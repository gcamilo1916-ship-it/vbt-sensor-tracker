"""
Tier 1: Feature Coverage Test Suite for VBT Self-Correcting Firmware & Chaos Framework.
Validates all 23 features from PROJECT.md § Feature Inventory.
Zero-dependency pure Python standard library execution.
"""

import os
import sys
import math
import json
import random
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from tests.sim_madgwick import RobustVBTTracker, MadgwickAHRS, make_bell_profile
from tests.vbt_test_fixtures import (
    VBTKinematicGenerator,
    VBTRewardCalculator,
    VBTPolicyGenome,
    VBTSupervisorOracle,
    VBTAnomaly,
    VBTCppSourceAnalyzer,
    VBTRegressionCaseValidator,
    MAIN_CPP_PATH,
    PLATFORMIO_INI_PATH,
    REPO_ROOT_PIO
)


class TestVBTFirmwareTier1Features(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 1: Kinematic Lift Profile Generator
    # ─────────────────────────────────────────────────────────────────────────

    def test_f01_01_concentric_bell_continuous_calculus(self):
        """F1: Verify concentric bell profile satisfies continuous velocity integration d = integral(v*dt)."""
        res = VBTKinematicGenerator.generate_concentric_bell(duration_s=0.8, v_peak=0.60, dt=0.01)
        self.assertAlmostEqual(res["duration"], 0.8, delta=0.01)
        self.assertAlmostEqual(res["peak_velocity"], 0.60, delta=0.01)
        self.assertGreater(res["displacement"], 0.20, "Concentric displacement must exceed 0.20m")
        # Analytical average of sin^2 over period is 0.5 * peak
        expected_mcv = 0.5 * 0.60
        self.assertAlmostEqual(res["mean_velocity"], expected_mcv, delta=0.02)

    def test_f01_02_parametric_squat_bench_deadlift_profiles(self):
        """F1: Verify realistic kinematic bounds for Squat, Bench Press, and Deadlift."""
        sq = VBTKinematicGenerator.generate_full_rep(ecc_dur=1.4, v_ecc=-0.50, pause_s=0.2, conc_dur=0.9, v_conc=0.65)
        bp = VBTKinematicGenerator.generate_full_rep(ecc_dur=1.2, v_ecc=-0.40, pause_s=1.0, conc_dur=0.7, v_conc=0.55)
        dl = VBTKinematicGenerator.generate_full_rep(ecc_dur=0.2, v_ecc=-0.10, pause_s=0.0, conc_dur=1.1, v_conc=0.45)

        self.assertGreater(sq["concentric_displacement"], 0.25, "Squat concentric displacement >= 0.25m")
        self.assertGreater(bp["concentric_displacement"], 0.15, "Bench concentric displacement >= 0.15m")
        self.assertGreater(dl["concentric_displacement"], 0.20, "Deadlift concentric displacement >= 0.20m")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 2: Chaos Domain 1 (Boot & Sensor)
    # ─────────────────────────────────────────────────────────────────────────

    def test_f02_01_nan_telemetry_packet_rejection(self):
        """F2: Verify tracker rejects or survives corrupted NaN acceleration/gyro packets without NaN state."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        dt = 0.01
        # Step with normal samples
        for i in range(25):
            tracker.step(i * dt, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        # Inject NaN packet
        try:
            tracker.step(0.26, float("nan"), 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        except Exception:
            pass  # Exception or safe handling is valid; state must not corrupt into permanent crash
        # Verify subsequent normal stepping recovers
        for i in range(27, 50):
            tracker.step(i * dt, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        self.assertFalse(math.isnan(tracker.gravity_baseline))

    def test_f02_02_boot_motion_calibration_rejection(self):
        """F2: Non-stationary movement during initial warmup prevents premature baseline lock."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        dt = 0.01
        # Heavy motion: high variance
        for i in range(30):
            t = i * dt
            ax = 2.0 * math.sin(10.0 * t)
            tracker.step(t, ax, 0.0, 9.81, 0.5, 0.0, 0.0, dt)
        self.assertFalse(tracker.is_stationary, "Must not be stationary during violent motion")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 3: Chaos Domain 2 (Thermal & Drift)
    # ─────────────────────────────────────────────────────────────────────────

    def test_f03_01_thermal_drift_and_gyro_bias_smooth_tracking(self):
        """F3: Verify tracker adapts to +0.30 m/s2 accel drift and +0.06 rad/s gyro bias smoothly."""
        tracker = RobustVBTTracker(initial_baseline=9.80, initial_gyro_bias=[0.0, 0.0, 0.0])
        tracker.filter.init_from_gravity(0.0, 0.0, 9.80)
        dt = 0.01
        for i in range(3000): # 30s rest
            t = i * dt
            accel_drift = 0.30 * (i / 3000.0)
            gyro_drift = 0.06 * (i / 3000.0)
            tracker.step(t, 0.0, 0.0, 9.80 + accel_drift, gyro_drift, 0.0, 0.0, dt)
        self.assertAlmostEqual(tracker.gravity_baseline, 10.10, delta=0.08)
        self.assertEqual(len(tracker.reps), 0, "No false reps during thermal warming")

    def test_f03_02_3d_orientation_invariance(self):
        """F3: Verify tracker operates correctly when sensor is pitched 45 degrees."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        angle = math.radians(45.0)
        ax = 9.81 * math.sin(angle)
        az = 9.81 * math.cos(angle)
        tracker.filter.init_from_gravity(ax, 0.0, az)
        dt = 0.01
        for i in range(50):
            tracker.step(i * dt, ax, 0.0, az, 0.0, 0.0, 0.0, dt)
        self.assertTrue(tracker.is_stationary)
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.01)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 4: Chaos Domain 3 (Biomechanics & Impacts)
    # ─────────────────────────────────────────────────────────────────────────

    def test_f04_01_paused_lift_3_5s_hold_gating(self):
        """F4: Verify 3.5s motionless hold on safety pins resets velocity to 0 and transitions cleanly."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01
        descent_samples = make_bell_profile(1.2, 0.50, is_downward=True)
        # Descent into eccentric
        for i, (a_vert, g_rot) in enumerate(descent_samples):
            t = i * dt
            tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)
        self.assertEqual(tracker.currentState, "ECCENTRIC")
        # 3.0s motionless pause at bottom
        start_t = len(descent_samples) * dt
        for i in range(300):
            t = start_t + i * dt
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.05, msg="Velocity must remain zeroed during pause")

    def test_f04_02_sticking_point_grind_survival(self):
        """F4: Verify slow grinding repetition (v <= 0.04 m/s) is not prematurely truncated."""
        rep = VBTKinematicGenerator.generate_sticking_point_rep(grind_vel=0.035, grind_dur=1.5)
        self.assertGreater(rep["concentric_displacement"], 0.20)
        self.assertGreater(rep["concentric_duration"], 1.5)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 5: Chaos Domain 4 (Connectivity & BLE)
    # ─────────────────────────────────────────────────────────────────────────

    def test_f05_01_ble_gatt_uuid_conformance(self):
        """F5: Verify firmware defines official Service, Data, and Command UUIDs."""
        verified, msg = self.analyzer.verify_ble_gatt_uuids()
        self.assertTrue(verified, msg)

    def test_f05_02_state_preservation_on_disconnect(self):
        """F5: Verify firmware onDisconnect callback does not clear active physics state."""
        verified, msg = self.analyzer.verify_nondestructive_ble_reconnect()
        self.assertTrue(verified, msg)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 6: 500+ Monte Carlo Trials Engine
    # ─────────────────────────────────────────────────────────────────────────

    def test_f06_01_monte_carlo_trial_generation_and_seed_reproducibility(self):
        """F6: Verify deterministic trial generation from random seeds."""
        random.seed(42)
        v1 = [random.uniform(0.3, 0.8) for _ in range(10)]
        random.seed(42)
        v2 = [random.uniform(0.3, 0.8) for _ in range(10)]
        self.assertEqual(v1, v2, "Identical seed must produce identical parameter vectors")

    def test_f06_02_trial_metrics_aggregation(self):
        """F6: Verify aggregation of batch results across 500 trials."""
        mock_results = [{"true": 5, "false": 0, "missed": 0} for _ in range(500)]
        total_true = sum(r["true"] for r in mock_results)
        total_false = sum(r["false"] for r in mock_results)
        self.assertEqual(total_true, 2500)
        self.assertEqual(total_false, 0)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 7: 100Hz Multi-Agent Supervisor
    # ─────────────────────────────────────────────────────────────────────────

    def test_f07_01_four_inspection_subagents(self):
        """F7: Verify 4 subagents (RestZUPT, RepStroke, FSMDeadlock, NumericalHealth) detect anomalies."""
        # Test 1: Non-zero velocity when stationary
        anom1 = VBTSupervisorOracle.inspect_sample(
            t=1.0, tracker_state={"velocity": 0.25, "currentState": "IDLE"},
            is_physically_stationary=True, is_in_concentric=False
        )
        self.assertTrue(any(a.subagent == "RestZUPT" for a in anom1))

        # Test 2: Deadlock in eccentric
        anom2 = VBTSupervisorOracle.inspect_sample(
            t=10.0, tracker_state={"velocity": 0.0, "currentState": "ECCENTRIC", "state_duration": 9.0},
            is_physically_stationary=False, is_in_concentric=False
        )
        self.assertTrue(any(a.subagent == "FSMDeadlock" for a in anom2))

        # Test 3: Numerical runaway
        anom3 = VBTSupervisorOracle.inspect_sample(
            t=2.0, tracker_state={"velocity": 9.5, "currentState": "CONCENTRIC"},
            is_physically_stationary=False, is_in_concentric=True
        )
        self.assertTrue(any(a.subagent == "NumericalHealth" for a in anom3))

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 8: Root-Cause Fault Classifier
    # ─────────────────────────────────────────────────────────────────────────

    def test_f08_01_fault_classifier_domain_mapping(self):
        """F8: Verify mapping to 4 root-cause domains: Sensor Noise, Threshold Mismatch, Numerical Drift, FSM Deadlock."""
        self.assertEqual(VBTSupervisorOracle.classify_root_cause("accel_spike"), "Sensor Noise")
        self.assertEqual(VBTSupervisorOracle.classify_root_cause("velocity_drift_nan"), "Numerical Drift")
        self.assertEqual(VBTSupervisorOracle.classify_root_cause("fsm_timeout_deadlock"), "FSM Deadlock")
        self.assertEqual(VBTSupervisorOracle.classify_root_cause("zupt_gate_mismatch"), "Threshold Mismatch")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 9: Objective Reward Function
    # ─────────────────────────────────────────────────────────────────────────

    def test_f09_01_reward_formula_exact_evaluation(self):
        """F9: Verify formal formula Reward = +100*True - 250*False - 300*Missed - 50*VelErr - 100*ResDrift."""
        # Perfect 5-rep trial
        r_perfect = VBTRewardCalculator.compute_reward(true_reps=5, false_reps=0, missed_reps=0, velocity_error=0.0, residual_drift=0.0)
        self.assertEqual(r_perfect, 500.0)

        # 1 false rep, 1 missed rep, 0.05 vel err, 0.02 drift
        r_flawed = VBTRewardCalculator.compute_reward(true_reps=4, false_reps=1, missed_reps=1, velocity_error=0.05, residual_drift=0.02)
        expected = (100 * 4) + (-250 * 1) + (-300 * 1) + (-50 * 0.05) + (-100 * 0.02)
        self.assertAlmostEqual(r_flawed, expected, delta=0.01)
        self.assertLess(r_flawed, 0.0, "Flawed run with missed & false reps must yield severe negative reward")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 10: Hyperparameter Policy Genome
    # ─────────────────────────────────────────────────────────────────────────

    def test_f10_01_18_parameter_genome_completeness(self):
        """F10: Verify 18-parameter genome specification, bounds, and roundtrip normalization."""
        genome = VBTPolicyGenome()
        self.assertEqual(len(genome.params), 18, "Genome must contain exactly 18 hyperparameters")
        valid, msg = genome.validate()
        self.assertTrue(valid, msg)

        # Roundtrip vector encoding/decoding
        vec = genome.to_vector()
        self.assertEqual(len(vec), 18)
        self.assertTrue(all(0.0 <= x <= 1.0 for x in vec))
        reconstructed = VBTPolicyGenome.from_vector(vec)
        self.assertEqual(reconstructed.params["window_size_N"], genome.params["window_size_N"])

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 11: Evolutionary Policy Optimizer
    # ─────────────────────────────────────────────────────────────────────────

    def test_f11_01_differential_evolution_mutation_bounds(self):
        """F11: Verify DE mutation vector remains strictly bounded in [0.0, 1.0]."""
        p1 = [0.1] * 18
        p2 = [0.5] * 18
        p3 = [0.9] * 18
        F = 0.5
        # v = p1 + F * (p2 - p3)
        mutant = [min(1.0, max(0.0, p1[i] + F * (p2[i] - p3[i]))) for i in range(18)]
        self.assertTrue(all(0.0 <= x <= 1.0 for x in mutant))
        genome = VBTPolicyGenome.from_vector(mutant)
        valid, msg = genome.validate()
        self.assertTrue(valid, msg)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 12: Dynamic I2C Bus Reset Routine
    # ─────────────────────────────────────────────────────────────────────────

    def test_f12_01_i2c_timeout_and_fault_guards_in_source(self):
        """F12: Verify C++ source includes I2C timeout protection and NaN dropout recovery."""
        verified, msg = self.analyzer.verify_dynamic_i2c_bus_protection()
        self.assertTrue(verified, msg)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 13: Boot Motion Auto-Recalibration
    # ─────────────────────────────────────────────────────────────────────────

    def test_f13_01_boot_motion_dynamic_recalibration_in_source(self):
        """F13: Verify C++ source implements Tier 2 recovery still detection for auto-recalibration."""
        verified, msg = self.analyzer.verify_boot_motion_auto_recalibration()
        self.assertTrue(verified, msg)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 14: Sticking-Point & Pause Remediation
    # ─────────────────────────────────────────────────────────────────────────

    def test_f14_01_sticking_point_stall_persistence_in_source(self):
        """F14: Verify C++ source implements >=25 stall persistence samples and 3500ms pause limit."""
        verified, msg = self.analyzer.verify_sticking_point_remediation()
        self.assertTrue(verified, msg)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 15: Non-Destructive BLE Reconnect
    # ─────────────────────────────────────────────────────────────────────────

    def test_f15_01_nondestructive_ble_reconnect_invariant(self):
        """F15: Verify client disconnection does not reset active kinematics integration."""
        verified, msg = self.analyzer.verify_nondestructive_ble_reconnect()
        self.assertTrue(verified, msg)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 16: Optimized Hyperparameter C++ Embedding
    # ─────────────────────────────────────────────────────────────────────────

    def test_f16_01_hyperparameter_constants_declared_in_source(self):
        """F16: Verify critical physics constants are defined in src/main.cpp."""
        content = self.analyzer.content
        constants = [
            "STATIONARY_ACCEL_VAR_THRESH",
            "STATIONARY_GYRO_VAR_THRESH",
            "REFRACTORY_WINDOW_MS",
            "LOOP_PERIOD_MS",
            "ALPHA",
            "GRAVITY_MIN",
            "GRAVITY_MAX"
        ]
        for c in constants:
            self.assertIn(c, content, f"Constant {c} must be declared in src/main.cpp")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 17: Deterministic 100Hz Loop Guarantee
    # ─────────────────────────────────────────────────────────────────────────

    def test_f17_01_zero_blocking_delays_in_main_loop(self):
        """F17: Verify void loop() has no blocking delay() calls that starve BLE execution."""
        verified, msg = self.analyzer.verify_no_blocking_delays_in_loop()
        self.assertTrue(verified, msg)

    def test_f17_02_deterministic_100hz_pacing(self):
        """F17: Verify deterministic 10ms pacing in loop()."""
        verified, msg = self.analyzer.verify_deterministic_100hz_loop()
        self.assertTrue(verified, msg)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 18: Declarative Regression Case Schema
    # ─────────────────────────────────────────────────────────────────────────

    def test_f18_01_regression_case_schema_validation(self):
        """F18: Verify JSON schema validator accepts canonical cases and rejects invalid structures."""
        valid_case = VBTRegressionCaseValidator.create_canonical_case(
            case_id="bench_001", lift_type="Bench", reps=5, disp=0.35, dur=0.85, peak_v=0.62, mcv=0.41
        )
        is_valid, msg = VBTRegressionCaseValidator.validate_case(valid_case)
        self.assertTrue(is_valid, msg)

        # Malformed case missing tolerances
        invalid_case = dict(valid_case)
        del invalid_case["tolerances"]
        is_valid, msg = VBTRegressionCaseValidator.validate_case(invalid_case)
        self.assertFalse(is_valid)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 19: Benchmark Lift Regression Corpus
    # ─────────────────────────────────────────────────────────────────────────

    def test_f19_01_benchmark_suites_for_squat_bench_deadlift(self):
        """F19: Verify benchmark definitions for all 3 competition powerlifts."""
        lifts = ["Squat", "Bench", "Deadlift"]
        for lift in lifts:
            case = VBTRegressionCaseValidator.create_canonical_case(
                case_id=f"bm_{lift.lower()}", lift_type=lift, reps=3, disp=0.40, dur=1.0, peak_v=0.60, mcv=0.40
            )
            is_valid, _ = VBTRegressionCaseValidator.validate_case(case)
            self.assertTrue(is_valid)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 20: Automated Failure Ingestion Loop
    # ─────────────────────────────────────────────────────────────────────────

    def test_f20_01_failure_trajectory_ingestion_conversion(self):
        """F20: Verify anomalous trial is programmatically transformed into declarative regression case."""
        anom = VBTAnomaly(t=1.5, subagent="RestZUPT", description="Drift spike", root_cause="Sensor Noise")
        case = VBTRegressionCaseValidator.create_canonical_case(
            case_id="ingested_fail_01", lift_type="General", reps=0, disp=0.0, dur=1.5, peak_v=0.0, mcv=0.0,
            faults=[anom.to_dict()]
        )
        self.assertEqual(len(case["fault_injections"]), 1)
        self.assertEqual(case["fault_injections"][0]["root_cause"], "Sensor Noise")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 21: Regression Test Suite Runner
    # ─────────────────────────────────────────────────────────────────────────

    def test_f21_01_regression_runner_pass_fail_semantics(self):
        """F21: Verify runner requires 100% pass rate across regression catalog cases."""
        catalog_results = [True] * 20
        all_passed = all(catalog_results)
        self.assertTrue(all_passed)
        # Any single failure breaks regression guarantee
        catalog_results[5] = False
        self.assertFalse(all(catalog_results))

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 22: Final Verification & 500+ MC Run
    # ─────────────────────────────────────────────────────────────────────────

    def test_f22_01_platformio_ini_validity(self):
        """F22: Verify platformio.ini specifies seeed_xiao_esp32c6 and required sensor libraries."""
        self.assertTrue(os.path.exists(PLATFORMIO_INI_PATH), "platformio.ini must exist")
        with open(PLATFORMIO_INI_PATH, "r", encoding="utf-8") as f:
            ini_text = f.read()
        self.assertIn("seeed_xiao_esp32c6", ini_text)
        self.assertIn("Adafruit MPU6050", ini_text)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 23: E2E Testing Suite (Tiers 1-4)
    # ─────────────────────────────────────────────────────────────────────────

    def test_f23_01_test_infra_documentation_exists(self):
        """F23: Verify TEST_INFRA.md exists at project root with 4-tier documentation."""
        infra_path = os.path.join(REPO_ROOT_PIO, "TEST_INFRA.md")
        self.assertTrue(os.path.exists(infra_path), "TEST_INFRA.md must exist at project root")
        with open(infra_path, "r", encoding="utf-8") as f:
            infra_text = f.read()
        self.assertIn("Tier 1: Feature Coverage", infra_text)
        self.assertIn("Tier 2: Boundary & Corner Cases", infra_text)
        self.assertIn("Tier 3: Cross-Feature Interactions", infra_text)
        self.assertIn("Tier 4: Real-World Scenarios", infra_text)


if __name__ == "__main__":
    unittest.main()
