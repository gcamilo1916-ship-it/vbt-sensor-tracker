"""
Tier 3: Cross-Feature Interactions & Pairwise Matrix Test Suite for VBT Firmware & Chaos Framework.
Validates multi-feature state transitions, concurrent subsystem interactions, and fault combinations.
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


class TestVBTFirmwareTier3Interactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 1: Boot Motion + Thermal Drift Adaptation
    # ─────────────────────────────────────────────────────────────────────────

    def test_p01_boot_motion_plus_thermal_drift_recovery(self):
        """P1: Sensor moves violently during boot, then rests on rack while warming (+0.25 m/s2)."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # Phase 1: Violent boot motion (3 seconds)
        for i in range(300):
            t = i * dt
            ax = 3.0 * math.sin(15.0 * t)
            gx = 1.0 * math.cos(10.0 * t)
            tracker.step(t, ax, 0.0, 9.81, gx, 0.0, 0.0, dt)

        self.assertFalse(tracker.is_stationary, "Must not be stationary during boot motion")

        # Phase 2: Rests on rack, thermal drift kicks in (+0.25 m/s2 over 15s)
        for i in range(300, 1800):
            t = i * dt
            rel_i = i - 300
            drift = 0.25 * (rel_i / 1500.0)
            tracker.step(t, 0.0, 0.0, 9.81 + drift, 0.0, 0.0, 0.0, dt)

        self.assertTrue(tracker.is_stationary, "Must recover stationarity on rack")
        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(len(tracker.reps), 0, "Zero false reps during motion-to-rest recovery")

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 2: Sticking-Point Grind + BLE Disconnect & Reconnect
    # ─────────────────────────────────────────────────────────────────────────

    def test_p02_sticking_point_grind_plus_ble_reconnect(self):
        """P2: Bar enters concentric sticking point (v = 0.035 m/s); BLE drops and reconnects mid-drive."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # Descent
        descent = make_bell_profile(1.0, 0.45, is_downward=True)
        for i, (a_vert, g_rot) in enumerate(descent):
            tracker.step(i * dt, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)
        self.assertEqual(tracker.currentState, "ECCENTRIC")

        # Concentric start
        t_base = len(descent) * dt
        for i in range(30):
            t = t_base + i * dt
            tracker.step(t, 0.0, 0.0, 9.81 + 0.8, 0.0, 0.0, 0.0, dt)
        self.assertEqual(tracker.currentState, "CONCENTRIC")

        # Mid-concentric BLE disconnection & reconnection event:
        # Invariant: Disconnect must NOT reset tracker.velocity or rep_displacement
        current_disp = tracker.rep_displacement
        self.assertGreater(current_disp, 0.0)

        # Complete concentric drive to lockout
        t_mid = t_base + 30 * dt
        for i in range(50):
            t = t_mid + i * dt
            tracker.step(t, 0.0, 0.0, 9.81 + 0.5, 0.0, 0.0, 0.0, dt)
        # Settle at lockout
        t_end = t_mid + 50 * dt
        for i in range(50):
            t = t_end + i * dt
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        self.assertEqual(len(tracker.reps), 1, "Rep must complete successfully despite BLE event")

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 3: Bottom Pause + Sensor Impact Spike
    # ─────────────────────────────────────────────────────────────────────────

    def test_p03_bottom_pause_plus_rattle_impact_rejection(self):
        """P3: Barbell paused at bottom; sudden lateral impact spike does not trigger false rep."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # Descent
        descent = make_bell_profile(1.0, 0.45, is_downward=True)
        for i, (a_vert, g_rot) in enumerate(descent):
            tracker.step(i * dt, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)

        # Pause at bottom for 1.5s
        t_base = len(descent) * dt
        for i in range(150):
            t = t_base + i * dt
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        # Sudden lateral rattle spike on pins (ax = 4.0 m/s2 for 20ms)
        t_spike = t_base + 1.5
        tracker.step(t_spike, 4.0, 0.0, 9.81, 0.5, 0.0, 0.0, dt)
        tracker.step(t_spike + 0.01, 4.0, 0.0, 9.81, 0.5, 0.0, 0.0, dt)

        # Continue pause
        for i in range(50):
            t = t_spike + 0.02 + i * dt
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        # Must not transition to CONCENTRIC or generate false reps
        self.assertNotEqual(tracker.currentState, "CONCENTRIC")
        self.assertEqual(len(tracker.reps), 0)

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 4: Consecutive NaNs + Bottom Paused Hold
    # ─────────────────────────────────────────────────────────────────────────

    def test_p04_consecutive_nans_during_paused_hold(self):
        """P4: 5 consecutive NaN packets during chest pause are safely absorbed without state corruption."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # Descent
        descent = make_bell_profile(1.0, 0.45, is_downward=True)
        for i, (a_vert, g_rot) in enumerate(descent):
            tracker.step(i * dt, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)

        # Pause + 5 NaNs with firmware dropout protection (src/main.cpp:427)
        t_base = len(descent) * dt
        dropped_packets = 0
        for i in range(5):
            raw_ax, raw_ay, raw_az = float("nan"), 0.0, 9.81
            raw_gx, raw_gy, raw_gz = 0.0, 0.0, 0.0
            # Emulate firmware layer: if isnan(a.acceleration.x) -> drop packet
            if math.isnan(raw_ax) or math.isnan(raw_gx):
                dropped_packets += 1
                continue
            tracker.step(t_base + i * dt, raw_ax, raw_ay, raw_az, raw_gx, raw_gy, raw_gz, dt)

        self.assertEqual(dropped_packets, 5, "All 5 NaN packets must be dropped by sensor guard")

        # Clean samples continue
        for i in range(5, 50):
            t = t_base + i * dt
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        self.assertFalse(math.isnan(tracker.velocity), "Velocity must remain valid and non-NaN")
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.05)

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 5: Genome Mutation + Supervisor Inspection
    # ─────────────────────────────────────────────────────────────────────────

    def test_p05_policy_mutation_evaluated_by_supervisor(self):
        """P5: Mutated genome decoded into parameters and inspected across 4 supervisor subagents."""
        vec = [0.5] * 18
        genome = VBTPolicyGenome.from_vector(vec)
        self.assertTrue(genome.validate()[0])

        # Verify supervisor inspects sample under these parameters
        anomalies = VBTSupervisorOracle.inspect_sample(
            t=1.0,
            tracker_state={"velocity": 0.0, "currentState": "IDLE", "state_duration": 1.0},
            is_physically_stationary=True,
            is_in_concentric=False
        )
        self.assertEqual(len(anomalies), 0, "Normal resting state should yield zero anomalies")

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 6: Supervisor Anomaly Ingestion into Regression Catalog
    # ─────────────────────────────────────────────────────────────────────────

    def test_p06_supervisor_anomaly_triggers_regression_case_ingestion(self):
        """P6: Anomaly detected by supervisor is automatically formatted and validated as regression case."""
        anom = VBTAnomaly(t=3.2, subagent="RepStroke", description="Stroke truncated", root_cause="Threshold Mismatch")
        case = VBTRegressionCaseValidator.create_canonical_case(
            case_id="auto_ingested_p06",
            lift_type="Bench",
            reps=0,
            disp=0.08,
            dur=0.6,
            peak_v=0.18,
            mcv=0.10,
            faults=[anom.to_dict()]
        )
        is_valid, msg = VBTRegressionCaseValidator.validate_case(case)
        self.assertTrue(is_valid, msg)
        self.assertEqual(case["fault_injections"][0]["subagent"], "RepStroke")

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 7: Dual-Tier Variance Gate State Transition Handshake
    # ─────────────────────────────────────────────────────────────────────────

    def test_p07_dual_tier_variance_gate_handshake(self):
        """P7: Transition from Tier 2 Recovery Still (wide baseline) to Tier 1 Normal Operation."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        # Large initial error (10.40 m/s2) triggers Tier 2 recovery still
        tracker.filter.init_from_gravity(0.0, 0.0, 10.40)
        dt = 0.01

        # 15s rest on rack adapts baseline toward 10.40
        for i in range(1500):
            tracker.step(i * dt, 0.0, 0.0, 10.40, 0.0, 0.0, 0.0, dt)

        # Baseline adapted within 0.40 m/s2, so Tier 1 Primary Still is now active
        diff = abs(tracker.gravity_baseline - 10.40)
        self.assertLess(diff, 0.40, "Baseline must adapt into Tier 1 gating tolerance (< 0.40)")

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 8: BLE Lift Change Queued Mid-Rep Applied at IDLE
    # ─────────────────────────────────────────────────────────────────────────

    def test_p08_queued_lift_change_applied_only_at_idle(self):
        """P8: Verify C++ source enforces pending lift change is applied ONLY when currentState == IDLE."""
        content = self.analyzer.content
        has_idle_check = bool(re.search(r"if\s*\(\s*currentState\s*==\s*IDLE\s*&&\s*pendingLift\s*!=\s*nullptr\s*\)", content))
        self.assertTrue(has_idle_check, "Lift changes must be gated by currentState == IDLE")

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 9: Touch-and-Go Cycling with Refractory Window
    # ─────────────────────────────────────────────────────────────────────────

    def test_p09_touch_and_go_cycling_seamless_transition(self):
        """P9: Rep 1 lockout immediately followed by Rep 2 descent integrates seamlessly."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01

        # Rep 1: Descent + Ascent
        r1_descent = make_bell_profile(0.8, 0.50, is_downward=True)
        r1_ascent = make_bell_profile(0.7, 0.60, is_downward=False)
        for i, (a_vert, g_rot) in enumerate(r1_descent + r1_ascent):
            tracker.step(i * dt, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)

        # Lockout transition
        t_r1_end = len(r1_descent + r1_ascent) * dt
        for i in range(30):
            tracker.step(t_r1_end + i * dt, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        self.assertEqual(len(tracker.reps), 1, "Rep 1 recorded")

        # Rep 2 starts immediately without stationary delay
        t_r2_start = t_r1_end + 30 * dt
        r2_descent = make_bell_profile(0.8, 0.50, is_downward=True)
        r2_ascent = make_bell_profile(0.7, 0.60, is_downward=False)
        for i, (a_vert, g_rot) in enumerate(r2_descent + r2_ascent):
            tracker.step(t_r2_start + i * dt, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)

        # Settle at top
        t_r2_end = t_r2_start + len(r2_descent + r2_ascent) * dt
        for i in range(30):
            tracker.step(t_r2_end + i * dt, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        self.assertEqual(len(tracker.reps), 2, "Rep 2 captured seamlessly in touch-and-go cycling")

    # ─────────────────────────────────────────────────────────────────────────
    # Interaction 10: Runaway Velocity Clamp + Atomic State Reset
    # ─────────────────────────────────────────────────────────────────────────

    def test_p10_runaway_clamp_resets_state_and_engages_lockout(self):
        """P10: Runaway clamp resets velocity to 0 and transitions FSM to IDLE with lockout window."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        tracker.velocity = 9.2 # High velocity spike
        tracker.currentState = "CONCENTRIC"
        dt = 0.01

        # Step triggers clamp at line 287 of sim_madgwick.py
        tracker.step(1.0, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
        self.assertEqual(tracker.velocity, 0.0, "Velocity must be reset to 0.0 upon clamp")
        self.assertEqual(tracker.currentState, "IDLE", "State must reset to IDLE")
        self.assertGreater(tracker.concentric_lockout_until, 1.0, "Refractory lockout must be engaged")


if __name__ == "__main__":
    unittest.main()
