"""
sim_supervisor.py - 100Hz Multi-Agent Supervisor & Root-Cause Fault Classifier.

Milestone 1 - VBT Anti-Gravity Engine.
100% Pure Python Standard Library (Zero Dependencies).

Monitors simulation runs in lockstep at 100Hz:
  - 4 Inspection Subagents (RestZuptInspector, RepStrokeInspector, FSMDeadlockInspector, NumericalHealthInspector)
  - 4-Domain Root-Cause Classification (Sensor Noise, Threshold Mismatch, Numerical Drift, FSM Deadlock)
  - Trajectory Slicing with circular pre/event/post buffers
  - Formal Objective Reward Evaluation:
      Reward = +100 * True Reps - 250 * False Reps - 300 * Missed Reps - 50 * Velocity Error - 100 * Residual Drift
"""

from __future__ import annotations
import math
import json
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import List, Dict, Tuple, Optional, Any, Deque


class RootCause(str, Enum):
    SENSOR_NOISE = "Sensor Noise"
    THRESHOLD_MISMATCH = "Threshold Mismatch"
    NUMERICAL_DRIFT = "Numerical Drift"
    FSM_DEADLOCK = "FSM Deadlock"


class AnomalyType(str, Enum):
    # Domain 1: Rest & ZUPT
    REST_VELOCITY_LEAK = "REST_VELOCITY_LEAK"
    PREMATURE_ZUPT_IN_FLIGHT = "PREMATURE_ZUPT_IN_FLIGHT"
    PAUSE_ZUPT_VIOLATION = "PAUSE_ZUPT_VIOLATION"
    BASELINE_ADAPTATION_LEAK = "BASELINE_ADAPTATION_LEAK"
    STATIONARY_BLINDNESS = "STATIONARY_BLINDNESS"

    # Domain 2: Rep Accuracy & Stroke
    FALSE_POSITIVE_REP = "FALSE_POSITIVE_REP"
    MISSED_REP = "MISSED_REP"
    TRUNCATED_STROKE = "TRUNCATED_STROKE"
    INFLATED_STROKE = "INFLATED_STROKE"
    VELOCITY_ESTIMATION_ERROR = "VELOCITY_ESTIMATION_ERROR"
    TOUCH_AND_GO_BLINDNESS = "TOUCH_AND_GO_BLINDNESS"

    # Domain 3: FSM Deadlock
    ECCENTRIC_DEADLOCK = "ECCENTRIC_DEADLOCK"
    CONCENTRIC_DEADLOCK = "CONCENTRIC_DEADLOCK"
    IDLE_LOCKOUT_FREEZE = "IDLE_LOCKOUT_FREEZE"
    STATE_FLAPPING = "STATE_FLAPPING"
    ILLEGAL_STATE_TRANSITION = "ILLEGAL_STATE_TRANSITION"

    # Domain 4: Numerical & Sensor Health
    NAN_INF_POISONING = "NAN_INF_POISONING"
    QUATERNION_DEGENERACY = "QUATERNION_DEGENERACY"
    RUNAWAY_VELOCITY = "RUNAWAY_VELOCITY"
    SENSOR_SATURATION = "SENSOR_SATURATION"
    TIMESTEP_CORRUPTION = "TIMESTEP_CORRUPTION"
    I2C_BURST_DROPOUT = "I2C_BURST_DROPOUT"


CRITICAL_ANOMALIES = {
    AnomalyType.RUNAWAY_VELOCITY,
    AnomalyType.QUATERNION_DEGENERACY,
    AnomalyType.ECCENTRIC_DEADLOCK,
    AnomalyType.CONCENTRIC_DEADLOCK,
    AnomalyType.IDLE_LOCKOUT_FREEZE,
    AnomalyType.ILLEGAL_STATE_TRANSITION,
    AnomalyType.FALSE_POSITIVE_REP,
    AnomalyType.MISSED_REP,
    AnomalyType.TRUNCATED_STROKE,
}


@dataclass
class Anomaly:
    anomaly_id: str
    anomaly_type: AnomalyType
    root_cause: RootCause
    timestamp: float
    trigger_value: float
    threshold_value: float
    description: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def code(self) -> str:
        return self.anomaly_type.value


@dataclass
class StepFrame:
    t: float
    dt: float
    telemetry: Dict[str, float]
    gt: Dict[str, Any]
    tracker_state: Dict[str, Any]


@dataclass
class TrajectorySlice:
    case_id: str
    primary_anomaly: Anomaly
    pre_buffer: List[Dict[str, Any]]
    event_buffer: List[Dict[str, Any]]
    post_buffer: List[Dict[str, Any]]


@dataclass
class TrialEvaluation:
    trial_id: str
    matched_reps: int
    false_reps: int
    missed_reps: int
    velocity_error: float
    peak_velocity_error: float
    displacement_error: float
    residual_drift: float
    objective_reward: float
    root_cause_breakdown: Dict[str, int]
    anomalies: List[Anomaly]
    critical_anomalies: List[Anomaly]
    trajectory_slices: List[TrajectorySlice]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "trial_id": self.trial_id,
            "matched_reps": self.matched_reps,
            "false_reps": self.false_reps,
            "missed_reps": self.missed_reps,
            "velocity_error": self.velocity_error,
            "peak_velocity_error": self.peak_velocity_error,
            "displacement_error": self.displacement_error,
            "residual_drift": self.residual_drift,
            "objective_reward": self.objective_reward,
            "root_cause_breakdown": self.root_cause_breakdown,
            "anomaly_count": len(self.anomalies),
            "critical_anomaly_count": len(self.critical_anomalies),
            "anomalies": [
                {
                    "id": a.anomaly_id,
                    "type": a.anomaly_type.value,
                    "root_cause": a.root_cause.value,
                    "timestamp": a.timestamp,
                    "description": a.description
                }
                for a in self.anomalies
            ]
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


# ==============================================================================
# Inspection Subagents Protocol & Implementations
# ==============================================================================

class BaseSupervisorSubagent:
    """Base inspection subagent protocol."""
    def reset(self) -> None:
        pass

    def inspect_step(
        self,
        t: float,
        tracker: Any,
        gt_step: Any,
        telemetry: Any
    ) -> List[Anomaly]:
        return []


class RestZuptInspector(BaseSupervisorSubagent):
    """Subagent 1: Audits stationary rest, ZUPT triggers, and baseline gravity adaptation."""

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.motionless_ticks = 0
        self.last_baseline: Optional[float] = None

    def inspect_step(
        self,
        t: float,
        tracker: Any,
        gt_step: Any,
        telemetry: Any
    ) -> List[Anomaly]:
        anomalies: List[Anomaly] = []
        is_motionless = getattr(gt_step, "is_motionless", False)
        true_vel = getattr(gt_step, "true_velocity", 0.0)
        phase = getattr(gt_step, "phase", "IDLE")

        vel = getattr(tracker, "velocity", 0.0)
        state = getattr(tracker, "currentState", "IDLE")
        baseline = getattr(tracker, "gravity_baseline", 9.81)

        if is_motionless:
            self.motionless_ticks += 1
        else:
            self.motionless_ticks = 0

        # 1. Stationary velocity clamping: when still for >= 20 ticks (0.2s), velocity must be clamped (|v| <= 0.02)
        if self.motionless_ticks >= 20 and state == "IDLE":
            if abs(vel) > 0.02:
                anomalies.append(Anomaly(
                    anomaly_id=f"ZUPT-LEAK-{t:.2f}",
                    anomaly_type=AnomalyType.REST_VELOCITY_LEAK,
                    root_cause=RootCause.NUMERICAL_DRIFT,
                    timestamp=t,
                    trigger_value=abs(vel),
                    threshold_value=0.02,
                    description=f"Velocity leak during confirmed stationary rest: {vel:.4f} m/s"
                ))

        # 2. In-flight ZUPT immunity: must not claim stationary during active fast motion (|v_true| > 0.15)
        if abs(true_vel) > 0.15:
            is_stat = getattr(tracker, "is_stationary", False)
            if is_stat:
                anomalies.append(Anomaly(
                    anomaly_id=f"PREMATURE-ZUPT-{t:.2f}",
                    anomaly_type=AnomalyType.PREMATURE_ZUPT_IN_FLIGHT,
                    root_cause=RootCause.THRESHOLD_MISMATCH,
                    timestamp=t,
                    trigger_value=abs(true_vel),
                    threshold_value=0.15,
                    description=f"Premature stationary flag while moving at {true_vel:.3f} m/s"
                ))

        # 3. Bottom pause isometric compliance: must not abort to IDLE when holding in pause <= 3.5s
        if phase == "PAUSE":
            motionless_ms = getattr(tracker, "motionless_in_eccentric_ms", 0)
            if state == "IDLE" and motionless_ms < 3500:
                anomalies.append(Anomaly(
                    anomaly_id=f"PAUSE-VIOLATION-{t:.2f}",
                    anomaly_type=AnomalyType.PAUSE_ZUPT_VIOLATION,
                    root_cause=RootCause.THRESHOLD_MISMATCH,
                    timestamp=t,
                    trigger_value=motionless_ms,
                    threshold_value=3500,
                    description="Bottom isometric pause aborted to IDLE prematurely before 3.5s"
                ))

        # 4. Baseline adaptation containment: baseline must NOT adapt during active eccentric/concentric
        if phase in ("ECCENTRIC", "CONCENTRIC") and abs(true_vel) > 0.15:
            if self.last_baseline is not None and abs(baseline - self.last_baseline) > 0.005:
                anomalies.append(Anomaly(
                    anomaly_id=f"BASELINE-LEAK-{t:.2f}",
                    anomaly_type=AnomalyType.BASELINE_ADAPTATION_LEAK,
                    root_cause=RootCause.NUMERICAL_DRIFT,
                    timestamp=t,
                    trigger_value=abs(baseline - self.last_baseline),
                    threshold_value=0.005,
                    description=f"Baseline adapted by {abs(baseline - self.last_baseline):.4f} m/s^2 during active lift phase {phase}"
                ))

        self.last_baseline = baseline
        return anomalies


class RepStrokeInspector(BaseSupervisorSubagent):
    """Subagent 2: Audits rep counts, stroke displacement completeness, and MCV."""

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.last_tracker_reps_len = 0

    def inspect_step(
        self,
        t: float,
        tracker: Any,
        gt_step: Any,
        telemetry: Any
    ) -> List[Anomaly]:
        anomalies: List[Anomaly] = []
        cur_reps = getattr(tracker, "reps", [])
        if len(cur_reps) > self.last_tracker_reps_len:
            # A new rep was completed by tracker
            self.last_tracker_reps_len = len(cur_reps)
            latest_rep = cur_reps[-1]
            disp = latest_rep.get("disp", 0.0)
            mcv = latest_rep.get("mcv", 0.0)

            # Basic sanity on rep output
            if disp < 0.10:
                anomalies.append(Anomaly(
                    anomaly_id=f"TRUNCATED-REP-{t:.2f}",
                    anomaly_type=AnomalyType.TRUNCATED_STROKE,
                    root_cause=RootCause.THRESHOLD_MISMATCH,
                    timestamp=t,
                    trigger_value=disp,
                    threshold_value=0.10,
                    description=f"Rep completed with tiny displacement: {disp:.3f}m"
                ))
            if mcv > 4.0:
                anomalies.append(Anomaly(
                    anomaly_id=f"VELOCITY-ERR-{t:.2f}",
                    anomaly_type=AnomalyType.VELOCITY_ESTIMATION_ERROR,
                    root_cause=RootCause.NUMERICAL_DRIFT,
                    timestamp=t,
                    trigger_value=mcv,
                    threshold_value=4.0,
                    description=f"Rep recorded unphysical mean concentric velocity: {mcv:.3f} m/s"
                ))

        return anomalies


class FSMDeadlockInspector(BaseSupervisorSubagent):
    """Subagent 3: Audits FSM transitions, dwell times, and detects lockouts/chattering."""

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.current_state = "IDLE"
        self.state_enter_time = 0.0
        self.state_transitions: Deque[float] = deque(maxlen=30)

    def inspect_step(
        self,
        t: float,
        tracker: Any,
        gt_step: Any,
        telemetry: Any
    ) -> List[Anomaly]:
        anomalies: List[Anomaly] = []
        new_state = getattr(tracker, "currentState", "IDLE")

        if new_state != self.current_state:
            # Check legal transitions: IDLE->ECC/CONC, ECC->CONC/IDLE, CONC->IDLE
            legal = True
            if self.current_state == "CONCENTRIC" and new_state == "ECCENTRIC":
                legal = False

            if not legal:
                anomalies.append(Anomaly(
                    anomaly_id=f"ILLEGAL-TRANS-{t:.2f}",
                    anomaly_type=AnomalyType.ILLEGAL_STATE_TRANSITION,
                    root_cause=RootCause.FSM_DEADLOCK,
                    timestamp=t,
                    trigger_value=0.0,
                    threshold_value=0.0,
                    description=f"Illegal direct transition from {self.current_state} to {new_state}"
                ))

            self.current_state = new_state
            self.state_enter_time = t
            self.state_transitions.append(t)

            # State flapping / chattering: >= 4 transitions within 0.25s
            recent_transitions = [ts for ts in self.state_transitions if t - ts <= 0.25]
            if len(recent_transitions) >= 4:
                anomalies.append(Anomaly(
                    anomaly_id=f"FLAPPING-{t:.2f}",
                    anomaly_type=AnomalyType.STATE_FLAPPING,
                    root_cause=RootCause.THRESHOLD_MISMATCH,
                    timestamp=t,
                    trigger_value=float(len(recent_transitions)),
                    threshold_value=4.0,
                    description=f"High-frequency state chattering: {len(recent_transitions)} transitions in 250ms"
                ))
        else:
            dwell_time = t - self.state_enter_time
            if self.current_state == "ECCENTRIC" and dwell_time > 8.5:
                anomalies.append(Anomaly(
                    anomaly_id=f"ECC-DEADLOCK-{t:.2f}",
                    anomaly_type=AnomalyType.ECCENTRIC_DEADLOCK,
                    root_cause=RootCause.FSM_DEADLOCK,
                    timestamp=t,
                    trigger_value=dwell_time,
                    threshold_value=8.5,
                    description=f"ECCENTRIC state dwell timeout exceeded: {dwell_time:.2f}s > 8.5s"
                ))
            elif self.current_state == "CONCENTRIC" and dwell_time > 6.5:
                anomalies.append(Anomaly(
                    anomaly_id=f"CONC-DEADLOCK-{t:.2f}",
                    anomaly_type=AnomalyType.CONCENTRIC_DEADLOCK,
                    root_cause=RootCause.FSM_DEADLOCK,
                    timestamp=t,
                    trigger_value=dwell_time,
                    threshold_value=6.5,
                    description=f"CONCENTRIC state dwell timeout exceeded: {dwell_time:.2f}s > 6.5s"
                ))

        return anomalies


class NumericalHealthInspector(BaseSupervisorSubagent):
    """Subagent 4: Audits telemetry bounds, quaternion algebra, arithmetic sanity, and runaway velocity."""

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.consecutive_runaway_ticks = 0
        self.consecutive_dropout_ticks = 0

    def inspect_step(
        self,
        t: float,
        tracker: Any,
        gt_step: Any,
        telemetry: Any
    ) -> List[Anomaly]:
        anomalies: List[Anomaly] = []

        # 1. Telemetry NaN / Inf check
        ax = getattr(telemetry, "ax", 0.0)
        ay = getattr(telemetry, "ay", 0.0)
        az = getattr(telemetry, "az", 0.0)
        gx = getattr(telemetry, "gx", 0.0)
        gy = getattr(telemetry, "gy", 0.0)
        gz = getattr(telemetry, "gz", 0.0)

        has_nan = any(math.isnan(v) or math.isinf(v) for v in (ax, ay, az, gx, gy, gz))
        if has_nan:
            anomalies.append(Anomaly(
                anomaly_id=f"NAN-INPUT-{t:.2f}",
                anomaly_type=AnomalyType.NAN_INF_POISONING,
                root_cause=RootCause.SENSOR_NOISE,
                timestamp=t,
                trigger_value=0.0,
                threshold_value=0.0,
                description="Corrupted NaN/Inf detected in raw sensor telemetry"
            ))

        # Check tracker internal state for NaN/Inf
        vel = getattr(tracker, "velocity", 0.0)
        if math.isnan(vel) or math.isinf(vel):
            anomalies.append(Anomaly(
                anomaly_id=f"NAN-STATE-{t:.2f}",
                anomaly_type=AnomalyType.NAN_INF_POISONING,
                root_cause=RootCause.NUMERICAL_DRIFT,
                timestamp=t,
                trigger_value=0.0,
                threshold_value=0.0,
                description="Tracker integrated velocity corrupted by NaN/Inf"
            ))

        # 2. Quaternion normalisation
        if hasattr(tracker, "filter") and hasattr(tracker.filter, "q"):
            q = tracker.filter.q
            norm_sq = q[0]*q[0] + q[1]*q[1] + q[2]*q[2] + q[3]*q[3]
            if abs(norm_sq - 1.0) > 0.05 or norm_sq < 1e-6:
                anomalies.append(Anomaly(
                    anomaly_id=f"QUAT-DEG-{t:.2f}",
                    anomaly_type=AnomalyType.QUATERNION_DEGENERACY,
                    root_cause=RootCause.NUMERICAL_DRIFT,
                    timestamp=t,
                    trigger_value=norm_sq,
                    threshold_value=1.0,
                    description=f"Madgwick quaternion degeneracy: norm_sq={norm_sq:.4f}"
                ))

        # 3. Runaway velocity clamp check: |v| > 8.0 m/s persisting >= 2 steps
        if abs(vel) > 8.0:
            self.consecutive_runaway_ticks += 1
            if self.consecutive_runaway_ticks >= 2:
                anomalies.append(Anomaly(
                    anomaly_id=f"RUNAWAY-VEL-{t:.2f}",
                    anomaly_type=AnomalyType.RUNAWAY_VELOCITY,
                    root_cause=RootCause.NUMERICAL_DRIFT,
                    timestamp=t,
                    trigger_value=abs(vel),
                    threshold_value=8.0,
                    description=f"Runaway velocity unclamped: {vel:.2f} m/s persisted for >= 20ms"
                ))
        else:
            self.consecutive_runaway_ticks = 0

        # 4. Sensor saturation: ||a|| > 44.1 m/s^2 (> 4.5g)
        if not has_nan:
            a_mag = math.sqrt(ax*ax + ay*ay + az*az)
            g_mag = math.sqrt(gx*gx + gy*gy + gz*gz)
            if a_mag > 44.1 or g_mag > 20.9:
                anomalies.append(Anomaly(
                    anomaly_id=f"SATURATION-{t:.2f}",
                    anomaly_type=AnomalyType.SENSOR_SATURATION,
                    root_cause=RootCause.SENSOR_NOISE,
                    timestamp=t,
                    trigger_value=max(a_mag, g_mag),
                    threshold_value=44.1,
                    description=f"Sensor physical saturation: a_mag={a_mag:.1f} m/s^2, g_mag={g_mag:.1f} rad/s"
                ))

        # 5. I2C Burst dropouts
        is_timeout = getattr(telemetry, "is_i2c_timeout", False)
        if is_timeout:
            self.consecutive_dropout_ticks += 1
            if self.consecutive_dropout_ticks >= 5:
                anomalies.append(Anomaly(
                    anomaly_id=f"I2C-BURST-{t:.2f}",
                    anomaly_type=AnomalyType.I2C_BURST_DROPOUT,
                    root_cause=RootCause.SENSOR_NOISE,
                    timestamp=t,
                    trigger_value=float(self.consecutive_dropout_ticks),
                    threshold_value=5.0,
                    description=f"I2C bus timeout burst of {self.consecutive_dropout_ticks} consecutive samples"
                ))
        else:
            self.consecutive_dropout_ticks = 0

        return anomalies


# ==============================================================================
# Multi-Agent Supervisor
# ==============================================================================

class MultiAgentSupervisor:
    """
    100Hz Multi-Agent Supervisor orchestrating the 4 inspection subagents,
    anomaly classification, trajectory slicing, and formal objective reward evaluation.
    """

    def __init__(self, history_buffer_size: int = 100):
        self.subagents: List[BaseSupervisorSubagent] = [
            RestZuptInspector(),
            RepStrokeInspector(),
            FSMDeadlockInspector(),
            NumericalHealthInspector()
        ]
        self.history_buffer_size = history_buffer_size
        self.history: Deque[StepFrame] = deque(maxlen=history_buffer_size)
        self.active_anomalies: List[Anomaly] = []
        self.captured_slices: List[TrajectorySlice] = []

    def reset(self) -> None:
        self.history.clear()
        self.active_anomalies.clear()
        self.captured_slices.clear()
        for sub in self.subagents:
            sub.reset()

    def inspect_step(
        self,
        tracker: Any,
        gt_step: Any,
        telemetry: Optional[Any] = None
    ) -> List[Anomaly]:
        """
        Called at every 100Hz tick.
        Evaluates the 4 subagents, records rolling history, and triggers trajectory slicing.
        """
        t = getattr(gt_step, "t", 0.0)
        dt = getattr(gt_step, "dt", 0.01)

        # Record step frame in history
        tel_dict = {
            "ax": getattr(telemetry, "ax", 0.0),
            "ay": getattr(telemetry, "ay", 0.0),
            "az": getattr(telemetry, "az", 0.0),
            "gx": getattr(telemetry, "gx", 0.0),
            "gy": getattr(telemetry, "gy", 0.0),
            "gz": getattr(telemetry, "gz", 0.0)
        }
        gt_dict = {
            "phase": getattr(gt_step, "phase", "IDLE"),
            "true_vel": getattr(gt_step, "true_velocity", 0.0),
            "true_disp": getattr(gt_step, "true_displacement", 0.0),
            "is_motionless": getattr(gt_step, "is_motionless", True)
        }
        tr_dict = {
            "state": getattr(tracker, "currentState", "IDLE"),
            "velocity": getattr(tracker, "velocity", 0.0),
            "baseline": getattr(tracker, "gravity_baseline", 9.81),
            "is_stationary": getattr(tracker, "is_stationary", False)
        }
        frame = StepFrame(t=t, dt=dt, telemetry=tel_dict, gt=gt_dict, tracker_state=tr_dict)
        self.history.append(frame)

        step_anomalies: List[Anomaly] = []
        for sub in self.subagents:
            res = sub.inspect_step(t, tracker, gt_step, telemetry)
            if res:
                step_anomalies.extend(res)

        if step_anomalies:
            self.active_anomalies.extend(step_anomalies)
            # Capture trajectory slice for primary anomaly
            primary = step_anomalies[0]
            pre_buf = [asdict(f) for f in list(self.history)[-50:]]
            evt_buf = [asdict(frame)]
            slice_obj = TrajectorySlice(
                case_id=f"SLICE-{primary.code}-{t:.2f}",
                primary_anomaly=primary,
                pre_buffer=pre_buf,
                event_buffer=evt_buf,
                post_buffer=[]
            )
            self.captured_slices.append(slice_obj)

        return step_anomalies

    def evaluate_trial(
        self,
        tracker: Any,
        ground_truth: Any,
        trial_id: str = "TRIAL-001"
    ) -> TrialEvaluation:
        """
        Calculates trial-level rep matching, velocity error, residual drift,
        formal objective reward, and root-cause breakdown.
        """
        gt_reps = getattr(ground_truth, "rep_events", [])
        expected_reps = getattr(ground_truth, "reps", len(gt_reps))
        detected_reps = getattr(tracker, "reps", [])
        n_detected = len(detected_reps)

        # 1-to-1 greedy matching within +-0.50s window of completion time
        matched_gt = set()
        matched_tr = set()
        vel_errors: List[float] = []
        peak_vel_errors: List[float] = []
        disp_errors: List[float] = []

        for tr_idx, tr in enumerate(detected_reps):
            tr_t = tr.get("t", 0.0)
            tr_mcv = tr.get("mcv", 0.0)
            tr_disp = tr.get("disp", 0.0)
            best_gt_idx = None
            best_dt = 0.50

            for gt_idx, gt in enumerate(gt_reps):
                if gt_idx in matched_gt:
                    continue
                dt = abs(tr_t - gt.completion_time)
                if dt <= best_dt:
                    best_dt = dt
                    best_gt_idx = gt_idx

            if best_gt_idx is not None:
                matched_gt.add(best_gt_idx)
                matched_tr.add(tr_idx)
                gt = gt_reps[best_gt_idx]
                # MCV error relative to true MCV
                denom = max(0.10, gt.true_mean_velocity)
                vel_errors.append(abs(tr_mcv - gt.true_mean_velocity) / denom)
                peak_vel_errors.append(abs(getattr(tracker, "peak_velocity", tr_mcv) - gt.true_peak_velocity))
                disp_errors.append(abs(tr_disp - gt.true_displacement))

        n_true = len(matched_gt)
        n_false = max(0, n_detected - n_true)
        n_missed = max(0, expected_reps - n_true)

        # Flag trial-level rep anomalies if any
        if n_false > 0:
            self.active_anomalies.append(Anomaly(
                anomaly_id=f"FALSE-REP-{trial_id}",
                anomaly_type=AnomalyType.FALSE_POSITIVE_REP,
                root_cause=RootCause.THRESHOLD_MISMATCH,
                timestamp=getattr(ground_truth, "total_duration_s", 0.0),
                trigger_value=float(n_false),
                threshold_value=0.0,
                description=f"{n_false} false positive repetition(s) detected"
            ))

        if n_missed > 0:
            self.active_anomalies.append(Anomaly(
                anomaly_id=f"MISSED-REP-{trial_id}",
                anomaly_type=AnomalyType.MISSED_REP,
                root_cause=RootCause.THRESHOLD_MISMATCH,
                timestamp=getattr(ground_truth, "total_duration_s", 0.0),
                trigger_value=float(n_missed),
                threshold_value=0.0,
                description=f"{n_missed} expected repetition(s) missed"
            ))

        # Velocity error metric
        if n_true > 0:
            mean_vel_err = sum(vel_errors) / len(vel_errors)
            mean_peak_err = sum(peak_vel_errors) / len(peak_vel_errors)
            mean_disp_err = sum(disp_errors) / len(disp_errors)
        elif expected_reps > 0:
            mean_vel_err = 1.0
            mean_peak_err = 1.0
            mean_disp_err = 0.5
        else:
            mean_vel_err = 0.0
            mean_peak_err = 0.0
            mean_disp_err = 0.0

        # Residual drift: |final_velocity| + |final_baseline - true_baseline|
        final_vel = abs(getattr(tracker, "velocity", 0.0))
        final_base = getattr(tracker, "gravity_baseline", 9.81)
        true_base = getattr(ground_truth, "stationary_gravity_mag", 9.81)
        base_err = abs(final_base - true_base)
        residual_drift = final_vel + base_err

        # Formal Objective Reward Function:
        # Reward = +100 * True Reps - 250 * False Reps - 300 * Missed Reps - 50 * Velocity Error - 100 * Residual Drift
        objective_reward = (
            + 100.0 * n_true
            - 250.0 * n_false
            - 300.0 * n_missed
            - 50.0  * mean_vel_err
            - 100.0 * residual_drift
        )

        # Root-cause breakdown
        rc_breakdown = {rc.value: 0 for rc in RootCause}
        for a in self.active_anomalies:
            rc_breakdown[a.root_cause.value] = rc_breakdown.get(a.root_cause.value, 0) + 1

        critical = [a for a in self.active_anomalies if a.anomaly_type in CRITICAL_ANOMALIES]

        return TrialEvaluation(
            trial_id=str(trial_id),
            matched_reps=n_true,
            false_reps=n_false,
            missed_reps=n_missed,
            velocity_error=mean_vel_err,
            peak_velocity_error=mean_peak_err,
            displacement_error=mean_disp_err,
            residual_drift=residual_drift,
            objective_reward=objective_reward,
            root_cause_breakdown=rc_breakdown,
            anomalies=list(self.active_anomalies),
            critical_anomalies=critical,
            trajectory_slices=list(self.captured_slices)
        )

    def export_regression_case(
        self,
        evaluation: TrialEvaluation,
        trial_config: Any
    ) -> Dict[str, Any]:
        """Export serialized regression case matching the R5 declarative JSON schema."""
        cfg_dict = asdict(trial_config) if hasattr(trial_config, "__dataclass_fields__") else dict(trial_config)
        return {
            "case_id": f"REG-FAIL-{evaluation.trial_id}-{int(time.time())}",
            "description": f"Automated failure ingestion for {evaluation.trial_id}",
            "config": cfg_dict,
            "evaluation": evaluation.to_dict()
        }


# Alias for clean API contract
Supervisor = MultiAgentSupervisor
