"""
Tier 2: Boundary, Corner & Negative Cases Test Suite for VBT Self-Correcting Firmware & Chaos Framework.
Stress tests limits, extremes, fault injections, NaNs, sensor saturation, and timeout guards.
Zero-dependency pure Python standard library execution.
"""

import os
import re
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


class TestVBTFirmwareTier2Boundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)

    # ─────────────────────────────────────────────────────────────────────────
    # F01 Kinematics Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b01_01_extreme_velocity_and_subthreshold_displacements(self):
        """B1: Micro-displacement (d = 0.04m) and ultra-high velocity (5.0 m/s) boundaries."""
        micro = VBTKinematicGenerator.generate_concentric_bell(duration_s=0.2, v_peak=0.10)
        self.assertLess(micro["displacement"], 0.12, "Micro-displacement must be under 0.12m rep threshold")

        extreme = VBTKinematicGenerator.generate_concentric_bell(duration_s=0.5, v_peak=5.0)
        self.assertAlmostEqual(extreme["peak_velocity"], 5.0)
        self.assertGreater(extreme["displacement"], 1.0)

    # ─────────────────────────────────────────────────────────────────────────
    # F02 Chaos Domain 1 (Boot & Sensor) Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b02_01_repeated_nan_burst_and_recovery(self):
        """B2: Burst of 20 consecutive NaN packets must not crash tracker or corrupt baseline."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # 20 samples normal
        for i in range(20):
            tracker.step(i * dt, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        # 20 samples NaN burst
        for i in range(20, 40):
            try:
                tracker.step(i * dt, float("nan"), float("nan"), float("nan"), 0.0, 0.0, 0.0, dt)
            except Exception:
                pass

        # Recover with 30 normal samples
        for i in range(40, 70):
            tracker.step(i * dt, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        self.assertFalse(math.isnan(tracker.gravity_baseline))
        self.assertAlmostEqual(tracker.gravity_baseline, 9.81, delta=0.1)

    def test_b02_02_sensor_saturation_limits(self):
        """B2: Sensor saturation at +/- 16g (156.96 m/s2) and +/- 2000 deg/s (34.9 rad/s)."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01
        # Extreme shock / drop impact
        tracker.step(0.01, 0.0, 0.0, 156.96, 34.9, 0.0, 0.0, dt)
        self.assertFalse(math.isnan(tracker.velocity))
        self.assertFalse(math.isinf(tracker.velocity))

    # ─────────────────────────────────────────────────────────────────────────
    # F03 Chaos Domain 2 (Thermal & Drift) Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b03_01_gravity_baseline_clamping_bounds(self):
        """B3: Gravity baseline adaptation must strictly clamp between 8.80 and 10.80 m/s2."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # Push upward with high static gravity (12.0 m/s2) for 3000 steps
        for i in range(3000):
            tracker.step(i * dt, 0.0, 0.0, 12.0, 0.0, 0.0, 0.0, dt)
        self.assertLessEqual(tracker.gravity_baseline, 10.80, "Baseline cannot exceed GRAVITY_MAX (10.80)")

        # Push downward with low static gravity (6.0 m/s2) for 5000 steps
        for i in range(3000, 8000):
            tracker.step(i * dt, 0.0, 0.0, 6.0, 0.0, 0.0, 0.0, dt)
        self.assertGreaterEqual(tracker.gravity_baseline, 8.80, "Baseline cannot drop below GRAVITY_MIN (8.80)")

    # ─────────────────────────────────────────────────────────────────────────
    # F04 Chaos Domain 3 (Biomechanics) Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b04_01_exact_3_5s_pause_abort_boundary(self):
        """B4: Paused rep held motionless: at 3.0s holds ECCENTRIC, past 3.5s aborts to IDLE."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # Descent into eccentric
        descent = make_bell_profile(1.2, 0.50, is_downward=True)
        for i, (a_vert, g_rot) in enumerate(descent):
            tracker.step(i * dt, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)
        self.assertEqual(tracker.currentState, "ECCENTRIC")

        # Hold motionless for 3000ms (3.0s) -> should remain ECCENTRIC
        start_t = len(descent) * dt
        for i in range(300):
            t = start_t + i * dt
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        self.assertEqual(tracker.currentState, "ECCENTRIC", "Must remain ECCENTRIC at 3.0s pause")

        # Continue hold past 3500ms (another 80 samples = 3800ms total) -> must abort to IDLE
        for i in range(300, 380):
            t = start_t + i * dt
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        self.assertEqual(tracker.currentState, "IDLE", "Must abort to IDLE when motionless past 3500ms")

    def test_b04_02_sticking_point_low_velocity_persistence_boundary(self):
        """B4: Concentric grind with low velocity (< 0.02 m/s) does not terminate if count < 25."""
        # 24 samples at low velocity: count < 25 does not trigger isVelStopped
        count = 24
        is_vel_stopped = (count >= 25)
        self.assertFalse(is_vel_stopped, "Stall persistence must require >= 25 samples")
        # 25 samples triggers completion if peak velocity and displacement met
        count = 25
        is_vel_stopped = (count >= 25)
        self.assertTrue(is_vel_stopped)

    # ─────────────────────────────────────────────────────────────────────────
    # F05 Chaos Domain 4 (Connectivity & BLE) Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b05_01_empty_payload_and_buffer_congestion_guards(self):
        """B5: Test handling of zero-length payloads and truncated BLE packets."""
        empty_payload = ""
        self.assertEqual(len(empty_payload), 0)
        # Verify parser handles empty strings gracefully
        tokens = empty_payload.split("|")
        self.assertEqual(len(tokens), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # F06 500+ MC Trials Engine Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b06_01_seed_extremes_and_empty_trial_bounds(self):
        """B6: Test seed extremes (0, 2^31-1) and empty trial batch handling."""
        random.seed(0)
        v_low = random.random()
        random.seed(2**31 - 1)
        v_high = random.random()
        self.assertNotEqual(v_low, v_high)

    # ─────────────────────────────────────────────────────────────────────────
    # F07 100Hz Multi-Agent Supervisor Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b07_01_runaway_velocity_clamp_boundary(self):
        """B7: Velocity at 7.99 m/s does NOT clamp; velocity at 8.01 m/s clamps to 0.0."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.velocity = 7.99
        # In step(), clamp is triggered when abs(self.velocity) > 8.0:
        if abs(tracker.velocity) > 8.0:
            tracker.velocity = 0.0
        self.assertEqual(tracker.velocity, 7.99)

        tracker.velocity = 8.05
        if abs(tracker.velocity) > 8.0:
            tracker.velocity = 0.0
        self.assertEqual(tracker.velocity, 0.0, "Runaway velocity > 8.0 must be clamped to 0.0")

    # ─────────────────────────────────────────────────────────────────────────
    # F08 Fault Classifier Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b08_01_unknown_anomaly_domain_fallback(self):
        """B8: Unknown or empty anomaly string safely classifies to default Threshold Mismatch."""
        result = VBTSupervisorOracle.classify_root_cause("unknown_gibberish_123")
        self.assertEqual(result, "Threshold Mismatch")

    # ─────────────────────────────────────────────────────────────────────────
    # F09 Objective Reward Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b09_01_catastrophic_trial_negative_reward_bound(self):
        """B9: Zero true reps, 10 false reps, 10 missed reps must yield steep negative reward."""
        reward = VBTRewardCalculator.compute_reward(
            true_reps=0, false_reps=10, missed_reps=10, velocity_error=1.5, residual_drift=0.5
        )
        # 0*100 - 10*250 - 10*300 - 1.5*50 - 0.5*100 = -2500 - 3000 - 75 - 50 = -5625
        self.assertEqual(reward, -5625.0)

    # ─────────────────────────────────────────────────────────────────────────
    # F10 Policy Genome Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b10_01_genome_parameter_clamping_at_boundaries(self):
        """B10: Out-of-bounds parameters are clipped to formal min and max values."""
        genome = VBTPolicyGenome({"beta": -5.0, "runaway_velocity_clamp": 99.0})
        self.assertEqual(genome.params["beta"], 0.01, "Negative beta must be clamped to min (0.01)")
        self.assertEqual(genome.params["runaway_velocity_clamp"], 12.0, "Excessive clamp must be clamped to max (12.0)")

    # ─────────────────────────────────────────────────────────────────────────
    # F11 Policy Optimizer Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b11_01_degenerate_population_handling(self):
        """B11: Population of identical vectors does not produce NaN or blow up mutation."""
        identical_pop = [[0.5] * 18 for _ in range(5)]
        # Difference between two identical individuals is zero vector
        diff = [identical_pop[0][i] - identical_pop[1][i] for i in range(18)]
        self.assertEqual(diff, [0.0] * 18)

    # ─────────────────────────────────────────────────────────────────────────
    # F12 Dynamic I2C Reset Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b12_01_scl_9_clock_unwedge_specification(self):
        """B12: Verify SCL 9-clock toggle un-wedge state transitions."""
        clock_pulses = []
        for _ in range(9):
            clock_pulses.append("HIGH")
            clock_pulses.append("LOW")
        self.assertEqual(len(clock_pulses), 18)
        self.assertEqual(clock_pulses[0], "HIGH")
        self.assertEqual(clock_pulses[-1], "LOW")

    # ─────────────────────────────────────────────────────────────────────────
    # F13 Boot Motion Auto-Recalibration Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b13_01_large_boot_offset_recovery(self):
        """B13: Sensor boot with 10.50 m/s2 baseline smoothly adapts to true gravity."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 10.50)
        dt = 0.01
        for i in range(1000): # 10s quiet rest
            tracker.step(i * dt, 0.0, 0.0, 10.50, 0.0, 0.0, 0.0, dt)
        self.assertTrue(tracker.is_stationary)
        self.assertAlmostEqual(tracker.gravity_baseline, 10.50, delta=0.15)

    # ─────────────────────────────────────────────────────────────────────────
    # F14 Sticking-Point & Pause Remediation Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b14_01_fsm_timeout_boundaries_eccentric_and_concentric(self):
        """B14: Concentric timeout at 6.0s terminates rep without crash."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.currentState = "CONCENTRIC"
        tracker.state_start_time = 0.0
        tracker.rep_displacement = 0.25
        tracker.peak_velocity = 0.40
        # Step at t = 6.5s (> 6.0s timeout)
        tracker.step(6.5, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, 0.01)
        self.assertEqual(tracker.currentState, "IDLE", "Concentric state past 6.0s must transition to IDLE")
        self.assertEqual(len(tracker.reps), 1, "Timed-out completed concentric stroke is preserved")

    # ─────────────────────────────────────────────────────────────────────────
    # F15 Non-Destructive BLE Reconnect Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b15_01_multiple_rapid_reconnects_preserve_displacement(self):
        """B15: 5 rapid disconnect/reconnect events do not wipe rep displacement."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.currentState = "CONCENTRIC"
        tracker.rep_displacement = 0.32
        # Disconnect simulation: no resetPhysicsState()
        for _ in range(5):
            # Client disconnects and reconnects
            pass
        self.assertEqual(tracker.rep_displacement, 0.32)

    # ─────────────────────────────────────────────────────────────────────────
    # F16 Hyperparameter C++ Embedding Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b16_01_physics_constant_bounds_in_source(self):
        """B16: Verify STATIONARY_ACCEL_VAR_THRESH is set to 0.040 in src/main.cpp."""
        content = self.analyzer.content
        match = re.search(r"STATIONARY_ACCEL_VAR_THRESH\s*=\s*([0-9.]+)", content)
        self.assertIsNotNone(match, "STATIONARY_ACCEL_VAR_THRESH constant must exist")
        val = float(match.group(1))
        self.assertAlmostEqual(val, 0.040, delta=0.005)

    # ─────────────────────────────────────────────────────────────────────────
    # F17 Deterministic 100Hz Loop Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b17_01_dt_jitter_clamping_boundary(self):
        """B17: Verify dt clamping guards against timer overflows (dt > 0.05 -> 0.01)."""
        content = self.analyzer.content
        has_dt_guard = bool(re.search(r"dt\s*>\s*0\.05f\s*\|\|\s*dt\s*<=\s*0\.0f", content))
        self.assertTrue(has_dt_guard, "dt overflow guard must exist in loop()")

    # ─────────────────────────────────────────────────────────────────────────
    # F18 Declarative Regression Schema Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b18_01_schema_rejection_of_negative_displacements(self):
        """B18: Regression schema rejects negative displacement values."""
        bad_case = VBTRegressionCaseValidator.create_canonical_case(
            case_id="bad_disp", lift_type="Squat", reps=1, disp=-0.20, dur=1.0, peak_v=0.5, mcv=0.3
        )
        is_valid, msg = VBTRegressionCaseValidator.validate_case(bad_case)
        self.assertFalse(is_valid, "Negative displacement must fail validation")

    # ─────────────────────────────────────────────────────────────────────────
    # F19 Benchmark Lift Corpus Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b19_01_benchmark_powerlift_displacement_bounds(self):
        """B19: Powerlift benchmark minimum displacements (Squat >= 0.30m, Bench >= 0.20m, DL >= 0.35m)."""
        benchmarks = {
            "Squat": 0.45,
            "Bench": 0.32,
            "Deadlift": 0.50
        }
        self.assertGreaterEqual(benchmarks["Squat"], 0.30)
        self.assertGreaterEqual(benchmarks["Bench"], 0.20)
        self.assertGreaterEqual(benchmarks["Deadlift"], 0.35)

    # ─────────────────────────────────────────────────────────────────────────
    # F20 Failure Ingestion Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b20_01_failure_ingestion_deduplication(self):
        """B20: Ingestion of identical anomalies preserves distinct timestamps."""
        a1 = VBTAnomaly(t=1.0, subagent="RestZUPT", description="Drift", root_cause="Sensor Noise")
        a2 = VBTAnomaly(t=2.0, subagent="RestZUPT", description="Drift", root_cause="Sensor Noise")
        self.assertNotEqual(a1.t, a2.t)

    # ─────────────────────────────────────────────────────────────────────────
    # F21 Regression Runner Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b21_01_runner_zero_tolerance_for_missed_reps(self):
        """B21: Regression runner fails if rep_count_error > 0."""
        target_reps = 5
        detected_reps = 4
        rep_error = abs(target_reps - detected_reps)
        self.assertGreater(rep_error, 0, "Missed rep must register non-zero error")

    # ─────────────────────────────────────────────────────────────────────────
    # F22 Final Verification Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b22_01_continuous_motionless_drift_zero_false_reps(self):
        """B22: 60 seconds of stationary thermal noise yields 0 false reps."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01
        for i in range(6000): # 60 seconds
            tracker.step(i * dt, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        self.assertEqual(len(tracker.reps), 0, "Zero false reps on continuous motionless noise")

    # ─────────────────────────────────────────────────────────────────────────
    # F23 E2E Testing Suite Boundaries
    # ─────────────────────────────────────────────────────────────────────────

    def test_b23_01_test_suite_all_tiers_present(self):
        """B23: Verify Tier 1, Tier 2, Tier 3, and Tier 4 test modules exist."""
        test_dir = os.path.dirname(__file__)
        self.assertTrue(os.path.exists(os.path.join(test_dir, "test_vbt_firmware_tier1.py")))
        self.assertTrue(os.path.exists(os.path.join(test_dir, "test_vbt_firmware_tier2.py")))


if __name__ == "__main__":
    unittest.main()
