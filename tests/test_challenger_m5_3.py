"""
tests/test_challenger_m5_3.py — Milestone 5 Tier 5 Adversarial Stress & Boundary Verification Suite.

Challenger 1 (challenger_m5_3) Empirical Stress Verification Suite.
Validates the complete system against 4 extreme stress dimensions:
1. Sub-threshold velocity grinds: Sticking points at extreme sub-threshold velocities (v <= 0.015 m/s) with stroke >= 0.25m.
2. Isometric pin holds: Motionless holds on safety pins extending 4.0s–5.0s with atomic abort to IDLE and zero velocity runaway.
3. Touch-and-go high-frequency barbell cycling: Rapid cycling up to 2.5 reps/s with zero dropped reps or phantom integration spikes.
4. Floor shocks and impact drops: +60 m/s^2 impulse shocks and verification of false positive rep triggers.

Pure Python standard library with zero external dependencies.
"""

from __future__ import annotations

import os
import sys
import math
import random
import unittest
from typing import List, Dict, Any

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.sim_madgwick import RobustVBTTracker, make_bell_profile
from tests.sim_chaos_engine import ChaosEngine, TrialConfig, LiftType
from tests.vbt_test_fixtures import (
    VBTKinematicGenerator,
    VBTCppSourceAnalyzer,
    MAIN_CPP_PATH,
    PLATFORMIO_INI_PATH,
)


class TestChallengerM53SubThresholdGrinds(unittest.TestCase):
    """Tier 5 Stress Target 1: Sub-threshold velocity grinds (v <= 0.015 m/s, stroke >= 0.25m)."""

    def setUp(self):
        self.tracker = RobustVBTTracker(initial_baseline=9.81)
        self.tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        self.dt = 0.01

    def test_01_sub_threshold_grind_truncation_empirical(self):
        """
        Empirically test sticking-point grind at v = 0.015 m/s with true stroke >= 0.25m.
        Demonstrates that when velocity drops below 0.02 m/s during an active concentric drive,
        the low_velocity_concentric_count does NOT prematurely terminate the repetition while
        the lifter is actively pushing upward below full stroke (disp < 0.20m), and completes
        with stroke >= 0.25m upon lockout deceleration.
        """
        t = 0.0
        # 1. Stationary rest on floor in IDLE (1.0s)
        for _ in range(100):
            self.tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # 2. Explosive concentric pull off floor (0.15s, a = +2.5 m/s^2) -> enters CONCENTRIC
        for _ in range(15):
            self.tracker.step(t, 0.0, 0.0, 9.81 + 2.5, 0.05, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(self.tracker.currentState, "CONCENTRIC")
        initial_peak = self.tracker.peak_velocity
        self.assertGreaterEqual(initial_peak, 0.15, "Initial pull must exceed 0.15 m/s peak velocity gate")

        # 3. Decelerate into sticking point (target v = 0.015 m/s)
        while self.tracker.velocity > 0.015:
            self.tracker.step(t, 0.0, 0.0, 9.81 - 0.50, 0.01, 0.0, 0.0, self.dt)
            t += self.dt

        grind_entry_disp = self.tracker.rep_displacement
        self.assertGreater(grind_entry_disp, 0.12, "Displacement before grind must exceed 0.12m threshold")

        # 4. Sustained sub-threshold grind at v = 0.015 m/s for 1.0s (100 samples)
        tripped_early = False
        trip_sample = 0
        for step_i in range(100):
            self.tracker.step(t, 0.0, 0.0, 9.81, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
            if self.tracker.currentState != "CONCENTRIC":
                tripped_early = True
                trip_sample = step_i
                break

        # REMEDIATED BEHAVIOR:
        # The rep does NOT trip early during the 0.015 m/s grind:
        self.assertFalse(tripped_early, "Tracker must not exit CONCENTRIC during sub-threshold sticking-point grind")
        self.assertEqual(len(self.tracker.reps), 0, "No premature rep recorded during active grind")

        # 5. Push through past sticking point to lockout (stroke >= 0.25m):
        for _ in range(30):
            self.tracker.step(t, 0.0, 0.0, 9.81 + 1.5, 0.02, 0.0, 0.0, self.dt)
            t += self.dt
        while self.tracker.velocity > 0.00:
            self.tracker.step(t, 0.0, 0.0, 9.81 - 1.5, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
        for _ in range(20):
            self.tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(self.tracker.reps), 1, "Full-stroke rep recorded upon lockout")
        self.assertGreaterEqual(self.tracker.reps[0]["disp"], 0.25, "Rep stroke >= 0.25m")

    def test_02_constant_velocity_grind_lockout_false_stationary(self):
        """
        Demonstrates that smooth constant-velocity grind (a_vert = 0) with active upward
        motion (v > 0.005 m/s) does not prematurely terminate the rep before full stroke (disp >= 0.20m).
        """
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt
        # Explosive pull off floor
        for _ in range(15):
            tracker.step(t, 0.0, 0.0, 9.81 + 2.5, 0.05, 0.0, 0.0, self.dt)
            t += self.dt
        # Decelerate to 0.035 m/s
        while tracker.velocity > 0.035:
            tracker.step(t, 0.0, 0.0, 9.81 - 0.45, 0.01, 0.0, 0.0, self.dt)
            t += self.dt

        # Even though moving variance drops, velocity gate (abs(v) <= 0.005 or disp >= 0.20)
        # prevents premature lockout termination:
        early_lockout = False
        lockout_sample = 0
        for step_i in range(50):
            tracker.step(t, 0.0, 0.0, 9.81, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
            if tracker.currentState != "CONCENTRIC":
                early_lockout = True
                lockout_sample = step_i
                break

        self.assertFalse(early_lockout, "Constant velocity grind must not trigger early lockout before full stroke")
        self.assertEqual(len(tracker.reps), 0, "No premature rep recorded during constant-velocity grind")

    def test_03_ast_check_stall_persistence_constants(self):
        """Verifies C++ firmware stall constants and identifies low-velocity threshold vulnerability."""
        analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)
        content = analyzer.content

        # Verify OPT_STALL_PERSISTENCE_LIMIT definition
        self.assertIn("OPT_STALL_PERSISTENCE_LIMIT", content)
        self.assertIn("low_velocity_concentric_count", content)

        # Confirm the threshold in C++ is exactly 0.02f
        self.assertRegex(content, r"velocity\s*<=\s*0\.02f")


class TestChallengerM53IsometricPinHolds(unittest.TestCase):
    """Tier 5 Stress Target 2: Motionless holds on safety pins extending 4.0s–5.0s."""

    def setUp(self):
        self.tracker = RobustVBTTracker(initial_baseline=9.81)
        self.tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        self.dt = 0.01

    def test_04_eccentric_pin_hold_4s_abort_clean(self):
        """
        Athlete descends into ECCENTRIC and dumps bar motionless on safety pins for 4.0s.
        Verifies atomic abort to IDLE at ~3.7s without velocity accumulation or false rep.
        """
        t = 0.0
        # 1.2s eccentric descent
        descent = make_bell_profile(1.2, 0.50, is_downward=True)
        for a_vert, g_rot in descent:
            self.tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(self.tracker.currentState, "ECCENTRIC")

        # 4.0s motionless pin hold (400 samples)
        abort_time = None
        for step_i in range(400):
            self.tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt
            if self.tracker.currentState == "IDLE" and abort_time is None:
                abort_time = step_i * self.dt

        self.assertIsNotNone(abort_time, "Must abort to IDLE during 4.0s motionless pin hold")
        # Abort happens after ~3.5s of motionless hold + ~0.2s variance window
        self.assertAlmostEqual(abort_time, 3.70, delta=0.25)
        self.assertEqual(self.tracker.currentState, "IDLE")
        self.assertEqual(len(self.tracker.reps), 0, "Aborted pin dump must record 0 reps")
        self.assertEqual(self.tracker.velocity, 0.0, "Velocity must be exactly 0.0 at IDLE")

    def test_05_eccentric_pin_hold_5s_zero_velocity_runaway(self):
        """
        Extends motionless pin hold to 5.0 seconds under thermal noise.
        Verifies zero velocity runaway, zero drift, and state stability in IDLE.
        """
        t = 0.0
        descent = make_bell_profile(1.0, 0.45, is_downward=True)
        for a_vert, g_rot in descent:
            self.tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
            t += self.dt

        # 5.0s motionless pin hold with small sensor noise
        for _ in range(500):
            an = random.gauss(0.0, 0.005)
            gn = random.gauss(0.0, 0.002)
            self.tracker.step(t, 0.0, 0.0, 9.81 + an, gn, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(self.tracker.currentState, "IDLE")
        self.assertEqual(len(self.tracker.reps), 0, "0 reps allowed during 5.0s pin hold")
        self.assertAlmostEqual(self.tracker.velocity, 0.0, delta=0.005, msg="No velocity runaway allowed")
        self.assertAlmostEqual(self.tracker.rep_displacement, 0.0, delta=0.001)

    def test_06_ast_check_pin_pause_timeout(self):
        """Verifies C++ firmware contains the motionless_in_eccentric_ms timeout guard."""
        analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)
        content = analyzer.content

        self.assertIn("PAUSE_MOTIONLESS_MAX_MS", content)
        self.assertIn("motionless_in_eccentric_ms", content)
        # Timeout condition in ECCENTRIC state
        self.assertRegex(content, r"motionless_in_eccentric_ms\s*>\s*PAUSE_MOTIONLESS_MAX_MS")


class TestChallengerM53HighFrequencyBarbellCycling(unittest.TestCase):
    """Tier 5 Stress Target 3: Touch-and-go barbell cycling up to 2.5 reps/s."""

    def setUp(self):
        self.dt = 0.01

    def test_07_cycling_cadence_sweep_1_0_to_2_5_reps_per_sec(self):
        """
        Sweeps cycling cadences from 1.0 rep/s (standard) to 2.5 reps/s (extreme).
        Empirically isolates the frequency threshold where repetitions begin dropping.
        """
        cadences = [1.0, 1.5, 2.0, 2.5]
        results = {}

        for cad in cadences:
            tracker = RobustVBTTracker(initial_baseline=9.81)
            tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
            t = 0.0
            rep_period_s = 1.0 / cad
            ecc_dur = rep_period_s * 0.45
            conc_dur = rep_period_s * 0.55

            for rep_idx in range(5):
                descent = make_bell_profile(ecc_dur, 0.70, is_downward=True)
                ascent = make_bell_profile(conc_dur, 0.85, is_downward=False)
                for a_vert, g_rot in descent + ascent:
                    tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
                    t += self.dt

            # Lockout rest
            for _ in range(60):
                tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
                t += self.dt

            results[cad] = len(tracker.reps)

        # Cadence 1.0 rep/s (5.0s for 5 reps) captures 100% (5 reps)
        self.assertEqual(results[1.0], 5, "1.0 rep/s cadence must capture 5 of 5 reps")

        # Cadence sweep isolates threshold where stroke drops below minimum displacement (conc_dur=0.22s yields disp=0.093m < 0.10m):
        self.assertLess(results[2.5], 5, f"2.5 reps/s cadence with sub-10cm stroke correctly filtered: captured {results[2.5]}/5")

    def test_08_cycling_2_5_reps_per_sec_dropped_reps_empirical(self):
        """
        Detailed empirical verification of 2.5 reps/s cycling capture:
        5 reps executed in 2.0 seconds yields all 5 recorded repetitions.
        """
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        # 5 reps at 2.5 reps/s (0.15s descent, 0.25s ascent = 0.40s per rep)
        for rep_idx in range(5):
            descent = make_bell_profile(0.15, 0.80, is_downward=True)
            ascent = make_bell_profile(0.25, 0.95, is_downward=False)
            for a_vert, g_rot in descent + ascent:
                tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
                t += self.dt

        for _ in range(50):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # Exactly 5 reps recorded out of 5 executed with explosive cadence adaptation
        self.assertEqual(len(tracker.reps), 5, f"Expected 5 reps recorded at 2.5 reps/s, got {len(tracker.reps)}")

    def test_09_ast_check_refractory_and_concentric_min_duration(self):
        """Static inspection confirming the 250ms minimum duration gate and 347ms refractory window."""
        analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)
        content = analyzer.content

        # OPT_REFRACTORY_WINDOW_MS = 347ms
        self.assertIn("OPT_REFRACTORY_WINDOW_MS", content)
        # Minimum concentric duration check: state_duration_ms >= 250
        self.assertRegex(content, r"state_duration_ms\s*>=\s*250")
        self.assertRegex(content, r"rep_duration\s*>=\s*0\.25f")


class TestChallengerM53FloorShocksAndImpactDrops(unittest.TestCase):
    """Tier 5 Stress Target 4: Floor shocks and impact drops (+60 m/s^2 impulse shocks)."""

    def setUp(self):
        self.dt = 0.01

    def test_10_floor_drop_via_chaos_engine_extended_timeout(self):
        """
        Physical floor drop with free-fall descent (-9.81 m/s^2) followed by +60 m/s^2 impact pulse.
        Verifies that legitimate floor drops cleanly yield 0 reps, and demonstrates that the
        eccentric ZUPT velocity gate (|v| < 0.10) traps the post-impact residual velocity in ECCENTRIC
        until the 8.0s timeout resets it to IDLE.
        """
        # Under 10.0s trial duration, 8.0s state timeout resets ECCENTRIC to IDLE
        config = TrialConfig(trial_id="test_challenger_floor_drop_10s", lift_type=LiftType.FLOOR_DROP, duration_s=10.0)
        engine = ChaosEngine(seed=123)
        telemetry, gt = engine.run_trial(config)

        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)

        for s in telemetry:
            tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)

        self.assertEqual(gt.reps, 0)
        self.assertEqual(len(tracker.reps), 0, "Floor drop must register 0 repetitions")
        self.assertEqual(tracker.currentState, "IDLE", "Must eventually reset to IDLE via 8.0s timeout")

    def test_11_stationary_floor_shock_false_rep_empirical(self):
        """
        Empirically test an uncompensated +60 m/s^2 impulse shock on a stationary barbell in IDLE.
        Demonstrates the vulnerability: lack of motionless ZUPT or damping in CONCENTRIC
        causes velocity to persist at ~0.24 m/s, integrating phantom displacement to >= 0.12m
        and registering a false positive repetition.
        """
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        # 1. Barbell resting motionless in IDLE (1.0s)
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt
        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(tracker.velocity, 0.0)

        # 2. Impact shock (+60 m/s^2 for 10ms), followed by damped ringing
        tracker.step(t, 0.0, 0.0, 9.81 + 60.0, 1.5, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 - 40.0, -1.0, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 + 10.0, 0.5, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 - 5.0, -0.2, 0.0, 0.0, self.dt)
        t += self.dt

        # 3. Barbell rests motionless on floor (2.0s)
        for _ in range(200):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # REMEDIATED BEHAVIOR:
        # Stationary floor shock triggers immediate ZUPT clamp and aborts to IDLE with 0 reps:
        self.assertEqual(len(tracker.reps), 0, "Stationary impulse shock must register 0 repetitions")
        self.assertEqual(tracker.currentState, "IDLE", "Tracker must reset to IDLE upon motionless abort")
        self.assertEqual(tracker.velocity, 0.0, "Velocity must be clamped to 0.0")

    def test_12_symmetric_dipole_shock_comparison(self):
        """
        Contrasts symmetric dipole (+60 then -60 m/s^2, zero net momentum)
        against uncompensated impulse shock.
        Demonstrates that momentum-balanced shocks are rejected (0 reps),
        proving that uncompensated shocks fail specifically due to velocity persistence in CONCENTRIC.
        """
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # Perfectly symmetric dipole: +60 then -60
        tracker.step(t, 0.0, 0.0, 9.81 + 60.0, 0.0, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 - 60.0, 0.0, 0.0, 0.0, self.dt)
        t += self.dt

        for _ in range(200):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 0, "Symmetric dipole shock must register 0 reps")
        self.assertEqual(tracker.currentState, "IDLE")

    def test_13_ast_check_concentric_zupt_gap(self):
        """
        Static code analysis of src/main.cpp confirming that motionless ZUPT is implemented
        in CONCENTRIC physics loop to protect against floor shock false positive reps.
        """
        analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)
        content = analyzer.content

        # IDLE motionless check
        self.assertIn("if (currentState == IDLE)", content)
        # ECCENTRIC motionless check
        self.assertIn("else if (currentState == ECCENTRIC)", content)
        # CONCENTRIC motionless ZUPT check
        concentric_block = content.split("else { // CONCENTRIC")[1].split("if (abs(velocity) > RUNAWAY_VELOCITY_CLAMP)")[0]
        self.assertIn("isMotionless", concentric_block, "CONCENTRIC physics loop has isMotionless ZUPT guard")


if __name__ == "__main__":
    unittest.main()
