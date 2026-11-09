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
  "coach:connect"
]);

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

export default class SquadSession extends Actor {
  private activeAthletes = new Map<string, any>();
  private connectionSessions = new Map<string, ConnectionSession>();

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

    // 4. Role-Based Access Control (RBAC) Enforcement
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

    const broadcastPayload = {
      type: type,
      data: {
        ...rawData,
        senderId: rawData.senderId || msg.senderId || conn.id,
        pairingCode: this.instanceId,
        timestamp: rawData.timestamp || now
      }
    };

    // 5. Realtime Broadcast to Connected Room Peers
    this.broadcast(broadcastPayload);

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
          completed_at: new Date(rawData.timestamp || now).toISOString()
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
