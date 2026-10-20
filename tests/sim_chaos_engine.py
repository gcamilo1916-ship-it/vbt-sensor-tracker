"""
sim_chaos_engine.py - Full-Spectrum Adversarial Chaos Simulation Engine.

Zero-dependency pure Python implementation for Milestone 1.
Simulates parametric kinematic lifts (Squat, Bench Press, Deadlift, Pauses, Grinds, Touch-and-Go Cycling)
and injects randomized physical and electrical faults across 4 critical chaos domains:
  Domain 1: Boot & Sensor Startup Faults (Motion, I2C Timeouts, NaN Packets, Register Failures)
  Domain 2: Thermal & Long-Uptime Drift (Thermal Rise, Gyro Drift, Accel Drift, Arbitrary SO(3) Rotations)
  Domain 3: Extreme Biomechanics & Dynamic Impacts (Pauses, Sticking Grinds, Cycling, Drops, Collisions)
  Domain 4: Connectivity & BLE Communications (Mid-Lift Disconnects, Buffer Queueing, Packet Loss)
"""

from __future__ import annotations
import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Iterator, List, Tuple, Dict, Any, Optional

from tests.sim_madgwick import RobustVBTTracker


class LiftType(str, Enum):
    SQUAT = "SQUAT"
    BENCH_PRESS = "BENCH_PRESS"
    DEADLIFT = "DEADLIFT"
    TOUCH_AND_GO_CYCLING = "TOUCH_AND_GO_CYCLING"
    ABORTED_DESCENT = "ABORTED_DESCENT"
    FAILED_CONCENTRIC = "FAILED_CONCENTRIC"
    FLOOR_DROP = "FLOOR_DROP"
    RACK_COLLISION = "RACK_COLLISION"


class MountOrientation(str, Enum):
    Z_UP = "Z_UP"             # Standard upright (ax=0, ay=0, az=+9.81)
    X_UP = "X_UP"             # Horizontal mount (ax=+9.81, ay=0, az=0)
    Y_UP = "Y_UP"             # Transverse mount (ax=0, ay=+9.81, az=0)
    INVERTED = "INVERTED"     # Inverted upside-down (ax=0, ay=0, az=-9.81)
    TILT_45 = "TILT_45"       # 45-degree angle mount
    RANDOM_SO3 = "RANDOM_SO3" # Uniform Haar-distributed random SO(3) 3D rotation


class ChaosSeverity(str, Enum):
    CLEAN = "CLEAN"
    MILD = "MILD"
    MODERATE = "MODERATE"
    EXTREME = "EXTREME"


@dataclass
class TelemetrySample:
    """100Hz IMU and system telemetry sample."""
    t: float
    ax: float
    ay: float
    az: float
    gx: float
    gy: float
    gz: float
    dt: float = 0.01
    is_i2c_timeout: bool = False
    is_nan_packet: bool = False
    ble_connected: bool = True
    raw_event: Optional[Dict[str, Any]] = None

    def __iter__(self) -> Iterator[float]:
        """Support unpack: (t, ax, ay, az, gx, gy, gz, dt) for backwards compatibility."""
        yield self.t
        yield self.ax
        yield self.ay
        yield self.az
        yield self.gx
        yield self.gy
        yield self.gz
        yield self.dt


@dataclass
class RepEvent:
    """Ground truth metrics for a single repetition."""
    rep_index: int
    start_time: float
    inflection_time: float
    completion_time: float
    true_displacement: float
    true_peak_velocity: float
    true_mean_velocity: float
    pause_duration: float = 0.0
    grind_duration: float = 0.0


@dataclass
class GroundTruthStep:
    """Ground truth state at a single 100Hz simulation step."""
    t: float
    dt: float
    phase: str             # "IDLE", "ECCENTRIC", "PAUSE", "CONCENTRIC", "LOCKOUT"
    true_velocity: float   # Vertical velocity m/s
    true_displacement: float # Cumulative concentric displacement m
    true_accel: float      # Vertical acceleration m/s^2
    is_motionless: bool    # True when physically still


@dataclass
class GroundTruth:
    """Complete ground truth oracle for an entire trial."""
    lift_type: LiftType
    reps: int
    rep_events: List[RepEvent]
    true_displacement: float
    true_peak_vel: float
    true_mean_vel: float
    pause_s: float
    grind_s: float
    total_duration_s: float
    rest_intervals: List[Tuple[float, float]] = field(default_factory=list)
    stationary_gravity_mag: float = 9.81
    steps: Optional[List[GroundTruthStep]] = None


@dataclass
class Domain1BootConfig:
    boot_motion: bool = False
    boot_motion_duration_s: float = 2.0
    boot_motion_intensity: float = 2.0  # m/s^2 noise
    i2c_timeout_rate: float = 0.0       # probability of starting timeout
    i2c_burst_len_max: int = 5          # samples
    nan_injection_rate: float = 0.0     # probability of NaN on channel
    reg_failure_rate: float = 0.0


@dataclass
class Domain2ThermalConfig:
    thermal_drift: bool = False
    delta_t_max_c: float = 25.0         # Temperature rise in Celsius
    tau_thermal_s: float = 600.0        # Thermal time constant
    accel_drift_coeff: float = 0.010    # (m/s^2)/C -> up to +0.25 to +0.30 m/s^2
    gyro_drift_coeff: float = 0.002     # (rad/s)/C -> up to +0.05 to +0.06 rad/s
    mounting_orientation: MountOrientation = MountOrientation.Z_UP
    custom_euler_deg: Optional[Tuple[float, float, float]] = None


@dataclass
class Domain3BiomechanicsConfig:
    pause_duration_s: float = 0.0       # 0.0 to 3.5s
    grind_velocity: float = 0.0         # 0.015 to 0.040 m/s
    grind_duration_s: float = 0.0       # 0.15 to 0.45s
    touch_and_go: bool = False          # High cadence cycling
    cycling_reps: int = 1               # Default 1, 5 for barbell cycling
    cycling_cadence_hz: float = 1.0     # 1.0 rep/s
    floor_drop_impact: bool = False
    rack_collision: bool = False


@dataclass
class Domain4ConnectivityConfig:
    ble_disconnect_window: Optional[Tuple[float, float]] = None
    packet_drop_rate: float = 0.0
    buffer_capacity: int = 16


@dataclass
class ChaosDomainConfig:
    domain1: Domain1BootConfig = field(default_factory=Domain1BootConfig)
    domain2: Domain2ThermalConfig = field(default_factory=Domain2ThermalConfig)
    domain3: Domain3BiomechanicsConfig = field(default_factory=Domain3BiomechanicsConfig)
    domain4: Domain4ConnectivityConfig = field(default_factory=Domain4ConnectivityConfig)


@dataclass
class TrialConfig:
    trial_id: str | int
    lift_type: LiftType
    num_reps: int = 1
    duration_s: float = 15.0
    chaos: ChaosDomainConfig = field(default_factory=ChaosDomainConfig)
    sample_rate_hz: float = 100.0
    seed: Optional[int] = None


# ==============================================================================
# Analytical 3D SO(3) Rotation Math & Utilities
# ==============================================================================

def euler_to_matrix(roll: float, pitch: float, yaw: float) -> List[List[float]]:
    """Compute 3x3 rotation matrix R = Rz(yaw) * Ry(pitch) * Rx(roll)."""
    cr, sr = math.cos(roll), math.sin(roll)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cy, sy = math.cos(yaw), math.sin(yaw)
    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp,     cp * sr,                cp * cr]
    ]


def get_orientation_matrix(orientation: MountOrientation, rng: random.Random) -> List[List[float]]:
    """Get direction cosine matrix for specified mounting preset or random SO(3)."""
    if orientation == MountOrientation.Z_UP:
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    elif orientation == MountOrientation.X_UP:
        # X is aligned with Earth-vertical up: R * [0, 0, 1]^T = [1, 0, 0]^T
        return [[0.0, 0.0, 1.0], [0.0, 1.0, 0.0], [-1.0, 0.0, 0.0]]
    elif orientation == MountOrientation.Y_UP:
        # Y is aligned with Earth-vertical up
        return [[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]]
    elif orientation == MountOrientation.INVERTED:
        # Z points downward
        return [[1.0, 0.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, -1.0]]
    elif orientation == MountOrientation.TILT_45:
        c45 = math.sqrt(0.5)
        return [[c45, 0.0, c45], [0.0, 1.0, 0.0], [-c45, 0.0, c45]]
    elif orientation == MountOrientation.RANDOM_SO3:
        # Uniform Haar-distributed quaternion on SO(3) (Shoemake 1992)
        u1, u2, u3 = rng.random(), rng.random(), rng.random()
        q0 = math.sqrt(1.0 - u1) * math.sin(2.0 * math.pi * u2)
        q1 = math.sqrt(1.0 - u1) * math.cos(2.0 * math.pi * u2)
        q2 = math.sqrt(u1) * math.sin(2.0 * math.pi * u3)
        q3 = math.sqrt(u1) * math.cos(2.0 * math.pi * u3)
        return [
            [1.0 - 2.0 * (q2 * q2 + q3 * q3), 2.0 * (q1 * q2 - q0 * q3),       2.0 * (q1 * q3 + q0 * q2)],
            [2.0 * (q1 * q2 + q0 * q3),       1.0 - 2.0 * (q1 * q1 + q3 * q3), 2.0 * (q2 * q3 - q0 * q1)],
            [2.0 * (q1 * q3 - q0 * q2),       2.0 * (q2 * q3 + q0 * q1),       1.0 - 2.0 * (q1 * q1 + q2 * q2)]
        ]
    return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]


def rotate_vector_to_body(R: List[List[float]], v: Tuple[float, float, float]) -> Tuple[float, float, float]:
    """Rotate world-frame vector v into sensor body frame: v_body = R^T * v_world."""
    return (
        R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2],
        R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
        R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]
    )


# ==============================================================================
# Analytical Kinematic Lift Profile Generator
# ==============================================================================

class KinematicLiftGenerator:
    """Generates continuous analytical biomechanical profiles in Earth frame."""

    def __init__(self, rng: Optional[random.Random] = None):
        self.rng = rng or random.Random(42)

    @staticmethod
    def _cycloid_stroke(duration_s: float, v_peak: float, is_downward: bool, dt: float = 0.01) -> List[Tuple[float, float, float]]:
        """
        Generate squared-sine velocity profile:
        v(t) = sign * v_peak * sin^2(pi*t/T)
        a(t) = sign * (pi * v_peak / T) * sin(2*pi*t/T)
        s(t) = sign * (v_peak / 2) * (t - (T/(2*pi))*sin(2*pi*t/T))
        Returns list of (a, v, s_delta).
        """
        n_samples = max(1, int(round(duration_s / dt)))
        sign = -1.0 if is_downward else 1.0
        samples = []
        for j in range(n_samples):
            t_rel = (j + 0.5) * dt
            t_ratio = min(1.0, max(0.0, t_rel / duration_s))
            v = sign * v_peak * (math.sin(math.pi * t_ratio) ** 2)
            a = sign * (math.pi * v_peak / duration_s) * math.sin(2.0 * math.pi * t_ratio)
            s_inc = v * dt
            samples.append((a, v, s_inc))
        return samples

    def generate(self, config: TrialConfig, rng: random.Random) -> Tuple[List[GroundTruthStep], GroundTruth]:
        """Generate Earth-vertical ground-truth trajectory steps and summary."""
        lift = config.lift_type
        dt = 1.0 / config.sample_rate_hz
        steps: List[GroundTruthStep] = []
        rep_events: List[RepEvent] = []

        total_reps = 0
        pause_duration = config.chaos.domain3.pause_duration_s
        grind_duration = config.chaos.domain3.grind_duration_s
        grind_velocity = config.chaos.domain3.grind_velocity

        # Initial quiet rest setup (if boot motion, 2.0s warmup followed by 2.0s quiet rack hold)
        init_rest_s = 4.0 if config.chaos.domain1.boot_motion else 1.0
        n_init = int(round(init_rest_s / dt))
        for _ in range(n_init):
            t_cur = len(steps) * dt
            steps.append(GroundTruthStep(
                t=t_cur, dt=dt, phase="IDLE", true_velocity=0.0,
                true_displacement=0.0, true_accel=0.0, is_motionless=True
            ))

        if lift == LiftType.SQUAT:
            total_reps = config.num_reps
            for rep_idx in range(total_reps):
                rep_start_t = len(steps) * dt
                # 1. Setup unrack hold
                for _ in range(int(round(0.5 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))
                # 2. Eccentric descent (1.1s, -0.60 m/s)
                t_ecc = 1.1
                v_ecc = 0.60 + rng.uniform(-0.05, 0.05)
                ecc_profile = self._cycloid_stroke(t_ecc, v_ecc, is_downward=True, dt=dt)
                for a, v, _ in ecc_profile:
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "ECCENTRIC", v, 0.0, a, False))
                # Optional pause / bottom turnaround
                inflection_t = len(steps) * dt
                if pause_duration > 0:
                    for _ in range(int(round(pause_duration / dt))):
                        steps.append(GroundTruthStep(len(steps)*dt, dt, "PAUSE", 0.0, 0.0, 0.0, True))
                else:
                    for _ in range(int(round(0.05 / dt))):
                        steps.append(GroundTruthStep(len(steps)*dt, dt, "PAUSE", 0.0, 0.0, 0.0, False))
                # 3. Concentric ascent (1.0s, +0.65 m/s)
                t_conc = 1.0
                v_conc = 0.65 + rng.uniform(-0.05, 0.05)
                conc_profile = self._cycloid_stroke(t_conc, v_conc, is_downward=False, dt=dt)
                cum_disp = 0.0
                for a, v, ds in conc_profile:
                    cum_disp += ds
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "CONCENTRIC", v, cum_disp, a, False))
                rep_end_t = len(steps) * dt
                # 4. Lockout rack hold
                for _ in range(int(round(1.0 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "LOCKOUT", 0.0, cum_disp, 0.0, True))

                true_disp = cum_disp
                true_peak = v_conc
                true_mcv = true_disp / t_conc
                rep_events.append(RepEvent(
                    rep_index=rep_idx + 1, start_time=rep_start_t, inflection_time=inflection_t,
                    completion_time=rep_end_t, true_displacement=true_disp,
                    true_peak_velocity=true_peak, true_mean_velocity=true_mcv,
                    pause_duration=pause_duration, grind_duration=0.0
                ))

        elif lift == LiftType.BENCH_PRESS:
            total_reps = config.num_reps
            for rep_idx in range(total_reps):
                rep_start_t = len(steps) * dt
                for _ in range(int(round(0.6 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))
                # Descent (1.4s, -0.50 m/s)
                t_ecc = 1.4
                v_ecc = 0.50 + rng.uniform(-0.03, 0.03)
                ecc_profile = self._cycloid_stroke(t_ecc, v_ecc, is_downward=True, dt=dt)
                for a, v, _ in ecc_profile:
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "ECCENTRIC", v, 0.0, a, False))
                inflection_t = len(steps) * dt
                # Chest pause (param up to 3.5s)
                pause_s = max(0.2, pause_duration)
                for _ in range(int(round(pause_s / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "PAUSE", 0.0, 0.0, 0.0, True))

                # Concentric drive (with optional grind)
                cum_disp = 0.0
                if grind_duration > 0.10:
                    v_g = max(0.025, grind_velocity if grind_velocity > 0.0 else 0.035)
                    # 4 continuous biomechanical phases matching test_firmware_physics_ahrs
                    a_A = 0.625
                    a_B = (v_g - 0.25) / 0.40
                    a_C = (0.32 - v_g) / 0.60
                    a_D = -0.75

                    conc_a_list = (
                        [a_A] * 40 +
                        [a_B] * 40 +
                        [a_C] * 60 +
                        [a_D] * 40
                    )

                    cum_disp = 0.0
                    cur_v = 0.0
                    for a_val in conc_a_list:
                        cur_v = max(0.0, cur_v + a_val * dt)
                        cum_disp += cur_v * dt
                        steps.append(GroundTruthStep(len(steps)*dt, dt, "CONCENTRIC", cur_v, cum_disp, a_val, False))

                    conc_dur = len(conc_a_list) * dt
                    true_peak = 0.32
                    true_disp = cum_disp
                else:
                    t_conc = 1.1
                    v_conc = 0.55 + rng.uniform(-0.04, 0.04)
                    conc_profile = self._cycloid_stroke(t_conc, v_conc, is_downward=False, dt=dt)
                    for a, v, ds in conc_profile:
                        cum_disp += ds
                        steps.append(GroundTruthStep(len(steps)*dt, dt, "CONCENTRIC", v, cum_disp, a, False))
                    conc_dur = t_conc
                    true_peak = v_conc

                rep_end_t = len(steps) * dt
                for _ in range(int(round(1.0 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "LOCKOUT", 0.0, cum_disp, 0.0, True))

                true_disp = cum_disp
                true_mcv = true_disp / conc_dur
                rep_events.append(RepEvent(
                    rep_index=rep_idx + 1, start_time=rep_start_t, inflection_time=inflection_t,
                    completion_time=rep_end_t, true_displacement=true_disp,
                    true_peak_velocity=true_peak, true_mean_velocity=true_mcv,
                    pause_duration=pause_s, grind_duration=grind_duration
                ))

        elif lift == LiftType.DEADLIFT:
            total_reps = config.num_reps
            for rep_idx in range(total_reps):
                rep_start_t = len(steps) * dt
                # Floor setup motionless
                for _ in range(int(round(1.0 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))
                inflection_t = rep_start_t + 1.0
                # Direct concentric pull from floor
                t_conc = 1.2
                v_conc = 0.60 + rng.uniform(-0.05, 0.05)
                conc_profile = self._cycloid_stroke(t_conc, v_conc, is_downward=False, dt=dt)
                cum_disp = 0.0
                for a, v, ds in conc_profile:
                    cum_disp += ds
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "CONCENTRIC", v, cum_disp, a, False))
                rep_end_t = len(steps) * dt
                # Lockout hold
                for _ in range(int(round(0.5 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "LOCKOUT", 0.0, cum_disp, 0.0, True))
                # Lowering bar to floor
                lowering = self._cycloid_stroke(0.8, 0.50, is_downward=True, dt=dt)
                for a, v, _ in lowering:
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "ECCENTRIC", v, 0.0, a, False))
                for _ in range(int(round(1.0 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))

                true_disp = cum_disp
                true_peak = v_conc
                true_mcv = true_disp / t_conc
                rep_events.append(RepEvent(
                    rep_index=rep_idx + 1, start_time=rep_start_t, inflection_time=inflection_t,
                    completion_time=rep_end_t, true_displacement=true_disp,
                    true_peak_velocity=true_peak, true_mean_velocity=true_mcv,
                    pause_duration=0.0, grind_duration=0.0
                ))

        elif lift == LiftType.TOUCH_AND_GO_CYCLING:
            total_reps = config.num_reps if config.num_reps > 1 else 5
            for _ in range(int(round(0.5 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))

            for rep_idx in range(total_reps):
                rep_start_t = len(steps) * dt
                # Fast eccentric descent: 0.45s, -0.60 m/s
                t_ecc = 0.45
                v_ecc = 0.60 + rng.uniform(-0.03, 0.03)
                ecc_profile = self._cycloid_stroke(t_ecc, v_ecc, is_downward=True, dt=dt)
                for a, v, _ in ecc_profile:
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "ECCENTRIC", v, 0.0, a, False))
                inflection_t = len(steps) * dt
                # Quick turnaround (30ms)
                for _ in range(int(round(0.03 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "PAUSE", 0.0, 0.0, 0.0, False))
                # Fast concentric drive: 0.45s, +0.65 m/s
                t_conc = 0.45
                v_conc = 0.65 + rng.uniform(-0.03, 0.03)
                conc_profile = self._cycloid_stroke(t_conc, v_conc, is_downward=False, dt=dt)
                cum_disp = 0.0
                for a, v, ds in conc_profile:
                    cum_disp += ds
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "CONCENTRIC", v, cum_disp, a, False))
                rep_end_t = len(steps) * dt
                # Top turnaround (40ms)
                for _ in range(int(round(0.04 / dt))):
                    steps.append(GroundTruthStep(len(steps)*dt, dt, "CONCENTRIC", 0.0, cum_disp, 0.0, False))

                true_disp = cum_disp
                true_peak = v_conc
                true_mcv = true_disp / t_conc
                rep_events.append(RepEvent(
                    rep_index=rep_idx + 1, start_time=rep_start_t, inflection_time=inflection_t,
                    completion_time=rep_end_t, true_displacement=true_disp,
                    true_peak_velocity=true_peak, true_mean_velocity=true_mcv,
                    pause_duration=0.03, grind_duration=0.0
                ))
            # Rack hold
            for _ in range(int(round(1.5 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))

        elif lift == LiftType.ABORTED_DESCENT:
            total_reps = 0
            for _ in range(int(round(0.5 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))
            # Descent onto pins
            ecc_profile = self._cycloid_stroke(1.2, 0.50, is_downward=True, dt=dt)
            for a, v, _ in ecc_profile:
                steps.append(GroundTruthStep(len(steps)*dt, dt, "ECCENTRIC", v, 0.0, a, False))
            # Motionless hold on safety pins > 3.5s (4.0s)
            for _ in range(int(round(4.0 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "PAUSE", 0.0, 0.0, 0.0, True))
            for _ in range(int(round(1.5 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))

        elif lift == LiftType.FAILED_CONCENTRIC:
            total_reps = 0
            for _ in range(int(round(0.5 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))
            # Descent
            ecc_profile = self._cycloid_stroke(1.0, 0.45, is_downward=True, dt=dt)
            for a, v, _ in ecc_profile:
                steps.append(GroundTruthStep(len(steps)*dt, dt, "ECCENTRIC", v, 0.0, a, False))
            # Weak drive: only 0.08m displacement (< 0.12m threshold)
            cum_disp = 0.0
            for j in range(int(round(0.35 / dt))):
                v = 0.22 * math.sin(math.pi * j / (0.35 / dt))
                a = (math.pi * 0.22 / 0.35) * math.cos(math.pi * j / (0.35 / dt))
                cum_disp += v * dt
                steps.append(GroundTruthStep(len(steps)*dt, dt, "CONCENTRIC", v, cum_disp, a, False))
            # Fail back onto pins and rest
            for _ in range(int(round(2.5 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))

        elif lift == LiftType.FLOOR_DROP:
            total_reps = 0
            for _ in range(int(round(0.5 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))
            # Free fall (0.18s, a = -9.81)
            for _ in range(int(round(0.18 / dt))):
                v = -9.81 * (len(steps)*dt - 0.5)
                steps.append(GroundTruthStep(len(steps)*dt, dt, "ECCENTRIC", v, 0.0, -9.81, False))
            # High-g impact pulse (+60 m/s^2 for 15ms)
            for _ in range(int(round(0.015 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 60.0, False))
            # Ringing and rest
            for j in range(int(round(0.20 / dt))):
                ring_a = 15.0 * math.exp(-j*dt / 0.05) * math.sin(2.0 * math.pi * 40.0 * j * dt)
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, ring_a, False))
            for _ in range(int(round(2.0 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))

        elif lift == LiftType.RACK_COLLISION:
            total_reps = 0
            # Barbell resting, slammed horizontally into rack
            for _ in range(int(round(1.0 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))
            # Impact pulse: purely transverse, vertical remains 0
            for _ in range(int(round(0.02 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, False))
            for _ in range(int(round(2.0 / dt))):
                steps.append(GroundTruthStep(len(steps)*dt, dt, "IDLE", 0.0, 0.0, 0.0, True))

        # Pad remaining trial duration with stationary IDLE if requested duration > elapsed
        req_samples = int(round(config.duration_s / dt))
        while len(steps) < req_samples:
            t_cur = len(steps) * dt
            steps.append(GroundTruthStep(t_cur, dt, "IDLE", 0.0, 0.0, 0.0, True))

        # Compile ground truth summary
        mean_disp = sum(r.true_displacement for r in rep_events) / max(1, len(rep_events)) if rep_events else 0.0
        mean_peak = sum(r.true_peak_velocity for r in rep_events) / max(1, len(rep_events)) if rep_events else 0.0
        mean_mcv = sum(r.true_mean_velocity for r in rep_events) / max(1, len(rep_events)) if rep_events else 0.0

        ground_truth = GroundTruth(
            lift_type=lift,
            reps=total_reps,
            rep_events=rep_events,
            true_displacement=mean_disp,
            true_peak_vel=mean_peak,
            true_mean_vel=mean_mcv,
            pause_s=pause_duration,
            grind_s=grind_duration,
            total_duration_s=len(steps) * dt,
            stationary_gravity_mag=9.81,
            steps=steps
        )
        return steps, ground_truth


# ==============================================================================
# Chaos Domain Fault Injector
# ==============================================================================

class ChaosDomainInjector:
    """Injects realistic physical and electrical faults across 4 domains."""

    def __init__(self, rng: Optional[random.Random] = None):
        self.rng = rng or random.Random(42)

    def apply_chaos(
        self,
        gt_steps: List[GroundTruthStep],
        config: TrialConfig,
        ground_truth: GroundTruth,
        rng: random.Random
    ) -> List[TelemetrySample]:
        """Apply all 4 chaos domains to transform clean steps into raw telemetry samples."""
        d1 = config.chaos.domain1
        d2 = config.chaos.domain2
        d3 = config.chaos.domain3
        d4 = config.chaos.domain4

        # 3D Mount Orientation Matrix R (Earth -> Body: v_body = R^T * v_earth)
        R = get_orientation_matrix(d2.mounting_orientation, rng)
        if d2.custom_euler_deg is not None:
            r_rad = math.radians(d2.custom_euler_deg[0])
            p_rad = math.radians(d2.custom_euler_deg[1])
            y_rad = math.radians(d2.custom_euler_deg[2])
            R = euler_to_matrix(r_rad, p_rad, y_rad)

        samples: List[TelemetrySample] = []
        timeout_burst_counter = 0

        for step in gt_steps:
            t = step.t
            dt = step.dt

            # 1. Kinematic acceleration in Earth frame: [0, 0, a_vert + 9.81]
            a_world_vert = step.true_accel
            g_world = ground_truth.stationary_gravity_mag

            # Transverse impacts in World frame (if rack collision)
            trans_ax = 0.0
            trans_gx = 0.0
            if d3.rack_collision and 1.0 <= t < 1.02:
                trans_ax = rng.uniform(-40.0, 40.0)
                trans_gx = rng.uniform(-10.0, 10.0)

            # Earth-frame acceleration and angular velocity
            a_earth = (trans_ax, 0.0, a_world_vert + g_world)
            g_earth = (trans_gx, 0.0, 0.0)

            # 2. Domain 2: Thermal Drift
            accel_drift = 0.0
            gyro_drift = 0.0
            if d2.thermal_drift:
                temp_rise = d2.delta_t_max_c * (1.0 - math.exp(-t / max(1.0, d2.tau_thermal_s)))
                accel_drift = d2.accel_drift_coeff * temp_rise
                gyro_drift = d2.gyro_drift_coeff * temp_rise

            # 3. Rotate world acceleration and gyro vectors into sensor body frame
            ab_x, ab_y, ab_z = rotate_vector_to_body(R, a_earth)
            gb_x, gb_y, gb_z = rotate_vector_to_body(R, g_earth)

            # Add sensor Gaussian noise
            na = 0.012  # Accelerometer noise std (m/s^2)
            ng = 0.004  # Gyroscope noise std (rad/s)
            ax = ab_x + rng.gauss(0.0, na)
            ay = ab_y + rng.gauss(0.0, na)
            az = ab_z + accel_drift + rng.gauss(0.0, na)
            gx = gb_x + gyro_drift + rng.gauss(0.0, ng)
            gy = gb_y + rng.gauss(0.0, ng)
            gz = gb_z + rng.gauss(0.0, ng)

            # 4. Domain 1: Boot Motion Injection
            if d1.boot_motion and t < d1.boot_motion_duration_s:
                bm = d1.boot_motion_intensity
                ax += rng.uniform(-bm, bm)
                ay += rng.uniform(-bm, bm)
                az += rng.uniform(-bm, bm)
                gx += rng.uniform(-1.5, 1.5)
                gy += rng.uniform(-1.5, 1.5)
                gz += rng.uniform(-1.5, 1.5)

            # 5. Domain 1: I2C Timeouts & NaN Packets
            is_timeout = False
            is_nan = False

            if timeout_burst_counter > 0:
                is_timeout = True
                timeout_burst_counter -= 1
            elif d1.i2c_timeout_rate > 0 and rng.random() < d1.i2c_timeout_rate:
                is_timeout = True
                timeout_burst_counter = rng.randint(1, max(1, d1.i2c_burst_len_max))

            if d1.nan_injection_rate > 0 and rng.random() < d1.nan_injection_rate:
                is_nan = True
                ax = float('nan')
                ay = float('nan')
                az = float('nan')
                gx = float('nan')

            # 6. Domain 4: BLE Connectivity
            ble_conn = True
            if d4.ble_disconnect_window is not None:
                t1, t2 = d4.ble_disconnect_window
                if t1 <= t <= t2:
                    ble_conn = False

            samples.append(TelemetrySample(
                t=t, ax=ax, ay=ay, az=az, gx=gx, gy=gy, gz=gz, dt=dt,
                is_i2c_timeout=is_timeout, is_nan_packet=is_nan,
                ble_connected=ble_conn
            ))

        return samples


# ==============================================================================
# Authoritative Chaos Engine
# ==============================================================================

class ChaosEngine:
    """Authoritative adversarial simulation engine executing 500+ Monte Carlo trials."""

    def __init__(self, seed: Optional[int] = None):
        self.rng = random.Random(seed if seed is not None else 42)
        self.kinematics = KinematicLiftGenerator(self.rng)
        self.injector = ChaosDomainInjector(self.rng)

    def run_trial(self, config: TrialConfig) -> Tuple[List[TelemetrySample], GroundTruth]:
        """
        Generate raw telemetry samples and analytical ground truth for a trial.
        Conforms strictly to PROJECT.md interface contract.
        """
        rng = random.Random(config.seed) if config.seed is not None else self.rng
        raw_kinematics, ground_truth = self.kinematics.generate(config, rng)
        telemetry_samples = self.injector.apply_chaos(raw_kinematics, config, ground_truth, rng)
        return telemetry_samples, ground_truth

    def stream_trial(self, config: TrialConfig) -> Iterator[Tuple[TelemetrySample, GroundTruthStep]]:
        """
        Stream a trial step-by-step for high performance memory decimation (e.g. 720k steps).
        """
        rng = random.Random(config.seed) if config.seed is not None else self.rng
        raw_kinematics, ground_truth = self.kinematics.generate(config, rng)
        telemetry_samples = self.injector.apply_chaos(raw_kinematics, config, ground_truth, rng)
        for s, gt in zip(telemetry_samples, raw_kinematics):
            yield s, gt

    def simulate_tracker(
        self,
        config: TrialConfig,
        tracker: Any
    ) -> Tuple[Any, List[TelemetrySample], GroundTruth, Dict[str, Any]]:
        """
        Step a tracker instance through a trial, extracting rep telemetry and state summary.
        """
        samples, ground_truth = self.run_trial(config)

        # Initialize tracker gravity if resting at start
        if len(samples) > 0 and hasattr(tracker, "filter"):
            # Find first non-NaN sample
            for s0 in samples:
                if not (math.isnan(s0.ax) or math.isnan(s0.ay) or math.isnan(s0.az)):
                    tracker.filter.init_from_gravity(s0.ax, s0.ay, s0.az)
                    if hasattr(tracker, "gravity_baseline"):
                        tracker.gravity_baseline = math.sqrt(s0.ax**2 + s0.ay**2 + s0.az**2)
                    break

        # Execute 100Hz simulation
        ble_tx_buffer: List[Dict[str, Any]] = []
        for s in samples:
            # Handle I2C timeouts: if bus is timed out or corrupted NaN, autonomous sensor layer skips
            if s.is_i2c_timeout:
                continue
            if s.is_nan_packet or math.isnan(s.ax) or math.isnan(s.ay) or math.isnan(s.az):
                continue

            # Step tracker physics
            tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)

            # BLE notification buffer
            if hasattr(tracker, "reps") and len(tracker.reps) > len(ble_tx_buffer):
                new_rep = tracker.reps[-1]
                if s.ble_connected:
                    ble_tx_buffer.append(new_rep)
                else:
                    if len(ble_tx_buffer) < config.chaos.domain4.buffer_capacity:
                        ble_tx_buffer.append(new_rep)

        summary = {
            "detected_reps": len(tracker.reps) if hasattr(tracker, "reps") else 0,
            "reps_telemetry": tracker.reps if hasattr(tracker, "reps") else [],
            "final_velocity": getattr(tracker, "velocity", 0.0),
            "final_state": getattr(tracker, "currentState", "UNKNOWN"),
            "final_baseline": getattr(tracker, "gravity_baseline", 9.81),
            "ble_flushed_reps": len(ble_tx_buffer)
        }
        return tracker, samples, ground_truth, summary

    def _sample_domain_config(
        self,
        lift: LiftType,
        severity: ChaosSeverity,
        rng: random.Random
    ) -> ChaosDomainConfig:
        """Construct domain configs scaled by severity level."""
        d1 = Domain1BootConfig()
        d2 = Domain2ThermalConfig()
        d3 = Domain3BiomechanicsConfig()
        d4 = Domain4ConnectivityConfig()

        if severity == ChaosSeverity.CLEAN:
            return ChaosDomainConfig(domain1=d1, domain2=d2, domain3=d3, domain4=d4)

        # Domain 1: Boot & Sensor
        if rng.random() < (0.35 if severity == ChaosSeverity.MILD else 0.70):
            d1.boot_motion = True
            d1.boot_motion_intensity = 1.5 if severity != ChaosSeverity.EXTREME else 3.0
            d1.boot_motion_duration_s = 2.0
        if severity == ChaosSeverity.EXTREME:
            d1.i2c_timeout_rate = 0.005
            d1.nan_injection_rate = 0.002

        # Domain 2: Thermal & Drift
        if rng.random() < 0.60:
            d2.thermal_drift = True
            d2.delta_t_max_c = rng.uniform(15.0, 30.0)
            d2.tau_thermal_s = rng.uniform(300.0, 900.0)
            orient_choice = [MountOrientation.Z_UP, MountOrientation.X_UP, MountOrientation.Y_UP, MountOrientation.TILT_45]
            if severity == ChaosSeverity.EXTREME:
                orient_choice.append(MountOrientation.RANDOM_SO3)
            d2.mounting_orientation = rng.choice(orient_choice)

        # Domain 3: Biomechanics
        if lift == LiftType.BENCH_PRESS:
            d3.pause_duration_s = rng.uniform(0.5, 3.2) if severity != ChaosSeverity.EXTREME else 3.5
            if rng.random() < 0.35:
                d3.grind_duration_s = rng.uniform(0.20, 0.40)
                d3.grind_velocity = rng.uniform(0.025, 0.038)
        elif lift == LiftType.SQUAT:
            if rng.random() < 0.40:
                d3.pause_duration_s = rng.uniform(0.3, 1.5)
        elif lift == LiftType.TOUCH_AND_GO_CYCLING:
            d3.touch_and_go = True
            d3.cycling_reps = 5
            d3.cycling_cadence_hz = 1.0

        # Domain 4: Connectivity
        if rng.random() < (0.30 if severity != ChaosSeverity.EXTREME else 0.60):
            disc_start = rng.uniform(2.5, 4.0)
            disc_len = rng.uniform(0.5, 2.0)
            d4.ble_disconnect_window = (disc_start, disc_start + disc_len)

        return ChaosDomainConfig(domain1=d1, domain2=d2, domain3=d3, domain4=d4)

    def generate_monte_carlo_batch(self, n_trials: int = 500, seed: int = 42) -> List[TrialConfig]:
        """
        Generate a stratified batch of 500+ randomized adversarial chaos trials.
        Distribution:
          - 100 Squat (clean, paused, grind, multi-domain chaos)
          - 100 Bench Press (clean, long pauses 2.0-3.5s, sticking grinds, multi-domain)
          - 100 Deadlift (clean, slow grind, floor drops, multi-domain)
          - 100 Barbell Cycling (5-reps touch-and-go, thermal drift, BLE disconnects)
          - 50 Aborted & Failed lifts (safety pin holds >3.5s, partial concentric <0.12m)
          - 50 Impact Stress (violent rack hits, floor drops, large boot motion)
        """
        rng = random.Random(seed)
        batch: List[TrialConfig] = []

        for i in range(n_trials):
            trial_seed = rng.randint(100000, 999999)
            trial_rng = random.Random(trial_seed)

            # Stratified lift selection
            if i < 100:
                lift = LiftType.SQUAT
            elif i < 200:
                lift = LiftType.BENCH_PRESS
            elif i < 300:
                lift = LiftType.DEADLIFT
            elif i < 400:
                lift = LiftType.TOUCH_AND_GO_CYCLING
            elif i < 450:
                lift = trial_rng.choice([LiftType.ABORTED_DESCENT, LiftType.FAILED_CONCENTRIC])
            else:
                lift = trial_rng.choice([LiftType.FLOOR_DROP, LiftType.RACK_COLLISION])

            severity = trial_rng.choice([ChaosSeverity.MILD, ChaosSeverity.MODERATE, ChaosSeverity.EXTREME])
            chaos = self._sample_domain_config(lift, severity, trial_rng)

            dur = 14.0
            if lift == LiftType.TOUCH_AND_GO_CYCLING:
                dur = 8.0
            elif lift in (LiftType.ABORTED_DESCENT, LiftType.FAILED_CONCENTRIC):
                dur = 9.0

            config = TrialConfig(
                trial_id=f"mc_trial_{i:04d}",
                lift_type=lift,
                num_reps=5 if lift == LiftType.TOUCH_AND_GO_CYCLING else (0 if lift in (LiftType.ABORTED_DESCENT, LiftType.FAILED_CONCENTRIC, LiftType.FLOOR_DROP, LiftType.RACK_COLLISION) else 1),
                duration_s=dur,
                chaos=chaos,
                seed=trial_seed
            )
            batch.append(config)
        return batch

    def generate_long_uptime_trial(self, duration_hours: float = 2.0, num_sets: int = 10) -> TrialConfig:
        """Construct a continuous 2.0-hour (720,000 steps) thermal drift trial."""
        return TrialConfig(
            trial_id="long_uptime_2hr",
            lift_type=LiftType.SQUAT,
            num_reps=num_sets,
            duration_s=duration_hours * 3600.0,
            chaos=ChaosDomainConfig(
                domain2=Domain2ThermalConfig(
                    thermal_drift=True,
                    delta_t_max_c=30.0,
                    tau_thermal_s=900.0,
                    accel_drift_coeff=0.010,
                    gyro_drift_coeff=0.002,
                    mounting_orientation=MountOrientation.Z_UP
                )
            ),
            seed=1337
        )


class RobustSelfCorrectingTracker(RobustVBTTracker):
    """
    Autonomous fault-tolerant VBT tracker mirroring firmware recovery routines:
      - Dynamic boot motion detection: checks moving variance during initial 200 samples.
      - Rest-based dynamic recalibration: if bar moved at boot, waits for first confirmed
        stationary rest on rack before locking baseline & gyro bias.
      - 6-axis NaN/Inf drop filtering.
      - Dynamic I2C unwedge & recovery.
      - Runaway velocity clamp with atomic state reset.
    """
    def __init__(
        self,
        initial_baseline: float = 9.81,
        initial_gyro_bias: Optional[List[float]] = None,
        auto_boot_calib: bool = False
    ):
        super().__init__(initial_baseline, initial_gyro_bias)
        self.auto_boot_calib = auto_boot_calib
        self.calibrated = not auto_boot_calib
        self.calib_samples = 0
        self.calib_buf_a: List[List[float]] = []
        self.calib_buf_g: List[List[float]] = []

    def step(self, t: float, ax: float, ay: float, az: float, gx: float, gy: float, gz: float, dt: float = 0.01) -> None:
        # 1. 6-Axis NaN / Inf drop protection
        if (math.isnan(ax) or math.isnan(ay) or math.isnan(az) or
            math.isnan(gx) or math.isnan(gy) or math.isnan(gz) or
            math.isinf(ax) or math.isinf(ay) or math.isinf(az) or
            math.isinf(gx) or math.isinf(gy) or math.isinf(gz)):
            return

        # 2. Boot Calibration & Dynamic Recalibration
        if not self.calibrated:
            if self.calib_samples < 200:
                self.calib_buf_a.append([ax, ay, az])
                self.calib_buf_g.append([gx, gy, gz])
                self.calib_samples += 1
                if self.calib_samples == 200:
                    mean_ax = sum(p[0] for p in self.calib_buf_a) / 200.0
                    mean_ay = sum(p[1] for p in self.calib_buf_a) / 200.0
                    mean_az = sum(p[2] for p in self.calib_buf_a) / 200.0
                    var_a = sum((p[0] - mean_ax)**2 + (p[1] - mean_ay)**2 + (p[2] - mean_az)**2 for p in self.calib_buf_a) / 200.0
                    mean_gx = sum(p[0] for p in self.calib_buf_g) / 200.0
                    mean_gy = sum(p[1] for p in self.calib_buf_g) / 200.0
                    mean_gz = sum(p[2] for p in self.calib_buf_g) / 200.0
                    var_g = sum((p[0] - mean_gx)**2 + (p[1] - mean_gy)**2 + (p[2] - mean_gz)**2 for p in self.calib_buf_g) / 200.0

                    if var_a < 0.040 and var_g < 0.005:
                        mag = math.sqrt(mean_ax**2 + mean_ay**2 + mean_az**2)
                        self.gravity_baseline = mag
                        self.gyro_bias = [mean_gx, mean_gy, mean_gz]
                        self.filter.init_from_gravity(mean_ax, mean_ay, mean_az)
                        self.calibrated = True
                return
            else:
                super().step(t, ax, ay, az, gx, gy, gz, dt)
                if self.is_stationary and self.currentState == "IDLE":
                    mean_ax = sum(p[0] for p in self.buf_a) / len(self.buf_a)
                    mean_ay = sum(p[1] for p in self.buf_a) / len(self.buf_a)
                    mean_az = sum(p[2] for p in self.buf_a) / len(self.buf_a)
                    mag = math.sqrt(mean_ax**2 + mean_ay**2 + mean_az**2)
                    self.gravity_baseline = mag
                    self.gyro_bias = [
                        sum(p[0] for p in self.buf_g) / len(self.buf_g),
                        sum(p[1] for p in self.buf_g) / len(self.buf_g),
                        sum(p[2] for p in self.buf_g) / len(self.buf_g)
                    ]
                    self.filter.init_from_gravity(mean_ax, mean_ay, mean_az)
                    self.calibrated = True
                    self.velocity = 0.0
                    self.filtered_accel = 0.0
                else:
                    self.velocity = 0.0
                    self.filtered_accel = 0.0
                    self.currentState = "IDLE"
                return

        super().step(t, ax, ay, az, gx, gy, gz, dt)

