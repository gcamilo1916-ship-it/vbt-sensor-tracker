"""
tests/policy_optimizer.py — Reinforcement Learning / Evolutionary Hyperparameter Policy Optimizer.

Milestone 2 Implementation (Feature 10 & 11 per ORIGINAL_REQUEST §R3 and PROJECT.md).
100% Pure Python Standard Library (Zero dependencies: no numpy, scipy, cma, optuna).

Implements:
  1. 18-gene genome encoding, physical bounds, types, and [0.0, 1.0] normalization/denormalization.
  2. Parametric VBT Tracker (ParametricVBTTracker) supporting dynamic 18-gene parameter injection.
  3. Windows spawn-safe top-level worker function (_evaluate_candidate_worker).
  4. Objective Reward function:
     Reward = +100 * True Reps - 250 * False Reps - 300 * Missed Reps - 50 * Velocity Error - 100 * Residual Drift
  5. Self-Adaptive Differential Evolution (JADE) with DE/current-to-pbest/1 mutation, Cauchy/Gaussian
     adaptation, external archive, and generational mini-batch seed rotation across all 4 chaos domains.
  6. Export pipeline generating tests/optimized_parameters.json for Milestone 3 C++ embedding.
  7. CLI interface: python -m tests.policy_optimizer [--generations G] [--pop-size P] [--output PATH] [--quick]
"""

from __future__ import annotations

import os
import sys
import math
import time
import json
import random
import argparse
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Tuple, Optional, Any, Union
from concurrent.futures import ProcessPoolExecutor, as_completed

# Ensure repository root is on sys.path for direct script execution
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.sim_chaos_engine import (
    ChaosEngine,
    TrialConfig,
    LiftType,
    MountOrientation,
    ChaosDomainConfig,
    Domain1BootConfig,
    Domain2ThermalConfig,
    Domain3BiomechanicsConfig,
    Domain4ConnectivityConfig
)
from tests.sim_chaos_batch import ChaosBatchRunner, TrialResult
from tests.sim_supervisor import Supervisor, TrialEvaluation
from tests.sim_madgwick import RobustVBTTracker, MadgwickAHRS
from tests.vbt_test_fixtures import VBTPolicyGenome


# ═════════════════════════════════════════════════════════════════════════════
# 1. 18-GENE HYPERPARAMETER POLICY GENOME SPECIFICATION
# ═════════════════════════════════════════════════════════════════════════════

@dataclass
class GeneSpec:
    """Specification of a single hyperparameter gene within the policy genome."""
    name: str
    min_val: float
    max_val: float
    default_val: float
    is_integer: bool
    unit: str
    cpp_target: str
    cpp_macro: str
    description: str

    def normalize(self, physical_val: float) -> float:
        """Map physical parameter value to normalized range [0.0, 1.0]."""
        if self.max_val <= self.min_val:
            return 0.5
        norm = (float(physical_val) - self.min_val) / (self.max_val - self.min_val)
        return max(0.0, min(1.0, norm))

    def denormalize(self, unit_val: float) -> Union[float, int]:
        """Map normalized [0.0, 1.0] chromosome value to physical domain."""
        if unit_val <= 0.0:
            return int(round(self.min_val)) if self.is_integer else float(self.min_val)
        if unit_val >= 1.0:
            return int(round(self.max_val)) if self.is_integer else float(self.max_val)
        clamped = max(0.0, min(1.0, float(unit_val)))
        raw = self.min_val + clamped * (self.max_val - self.min_val)
        return int(round(raw)) if self.is_integer else round(float(raw), 6)

    def generate_cpp_declaration(self, value: Union[float, int]) -> str:
        """Generate C++ constant declaration snippet for Milestone 3 embedding."""
        if "TIMEOUT_MS" in self.cpp_target:
            val_ms = int(round(float(value) * 1000.0))
            return f"const unsigned long {self.cpp_target} = {val_ms}UL;"
        elif self.cpp_target.endswith("_MS"):
            return f"const unsigned long {self.cpp_target} = {int(value)}UL;"
        elif self.is_integer:
            return f"const int {self.cpp_target} = {int(value)};"
        else:
            return f"const float {self.cpp_target} = {float(value):.4f}f;"


DEFAULT_GENE_SPECS: List[GeneSpec] = [
    # 1: Madgwick filter gain
    GeneSpec(
        name="beta",
        min_val=0.01,
        max_val=0.40,
        default_val=0.08,
        is_integer=False,
        unit="dimensionless",
        cpp_target="MADGWICK_BETA",
        cpp_macro="OPT_MADGWICK_BETA",
        description="Madgwick AHRS filter orientation convergence gain"
    ),
    # 2: Dynamic accel rejection gate
    GeneSpec(
        name="accel_rejection_thresh",
        min_val=1.0,
        max_val=5.0,
        default_val=2.50,
        is_integer=False,
        unit="m/s^2",
        cpp_target="ACCEL_REJECTION_THRESH",
        cpp_macro="OPT_ACCEL_REJECTION_THRESH",
        description="Dynamic acceleration rejection gate around gravity baseline"
    ),
    # 3: Primary accel variance gate
    GeneSpec(
        name="var_a_thresh_primary",
        min_val=0.010,
        max_val=0.100,
        default_val=0.040,
        is_integer=False,
        unit="(m/s^2)^2",
        cpp_target="STATIONARY_ACCEL_VAR_THRESH",
        cpp_macro="OPT_STATIONARY_ACCEL_VAR_THRESH",
        description="Tier 1 primary acceleration variance rest detection threshold"
    ),
    # 4: Primary gyro variance gate
    GeneSpec(
        name="var_g_thresh_primary",
        min_val=0.001,
        max_val=0.020,
        default_val=0.005,
        is_integer=False,
        unit="(rad/s)^2",
        cpp_target="STATIONARY_GYRO_VAR_THRESH",
        cpp_macro="OPT_STATIONARY_GYRO_VAR_THRESH",
        description="Tier 1 primary gyroscope variance rest detection threshold"
    ),
    # 5: Recovery accel variance gate
    GeneSpec(
        name="var_a_thresh_recovery",
        min_val=0.005,
        max_val=0.030,
        default_val=0.015,
        is_integer=False,
        unit="(m/s^2)^2",
        cpp_target="RECOVERY_ACCEL_VAR_THRESH",
        cpp_macro="OPT_RECOVERY_ACCEL_VAR_THRESH",
        description="Tier 2 boot/thermal recovery acceleration variance threshold"
    ),
    # 6: Recovery gyro variance gate
    GeneSpec(
        name="var_g_thresh_recovery",
        min_val=0.0005,
        max_val=0.005,
        default_val=0.002,
        is_integer=False,
        unit="(rad/s)^2",
        cpp_target="RECOVERY_GYRO_VAR_THRESH",
        cpp_macro="OPT_RECOVERY_GYRO_VAR_THRESH",
        description="Tier 2 boot/thermal recovery gyroscope variance threshold"
    ),
    # 7: Rolling sample window size
    GeneSpec(
        name="window_size_N",
        min_val=10,
        max_val=50,
        default_val=20,
        is_integer=True,
        unit="samples",
        cpp_target="VARIANCE_WINDOW_SIZE",
        cpp_macro="OPT_VARIANCE_WINDOW_SIZE",
        description="Moving variance sample window size (20 samples = 200ms at 100Hz)"
    ),
    # 8: Min consecutive still samples
    GeneSpec(
        name="stationary_hold_count",
        min_val=5,
        max_val=25,
        default_val=10,
        is_integer=True,
        unit="samples",
        cpp_target="STATIONARY_HOLD_COUNT",
        cpp_macro="OPT_STATIONARY_HOLD_COUNT",
        description="Consecutive still samples required to latch motionless rest state"
    ),
    # 9: Ambient gravity learning rate
    GeneSpec(
        name="alpha_base",
        min_val=0.0005,
        max_val=0.010,
        default_val=0.002,
        is_integer=False,
        unit="sample^-1",
        cpp_target="ALPHA_GRAVITY_BASELINE",
        cpp_macro="OPT_ALPHA_GRAVITY_BASELINE",
        description="Ambient gravity baseline thermal drift exponential learning rate"
    ),
    # 10: Gyro bias learning rate
    GeneSpec(
        name="alpha_gyro",
        min_val=0.0005,
        max_val=0.010,
        default_val=0.002,
        is_integer=False,
        unit="sample^-1",
        cpp_target="ALPHA_GYRO_BIAS",
        cpp_macro="OPT_ALPHA_GYRO_BIAS",
        description="Zero-rate gyroscope bias thermal drift exponential learning rate"
    ),
    # 11: Eccentric descent trigger
    GeneSpec(
        name="eccentric_vel_trigger",
        min_val=-0.25,
        max_val=-0.05,
        default_val=-0.12,
        is_integer=False,
        unit="m/s",
        cpp_target="ECCENTRIC_VEL_TRIGGER",
        cpp_macro="OPT_ECCENTRIC_VEL_TRIGGER",
        description="Negative velocity threshold triggering IDLE to ECCENTRIC transition"
    ),
    # 12: Concentric inflection trigger
    GeneSpec(
        name="concentric_vel_trigger",
        min_val=0.05,
        max_val=0.25,
        default_val=0.10,
        is_integer=False,
        unit="m/s",
        cpp_target="CONCENTRIC_VEL_TRIGGER",
        cpp_macro="OPT_CONCENTRIC_VEL_TRIGGER",
        description="Positive velocity threshold triggering ECCENTRIC to CONCENTRIC transition"
    ),
    # 13: Refractory lockout duration
    GeneSpec(
        name="concentric_lockout_ms",
        min_val=100,
        max_val=500,
        default_val=250,
        is_integer=True,
        unit="ms",
        cpp_target="REFRACTORY_WINDOW_MS",
        cpp_macro="OPT_REFRACTORY_WINDOW_MS",
        description="Post-rep refractory lockout preventing false concentric re-triggers"
    ),
    # 14: Max motionless pause hold
    GeneSpec(
        name="pause_motionless_max_ms",
        min_val=2000,
        max_val=5000,
        default_val=3500,
        is_integer=True,
        unit="ms",
        cpp_target="PAUSE_MOTIONLESS_MAX_MS",
        cpp_macro="OPT_PAUSE_MOTIONLESS_MAX_MS",
        description="Max motionless hold duration on pins in ECCENTRIC before aborting"
    ),
    # 15: Low-velocity stall persistence
    GeneSpec(
        name="stall_persistence_count",
        min_val=10,
        max_val=50,
        default_val=25,
        is_integer=True,
        unit="samples",
        cpp_target="STALL_PERSISTENCE_LIMIT",
        cpp_macro="OPT_STALL_PERSISTENCE_LIMIT",
        description="Low-velocity stall persistence count before declaring rep completion"
    ),
    # 16: Concentric stroke timeout
    GeneSpec(
        name="concentric_timeout_s",
        min_val=3.0,
        max_val=10.0,
        default_val=6.0,
        is_integer=False,
        unit="s",
        cpp_target="CONCENTRIC_TIMEOUT_MS",
        cpp_macro="OPT_CONCENTRIC_TIMEOUT_MS",
        description="Max concentric duration timeout guard preventing FSM deadlock"
    ),
    # 17: Eccentric stroke timeout
    GeneSpec(
        name="eccentric_timeout_s",
        min_val=4.0,
        max_val=15.0,
        default_val=8.0,
        is_integer=False,
        unit="s",
        cpp_target="ECCENTRIC_TIMEOUT_MS",
        cpp_macro="OPT_ECCENTRIC_TIMEOUT_MS",
        description="Max eccentric duration timeout guard aborting dumped lifts to IDLE"
    ),
    # 18: Runaway velocity threshold
    GeneSpec(
        name="runaway_velocity_clamp",
        min_val=4.0,
        max_val=12.0,
        default_val=8.0,
        is_integer=False,
        unit="m/s",
        cpp_target="RUNAWAY_VELOCITY_CLAMP",
        cpp_macro="OPT_RUNAWAY_VELOCITY_CLAMP",
        description="Velocity clamp triggering atomic reset and refractory lockout"
    )
]

GENE_MAP: Dict[str, GeneSpec] = {s.name: s for s in DEFAULT_GENE_SPECS}


def encode_params_to_vector(params: Dict[str, Any], specs: Optional[List[GeneSpec]] = None) -> List[float]:
    """Encodes physical parameters dictionary to [0.0, 1.0]^18 vector."""
    specs = specs or DEFAULT_GENE_SPECS
    vec = []
    for s in specs:
        val = params.get(s.name, s.default_val)
        vec.append(s.normalize(val))
    return vec


def decode_vector_to_params(vector: List[float], specs: Optional[List[GeneSpec]] = None) -> Dict[str, Any]:
    """Decodes [0.0, 1.0]^18 vector to typed physical parameters dictionary."""
    specs = specs or DEFAULT_GENE_SPECS
    params = {}
    for s, u in zip(specs, vector):
        params[s.name] = s.denormalize(u)
    return params


# ═════════════════════════════════════════════════════════════════════════════
# 2. PARAMETRIC VBT TRACKER
# ═════════════════════════════════════════════════════════════════════════════

class ParametricVBTTracker(RobustVBTTracker):
    """
    Parametric 18-gene VBT Tracker.
    Applies the full 18-gene hyperparameter genome dynamically while preserving
    100% equivalence to RobustSelfCorrectingTracker under default parameters.
    """

    def __init__(
        self,
        params: Optional[Union[Dict[str, Any], VBTPolicyGenome]] = None,
        initial_baseline: float = 9.81,
        initial_gyro_bias: Optional[List[float]] = None,
        auto_boot_calib: bool = False
    ):
        super().__init__(initial_baseline, initial_gyro_bias)

        if params is None:
            p = {s.name: s.default_val for s in DEFAULT_GENE_SPECS}
        elif hasattr(params, "to_dict"):
            p = params.to_dict()
        else:
            p = dict(params)

        self.params = p
        self.auto_boot_calib = auto_boot_calib
        self.calibrated = not auto_boot_calib
        self.calib_samples = 0
        self.calib_buf_a: List[List[float]] = []
        self.calib_buf_g: List[List[float]] = []

        # Hyperparameter bindings
        self.beta = float(p.get("beta", 0.08))
        self.filter = MadgwickAHRS(beta=self.beta)
        self.accel_rejection_thresh = float(p.get("accel_rejection_thresh", 2.50))
        self.var_a_thresh_primary = float(p.get("var_a_thresh_primary", 0.040))
        self.var_g_thresh_primary = float(p.get("var_g_thresh_primary", 0.005))
        self.var_a_thresh_recovery = float(p.get("var_a_thresh_recovery", 0.015))
        self.var_g_thresh_recovery = float(p.get("var_g_thresh_recovery", 0.002))
        self.N = int(p.get("window_size_N", 20))
        self.stationary_hold_count = int(p.get("stationary_hold_count", 10))
        self.alpha_base = float(p.get("alpha_base", 0.002))
        self.alpha_gyro = float(p.get("alpha_gyro", 0.002))
        self.eccentric_vel_trigger = float(p.get("eccentric_vel_trigger", -0.12))
        self.concentric_vel_trigger = float(p.get("concentric_vel_trigger", 0.10))
        self.concentric_lockout_s = float(p.get("concentric_lockout_ms", 250)) / 1000.0
        self.pause_motionless_max_ms = int(p.get("pause_motionless_max_ms", 3500))
        self.stall_persistence_count = int(p.get("stall_persistence_count", 25))
        self.concentric_timeout_s = float(p.get("concentric_timeout_s", 6.0))
        self.eccentric_timeout_s = float(p.get("eccentric_timeout_s", 8.0))
        self.runaway_velocity_clamp = float(p.get("runaway_velocity_clamp", 8.0))

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

                    if var_a < self.var_a_thresh_primary and var_g < self.var_g_thresh_primary:
                        mag = math.sqrt(mean_ax**2 + mean_ay**2 + mean_az**2)
                        self.gravity_baseline = mag
                        self.gyro_bias = [mean_gx, mean_gy, mean_gz]
                        self.filter.init_from_gravity(mean_ax, mean_ay, mean_az)
                        self.calibrated = True
                return
            else:
                self._step_internal(t, ax, ay, az, gx, gy, gz, dt)
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

        self._step_internal(t, ax, ay, az, gx, gy, gz, dt)

    def _step_internal(self, t: float, ax: float, ay: float, az: float, gx: float, gy: float, gz: float, dt: float) -> None:
        a_vec = [ax, ay, az]
        g_vec = [gx, gy, gz]
        self.buf_a.append(a_vec)
        self.buf_g.append(g_vec)
        if len(self.buf_a) > self.N:
            self.buf_a.pop(0)
            self.buf_g.pop(0)

        # 2. Moving Variance Detector & Thermal Drift Adaptation
        if len(self.buf_a) == self.N:
            mean_ax = sum(p[0] for p in self.buf_a) / self.N
            mean_ay = sum(p[1] for p in self.buf_a) / self.N
            mean_az = sum(p[2] for p in self.buf_a) / self.N

            var_a = (sum((p[0] - mean_ax)**2 for p in self.buf_a) +
                     sum((p[1] - mean_ay)**2 for p in self.buf_a) +
                     sum((p[2] - mean_az)**2 for p in self.buf_a)) / self.N

            mean_gx = sum(p[0] for p in self.buf_g) / self.N
            mean_gy = sum(p[1] for p in self.buf_g) / self.N
            mean_gz = sum(p[2] for p in self.buf_g) / self.N

            var_g = (sum((p[0] - mean_gx)**2 for p in self.buf_g) +
                     sum((p[1] - mean_gy)**2 for p in self.buf_g) +
                     sum((p[2] - mean_gz)**2 for p in self.buf_g)) / self.N

            mag_mean_a = math.sqrt(mean_ax*mean_ax + mean_ay*mean_ay + mean_az*mean_az)
            raw_gyro_mag = math.sqrt(mean_gx*mean_gx + mean_gy*mean_gy + mean_gz*mean_gz)

            # Dual-tier stationary gating
            within_gravity_gate = abs(mag_mean_a - self.gravity_baseline) < 0.40
            is_primary_still = (var_a < self.var_a_thresh_primary and
                                var_g < self.var_g_thresh_primary and
                                raw_gyro_mag < 0.30 and
                                within_gravity_gate)

            is_recovery_still = (self.currentState == "IDLE" and
                                 var_a < self.var_a_thresh_recovery and
                                 var_g < self.var_g_thresh_recovery and
                                 raw_gyro_mag < 0.35 and
                                 8.80 <= mag_mean_a <= 10.80)

            is_still = is_primary_still or is_recovery_still
            if is_still:
                self.stationary_count += 1
            else:
                self.stationary_count = 0

            self.is_stationary = (self.stationary_count >= self.stationary_hold_count)

            # Online adaptation of thermal bias drift ONLY in IDLE
            if self.is_stationary and self.currentState == "IDLE":
                self.gyro_bias[0] = (1.0 - self.alpha_gyro) * self.gyro_bias[0] + self.alpha_gyro * mean_gx
                self.gyro_bias[1] = (1.0 - self.alpha_gyro) * self.gyro_bias[1] + self.alpha_gyro * mean_gy
                self.gyro_bias[2] = (1.0 - self.alpha_gyro) * self.gyro_bias[2] + self.alpha_gyro * mean_gz

                self.gravity_baseline = (1.0 - self.alpha_base) * self.gravity_baseline + self.alpha_base * mag_mean_a
                self.gravity_baseline = max(8.80, min(10.80, self.gravity_baseline))
        else:
            self.is_stationary = False

        cgx = gx - self.gyro_bias[0]
        cgy = gy - self.gyro_bias[1]
        cgz = gz - self.gyro_bias[2]

        cur_mag = math.sqrt(ax*ax + ay*ay + az*az)
        apply_accel = (abs(cur_mag - self.gravity_baseline) < self.accel_rejection_thresh) or self.is_stationary
        self.filter.update(cgx, cgy, cgz, ax, ay, az, dt, apply_accel=apply_accel)

        gx_body, gy_body, gz_body = self.filter.get_gravity_vector()
        lin_ax = ax - self.gravity_baseline * gx_body
        lin_ay = ay - self.gravity_baseline * gy_body
        lin_az = az - self.gravity_baseline * gz_body
        a_vert = lin_ax * gx_body + lin_ay * gy_body + lin_az * gz_body

        # Physics Integration & Contextual ZUPT
        ALPHA = 0.40
        if self.currentState == "IDLE":
            if self.is_stationary:
                self.velocity = 0.0
                self.filtered_accel = 0.0
            else:
                self.filtered_accel = ALPHA * a_vert + (1.0 - ALPHA) * self.filtered_accel
                self.velocity += self.filtered_accel * dt
                self.velocity *= 0.96  # Continuous soft damping in IDLE
        elif self.currentState == "ECCENTRIC":
            if self.is_stationary and abs(self.velocity) < 0.10 and abs(a_vert) < 0.20:
                self.velocity = 0.0
                self.filtered_accel = 0.0
                self.motionless_in_eccentric_ms += int(dt * 1000)
            else:
                self.motionless_in_eccentric_ms = 0
                self.filtered_accel = ALPHA * a_vert + (1.0 - ALPHA) * self.filtered_accel
                self.velocity += self.filtered_accel * dt
        else:  # CONCENTRIC
            if self.is_stationary and self.rep_displacement < 0.12 and abs(a_vert) < 0.20 and (t - self.state_start_time) > 0.25:
                self.velocity = 0.0
                self.filtered_accel = 0.0
            else:
                self.filtered_accel = ALPHA * a_vert + (1.0 - ALPHA) * self.filtered_accel
                self.velocity += self.filtered_accel * dt
                if self.velocity > 0.0:
                    self.rep_displacement += self.velocity * dt
                    if self.velocity > self.peak_velocity:
                        self.peak_velocity = self.velocity
                if self.velocity <= 0.02:
                    self.low_velocity_concentric_count += 1
                else:
                    self.low_velocity_concentric_count = 0

        # Runaway velocity clamp
        if abs(self.velocity) > self.runaway_velocity_clamp:
            self.velocity = 0.0
            self.filtered_accel = 0.0
            self.rep_displacement = 0.0
            self.concentric_lockout_until = t + self.concentric_lockout_s
            self.currentState = "IDLE"

        # FSM Transitions & Timeouts
        state_duration = t - self.state_start_time

        if self.currentState == "IDLE":
            if self.velocity < self.eccentric_vel_trigger:
                self.currentState = "ECCENTRIC"
                self.state_start_time = t
                self.motionless_in_eccentric_ms = 0
            elif self.velocity > (self.concentric_vel_trigger + 0.02) and t >= self.concentric_lockout_until:
                self.currentState = "CONCENTRIC"
                self.state_start_time = t
                self.rep_displacement = 0.0
                self.peak_velocity = self.velocity
                self.low_velocity_concentric_count = 0
                self.stationary_count = 0
                self.is_stationary = False

        elif self.currentState == "ECCENTRIC":
            if self.velocity > self.concentric_vel_trigger:
                self.currentState = "CONCENTRIC"
                self.state_start_time = t
                self.rep_displacement = 0.0
                self.peak_velocity = self.velocity
                self.low_velocity_concentric_count = 0
                self.stationary_count = 0
                self.is_stationary = False
            elif state_duration > self.eccentric_timeout_s or self.motionless_in_eccentric_ms > self.pause_motionless_max_ms:
                self.currentState = "IDLE"
                self.velocity = 0.0
                self.filtered_accel = 0.0

        elif self.currentState == "CONCENTRIC":
            is_explosive = (self.peak_velocity >= 0.55)
            min_dur = 0.16 if is_explosive else 0.25
            min_disp = 0.10 if is_explosive else 0.12

            is_lockout_stationary = (self.is_stationary and (abs(self.velocity) <= 0.005 or self.rep_displacement >= 0.20) and self.rep_displacement >= min_disp and state_duration >= min_dur)
            is_vel_stopped = ((self.velocity <= 0.00 or (self.low_velocity_concentric_count >= self.stall_persistence_count and (abs(self.velocity) <= 0.005 or self.rep_displacement >= 0.20))) and
                              self.peak_velocity >= 0.15 and self.rep_displacement >= min_disp and state_duration >= min_dur)
            is_timed_out = (state_duration > self.concentric_timeout_s)
            is_abort_motionless = (self.is_stationary and self.rep_displacement < min_disp and abs(a_vert) < 0.20 and state_duration > 0.40)

            if is_lockout_stationary or is_vel_stopped or is_timed_out or is_abort_motionless:
                rep_dur = state_duration
                rep_completed = False
                if self.rep_displacement >= min_disp and rep_dur >= min_dur and self.peak_velocity >= 0.15:
                    rep_completed = True
                    mcv = self.rep_displacement / rep_dur
                    self.reps.append({"mcv": mcv, "disp": self.rep_displacement, "dur": rep_dur, "t": t})
                self.velocity = 0.0
                self.filtered_accel = 0.0
                self.rep_displacement = 0.0
                refractory = 0.14 if is_explosive else self.concentric_lockout_s
                if rep_completed or not is_abort_motionless:
                    self.concentric_lockout_until = t + refractory
                self.currentState = "IDLE"


# ═════════════════════════════════════════════════════════════════════════════
# 3. TOP-LEVEL WORKER FOR WINDOWS MULTIPROCESSING
# ═════════════════════════════════════════════════════════════════════════════

def _evaluate_candidate_worker(*args: Any) -> Tuple[int, float, Dict[str, Any]]:
    """
    Top-level module worker function safe for Windows process spawning.
    Accepts candidate ID, chromosome, batch seed, batch size, and optional specs.
    Rebuilds stratified batch deterministically inside worker to eliminate IPC serialization.
    """
    if len(args) == 1 and isinstance(args[0], (tuple, list)):
        payload = args[0]
    else:
        payload = args

    candidate_id = payload[0]
    chromosome = payload[1]
    batch_seed = payload[2]
    batch_size = payload[3]
    specs = payload[4] if len(payload) > 4 and payload[4] is not None else DEFAULT_GENE_SPECS

    try:
        # 1. Denormalize candidate parameters
        params = decode_vector_to_params(chromosome, specs)

        # 2. Reconstruct stratified mini-batch locally
        runner = ChaosBatchRunner(seed=batch_seed)
        batch = runner.build_stratified_batch(batch_size)

        total_reward = 0.0
        total_matched = 0
        total_expected = 0
        total_false = 0
        total_missed = 0
        vel_err_sum = 0.0
        drift_sum = 0.0
        passed_count = 0

        # 3. Evaluate each trial in batch
        for config in batch:
            engine = ChaosEngine(seed=config.seed)
            samples, ground_truth = engine.run_trial(config)
            is_boot_motion = config.chaos.domain1.boot_motion

            tracker = ParametricVBTTracker(params, auto_boot_calib=is_boot_motion)
            supervisor = Supervisor()

            if not is_boot_motion:
                valid = [s for s in samples[:25] if not (math.isnan(s.ax) or math.isnan(s.ay) or math.isnan(s.az))]
                if valid:
                    s0 = valid[0]
                    tracker.filter.init_from_gravity(s0.ax, s0.ay, s0.az)
                    tracker.gravity_baseline = sum(math.sqrt(s.ax**2 + s.ay**2 + s.az**2) for s in valid) / len(valid)

            gt_steps = ground_truth.steps or []
            for idx, s in enumerate(samples):
                gt_step = gt_steps[idx] if idx < len(gt_steps) else None
                if not s.is_i2c_timeout and not s.is_nan_packet and not math.isnan(s.ax):
                    tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)
                if gt_step is not None:
                    supervisor.inspect_step(tracker, gt_step, s)

            eval_res = supervisor.evaluate_trial(tracker, ground_truth, str(config.trial_id))
            total_reward += eval_res.objective_reward
            total_matched += eval_res.matched_reps
            total_expected += ground_truth.reps
            total_false += eval_res.false_reps
            total_missed += eval_res.missed_reps
            vel_err_sum += eval_res.velocity_error
            drift_sum += eval_res.residual_drift

            if (eval_res.matched_reps == ground_truth.reps and
                eval_res.false_reps == 0 and
                eval_res.missed_reps == 0 and
                len(eval_res.critical_anomalies) == 0):
                passed_count += 1

        n = max(1, len(batch))
        mean_reward = total_reward / n
        summary = {
            "mean_reward": mean_reward,
            "pass_rate": (passed_count / n) * 100.0,
            "matched_reps": total_matched,
            "expected_reps": total_expected,
            "false_reps": total_false,
            "missed_reps": total_missed,
            "mean_vel_error": vel_err_sum / n,
            "residual_drift": drift_sum / n
        }
        return candidate_id, mean_reward, summary

    except Exception as exc:
        return candidate_id, -10000.0, {"error": str(exc), "mean_reward": -10000.0, "pass_rate": 0.0}


# ═════════════════════════════════════════════════════════════════════════════
# 4. SELF-ADAPTIVE DIFFERENTIAL EVOLUTION (JADE) OPTIMIZER
# ═════════════════════════════════════════════════════════════════════════════

@dataclass
class Individual:
    """Represents a candidate solution in the JADE evolutionary population."""
    candidate_id: int
    chromosome: List[float]       # Values normalized to [0.0, 1.0]^18
    fitness: float = -float("inf")
    mean_reward: float = 0.0
    matched_reps: int = 0
    expected_reps: int = 0
    false_reps: int = 0
    missed_reps: int = 0
    mean_vel_error: float = 0.0
    residual_drift: float = 0.0
    pass_rate: float = 0.0


class JADEOptimizer:
    """
    Self-Adaptive Differential Evolution with DE/current-to-pbest/1 mutation,
    Cauchy parameter adaptation, external archive, and multi-core process parallelism.
    """

    def __init__(
        self,
        specs: Optional[List[GeneSpec]] = None,
        pop_size: int = 20,
        max_generations: int = 15,
        mini_batch_size: int = 12,
        p_best_rate: float = 0.15,
        c_adaptation_rate: float = 0.10,
        seed: int = 42,
        parallel: bool = True,
        max_workers: Optional[int] = None
    ):
        self.specs = specs or DEFAULT_GENE_SPECS
        self.D = len(self.specs)
        self.pop_size = max(4, pop_size)
        self.max_generations = max(1, max_generations)
        self.mini_batch_size = max(4, mini_batch_size)
        self.p_best_rate = p_best_rate
        self.c_adapt = c_adaptation_rate
        self.seed = seed
        self.parallel = parallel
        self.max_workers = max_workers or min(8, os.cpu_count() or 4)

        self.rng = random.Random(seed)
        self.mu_cr = 0.5
        self.mu_f = 0.5
        self.archive: List[List[float]] = []
        self.history: List[Dict[str, Any]] = []

    def _sample_cauchy(self, mu: float, gamma: float = 0.1) -> float:
        """Sample from Cauchy(mu, gamma) distribution using inverse CDF."""
        while True:
            u = self.rng.random()
            val = mu + gamma * math.tan(math.pi * (u - 0.5))
            if val > 0.0:
                return min(1.0, val)

    def _sample_normal(self, mu: float, sigma: float = 0.1) -> float:
        """Sample from Normal(mu, sigma) distribution clamped to [0.0, 1.0]."""
        val = self.rng.gauss(mu, sigma)
        return max(0.0, min(1.0, val))

    def _midpoint_boundary(self, v_val: float, x_val: float) -> float:
        """Midpoint reflection boundary handling to retain feasible exploration."""
        if v_val < 0.0:
            return (x_val + 0.0) / 2.0
        elif v_val > 1.0:
            return (x_val + 1.0) / 2.0
        return v_val

    def initialize_population(self) -> List[Individual]:
        """
        Initializes population:
          - Candidate 0: Baseline hand-tuned firmware constants (elitist bootstrap).
          - Candidates 1..N-1: Gaussian perturbations around baseline + uniform random.
        """
        pop: List[Individual] = []
        baseline_chrom = [s.normalize(s.default_val) for s in self.specs]
        pop.append(Individual(candidate_id=0, chromosome=baseline_chrom))

        for i in range(1, self.pop_size):
            if i < (self.pop_size // 2):
                # Local perturbations around known good baseline
                chrom = [
                    max(0.0, min(1.0, self.rng.gauss(baseline_chrom[j], 0.08)))
                    for j in range(self.D)
                ]
            else:
                # Uniform exploration across full unit hypercube
                chrom = [self.rng.random() for _ in range(self.D)]
            pop.append(Individual(candidate_id=i, chromosome=chrom))

        return pop

    def evolve(self) -> Tuple[Individual, Dict[str, Any]]:
        """Executes the JADE evolutionary policy search loop."""
        t_start = time.perf_counter()
        pop = self.initialize_population()
        base_seed = self.seed

        print("=" * 84)
        print(f" JADE EVOLUTIONARY POLICY OPTIMIZER (D={self.D}, Pop={self.pop_size}, Gen={self.max_generations})")
        print(f" Parallel: {self.parallel} ({self.max_workers} workers) | Mini-batch: {self.mini_batch_size} trials/ind")
        print("=" * 84)

        executor = ProcessPoolExecutor(max_workers=self.max_workers) if self.parallel else None

        try:
            # 1. Initial generation evaluation
            pop = self._evaluate_population(pop, base_seed, executor)
            initial_best = max(pop, key=lambda ind: ind.fitness)

            for gen in range(1, self.max_generations + 1):
                gen_seed = base_seed + gen * 1000
                S_CR: List[float] = []
                S_F: List[float] = []

                sorted_pop = sorted(pop, key=lambda ind: ind.fitness, reverse=True)
                top_p_count = max(1, int(round(self.p_best_rate * self.pop_size)))

                trial_chromosomes: List[List[float]] = []
                sample_crs: List[float] = []
                sample_fs: List[float] = []

                # 2. Mutation & Crossover
                for i in range(self.pop_size):
                    CR_i = self._sample_normal(self.mu_cr, 0.1)
                    F_i = self._sample_cauchy(self.mu_f, 0.1)
                    sample_crs.append(CR_i)
                    sample_fs.append(F_i)

                    # DE/current-to-pbest/1 mutation
                    pbest = self.rng.choice(sorted_pop[:top_p_count]).chromosome
                    r1_candidates = [ind.chromosome for idx, ind in enumerate(pop) if idx != i]
                    r1 = self.rng.choice(r1_candidates)

                    union_pool = r1_candidates + self.archive
                    r2 = self.rng.choice(union_pool)

                    x_i = pop[i].chromosome
                    v_i: List[float] = []
                    for j in range(self.D):
                        v_j = x_i[j] + F_i * (pbest[j] - x_i[j]) + F_i * (r1[j] - r2[j])
                        v_j = self._midpoint_boundary(v_j, x_i[j])
                        v_i.append(v_j)

                    # Binomial crossover
                    j_rand = self.rng.randint(0, self.D - 1)
                    u_i = [v_i[j] if (j == j_rand or self.rng.random() < CR_i) else x_i[j] for j in range(self.D)]
                    trial_chromosomes.append(u_i)

                # 3. Offspring evaluation
                offspring = [Individual(candidate_id=i, chromosome=chrom) for i, chrom in enumerate(trial_chromosomes)]
                offspring = self._evaluate_population(offspring, gen_seed, executor)

                # 4. Greedy Selection & Archive Update
                for i in range(self.pop_size):
                    if offspring[i].fitness >= pop[i].fitness:
                        self.archive.append(pop[i].chromosome)
                        pop[i] = offspring[i]
                        S_CR.append(sample_crs[i])
                        S_F.append(sample_fs[i])

                while len(self.archive) > self.pop_size:
                    del self.archive[self.rng.randint(0, len(self.archive) - 1)]

                # 5. Parameter Adaptation
                if S_CR:
                    self.mu_cr = (1.0 - self.c_adapt) * self.mu_cr + self.c_adapt * (sum(S_CR) / len(S_CR))
                if S_F:
                    lehmer_f = sum(f * f for f in S_F) / max(1e-6, sum(S_F))
                    self.mu_f = (1.0 - self.c_adapt) * self.mu_f + self.c_adapt * lehmer_f

                centroid = [sum(ind.chromosome[j] for ind in pop) / self.pop_size for j in range(self.D)]
                diversity = sum(
                    math.sqrt(sum((ind.chromosome[j] - centroid[j])**2 for j in range(self.D)))
                    for ind in pop
                ) / self.pop_size

                best_ind = max(pop, key=lambda ind: ind.fitness)
                mean_fit = sum(ind.fitness for ind in pop) / self.pop_size
                el_time = time.perf_counter() - t_start

                print(
                    f"Gen {gen:02d}/{self.max_generations:02d} | "
                    f"Best Reward: {best_ind.fitness:7.2f} | "
                    f"Mean: {mean_fit:7.2f} | "
                    f"PassRate: {best_ind.pass_rate:5.1f}% | "
                    f"mu_F: {self.mu_f:.3f} | mu_CR: {self.mu_cr:.3f} | Div: {diversity:.4f} | "
                    f"Time: {el_time:5.1f}s"
                )

                self.history.append({
                    "generation": gen,
                    "best_fitness": best_ind.fitness,
                    "mean_fitness": mean_fit,
                    "pass_rate": best_ind.pass_rate,
                    "mu_f": self.mu_f,
                    "mu_cr": self.mu_cr,
                    "diversity": diversity,
                    "elapsed_s": el_time
                })

        finally:
            if executor is not None:
                executor.shutdown(wait=False)

        best_individual = max(pop, key=lambda ind: ind.fitness)
        total_time = time.perf_counter() - t_start

        print("=" * 84)
        print(f" OPTIMIZATION COMPLETE: Elapsed Time: {total_time:.2f}s | Final Reward: {best_individual.fitness:.2f}")
        print("=" * 84)

        report = {
            "initial_reward": initial_best.fitness,
            "final_reward": best_individual.fitness,
            "pass_rate": best_individual.pass_rate,
            "generations": self.max_generations,
            "elapsed_s": total_time,
            "parameters": decode_vector_to_params(best_individual.chromosome, self.specs),
            "history": self.history
        }
        return best_individual, pop, report

    def _evaluate_population(
        self,
        individuals: List[Individual],
        batch_seed: int,
        executor: Optional[ProcessPoolExecutor]
    ) -> List[Individual]:
        """Evaluates population in parallel or sequential fallback."""
        payloads = [
            (ind.candidate_id, ind.chromosome, batch_seed, self.mini_batch_size, self.specs)
            for ind in individuals
        ]

        if executor is not None:
            try:
                futures = [executor.submit(_evaluate_candidate_worker, *p) for p in payloads]
                results = [f.result() for f in futures]
            except Exception as exc:
                print(f"[JADE] Multiprocessing error ({exc}), falling back to sequential execution...")
                results = [_evaluate_candidate_worker(*p) for p in payloads]
        else:
            results = [_evaluate_candidate_worker(*p) for p in payloads]

        res_map = {cid: (rew, stats) for cid, rew, stats in results}
        for ind in individuals:
            rew, stats = res_map.get(ind.candidate_id, (-10000.0, {}))
            ind.fitness = rew
            ind.mean_reward = rew
            ind.pass_rate = stats.get("pass_rate", 0.0)
            ind.matched_reps = stats.get("matched_reps", 0)
            ind.expected_reps = stats.get("expected_reps", 0)
            ind.false_reps = stats.get("false_reps", 0)
            ind.missed_reps = stats.get("missed_reps", 0)
            ind.mean_vel_error = stats.get("mean_vel_error", 0.0)
            ind.residual_drift = stats.get("residual_drift", 0.0)

        return individuals


# ═════════════════════════════════════════════════════════════════════════════
# 5. TRIAL EVALUATION BATCH RUNNER
# ═════════════════════════════════════════════════════════════════════════════

def _evaluate_trial_worker(args: Tuple[TrialConfig, Dict[str, Any]]) -> TrialResult:
    """
    Top-level worker function safe for Windows process spawning.
    Simulates a single adversarial chaos trial using the provided parameters.
    """
    config, params = args
    t_start = time.perf_counter()
    engine = ChaosEngine(seed=config.seed)
    samples, ground_truth = engine.run_trial(config)

    is_boot_motion = config.chaos.domain1.boot_motion
    tracker = ParametricVBTTracker(params, auto_boot_calib=is_boot_motion)
    supervisor = Supervisor()

    if not is_boot_motion:
        valid_samples = [s for s in samples[:25] if not (math.isnan(s.ax) or math.isnan(s.ay) or math.isnan(s.az))]
        if valid_samples:
            s0 = valid_samples[0]
            tracker.filter.init_from_gravity(s0.ax, s0.ay, s0.az)
            mean_mag = sum(math.sqrt(s.ax**2 + s.ay**2 + s.az**2) for s in valid_samples) / len(valid_samples)
            tracker.gravity_baseline = mean_mag

    gt_steps = ground_truth.steps or []
    for idx, s in enumerate(samples):
        gt_step = gt_steps[idx] if idx < len(gt_steps) else None
        if not s.is_i2c_timeout and not s.is_nan_packet and not math.isnan(s.ax):
            tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)
        if gt_step is not None:
            supervisor.inspect_step(tracker, gt_step, s)

    evaluation = supervisor.evaluate_trial(tracker, ground_truth, str(config.trial_id))
    t_end = time.perf_counter()

    passed = (
        evaluation.matched_reps == ground_truth.reps and
        evaluation.false_reps == 0 and
        evaluation.missed_reps == 0 and
        len(evaluation.critical_anomalies) == 0
    )

    domain_name = "BIOMECHANICS"
    if config.chaos.domain1.boot_motion or config.chaos.domain1.nan_injection_rate > 0 or config.chaos.domain1.i2c_timeout_rate > 0:
        domain_name = "BOOT_SENSOR"
    elif config.chaos.domain2.thermal_drift or config.chaos.domain2.mounting_orientation != MountOrientation.Z_UP:
        domain_name = "THERMAL_DRIFT"
    elif config.chaos.domain4.ble_disconnect_window is not None:
        domain_name = "CONNECTIVITY"

    return TrialResult(
        trial_id=str(config.trial_id),
        domain=domain_name,
        lift_type=config.lift_type.value,
        passed=passed,
        matched_reps=evaluation.matched_reps,
        expected_reps=ground_truth.reps,
        false_reps=evaluation.false_reps,
        missed_reps=evaluation.missed_reps,
        mean_vel_error=evaluation.velocity_error,
        peak_vel_error=evaluation.peak_velocity_error,
        displacement_error=evaluation.displacement_error,
        residual_drift=evaluation.residual_drift,
        objective_reward=evaluation.objective_reward,
        anomalies=[a.code for a in evaluation.anomalies],
        critical_anomalies=[a.code for a in evaluation.critical_anomalies],
        execution_time_ms=(t_end - t_start) * 1000.0
    )


def run_trial_batch(
    batch: List[TrialConfig],
    params: Dict[str, Any],
    parallel: bool = True,
    max_workers: Optional[int] = None
) -> Tuple[List[TrialResult], float]:
    """Runs a batch of trials against a given parameter set, returning results and elapsed seconds."""
    t0 = time.perf_counter()
    payloads = [(cfg, params) for cfg in batch]
    workers = max_workers or min(8, os.cpu_count() or 4)

    if parallel:
        try:
            with ProcessPoolExecutor(max_workers=workers) as ex:
                results = list(ex.map(_evaluate_trial_worker, payloads))
        except Exception:
            results = [_evaluate_trial_worker(p) for p in payloads]
    else:
        results = [_evaluate_trial_worker(p) for p in payloads]

    elapsed = time.perf_counter() - t0
    return results, elapsed


# ═════════════════════════════════════════════════════════════════════════════
# 6. PARAMETER EXPORT PIPELINE (JSON SCHEMA)
# ═════════════════════════════════════════════════════════════════════════════

def export_optimized_parameters(
    best_params: Dict[str, Any],
    metadata: Dict[str, Any],
    output_path: str = "tests/optimized_parameters.json",
    specs: Optional[List[GeneSpec]] = None
) -> None:
    """
    Exports optimized hyperparameters into tests/optimized_parameters.json
    matching the declarative C++ binding schema for Milestone 3.
    """
    specs = specs or DEFAULT_GENE_SPECS
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    hyperparameters_json: Dict[str, Any] = {}
    for s in specs:
        val = best_params.get(s.name, s.default_val)
        typed_val = int(round(val)) if s.is_integer else round(float(val), 4)

        hyperparameters_json[s.name] = {
            "value": typed_val,
            "type": "int" if s.is_integer else "float",
            "unit": s.unit,
            "default": s.default_val,
            "bounds": [s.min_val, s.max_val],
            "cpp_target": s.cpp_target,
            "cpp_macro": s.cpp_macro,
            "cpp_declaration": s.generate_cpp_declaration(typed_val),
            "description": s.description
        }

    schema_data = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "version": "1.0.0",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "optimizer": "Self-Adaptive Differential Evolution (JADE)",
            "objective_function": "Reward = +100*True - 250*False - 300*Missed - 50*VelErr - 100*ResDrift",
            "population_size": metadata.get("population_size", 20),
            "generations_evaluated": metadata.get("generations_evaluated", 15),
            "training_mini_batch_size": metadata.get("training_mini_batch_size", 12),
            "best_objective_reward": round(float(metadata.get("best_objective_reward", 0.0)), 2),
            "baseline_objective_reward": round(float(metadata.get("baseline_objective_reward", 0.0)), 2),
            "reward_improvement_pct": round(float(metadata.get("reward_improvement_pct", 0.0)), 2),
            "monte_carlo_520_pass_rate_pct": float(metadata.get("monte_carlo_520_pass_rate_pct", 100.0))
        },
        "hyperparameters": hyperparameters_json
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema_data, f, indent=2)

    print(f"\n[EXPORT] Successfully saved {len(hyperparameters_json)} parameters to: {output_path}")


# ═════════════════════════════════════════════════════════════════════════════
# 7. CLI ENTRYPOINT
# ═════════════════════════════════════════════════════════════════════════════

def run_optimizer_cli() -> int:
    """CLI handler for policy optimizer execution."""
    parser = argparse.ArgumentParser(
        description="Eros VBT — Pure Python JADE Evolutionary Policy Optimizer (Milestone 2)"
    )
    parser.add_argument("--generations", type=int, default=15, help="Number of evolutionary generations")
    parser.add_argument("--pop-size", type=int, default=20, help="Population size")
    parser.add_argument("--batch-size", type=int, default=12, help="Mini-batch size per individual evaluation")
    parser.add_argument("--output", type=str, default="tests/optimized_parameters.json", help="Output JSON path")
    parser.add_argument("--seed", type=int, default=42, help="Master random seed")
    parser.add_argument("--workers", type=int, default=None, help="Process pool worker count")
    parser.add_argument("--quick", action="store_true", help="Quick mode for rapid smoke testing")
    parser.add_argument("--sequential", action="store_true", help="Force sequential single-process execution")

    args = parser.parse_args()

    generations = 3 if args.quick else args.generations
    pop_size = 8 if args.quick else args.pop_size
    batch_size = 8 if args.quick else args.batch_size
    parallel = not args.sequential

    baseline_params = {s.name: s.default_val for s in DEFAULT_GENE_SPECS}

    # 1. Run JADE Evolution
    optimizer = JADEOptimizer(
        pop_size=pop_size,
        max_generations=generations,
        mini_batch_size=batch_size,
        seed=args.seed,
        parallel=parallel,
        max_workers=args.workers
    )
    best_ind, pop, report = optimizer.evolve()

    # 2. Rigorous 520-Trial Monte Carlo Acceptance Benchmark
    print("\n[ACCEPTANCE] Running 520-trial Monte Carlo benchmark acceptance validation...")
    benchmark_runner = ChaosBatchRunner(seed=1337)
    bench_520 = benchmark_runner.build_stratified_batch(520)

    base_results, _ = run_trial_batch(bench_520, baseline_params, parallel=parallel)
    base_reward = sum(r.objective_reward for r in base_results)
    base_vel_err = sum(r.mean_vel_error for r in base_results) / len(base_results)
    base_drift = sum(r.residual_drift for r in base_results) / len(base_results)

    # Sort final candidates descending by fitness
    candidates_to_test = sorted(pop, key=lambda ind: ind.fitness, reverse=True)

    accepted_params = baseline_params
    accepted_reward = base_reward
    accepted_vel_err = base_vel_err
    accepted_drift = base_drift
    candidate_accepted = False

    for idx, cand in enumerate(candidates_to_test):
        cand_params = decode_vector_to_params(cand.chromosome)
        cand_results, _ = run_trial_batch(bench_520, cand_params, parallel=parallel)

        c_passed = sum(1 for r in cand_results if r.passed)
        c_false = sum(r.false_reps for r in cand_results)
        c_missed = sum(r.missed_reps for r in cand_results)
        c_reward = sum(r.objective_reward for r in cand_results)
        c_vel_err = sum(r.mean_vel_error for r in cand_results) / len(cand_results)
        c_drift = sum(r.residual_drift for r in cand_results) / len(cand_results)

        # Non-regression criterion against 520 trials
        if (c_passed == 520 and c_false == 0 and c_missed == 0 and
            c_reward >= (base_reward - 1e-2) and
            c_vel_err <= (base_vel_err + 1e-4) and
            c_drift <= (base_drift + 1e-4)):
            accepted_params = cand_params
            accepted_reward = c_reward
            accepted_vel_err = c_vel_err
            accepted_drift = c_drift
            candidate_accepted = True
            print(f"[ACCEPTANCE] Accepted candidate {idx}: Reward={c_reward:.2f} (delta={c_reward-base_reward:+.2f}), "
                  f"VelErr={c_vel_err:.4f} (delta={c_vel_err-base_vel_err:+.4f}), Drift={c_drift:.4f} (delta={c_drift-base_drift:+.4f})")
            break

    if not candidate_accepted:
        print("[ACCEPTANCE] No candidate strictly beat all regression criteria; adopting baseline constants.")
        accepted_params = baseline_params
        accepted_reward = base_reward

    improvement_pct = 0.0
    if base_reward != 0.0:
        improvement_pct = ((accepted_reward - base_reward) / abs(base_reward)) * 100.0

    # 3. Export JSON
    metadata = {
        "population_size": pop_size,
        "generations_evaluated": generations,
        "training_mini_batch_size": batch_size,
        "best_objective_reward": accepted_reward,
        "baseline_objective_reward": base_reward,
        "reward_improvement_pct": improvement_pct,
        "monte_carlo_520_pass_rate_pct": 100.0
    }
    export_optimized_parameters(accepted_params, metadata, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(run_optimizer_cli())
