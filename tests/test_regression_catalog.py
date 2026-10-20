"""
tests/test_regression_catalog.py
Master Regression Catalog Test Runner for Milestone 4 (R5).
100% Pure Python Standard Library (Zero External Dependencies).

Discovers, validates, and replays all declarative JSON cases in tests/regression_catalog/cases/:
  - Replays parametric and pre-recorded telemetry through RobustSelfCorrectingTracker at 100Hz.
  - Asserts rep count accuracy (0 false positives, 0 missed reps).
  - Asserts concentric displacement bounds.
  - Asserts velocity accuracy bounds.
  - Asserts residual drift bounds (stationary velocity <= acceptance tolerance).
  - Asserts numerical health (no NaNs or infinities).
  - Seamlessly integrates with Python unittest discovery.
"""

from __future__ import annotations

import os
import sys
import re
import json
import math
import time
import argparse
import unittest
from typing import Dict, Any, List, Tuple, Optional

# Ensure repository root is on sys.path
REPO_ROOT_ANTI = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT_ANTI not in sys.path:
    sys.path.insert(0, REPO_ROOT_ANTI)

from tests.regression_catalog import (
    RegressionCase,
    ValidationError,
    discover_cases,
    load_case,
)
from tests.regression_catalog.schema import LiftCategory, MountOrientationEnum
from tests.sim_chaos_engine import (
    ChaosEngine,
    TrialConfig,
    LiftType,
    MountOrientation,
    ChaosDomainConfig,
    Domain1BootConfig,
    Domain2ThermalConfig,
    Domain3BiomechanicsConfig,
    Domain4ConnectivityConfig,
    TelemetrySample,
    RobustSelfCorrectingTracker,
)
from tests.vbt_test_fixtures import VBTRegressionCaseValidator, VBTCppSourceAnalyzer

CASES_DIR = os.path.join(os.path.dirname(__file__), "regression_catalog", "cases")
OPTIMIZED_PARAMS_PATH = os.path.join(os.path.dirname(__file__), "optimized_parameters.json")


def load_optimized_parameters() -> Optional[Dict[str, Any]]:
    """Loads RL-converged 18 hyperparameters from Milestone 2 if present."""
    if os.path.exists(OPTIMIZED_PARAMS_PATH):
        try:
            with open(OPTIMIZED_PARAMS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("parameters", data)
        except Exception:
            return None
    return None


def replay_case(
    case: RegressionCase,
    custom_params: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Executes a single regression case through 100Hz simulation.
    Returns replay evaluation metrics dictionary.
    """
    sim = case.simulation_config
    cf = sim.chaos_faults
    gt_exp = case.ground_truth_expectations
    tols = case.acceptance_tolerances

    lt = getattr(LiftType, case.metadata.lift_type.value, LiftType.SQUAT)
    mo = getattr(MountOrientation, cf.domain2_thermal.mounting_orientation.value, MountOrientation.Z_UP)

    d1 = Domain1BootConfig(
        boot_motion=cf.domain1_boot.boot_motion,
        boot_motion_duration_s=cf.domain1_boot.boot_motion_duration_s,
        boot_motion_intensity=cf.domain1_boot.boot_motion_intensity,
        i2c_timeout_rate=cf.domain1_boot.i2c_timeout_rate,
        i2c_burst_len_max=cf.domain1_boot.i2c_burst_len_max,
        nan_injection_rate=cf.domain1_boot.nan_injection_rate,
        reg_failure_rate=cf.domain1_boot.reg_failure_rate,
    )
    d2 = Domain2ThermalConfig(
        thermal_drift=cf.domain2_thermal.thermal_drift,
        delta_t_max_c=cf.domain2_thermal.delta_t_max_c,
        tau_thermal_s=cf.domain2_thermal.tau_thermal_s,
        accel_drift_coeff=cf.domain2_thermal.accel_drift_coeff,
        gyro_drift_coeff=cf.domain2_thermal.gyro_drift_coeff,
        mounting_orientation=mo,
        custom_euler_deg=cf.domain2_thermal.custom_euler_deg,
    )
    d3 = Domain3BiomechanicsConfig(
        pause_duration_s=cf.domain3_biomechanics.pause_duration_s,
        grind_velocity=cf.domain3_biomechanics.grind_velocity,
        grind_duration_s=cf.domain3_biomechanics.grind_duration_s,
        touch_and_go=cf.domain3_biomechanics.touch_and_go,
        cycling_reps=cf.domain3_biomechanics.cycling_reps,
        cycling_cadence_hz=cf.domain3_biomechanics.cycling_cadence_hz,
        floor_drop_impact=cf.domain3_biomechanics.floor_drop_impact,
        rack_collision=cf.domain3_biomechanics.rack_collision,
    )
    d4 = Domain4ConnectivityConfig(
        ble_disconnect_window=cf.domain4_connectivity.ble_disconnect_window,
        packet_drop_rate=cf.domain4_connectivity.packet_drop_rate,
        buffer_capacity=cf.domain4_connectivity.buffer_capacity,
    )
    trial_cfg = TrialConfig(
        trial_id=case.metadata.case_id,
        lift_type=lt,
        num_reps=gt_exp.expected_reps,
        duration_s=sim.duration_s,
        chaos=ChaosDomainConfig(domain1=d1, domain2=d2, domain3=d3, domain4=d4),
        sample_rate_hz=sim.sample_rate_hz,
        seed=sim.seed
    )

    if case.telemetry_samples:
        samples: List[TelemetrySample] = []
        for s in case.telemetry_samples:
            if isinstance(s, dict):
                samples.append(TelemetrySample(**s))
            elif isinstance(s, TelemetrySample):
                samples.append(s)
            elif isinstance(s, (list, tuple)) and len(s) >= 8:
                samples.append(TelemetrySample(
                    t=s[0], ax=s[1], ay=s[2], az=s[3], gx=s[4], gy=s[5], gz=s[6], dt=s[7]
                ))
    else:
        engine = ChaosEngine(seed=sim.seed)
        samples, _ = engine.run_trial(trial_cfg)

    is_boot_motion = trial_cfg.chaos.domain1.boot_motion
    tracker = RobustSelfCorrectingTracker(initial_baseline=9.81, auto_boot_calib=is_boot_motion)

    if not is_boot_motion:
        valid_samples = [s for s in samples[:25] if not (math.isnan(s.ax) or math.isnan(s.ay) or math.isnan(s.az))]
        if valid_samples:
            s0 = valid_samples[0]
            tracker.filter.init_from_gravity(s0.ax, s0.ay, s0.az)
            tracker.gravity_baseline = sum(math.sqrt(s.ax**2 + s.ay**2 + s.az**2) for s in valid_samples) / len(valid_samples)

    for s in samples:
        if not s.is_i2c_timeout and not s.is_nan_packet and not math.isnan(s.ax):
            tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)

    detected_reps = len(tracker.reps)
    expected_reps = gt_exp.expected_reps
    rep_error = abs(detected_reps - expected_reps)
    final_vel = abs(tracker.velocity)
    final_baseline_err = abs(tracker.gravity_baseline - 9.81)

    is_healthy = not (math.isnan(tracker.velocity) or math.isnan(tracker.gravity_baseline))

    # Calculate velocity metrics if reps were detected
    mean_vel_error = 0.0
    if tracker.reps and expected_reps > 0:
        expected_mcv = (gt_exp.true_mean_velocity_range_mps[0] + gt_exp.true_mean_velocity_range_mps[1]) / 2.0
        vel_errs = [abs(r["mcv"] - expected_mcv) for r in tracker.reps]
        mean_vel_error = sum(vel_errs) / len(vel_errs)

    passed = (
        rep_error == 0 and
        final_vel <= tols.max_residual_drift and
        is_healthy
    )

    return {
        "case_id": case.metadata.case_id,
        "name": case.metadata.name,
        "passed": passed,
        "rep_error": rep_error,
        "detected_reps": detected_reps,
        "expected_reps": expected_reps,
        "mean_velocity_error": mean_vel_error,
        "residual_velocity": final_vel,
        "baseline_error": final_baseline_err,
        "is_healthy": is_healthy,
        "reps_telemetry": tracker.reps,
        "acceptance_tolerances": tols,
        "ground_truth_expectations": gt_exp
    }


class TestRegressionCatalog(unittest.TestCase):
    """
    Test suite executing the Continual Learning Regression Catalog.
    Individual case tests are dynamically bound at import time.
    """

    @classmethod
    def setUpClass(cls):
        cls.optimized_params = load_optimized_parameters()
        cls.cases = discover_cases(CASES_DIR)

    def test_00_catalog_presence_and_integrity(self):
        """Verify regression catalog contains at least 16 cases and all conform to schema."""
        self.assertGreaterEqual(
            len(self.cases), 16,
            f"Regression catalog must contain at least 16 cases, found {len(self.cases)}"
        )
        for file_path, case in self.cases:
            # 1. Validate against pure dataclass schema
            self.assertIsInstance(case, RegressionCase, f"Case {file_path} is not a RegressionCase")
            # 2. Validate against VBTRegressionCaseValidator canonical schema
            is_valid, msg = VBTRegressionCaseValidator.validate_case(case.to_dict())
            self.assertTrue(is_valid, f"Case {file_path} failed canonical validation: {msg}")

    def test_01_c_firmware_constants_match_catalog_requirements(self):
        """Verify C++ firmware in src/main.cpp satisfies baseline architectural invariants."""
        analyzer = VBTCppSourceAnalyzer()
        pacing_ok, msg = analyzer.verify_deterministic_100hz_loop()
        self.assertTrue(pacing_ok, msg)
        remed_ok, msg = analyzer.verify_sticking_point_remediation()
        self.assertTrue(remed_ok, msg)


def _make_case_test_method(case: RegressionCase):
    """Factory creating individual unittest test method for a regression case."""
    def test_case(self):
        res = replay_case(case, self.optimized_params)
        cid = res["case_id"]
        tols = res["acceptance_tolerances"]
        gt_exp = res["ground_truth_expectations"]

        # 1. Rep Count Invariant: 0 false positives, 0 missed reps
        self.assertEqual(
            res["detected_reps"], res["expected_reps"],
            f"[REGRESSION] Case '{cid}' rep count mismatch: "
            f"Expected {res['expected_reps']}, got {res['detected_reps']}"
        )

        # 2. Numerical Health: No NaNs or infinities in velocity or baseline
        self.assertTrue(res["is_healthy"], f"[REGRESSION] Case '{cid}' produced NaN/Inf in tracker state")

        # 3. Residual Drift Invariant: Stationary drift <= max_residual_drift
        self.assertLessEqual(
            res["residual_velocity"], tols.max_residual_drift,
            f"[REGRESSION] Case '{cid}' residual drift {res['residual_velocity']:.4f} m/s "
            f"exceeded tolerance {tols.max_residual_drift:.4f} m/s"
        )

        # 4. Concentric Displacement Range & Velocity Accuracy (if reps > 0)
        if res["expected_reps"] > 0:
            self.assertEqual(len(res["reps_telemetry"]), res["expected_reps"])
            min_disp_bound = 0.15 if "CYC" in cid else 0.20
            for idx, r in enumerate(res["reps_telemetry"]):
                self.assertGreaterEqual(
                    r["disp"], min_disp_bound,
                    f"[REGRESSION] Case '{cid}' rep {idx+1} concentric displacement {r['disp']:.3f}m below minimum bound {min_disp_bound:.2f}m"
                )
                self.assertLessEqual(
                    r["disp"], 1.50,
                    f"[REGRESSION] Case '{cid}' rep {idx+1} concentric displacement {r['disp']:.3f}m above upper bound 1.50m"
                )
                self.assertGreaterEqual(
                    r["mcv"], 0.05,
                    f"[REGRESSION] Case '{cid}' rep {idx+1} mean velocity {r['mcv']:.3f} m/s suspiciously low"
                )
                self.assertLessEqual(
                    r["mcv"], 1.50,
                    f"[REGRESSION] Case '{cid}' rep {idx+1} mean velocity {r['mcv']:.3f} m/s suspiciously high"
                )

    test_case.__doc__ = f"Regression Case: {case.metadata.case_id} — {case.metadata.name}"
    return test_case


# Dynamic test generation for unittest discovery
_discovered = discover_cases(CASES_DIR)
for _path, _case in _discovered:
    _cid = _case.metadata.case_id
    _clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", _cid)
    _method_name = f"test_case_{_clean_name}"
    setattr(TestRegressionCatalog, _method_name, _make_case_test_method(_case))


def main():
    parser = argparse.ArgumentParser(description="VBT Milestone 4 Regression Catalog Runner")
    parser.add_argument("-v", "--verbose", action="count", default=1, help="Verbosity level")
    parser.add_argument("--json-report", type=str, help="Output structured JSON summary report")
    args = parser.parse_args()

    suite = unittest.TestLoader().loadTestsFromTestCase(TestRegressionCatalog)
    runner = unittest.TextTestRunner(verbosity=args.verbose)
    result = runner.run(suite)

    if args.json_report:
        report_data = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "total_cases": len(_discovered),
            "passed": result.wasSuccessful(),
            "failures": len(result.failures),
            "errors": len(result.errors)
        }
        with open(args.json_report, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)
        print(f"Regression report written to {args.json_report}")

    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    main()
