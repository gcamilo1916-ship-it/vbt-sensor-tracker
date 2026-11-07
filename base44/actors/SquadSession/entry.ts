import { Actor } from "base44:runtime/actors";

const VALID_MESSAGE_TYPES = new Set([
  "set:started",
  "rep:recorded",
  "set:completed",
  "coach:cue",
  "coach:load_override",
  "coach:load_response",
  "coach:rest_target",
  "athlete:connect"
]);

export default class SquadSession extends Actor {
  private activeAthletes = new Map<string, any>();

  async handleStart() {
    // Optional rehydration from actor storage if needed
  }

  async handleConnect(conn: any) {
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

    const rawData = msg.data !== undefined ? msg.data : (msg.payload !== undefined ? msg.payload : {});
    if (typeof rawData !== "object" || rawData === null) return;

    // Track athlete presence
    if (type === "athlete:connect") {
      this.activeAthletes.set(conn.id, {
        athleteId: rawData.athleteId || "ath_01",
        athleteName: rawData.athleteName || "Active Athlete",
        rackId: rawData.rackId || "Rack 01",
        coachCode: rawData.coachCode || this.instanceId,
        lastSeen: Date.now()
      });
    }

    const broadcastPayload = {
      type: type,
      data: {
        ...rawData,
        senderId: rawData.senderId || msg.senderId || conn.id,
        pairingCode: this.instanceId,
        timestamp: rawData.timestamp || Date.now()
      }
    };

    // Realtime broadcast to all connected squad peers (Athletes & Coaches)
    this.broadcast(broadcastPayload);

    // Durable persistence of completed sets with 2D barbell deviation telemetry
    if (type === "set:completed" && this.client?.asServiceRole?.entities?.CompletedSet) {
      try {
        const setId = String(rawData.setId || `set_${Date.now()}`);
        const reps = Array.isArray(rawData.reps) ? rawData.reps : [];
        const trajectoryPoints = Array.isArray(rawData.trajectoryPoints)
          ? rawData.trajectoryPoints
          : (Array.isArray(rawData.trajectory_points) ? rawData.trajectory_points : []);

        await this.client.asServiceRole.entities.CompletedSet.create({
          set_id: setId,
          pairing_code: String(this.instanceId || rawData.pairingCode || "DEFAULT"),
          athlete_id: String(rawData.athleteId || "ath_01"),
          athlete_name: String(rawData.athleteName || "Active Athlete"),
          set_number: Math.round(Number(rawData.setNumber) || 1),
          lift: String(rawData.lift || "Main"),
          weight: Math.round((Number(rawData.weight) || 0) * 10) / 10,
          avg_velocity: Math.round((Number(rawData.avgVelocity) || 0) * 100) / 100,
          max_velocity: Math.round((Number(rawData.maxVelocity) || 0) * 100) / 100,
          velocity_loss: Math.round((Number(rawData.velocityLoss) || 0) * 10) / 10,
          avg_rpe: Math.round((Number(rawData.avgRpe || rawData.rpe) || 0) * 10) / 10,
          target_rpe: Math.round((Number(rawData.targetRpe) || 8.0) * 10) / 10,
          rest_seconds: Math.round(Number(rawData.restSeconds) || 0),
          max_deviation_cm: Math.round((Number(rawData.maxDeviationCm || rawData.deviationCm) || 0) * 10) / 10,
          path_efficiency_pct: Math.round((Number(rawData.pathEfficiencyPct) || 100) * 10) / 10,
          reps_json: JSON.stringify(reps),
          trajectory_points_json: JSON.stringify(trajectoryPoints),
          completed_at: new Date(rawData.timestamp || Date.now()).toISOString()
        });
      } catch (err) {
        console.error("[SquadSession] Error persisting CompletedSet:", err);
      }
    }

    // Durable persistence of coach directives (prescriptions & tactical cues)
    if ((type === "coach:load_override" || type === "coach:cue" || type === "coach:rest_target") &&
        this.client?.asServiceRole?.entities?.CoachDirective) {
      try {
        const directiveId = String(rawData.id || `dir_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
        const directiveType = type === "coach:load_override"
          ? "load_override"
          : (type === "coach:rest_target" ? "rest_target" : "cue");

        await this.client.asServiceRole.entities.CoachDirective.create({
          directive_id: directiveId,
          pairing_code: String(this.instanceId || rawData.pairingCode || "DEFAULT"),
          athlete_id: String(rawData.athleteId || "ath_01"),
          coach_name: String(rawData.coachName || "Coach"),
          directive_type: directiveType,
          delta_kg: rawData.deltaKg != null ? Number(rawData.deltaKg) : undefined,
          prescribed_weight_kg: rawData.newWeight != null ? Number(rawData.newWeight) : undefined,
          target_rest_seconds: rawData.targetSeconds != null ? Math.round(Number(rawData.targetSeconds)) : undefined,
          cue_text: String(rawData.text || rawData.cueText || ""),
          status: "pending",
          created_at: new Date(rawData.timestamp || Date.now()).toISOString()
        });
      } catch (err) {
        console.error("[SquadSession] Error persisting CoachDirective:", err);
      }
    }
  }

  async handleClose(conn: any) {
    this.activeAthletes.delete(conn.id);
  }

  handleTick() {}
}
