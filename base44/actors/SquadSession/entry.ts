import { Actor } from "base44:runtime/actors";

const VALID_MESSAGE_TYPES = new Set([
  "set:started",
  "rep:recorded",
  "set:completed",
  "coach:cue",
  "coach:load_override",
  "coach:load_response",
  "coach:rest_target",
  "athlete:connect",
  "coach:connect",
  "prep:plan_sync",
  "prep:workout_updated",
  "athlete:profile_updated",
  "workout:pr_pushed",
  "prep:athlete_feedback"
]);

// Preparation events that only a verified coach connection may write
const COACH_ONLY_PREP_TYPES = new Set(["prep:plan_sync", "prep:workout_updated"]);

// Preparation events that only the athlete side may emit
const ATHLETE_ONLY_PREP_TYPES = new Set([
  "athlete:profile_updated",
  "workout:pr_pushed",
  "prep:athlete_feedback"
]);

// In-memory room snapshot bounds
const MAX_PREP_PLANS = 64;
const MAX_PLANNED_WORKOUTS = 2000;
const MAX_ATHLETE_PROFILES = 64;
const MAX_PUSHED_PRS = 200;
const MAX_SLOTS_PER_WORKOUT = 40;

// Maximum payload size (64 KB) to prevent memory exhaustion attacks
const MAX_PAYLOAD_BYTES = 65536;

// Rate limiting: maximum 60 messages per 5-second window per connection
const RATE_LIMIT_WINDOW_MS = 5000;
const MAX_MESSAGES_PER_WINDOW = 60;

interface ConnectionSession {
  id: string;
  role: "athlete" | "coach" | "unverified";
  athleteId?: string;
  athleteName?: string;
  coachName?: string;
  connectedAt: number;
  messageCount: number;
  windowStart: number;
}

function sanitizeText(input: unknown, maxLen = 128): string {
  if (input == null) return "";
  const str = String(input);
  return str
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

/** Clamps an optional numeric field, returning undefined when the input is absent. */
function clampOptional(val: unknown, min: number, max: number, places = 1): number | undefined {
  if (val == null || val === "") return undefined;
  const num = Number(val);
  if (!isFinite(num)) return undefined;
  const factor = Math.pow(10, places);
  return Math.round(Math.max(min, Math.min(max, num)) * factor) / factor;
}

/** Copies a sanitized optional string field onto the target when non-empty. */
function putText(target: Record<string, any>, source: any, key: string, maxLen: number) {
  const text = sanitizeText(source?.[key], maxLen);
  if (text !== "") target[key] = text;
}

/** Copies a clamped optional numeric field onto the target when present. */
function putNumber(target: Record<string, any>, source: any, key: string, min: number, max: number, places = 1) {
  const num = clampOptional(source?.[key], min, max, places);
  if (num !== undefined) target[key] = num;
}

/** Sanitizes one prescribed set block (top set or backoff) with bounded kinematic targets. */
function sanitizeSetBlock(block: any): Record<string, any> | null {
  if (!block || typeof block !== "object") return null;
  const out: Record<string, any> = {};
  putNumber(out, block, "sets", 1, 20, 0);
  putNumber(out, block, "reps", 1, 50, 0);
  putNumber(out, block, "loadKg", 0, 600, 1);
  putNumber(out, block, "dropPct", 0, 60, 1);
  putNumber(out, block, "targetVelocity", 0, 3, 2);
  const rpe = clampOptional(block.rpe != null ? block.rpe : block.targetRpe, 5, 10, 1);
  if (rpe !== undefined) {
    out.rpe = rpe;
    out.targetRpe = rpe;
  }
  putNumber(out, block, "velocityLossCapPct", 5, 50, 1);
  if (Array.isArray(block.velocityRange)) {
    out.velocityRange = block.velocityRange.slice(0, 2).map((v: unknown) => clampNumber(v, 0, 3, 0));
  }
  return out;
}

/** Sanitizes a prescribed exercise slot with bounded top set and backoff blocks. */
function sanitizeSlot(slot: any): Record<string, any> | null {
  if (!slot || typeof slot !== "object") return null;
  const out: Record<string, any> = {};
  putText(out, slot, "slotId", 64);
  putText(out, slot, "exerciseId", 64);
  putText(out, slot, "exerciseName", 96);
  putText(out, slot, "baseLift", 32);
  putText(out, slot, "notes", 256);
  const top = sanitizeSetBlock(slot.topSet || slot.top);
  if (top) out.topSet = top;
  const backoff = sanitizeSetBlock(slot.backoff);
  if (backoff) out.backoff = backoff;
  return out;
}

/** Sanitizes an array of prescribed slots to a bounded list. */
function sanitizeSlots(raw: unknown): Record<string, any>[] {
  if (!Array.isArray(raw)) return [];
  const slots: Record<string, any>[] = [];
  for (const entry of raw.slice(0, MAX_SLOTS_PER_WORKOUT)) {
    const slot = sanitizeSlot(entry);
    if (slot) slots.push(slot);
  }
  return slots;
}

/** Sanitizes a preparation event payload and enforces bounded physical ranges. */
function sanitizePrepData(type: string, raw: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (type === "prep:plan_sync") {
    const src = (raw?.plan && typeof raw.plan === "object") ? { ...raw.plan, ...raw } : raw;
    putText(out, src, "planId", 64);
    putText(out, src, "athleteId", 64);
    putText(out, src, "athleteName", 64);
    out.title = sanitizeText(src.title, 128) || "Preparation Plan";
    putText(out, src, "goalType", 64);
    out.durationMonths = Math.round(clampNumber(src.durationMonths, 0, 12, 0) * 10) / 10;
    putText(out, src, "startDate", 10);
    putText(out, src, "targetMeetDate", 10);
    putNumber(out, src, "targetSquatKg", 0, 600);
    putNumber(out, src, "targetBenchKg", 0, 600);
    putNumber(out, src, "targetDeadliftKg", 0, 600);
    putNumber(out, src, "deloadCadenceWeeks", 0, 52, 0);
    putText(out, src, "dietaryStrategyNotes", 1024);
    putText(out, src, "coachNotes", 1024);
    out.version = Math.round(clampNumber(src.version, 1, 1000000, 1));
    if (Array.isArray(src.macroBlocks)) {
      out.macroBlocks = src.macroBlocks.slice(0, 64).map((b: any) => ({
        phase: sanitizeText(b?.phase, 64),
        weeks: Math.round(clampNumber(b?.weeks, 0, 52, 0)),
        startWeek: Math.round(clampNumber(b?.startWeek, 0, 52, 0))
      }));
    }
  } else if (type === "prep:workout_updated") {
    const src = (raw?.workout && typeof raw.workout === "object") ? { ...raw.workout, ...raw } : raw;
    putText(out, src, "workoutId", 64);
    putText(out, src, "planId", 64);
    putText(out, src, "athleteId", 64);
    putText(out, src, "scheduledDate", 10);
    out.weekIndex = Math.round(clampNumber(src.weekIndex, 0, 52, 0));
    putText(out, src, "dayOfWeek", 16);
    putText(out, src, "blockPhase", 64);
    out.isDeload = Boolean(src.isDeload);
    putText(out, src, "sessionTitle", 128);
    putText(out, src, "workoutNotes", 1024);
    putText(out, src, "dietaryNotes", 1024);
    putText(out, src, "athleteFeedbackNote", 1024);
    putText(out, src, "adherenceStatus", 32);
    out.prescribedSlots = sanitizeSlots(src.prescribedSlots != null ? src.prescribedSlots : src.slots);
  } else if (type === "athlete:profile_updated") {
    putText(out, raw, "athleteId", 64);
    putText(out, raw, "athleteName", 64);
    putText(out, raw, "rackId", 32);
    putText(out, raw, "weightClass", 16);
    putText(out, raw, "targetWeightClass", 16);
    putText(out, raw, "gender", 16);
    putText(out, raw, "experienceTier", 32);
    putText(out, raw, "federation", 64);
    putText(out, raw, "dutiesInjuryNotes", 1024);
    putNumber(out, raw, "age", 10, 100, 0);
    putNumber(out, raw, "bodyweightKg", 20, 300);
    putNumber(out, raw, "trainingAgeYears", 0, 60);
    putNumber(out, raw, "meetsCompleted", 0, 500, 0);
    for (const lift of ["Squat", "Bench", "Deadlift"]) {
      putNumber(out, raw, `comp${lift}Kg`, 0, 600);
      putNumber(out, raw, `gym${lift}Kg`, 0, 600);
      putNumber(out, raw, `e1rm${lift}Kg`, 0, 700);
      putNumber(out, raw, `peak${lift}Velocity`, 0, 10, 2);
    }
    if (Array.isArray(raw.availableDays)) {
      out.availableDays = raw.availableDays.slice(0, 7).map((d: unknown) => sanitizeText(d, 3)).filter(Boolean);
    }
  } else if (type === "workout:pr_pushed") {
    putText(out, raw, "athleteId", 64);
    putText(out, raw, "athleteName", 64);
    out.lift = sanitizeText(raw.lift, 32) || "Main";
    const weightKg = clampNumber(raw.weightKg != null ? raw.weightKg : raw.weight, 0, 600, 0);
    out.weightKg = Math.round(weightKg * 10) / 10;
    out.weight = out.weightKg;
    out.prType = sanitizeText(raw.prType, 16) || "weight";
    putText(out, raw, "setId", 64);
    const workoutId = sanitizeText(raw.plannedWorkoutId || raw.workoutId, 64);
    const slotId = sanitizeText(raw.plannedSlotId || raw.slotId, 64);
    if (workoutId) { out.plannedWorkoutId = workoutId; out.workoutId = workoutId; }
    if (slotId) { out.plannedSlotId = slotId; out.slotId = slotId; }
    putNumber(out, raw, "velocity", 0, 10, 2);
    putNumber(out, raw, "rpe", 1, 10);
    putNumber(out, raw, "reps", 0, 100, 0);
    putNumber(out, raw, "e1rmKg", 0, 700);
  } else if (type === "prep:athlete_feedback") {
    putText(out, raw, "workoutId", 64);
    putText(out, raw, "planId", 64);
    putText(out, raw, "athleteId", 64);
    putText(out, raw, "athleteName", 64);
    out.note = sanitizeText(raw.note != null ? raw.note : raw.athleteFeedbackNote, 1024);
    putText(out, raw, "adherenceStatus", 32);
    putNumber(out, raw, "sessionRpe", 1, 10);
  }
  return out;
}

/** Inserts into a bounded map, evicting the oldest entry when the limit is exceeded. */
function boundedSet<V>(map: Map<string, V>, key: string, value: V, limit: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export default class SquadSession extends Actor {
  private activeAthletes = new Map<string, any>();
  private connectionSessions = new Map<string, ConnectionSession>();
  private prepPlans = new Map<string, any>();
  private plannedWorkouts = new Map<string, any>();
  private athleteProfiles = new Map<string, any>();
  private pushedPrs: any[] = [];

  /** Builds the room snapshot sent on connect and attestation. */
  private buildSessionState() {
    return {
      type: "session:state",
      data: {
        sessionId: this.instanceId,
        prepPlans: Array.from(this.prepPlans.values()),
        plannedWorkouts: Array.from(this.plannedWorkouts.values()),
        athleteProfiles: Array.from(this.athleteProfiles.values()),
        pushedPrs: this.pushedPrs.slice(-MAX_PUSHED_PRS),
        timestamp: Date.now()
      }
    };
  }

  async handleStart() {
    // Durable actor state initialization
  }

  async handleConnect(conn: any) {
    this.connectionSessions.set(conn.id, {
      id: conn.id,
      role: "unverified",
      connectedAt: Date.now(),
      messageCount: 0,
      windowStart: Date.now()
    });

    conn.send({
      type: "room:welcome",
      data: {
        sessionId: this.instanceId,
        connectionId: conn.id,
        timestamp: Date.now()
      }
    });
    conn.send(this.buildSessionState());
  }

  async handleMessage(conn: any, msg: any) {
    if (!msg || typeof msg !== "object") return;
    const type = msg.type;
    if (!type || typeof type !== "string" || !VALID_MESSAGE_TYPES.has(type)) {
      return;
    }

    // 1. Anti-Flooding & Denial of Service Defense
    let session = this.connectionSessions.get(conn.id);
    if (!session) {
      session = {
        id: conn.id,
        role: "unverified",
        connectedAt: Date.now(),
        messageCount: 0,
        windowStart: Date.now()
      };
      this.connectionSessions.set(conn.id, session);
    }

    const now = Date.now();
    if (now - session.windowStart > RATE_LIMIT_WINDOW_MS) {
      session.windowStart = now;
      session.messageCount = 0;
    }
    session.messageCount++;
    if (session.messageCount > MAX_MESSAGES_PER_WINDOW) {
      conn.send({
        type: "security:rate_limit",
        data: { message: "Message rate limit exceeded. Slow down telemetry burst." }
      });
      return;
    }

    // 2. Payload size bounds verification
    try {
      const serialized = JSON.stringify(msg);
      if (serialized.length > MAX_PAYLOAD_BYTES) {
        conn.send({
          type: "security:payload_too_large",
          data: { message: "Payload exceeds 64KB security threshold." }
        });
        return;
      }
    } catch (_) {
      return;
    }

    const rawData = msg.data !== undefined ? msg.data : (msg.payload !== undefined ? msg.payload : {});
    if (typeof rawData !== "object" || rawData === null) return;

    // 3. Mutual Role Attestation & Connection Authentication
    if (type === "athlete:connect") {
      session.role = "athlete";
      session.athleteId = sanitizeText(rawData.athleteId, 64) || "ath_01";
      session.athleteName = sanitizeText(rawData.athleteName, 64) || "Active Athlete";

      this.activeAthletes.set(conn.id, {
        athleteId: session.athleteId,
        athleteName: session.athleteName,
        rackId: sanitizeText(rawData.rackId, 32) || "Rack 01",
        coachCode: this.instanceId,
        lastSeen: now
      });
    } else if (type === "coach:connect") {
      session.role = "coach";
      session.coachName = sanitizeText(rawData.coachName, 64) || "Coach";
    }

    // Send a fresh room snapshot once a connection attests its role
    if (type === "athlete:connect" || type === "coach:connect") {
      conn.send(this.buildSessionState());
    }

    // 4. Role-Based Access Control (RBAC) Enforcement
    // Preparation plan writes are coach-only: only a verified coach connection may mutate plans
    if (COACH_ONLY_PREP_TYPES.has(type) && session.role !== "coach") {
      conn.send({
        type: "security:unauthorized",
        data: {
          message: "Only a verified coach connection can write preparation plans and planned workouts.",
          rejectedType: type
        }
      });
      return;
    }
    // Athlete-owned preparation events cannot be forged by a coach connection
    if (ATHLETE_ONLY_PREP_TYPES.has(type) && session.role === "coach") {
      conn.send({
        type: "security:unauthorized",
        data: {
          message: "Coach connection cannot emit athlete profile, PR, or feedback events.",
          rejectedType: type
        }
      });
      return;
    }

    const isCoachDirective = (type === "coach:cue" || type === "coach:load_override" || type === "coach:rest_target");
    if (isCoachDirective) {
      // Disallow an identified athlete from impersonating coach and issuing directives
      if (session.role === "athlete") {
        conn.send({
          type: "security:unauthorized",
          data: { message: "Athlete connection cannot dispatch coach directives." }
        });
        return;
      }
      session.role = "coach";
    }

    const isAthleteTelemetry = (type === "set:started" || type === "rep:recorded" || type === "set:completed");
    if (isAthleteTelemetry && session.role === "coach") {
      // Coaches observe; they do not forge athlete lifting telemetry
      return;
    }

    // Sanitize and clamp preparation payloads before broadcast and snapshotting
    const isPrepEvent = COACH_ONLY_PREP_TYPES.has(type) || ATHLETE_ONLY_PREP_TYPES.has(type);
    let outboundData: Record<string, any> = rawData;
    if (isPrepEvent) {
      outboundData = sanitizePrepData(type, rawData);
      if (ATHLETE_ONLY_PREP_TYPES.has(type)) {
        // Athlete-owned events are bound to the attested athlete identity
        outboundData.athleteId = session.athleteId || outboundData.athleteId || "ath_01";
      }
      if (COACH_ONLY_PREP_TYPES.has(type) && !(outboundData.planId && (type === "prep:plan_sync" || outboundData.workoutId))) {
        conn.send({
          type: "security:invalid_payload",
          data: { message: "Preparation payload is missing required identifiers.", rejectedType: type }
        });
        return;
      }
    }

    const broadcastPayload = {
      type: type,
      data: {
        ...outboundData,
        senderId: rawData.senderId || msg.senderId || conn.id,
        pairingCode: this.instanceId,
        timestamp: rawData.timestamp || now
      }
    };

    // 5. Realtime Broadcast to Connected Room Peers
    this.broadcast(broadcastPayload);

    // 5b. Maintain bounded in-memory room snapshots for reconnecting peers
    if (isPrepEvent) {
      const snapshot = { ...outboundData, timestamp: rawData.timestamp || now };
      if (type === "prep:plan_sync") {
        boundedSet(this.prepPlans, String(outboundData.planId), snapshot, MAX_PREP_PLANS);
      } else if (type === "prep:workout_updated") {
        boundedSet(this.plannedWorkouts, String(outboundData.workoutId), snapshot, MAX_PLANNED_WORKOUTS);
      } else if (type === "athlete:profile_updated") {
        const prior = this.athleteProfiles.get(String(outboundData.athleteId)) || {};
        boundedSet(this.athleteProfiles, String(outboundData.athleteId), { ...prior, ...snapshot }, MAX_ATHLETE_PROFILES);
      } else if (type === "workout:pr_pushed") {
        this.pushedPrs.push(snapshot);
        if (this.pushedPrs.length > MAX_PUSHED_PRS) {
          this.pushedPrs.splice(0, this.pushedPrs.length - MAX_PUSHED_PRS);
        }
      } else if (type === "prep:athlete_feedback") {
        const existing = this.plannedWorkouts.get(String(outboundData.workoutId));
        if (existing) {
          boundedSet(
            this.plannedWorkouts,
            String(outboundData.workoutId),
            { ...existing, athleteFeedbackNote: outboundData.note, adherenceStatus: outboundData.adherenceStatus || existing.adherenceStatus },
            MAX_PLANNED_WORKOUTS
          );
        }
      }
    }

    // 6. Durable Cloud Persistence with Bounded Numeric Sanitization
    if (type === "set:completed" && this.client?.asServiceRole?.entities?.CompletedSet) {
      try {
        const setId = sanitizeText(rawData.setId, 64) || `set_${now}`;
        const reps = Array.isArray(rawData.reps) ? rawData.reps : [];
        const trajectoryPoints = Array.isArray(rawData.trajectoryPoints)
          ? rawData.trajectoryPoints
          : (Array.isArray(rawData.trajectory_points) ? rawData.trajectory_points : []);

        const weight = clampNumber(rawData.weight, 0, 600, 0);
        const avgVel = clampNumber(rawData.avgVelocity, 0, 10, 0);
        const maxVel = clampNumber(rawData.maxVelocity, 0, 10, 0);
        const velLoss = clampNumber(rawData.velocityLoss, 0, 100, 0);
        const avgRpe = clampNumber(rawData.avgRpe || rawData.rpe, 1, 10, 8.0);
        const targetRpe = clampNumber(rawData.targetRpe, 1, 10, 8.0);
        const restSec = clampNumber(rawData.restSeconds, 0, 7200, 0);
        const maxDev = clampNumber(rawData.maxDeviationCm || rawData.deviationCm, -100, 100, 0);
        const pathEff = clampNumber(rawData.pathEfficiencyPct, 0, 100, 100);

        await this.client.asServiceRole.entities.CompletedSet.create({
          set_id: setId,
          pairing_code: String(this.instanceId || rawData.pairingCode || "DEFAULT"),
          athlete_id: sanitizeText(rawData.athleteId, 64) || session.athleteId || "ath_01",
          athlete_name: sanitizeText(rawData.athleteName, 64) || session.athleteName || "Active Athlete",
          set_number: Math.round(clampNumber(rawData.setNumber, 1, 100, 1)),
          lift: sanitizeText(rawData.lift, 32) || "Main",
          weight: Math.round(weight * 10) / 10,
          avg_velocity: Math.round(avgVel * 100) / 100,
          max_velocity: Math.round(maxVel * 100) / 100,
          velocity_loss: Math.round(velLoss * 10) / 10,
          avg_rpe: Math.round(avgRpe * 10) / 10,
          target_rpe: Math.round(targetRpe * 10) / 10,
          rest_seconds: Math.round(restSec),
          max_deviation_cm: Math.round(maxDev * 10) / 10,
          path_efficiency_pct: Math.round(pathEff * 10) / 10,
          reps_json: JSON.stringify(reps),
          trajectory_points_json: JSON.stringify(trajectoryPoints),
          completed_at: new Date(rawData.timestamp || now).toISOString(),
          planned_workout_id: sanitizeText(rawData.plannedWorkoutId || rawData.workoutId, 64) || undefined,
          planned_slot_id: sanitizeText(rawData.plannedSlotId || rawData.slotId, 64) || undefined,
          is_pr: Boolean(rawData.isPr || rawData.isPR),
          pr_type: sanitizeText(rawData.prType, 16) || undefined
        });
      } catch (err) {
        console.error("[SquadSession] Error persisting CompletedSet:", err);
      }
    }

    if (isCoachDirective && this.client?.asServiceRole?.entities?.CoachDirective) {
      try {
        const directiveId = sanitizeText(rawData.id, 64) || `dir_${now}_${Math.random().toString(36).substring(2, 6)}`;
        const directiveType = type === "coach:load_override"
          ? "load_override"
          : (type === "coach:rest_target" ? "rest_target" : "cue");

        const deltaKg = rawData.deltaKg != null ? clampNumber(rawData.deltaKg, -50, 50, 0) : undefined;
        const newWeight = rawData.newWeight != null ? clampNumber(rawData.newWeight, 0, 600, 0) : undefined;
        const targetRest = rawData.targetSeconds != null ? Math.round(clampNumber(rawData.targetSeconds, 0, 7200, 180)) : undefined;

        await this.client.asServiceRole.entities.CoachDirective.create({
          directive_id: directiveId,
          pairing_code: String(this.instanceId || rawData.pairingCode || "DEFAULT"),
          athlete_id: sanitizeText(rawData.athleteId, 64) || "ath_01",
          coach_name: sanitizeText(rawData.coachName, 64) || session.coachName || "Coach",
          directive_type: directiveType,
          delta_kg: deltaKg,
          prescribed_weight_kg: newWeight,
          target_rest_seconds: targetRest,
          cue_text: sanitizeText(rawData.text || rawData.cueText, 256),
          status: "pending",
          created_at: new Date(rawData.timestamp || now).toISOString()
        });
      } catch (err) {
        console.error("[SquadSession] Error persisting CoachDirective:", err);
      }
    }
  }

  async handleClose(conn: any) {
    this.activeAthletes.delete(conn.id);
    this.connectionSessions.delete(conn.id);
  }

  handleTick() {}
}
