"""
Authoritative Test Fixtures, Mathematical Oracles, and Contracts for VBT E2E Testing Track.
Pure Python standard library with zero third-party dependencies.
Supports validation of all 23 features in PROJECT.md § Feature Inventory.
"""

import os
import re
import sys
import math
import json
import random

# Root directories
REPO_ROOT_PIO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "PlatformIO", "Projects", "VBT"))
REPO_ROOT_ANTI = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAIN_CPP_PATH = os.path.join(REPO_ROOT_PIO, "src", "main.cpp")
PLATFORMIO_INI_PATH = os.path.join(REPO_ROOT_PIO, "platformio.ini")

# ═════════════════════════════════════════════════════════════════════════════
# 1. KINEMATIC GENERATOR & CONTINUOUS CALCULUS ORACLE
# ═════════════════════════════════════════════════════════════════════════════
class VBTKinematicGenerator:
    """Generates synthetic kinematic barbell motion curves conforming to continuous physics."""

    @staticmethod
    def generate_concentric_bell(duration_s=0.8, v_peak=0.60, dt=0.01):
        """Generates bell-shaped velocity profile: v(t) = v_peak * sin^2(pi * t / duration)."""
        samples = []
        n_steps = int(round(duration_s / dt))
        actual_disp = 0.0
        for i in range(n_steps):
            t = i * dt
            # Smooth bell curve starting and ending at 0
            v = v_peak * (math.sin(math.pi * t / duration_s) ** 2)
            # Analytical acceleration: a(t) = v_peak * (pi / duration) * sin(2 * pi * t / duration)
            a = v_peak * (math.pi / duration_s) * math.sin(2.0 * math.pi * t / duration_s)
            actual_disp += v * dt
            samples.append({"t": t, "v": v, "a": a})
        mcv = actual_disp / duration_s if duration_s > 0 else 0.0
        return {
            "samples": samples,
            "duration": duration_s,
            "peak_velocity": v_peak,
            "mean_velocity": mcv,
            "displacement": actual_disp
        }

    @staticmethod
    def generate_eccentric_bell(duration_s=1.2, v_peak_down=-0.45, dt=0.01):
        """Generates downward eccentric descent curve."""
        samples = []
        n_steps = int(round(duration_s / dt))
        actual_disp = 0.0
        for i in range(n_steps):
            t = i * dt
            v = v_peak_down * (math.sin(math.pi * t / duration_s) ** 2)
            a = v_peak_down * (math.pi / duration_s) * math.sin(2.0 * math.pi * t / duration_s)
            actual_disp += v * dt
            samples.append({"t": t, "v": v, "a": a})
        return {
            "samples": samples,
            "duration": duration_s,
            "peak_velocity": v_peak_down,
            "mean_velocity": actual_disp / duration_s,
            "displacement": actual_disp
        }

    @staticmethod
    def generate_full_rep(ecc_dur=1.2, v_ecc=-0.45, pause_s=0.0, conc_dur=0.8, v_conc=0.60, dt=0.01):
        """Combines eccentric, optional pause, and concentric strokes into a complete repetition."""
        ecc = VBTKinematicGenerator.generate_eccentric_bell(ecc_dur, v_ecc, dt)
        conc = VBTKinematicGenerator.generate_concentric_bell(conc_dur, v_conc, dt)
        
        all_samples = []
        # 1. Eccentric
        for s in ecc["samples"]:
            all_samples.append({"v": s["v"], "a": s["a"]})
        # 2. Pause
        n_pause = int(round(pause_s / dt))
        for _ in range(n_pause):
            all_samples.append({"v": 0.0, "a": 0.0})
        # 3. Concentric
        for s in conc["samples"]:
            all_samples.append({"v": s["v"], "a": s["a"]})
            
        total_dur = ecc_dur + pause_s + conc_dur
        return {
            "samples": all_samples,
            "total_duration": total_dur,
            "concentric_duration": conc_dur,
            "concentric_peak_vel": v_conc,
            "concentric_displacement": conc["displacement"],
            "concentric_mean_vel": conc["mean_velocity"],
            "pause_s": pause_s
        }

    @staticmethod
    def generate_sticking_point_rep(ecc_dur=1.0, grind_dur=1.5, grind_vel=0.035, final_conc_dur=0.6, dt=0.01):
        """Generates rep with severe concentric sticking point (grind v <= 0.04 m/s)."""
        samples = []
        # Eccentric
        ecc = VBTKinematicGenerator.generate_eccentric_bell(ecc_dur, -0.40, dt)
        for s in ecc["samples"]:
            samples.append({"v": s["v"], "a": s["a"]})
        # Concentric start: drive up to grind velocity
        n_start = int(0.2 / dt)
        disp_conc = 0.0
        for i in range(n_start):
            v = 0.25 * math.sin(0.5 * math.pi * (i / n_start))
            a = 0.25 * (0.5 * math.pi / 0.2) * math.cos(0.5 * math.pi * (i / n_start))
            disp_conc += v * dt
            samples.append({"v": v, "a": a})
        # Sticking point grind: v is sustained low (~0.035 m/s)
        n_grind = int(grind_dur / dt)
        for _ in range(n_grind):
            v = grind_vel
            a = 0.0
            disp_conc += v * dt
            samples.append({"v": v, "a": a})
        # Concentric lockout: accelerate to lockout
        n_lock = int(final_conc_dur / dt)
        for i in range(n_lock):
            t_rel = i / n_lock
            v = grind_vel + 0.35 * (math.sin(math.pi * t_rel) ** 2)
            a = 0.35 * (math.pi / final_conc_dur) * math.sin(2.0 * math.pi * t_rel)
            disp_conc += v * dt
            samples.append({"v": v, "a": a})
        
        conc_dur = 0.2 + grind_dur + final_conc_dur
        return {
            "samples": samples,
            "concentric_duration": conc_dur,
            "concentric_displacement": disp_conc,
            "grind_duration": grind_dur,
            "grind_velocity": grind_vel
        }


# ═════════════════════════════════════════════════════════════════════════════
# 2. OBJECTIVE REWARD FUNCTION ORACLE
# ═════════════════════════════════════════════════════════════════════════════
class VBTRewardCalculator:
    """Formal implementation of R3 objective reward function:
    Reward = +100*True - 250*False - 300*Missed - 50*VelErr - 100*ResDrift
    """
    WEIGHT_TRUE = 100.0
    WEIGHT_FALSE = -250.0
    WEIGHT_MISSED = -300.0
    WEIGHT_VEL_ERR = -50.0
    WEIGHT_RES_DRIFT = -100.0

    @classmethod
    def compute_reward(cls, true_reps, false_reps, missed_reps, velocity_error=0.0, residual_drift=0.0):
        reward = (cls.WEIGHT_TRUE * true_reps +
                  cls.WEIGHT_FALSE * false_reps +
                  cls.WEIGHT_MISSED * missed_reps +
                  cls.WEIGHT_VEL_ERR * abs(velocity_error) +
                  cls.WEIGHT_RES_DRIFT * abs(residual_drift))
        return reward

    @classmethod
    def evaluate_trial(cls, target_reps, detected_reps_list, ground_truth_mcv_list, residual_drift=0.0):
        n_detected = len(detected_reps_list)
        true_reps = min(target_reps, n_detected)
        false_reps = max(0, n_detected - target_reps)
        missed_reps = max(0, target_reps - n_detected)

        vel_errors = []
        for i in range(min(len(detected_reps_list), len(ground_truth_mcv_list))):
            vel_errors.append(abs(detected_reps_list[i] - ground_truth_mcv_list[i]))
        mean_vel_error = sum(vel_errors) / len(vel_errors) if vel_errors else 0.0

        reward = cls.compute_reward(true_reps, false_reps, missed_reps, mean_vel_error, residual_drift)
        return {
            "reward": reward,
            "true_reps": true_reps,
            "false_reps": false_reps,
            "missed_reps": missed_reps,
            "mean_velocity_error": mean_vel_error,
            "residual_drift": residual_drift
        }


# ═════════════════════════════════════════════════════════════════════════════
# 3. 18-PARAMETER HYPERPARAMETER POLICY GENOME
# ═════════════════════════════════════════════════════════════════════════════
class VBTPolicyGenome:
    """18-parameter genome covering Madgwick, rest detection, adaptation, and FSM guards."""

    GENOME_SPEC = {
        "beta": (0.01, 0.40, 0.08, float),                      # 1: Madgwick filter gain
        "accel_rejection_thresh": (1.0, 5.0, 2.5, float),        # 2: Dynamic accel rejection gate
        "var_a_thresh_primary": (0.010, 0.100, 0.040, float),   # 3: Primary accel variance gate
        "var_g_thresh_primary": (0.001, 0.020, 0.005, float),   # 4: Primary gyro variance gate
        "var_a_thresh_recovery": (0.005, 0.030, 0.015, float),  # 5: Recovery accel variance gate
        "var_g_thresh_recovery": (0.0005, 0.005, 0.002, float), # 6: Recovery gyro variance gate
        "window_size_N": (10, 50, 20, int),                     # 7: Rolling sample window size
        "stationary_hold_count": (5, 25, 10, int),              # 8: Min consecutive still samples
        "alpha_base": (0.0005, 0.010, 0.002, float),            # 9: Ambient gravity learning rate
        "alpha_gyro": (0.0005, 0.010, 0.002, float),            # 10: Gyro bias learning rate
        "eccentric_vel_trigger": (-0.25, -0.05, -0.12, float),  # 11: Eccentric descent trigger
        "concentric_vel_trigger": (0.05, 0.25, 0.10, float),    # 12: Concentric inflection trigger
        "concentric_lockout_ms": (100, 500, 250, int),          # 13: Refractory lockout duration
        "pause_motionless_max_ms": (2000, 5000, 3500, int),     # 14: Max motionless pause hold
        "stall_persistence_count": (10, 50, 25, int),           # 15: Low-velocity stall persistence
        "concentric_timeout_s": (3.0, 10.0, 6.0, float),        # 16: Concentric stroke timeout
        "eccentric_timeout_s": (4.0, 15.0, 8.0, float),         # 17: Eccentric stroke timeout
        "runaway_velocity_clamp": (4.0, 12.0, 8.0, float),      # 18: Runaway velocity threshold
    }

    def __init__(self, params=None):
        self.params = {}
        for key, (min_v, max_v, def_v, typ) in self.GENOME_SPEC.items():
            if params and key in params:
                val = typ(params[key])
                self.params[key] = max(min_v, min(max_v, val))
            else:
                self.params[key] = typ(def_v)

    def to_dict(self):
        return dict(self.params)

    def to_vector(self):
        """Returns 18-element normalized vector [0.0, 1.0]."""
        vec = []
        for key, (min_v, max_v, _, _) in self.GENOME_SPEC.items():
            val = self.params[key]
            norm = (val - min_v) / (max_v - min_v)
            vec.append(norm)
        return vec

    @classmethod
    def from_vector(cls, vec):
        """Constructs genome from 18-element normalized vector [0.0, 1.0]."""
        params = {}
        for (key, (min_v, max_v, _, typ)), norm_val in zip(cls.GENOME_SPEC.items(), vec):
            clipped = max(0.0, min(1.0, norm_val))
            raw_val = min_v + clipped * (max_v - min_v)
            params[key] = typ(round(raw_val) if typ is int else raw_val)
        return cls(params)

    def validate(self):
        """Validates all 18 parameters are within formal specification bounds."""
        for key, (min_v, max_v, _, typ) in self.GENOME_SPEC.items():
            if key not in self.params:
                return False, f"Missing gene: {key}"
            val = self.params[key]
            if not isinstance(val, (int, float)):
                return False, f"Invalid type for {key}: {type(val)}"
            if val < min_v or val > max_v:
                return False, f"Value {val} out of bounds [{min_v}, {max_v}] for {key}"
        return True, "Valid"


# ═════════════════════════════════════════════════════════════════════════════
# 4. 100Hz MULTI-AGENT SUPERVISOR & ROOT-CAUSE FAULT CLASSIFIER
# ═════════════════════════════════════════════════════════════════════════════
class VBTAnomaly:
    def __init__(self, t, subagent, description, root_cause):
        self.t = t
        self.subagent = subagent
        self.description = description
        self.root_cause = root_cause

    def to_dict(self):
        return {
            "t": self.t,
            "subagent": self.subagent,
            "description": self.description,
            "root_cause": self.root_cause
        }


class VBTSupervisorOracle:
    """100Hz Multi-Agent Supervisor evaluating Rest/ZUPT, Rep Stroke, FSM Deadlock, and Numerical Health."""

    ROOT_CAUSES = ["Sensor Noise", "Threshold Mismatch", "Numerical Drift", "FSM Deadlock"]

    @staticmethod
    def inspect_sample(t, tracker_state, is_physically_stationary, is_in_concentric):
        """Evaluates 4 subagents at current time slice."""
        anomalies = []

        # Subagent 1: Rest/ZUPT Inspector
        if is_physically_stationary:
            if abs(tracker_state.get("velocity", 0.0)) > 0.05:
                anomalies.append(VBTAnomaly(
                    t, "RestZUPT", "Non-zero velocity while physically stationary", "Threshold Mismatch"
                ))

        # Subagent 2: Rep Stroke Inspector
        if is_in_concentric and tracker_state.get("currentState") == "IDLE":
            anomalies.append(VBTAnomaly(
                t, "RepStroke", "Concentric stroke prematurely truncated into IDLE", "Threshold Mismatch"
            ))

        # Subagent 3: FSM Deadlock Inspector
        state_duration = tracker_state.get("state_duration", 0.0)
        curr_state = tracker_state.get("currentState", "IDLE")
        if curr_state == "ECCENTRIC" and state_duration > 8.5:
            anomalies.append(VBTAnomaly(
                t, "FSMDeadlock", "Eccentric state duration exceeded 8.5s without abort", "FSM Deadlock"
            ))
        elif curr_state == "CONCENTRIC" and state_duration > 6.5:
            anomalies.append(VBTAnomaly(
                t, "FSMDeadlock", "Concentric state duration exceeded 6.5s without completion", "FSM Deadlock"
            ))

        # Subagent 4: Numerical Health Inspector
        v = tracker_state.get("velocity", 0.0)
        if math.isnan(v) or math.isinf(v):
            anomalies.append(VBTAnomaly(
                t, "NumericalHealth", f"Non-finite velocity value: {v}", "Numerical Drift"
            ))
        elif abs(v) > 8.5:
            anomalies.append(VBTAnomaly(
                t, "NumericalHealth", f"Velocity exceeded safety runaway threshold: {v}", "Numerical Drift"
            ))

        return anomalies

    @staticmethod
    def classify_root_cause(anomaly_type, context=None):
        """Rule-based root cause classifier."""
        if "noise" in anomaly_type.lower() or "spike" in anomaly_type.lower():
            return "Sensor Noise"
        if "nan" in anomaly_type.lower() or "drift" in anomaly_type.lower() or "inf" in anomaly_type.lower():
            return "Numerical Drift"
        if "timeout" in anomaly_type.lower() or "deadlock" in anomaly_type.lower() or "stuck" in anomaly_type.lower():
            return "FSM Deadlock"
        return "Threshold Mismatch"


# ═════════════════════════════════════════════════════════════════════════════
# 5. EMBEDDED C++ SOURCE AST & STATIC ANALYSIS ORACLE
# ═════════════════════════════════════════════════════════════════════════════
class VBTCppSourceAnalyzer:
    """Parses and validates firmware architectural guarantees in src/main.cpp."""

    def __init__(self, main_cpp_path=MAIN_CPP_PATH):
        self.path = main_cpp_path
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as f:
                self.content = f.read()
        else:
            self.content = ""

    def get_loop_function_body(self):
        """Extracts the body of void loop()."""
        match = re.search(r"void\s+loop\s*\(\s*\)\s*\{(.*)\}", self.content, re.DOTALL)
        return match.group(1) if match else ""

    def verify_no_blocking_delays_in_loop(self):
        """Ensures loop() contains no long blocking delays (only active 10ms pacing)."""
        body = self.get_loop_function_body()
        if not body:
            return False, "Could not extract loop() body"
        # Search for delay() calls
        delays = re.findall(r"delay\s*\(\s*([^)]+)\s*\)", body)
        for d in delays:
            # Active pacing delay(LOOP_PERIOD_MS - elapsed_ms) or small remainder is permissible
            if "LOOP_PERIOD_MS" not in d and not any(k in d for k in ["10", "ms", "elapsed"]):
                return False, f"Disallowed blocking delay found in loop(): delay({d})"
        return True, "No blocking delays in loop"

    def verify_deterministic_100hz_loop(self):
        """Checks for deterministic 10ms / 100Hz period pacing."""
        has_period_const = bool(re.search(r"LOOP_PERIOD_MS\s*=\s*10", self.content))
        has_loop_pacing = bool(re.search(r"elapsed_ms\s*<\s*LOOP_PERIOD_MS", self.content))
        return (has_period_const and has_loop_pacing), "100Hz pacing verified"

    def verify_dynamic_i2c_bus_protection(self):
        """Checks for I2C bus error protection and timeout safeguards."""
        has_wire_timeout = bool(re.search(r"Wire\.setTimeOut\s*\(\s*25\s*\)", self.content))
        has_nan_protection = bool(re.search(r"isnan\s*\(\s*a\.acceleration\.x\s*\)", self.content))
        return (has_wire_timeout and has_nan_protection), "I2C protection verified"

    def verify_boot_motion_auto_recalibration(self):
        """Checks for dual-tier variance recovery allowing rest calibration without reboot."""
        has_tier2_recovery = bool(re.search(r"isRecoveryStill", self.content))
        has_online_adaptation = bool(re.search(r"gravity_baseline\s*=\s*\(0\.998f\s*\*\s*gravity_baseline\)", self.content))
        return (has_tier2_recovery and has_online_adaptation), "Boot auto-recalibration verified"

    def verify_sticking_point_remediation(self):
        """Checks for low-velocity stall persistence and 3.5s pause allowances."""
        has_stall_persistence = bool(re.search(r"low_velocity_concentric_count\s*>=\s*25", self.content))
        has_3500ms_pause = bool(re.search(r"motionless_in_eccentric_ms\s*>\s*3500", self.content))
        return (has_stall_persistence and has_3500ms_pause), "Sticking-point remediation verified"

    def verify_nondestructive_ble_reconnect(self):
        """Checks that BLE disconnect does not wipe physics state."""
        # onDisconnect callback
        match = re.search(r"void\s+onDisconnect\s*\([^)]*\)\s*\{([^}]*)\}", self.content)
        if not match:
            return False, "onDisconnect callback not found"
        body = match.group(1)
        # Should NOT call resetPhysicsState()
        if "resetPhysicsState" in body:
            return False, "resetPhysicsState() should not be called in onDisconnect"
        return True, "Non-destructive BLE disconnect confirmed"

    def verify_ble_gatt_uuids(self):
        """Verifies GATT service, data, and command UUIDs match project specs."""
        service_uuid = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
        data_uuid = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
        cmd_uuid = "5a7d3c90-951d-444a-8f5b-11c500732890"

        has_service = service_uuid.lower() in self.content.lower()
        has_data = data_uuid.lower() in self.content.lower()
        has_cmd = cmd_uuid.lower() in self.content.lower()

        return (has_service and has_data and has_cmd), "All 3 BLE UUIDs verified"


# ═════════════════════════════════════════════════════════════════════════════
# 6. DECLARATIVE REGRESSION CASE SCHEMA & VALIDATOR
# ═════════════════════════════════════════════════════════════════════════════
class VBTRegressionCaseValidator:
    """Validates declarative JSON regression test cases."""

    REQUIRED_ROOT_KEYS = ["case_id", "lift_type", "ground_truth", "tolerances"]
    REQUIRED_GROUND_TRUTH = ["reps", "displacement_m", "duration_s", "peak_velocity_mps", "mean_velocity_mps"]
    REQUIRED_TOLERANCES = ["rep_count_error", "max_velocity_error_mps", "max_residual_drift_mps"]

    @classmethod
    def validate_case(cls, case_data):
        """Validates dictionary against schema requirements."""
        if not isinstance(case_data, dict):
            return False, "Case data must be a JSON dictionary"

        for k in cls.REQUIRED_ROOT_KEYS:
            if k not in case_data:
                return False, f"Missing required root key: '{k}'"

        if case_data["lift_type"] not in ["Squat", "Bench", "Deadlift", "General"]:
            return False, f"Invalid lift_type: {case_data['lift_type']}"

        gt = case_data["ground_truth"]
        for k in cls.REQUIRED_GROUND_TRUTH:
            if k not in gt:
                return False, f"Missing ground_truth key: '{k}'"
            if gt[k] < 0:
                return False, f"Ground truth '{k}' cannot be negative: {gt[k]}"

        tol = case_data["tolerances"]
        for k in cls.REQUIRED_TOLERANCES:
            if k not in tol:
                return False, f"Missing tolerance key: '{k}'"
            if tol[k] < 0:
                return False, f"Tolerance '{k}' cannot be negative: {tol[k]}"

        return True, "Valid"

    @classmethod
    def create_canonical_case(cls, case_id, lift_type, reps, disp, dur, peak_v, mcv, faults=None):
        return {
            "case_id": case_id,
            "lift_type": lift_type,
            "ground_truth": {
                "reps": reps,
                "displacement_m": disp,
                "duration_s": dur,
                "peak_velocity_mps": peak_v,
                "mean_velocity_mps": mcv
            },
            "fault_injections": faults or [],
            "tolerances": {
                "rep_count_error": 0,
                "max_velocity_error_mps": 0.05,
                "max_residual_drift_mps": 0.03
            }
        }
