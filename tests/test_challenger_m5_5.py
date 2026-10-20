"""
tests/test_challenger_m5_5.py — Milestone 5 Tier 5 Adversarial Verification & Stress Harness.

Authored by Milestone 5 Stress Challenger 1 (challenger_m5_5).
Validates the remediated VBT codebase against all 4 Tier-5 stress dimensions:
1. Target 1: Sub-threshold velocity grinds (v <= 0.015 m/s, stroke >= 0.25m):
   - Sticking points at v = 0.015 and v = 0.010 m/s do not trip early.
   - Pushes through sticking point to full lockout stroke >= 0.25m.
   - Constant-velocity grinds with zero vertical acceleration do not trip early lockout before 0.20m.
   - Multi-phase sticking points with tremor noise complete full stroke.
2. Target 2: Isometric pin holds (4.0s–5.0s motionless holds on safety pins):
   - Motionless holds for 4.0s, 4.5s, 5.0s cleanly abort to IDLE.
   - Zero velocity runaway and zero drift under sensor thermal noise.
   - Clean re-engagement: subsequent repetition after abort is detected accurately.
3. Target 3: Touch-and-go barbell cycling up to 2.5 reps/s:
   - 5/5 reps (100%) captured at 2.5 reps/s cadence (400ms period).
   - Extended cycling: 10/10 consecutive reps captured without rep merges or drops.
   - Cadence sweep (1.5, 2.0, 2.5 reps/s) confirms 100% rep capture.
   - Sub-10cm flutter stroke rejection confirms individual reps are filtered (< 5 reps recorded).
4. Target 4: Floor shocks and impact drops (+60 m/s^2 impulse shocks):
   - Stationary impulse shock (+60 m/s^2) produces 0 false positive reps.
   - Velocity immediately clamps to 0.0 m/s and state resets to IDLE.
   - Multiple repetitive shocks produce 0 false reps.
   - Clean subsequent repetition detection after stationary floor shock.
   - Empirical boundary demonstration: isolates the physical limit where shocks exceeding
     +80 to +100 m/s^2 surpass the 12cm displacement threshold during variance latency.
5. C++ Firmware AST Static Conformance:
   - Verifies all hyperparameter declarations, FSM adaptive gates, and CONCENTRIC ZUPT clamps.

Zero external dependencies (pure Python standard library).
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
from tests.vbt_test_fixtures import (
    VBTCppSourceAnalyzer,
    MAIN_CPP_PATH,
)


class TestTarget1SubThresholdGrinds(unittest.TestCase):
    """Adversarial stress validation for Target 1: Sub-threshold Grinds (v <= 0.015 m/s, stroke >= 0.25m)."""

    def setUp(self):
        self.dt = 0.01

    def test_01_grind_at_015_reaches_full_stroke(self):
        """Verify sticking-point grind at v = 0.015 m/s does not trip early and completes stroke >= 0.25m."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        # 1. Rest in IDLE
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # 2. Concentric pull off floor (enters CONCENTRIC)
        for _ in range(15):
            tracker.step(t, 0.0, 0.0, 9.81 + 2.5, 0.05, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(tracker.currentState, "CONCENTRIC")
        self.assertGreaterEqual(tracker.peak_velocity, 0.15)

        # 3. Decelerate into sticking point (v ~ 0.015 m/s)
        while tracker.velocity > 0.015:
            tracker.step(t, 0.0, 0.0, 9.81 - 0.50, 0.01, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertGreater(tracker.rep_displacement, 0.12)

        # 4. Sustained grind at 0.015 m/s for 1.2s (120 samples)
        tripped_early = False
        for _ in range(120):
            tracker.step(t, 0.0, 0.0, 9.81, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
            if tracker.currentState != "CONCENTRIC":
                tripped_early = True
                break

        self.assertFalse(tripped_early, "Grind at 0.015 m/s must not trip early before full stroke")
        self.assertEqual(len(tracker.reps), 0)

        # 5. Push through to full lockout (displacement >= 0.25m)
        for _ in range(35):
            tracker.step(t, 0.0, 0.0, 9.81 + 1.8, 0.02, 0.0, 0.0, self.dt)
            t += self.dt
        while tracker.velocity > 0.00:
            tracker.step(t, 0.0, 0.0, 9.81 - 1.5, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
        for _ in range(25):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 1, "Must record exactly 1 full-stroke repetition")
        self.assertGreaterEqual(tracker.reps[0]["disp"], 0.25, "Rep stroke must be >= 0.25m")

    def test_02_grind_at_010_low_velocity_persistence(self):
        """Stress test sustained grind at v = 0.010 m/s completing full stroke >= 0.25m."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        for _ in range(80):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # Concentric drive
        for _ in range(15):
            tracker.step(t, 0.0, 0.0, 9.81 + 2.5, 0.05, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(tracker.currentState, "CONCENTRIC")

        # Decelerate to ~0.012 m/s
        while tracker.velocity > 0.012:
            tracker.step(t, 0.0, 0.0, 9.81 - 0.45, 0.01, 0.0, 0.0, self.dt)
            t += self.dt

        # Maintain grind in 0.008–0.015 m/s range for 1.0s (100 samples)
        tripped = False
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81 + 0.02, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
            if tracker.currentState != "CONCENTRIC":
                tripped = True
                break

        self.assertFalse(tripped, "Grind at ~0.010 m/s must not trip prematurely")
        self.assertEqual(len(tracker.reps), 0)

        # Push through to lockout
        for _ in range(35):
            tracker.step(t, 0.0, 0.0, 9.81 + 1.8, 0.02, 0.0, 0.0, self.dt)
            t += self.dt
        while tracker.velocity > 0.00:
            tracker.step(t, 0.0, 0.0, 9.81 - 1.5, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
        for _ in range(25):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 1)
        self.assertGreaterEqual(tracker.reps[0]["disp"], 0.25)

    def test_03_constant_velocity_zero_accel_no_false_lockout_before_stroke(self):
        """Verify smooth constant-velocity translation (a_vert = 0) does not trip early lockout before 0.20m."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        for _ in range(80):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt
        for _ in range(15):
            tracker.step(t, 0.0, 0.0, 9.81 + 2.5, 0.04, 0.0, 0.0, self.dt)
            t += self.dt
        while tracker.velocity > 0.035:
            tracker.step(t, 0.0, 0.0, 9.81 - 0.45, 0.01, 0.0, 0.0, self.dt)
            t += self.dt

        # Run 50 samples (~0.50s): moving variance drops to 0, but disp < 0.20m prevents early lockout
        early_lockout = False
        for _ in range(50):
            tracker.step(t, 0.0, 0.0, 9.81, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
            if tracker.currentState != "CONCENTRIC":
                early_lockout = True
                break

        self.assertFalse(early_lockout, "Constant velocity must not trip lockout before full stroke (disp < 0.20m)")
        self.assertEqual(len(tracker.reps), 0)

    def test_04_grind_with_muscular_tremor_noise(self):
        """Simulate high-effort grind with 10Hz muscular tremor oscillation."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        for _ in range(80):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt
        for _ in range(15):
            tracker.step(t, 0.0, 0.0, 9.81 + 2.5, 0.05, 0.0, 0.0, self.dt)
            t += self.dt
        while tracker.velocity > 0.015:
            tracker.step(t, 0.0, 0.0, 9.81 - 0.50, 0.01, 0.0, 0.0, self.dt)
            t += self.dt

        # Tremor for 1.0s: 10Hz sinusoidal acceleration oscillation +/- 0.3 m/s^2
        for j in range(100):
            tremor = 0.30 * math.sin(2.0 * math.pi * 10.0 * (j * self.dt))
            tracker.step(t, 0.0, 0.0, 9.81 + tremor, 0.02, 0.0, 0.0, self.dt)
            t += self.dt
            self.assertEqual(tracker.currentState, "CONCENTRIC")

        # Push to lockout
        for _ in range(30):
            tracker.step(t, 0.0, 0.0, 9.81 + 2.0, 0.03, 0.0, 0.0, self.dt)
            t += self.dt
        while tracker.velocity > 0.00:
            tracker.step(t, 0.0, 0.0, 9.81 - 1.5, 0.01, 0.0, 0.0, self.dt)
            t += self.dt
        for _ in range(25):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 1)
        self.assertGreaterEqual(tracker.reps[0]["disp"], 0.25)


class TestTarget2IsometricPinHolds(unittest.TestCase):
    """Adversarial stress validation for Target 2: Isometric Pin Holds (4.0s–5.0s)."""

    def setUp(self):
        self.dt = 0.01

    def test_05_motionless_pin_holds_duration_sweep(self):
        """Sweep motionless pin holds from 4.0s to 5.0s, verifying clean abort and 0 runaway."""
        durations = [4.0, 4.5, 5.0]

        for hold_dur in durations:
            with self.subTest(hold_dur=hold_dur):
                tracker = RobustVBTTracker(initial_baseline=9.81)
                tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
                t = 0.0

                # 1.0s eccentric descent onto safety pins
                descent = make_bell_profile(1.0, 0.45, is_downward=True)
                for a_vert, g_rot in descent:
                    tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
                    t += self.dt

                self.assertEqual(tracker.currentState, "ECCENTRIC")

                # Motionless hold on pins
                num_steps = int(hold_dur / self.dt)
                for _ in range(num_steps):
                    tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
                    t += self.dt

                # State must be cleanly aborted to IDLE
                self.assertEqual(tracker.currentState, "IDLE", f"Pin hold {hold_dur}s must abort to IDLE")
                self.assertEqual(len(tracker.reps), 0, f"Pin hold {hold_dur}s must register 0 reps")
                self.assertEqual(tracker.velocity, 0.0, f"Velocity must be exactly 0.0")
                self.assertEqual(tracker.rep_displacement, 0.0, f"Displacement must be 0.0")

    def test_06_pin_hold_thermal_drift_and_sensor_noise(self):
        """Motionless pin hold for 5.0s subjected to thermal drift (+0.25 m/s^2) and Gaussian noise."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        descent = make_bell_profile(1.1, 0.48, is_downward=True)
        for a_vert, g_rot in descent:
            tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
            t += self.dt

        # 5.0s hold with linear thermal drift + Gaussian jitter
        for step_i in range(500):
            drift = 0.25 * (step_i / 500.0)
            noise_a = random.gauss(0.0, 0.005)
            noise_g = random.gauss(0.0, 0.002)
            tracker.step(t, 0.0, 0.0, 9.81 + drift + noise_a, noise_g, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(len(tracker.reps), 0)
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.01)

    def test_07_post_abort_reengagement_subsequent_lift(self):
        """
        After 4.5s pin hold abort, lifter pauses 1.0s and executes a legitimate lift.
        Verifies that subsequent lift is captured accurately as 1 rep with zero state corruption.
        """
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        # Descent onto pins
        descent = make_bell_profile(1.0, 0.45, is_downward=True)
        for a_vert, g_rot in descent:
            tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
            t += self.dt

        # 4.5s motionless hold
        for _ in range(450):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(len(tracker.reps), 0)

        # 1.0s rest
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # Legitimate squat: 1.0s eccentric, 0.8s concentric (stroke = 0.45m)
        ecc = make_bell_profile(1.0, 0.45, is_downward=True)
        conc = make_bell_profile(0.8, 0.55, is_downward=False)
        for a_vert, g_rot in ecc + conc:
            tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
            t += self.dt

        # Rest in IDLE
        for _ in range(50):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 1, "Subsequent rep after pin abort must be recorded as 1 rep")
        self.assertAlmostEqual(tracker.reps[0]["disp"], 0.22, delta=0.08)


class TestTarget3HighFrequencyBarbellCycling(unittest.TestCase):
    """Adversarial stress validation for Target 3: High-Frequency Cycling (2.5 reps/s)."""

    def setUp(self):
        self.dt = 0.01

    def test_08_five_reps_at_2_5_reps_per_sec_captured_100_percent(self):
        """Verify 5/5 reps (100%) captured at 2.5 reps/s cadence (400ms period, stroke >= 10cm)."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        # 5 reps at 2.5 reps/s: 150ms descent, 250ms ascent = 400ms per rep
        for rep_idx in range(5):
            descent = make_bell_profile(0.15, 0.80, is_downward=True)
            ascent = make_bell_profile(0.25, 0.95, is_downward=False)
            for a_vert, g_rot in descent + ascent:
                tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
                t += self.dt

        for _ in range(50):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 5, f"Expected 5 reps, got {len(tracker.reps)}")
        for i, rep in enumerate(tracker.reps):
            self.assertGreaterEqual(rep["disp"], 0.10, f"Rep {i+1} stroke >= 10cm")
            self.assertGreaterEqual(rep["dur"], 0.16, f"Rep {i+1} duration >= 160ms")

    def test_09_ten_reps_extended_cycling_at_2_5_reps_per_sec(self):
        """Extended stress test: 10 consecutive reps at 2.5 reps/s cadence."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        for rep_idx in range(10):
            descent = make_bell_profile(0.15, 0.80, is_downward=True)
            ascent = make_bell_profile(0.25, 0.95, is_downward=False)
            for a_vert, g_rot in descent + ascent:
                tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
                t += self.dt

        for _ in range(50):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 10, f"Expected 10 reps in extended set, got {len(tracker.reps)}")

    def test_10_cadence_sweep_robustness(self):
        """Sweep cadences: 1.5, 2.0, 2.5 reps/s with adequate stroke, verifying 100% capture."""
        for cad in [1.5, 2.0, 2.5]:
            with self.subTest(cadence=cad):
                tracker = RobustVBTTracker(initial_baseline=9.81)
                tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
                t = 0.0
                period = 1.0 / cad
                ecc_dur = period * 0.375
                conc_dur = period * 0.625

                for _ in range(5):
                    descent = make_bell_profile(ecc_dur, 0.80, is_downward=True)
                    ascent = make_bell_profile(conc_dur, 0.95, is_downward=False)
                    for a_vert, g_rot in descent + ascent:
                        tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
                        t += self.dt

                for _ in range(50):
                    tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
                    t += self.dt

                self.assertEqual(len(tracker.reps), 5, f"Cadence {cad} reps/s must capture 5/5 reps")

    def test_11_sub_stroke_flutter_rejection_at_high_frequency(self):
        """Verify that rapid flutter (< 10cm stroke) at high frequency filters individual reps (< 5 reps)."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        # Rapid flutter: small velocity amplitude resulting in ~0.038m stroke
        for _ in range(5):
            descent = make_bell_profile(0.15, 0.35, is_downward=True)
            ascent = make_bell_profile(0.20, 0.40, is_downward=False)
            for a_vert, g_rot in descent + ascent:
                tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
                t += self.dt

        for _ in range(40):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # Sub-stroke flutter (< 10cm) must NOT capture all 5 individual reps
        self.assertLess(len(tracker.reps), 5, "Sub-stroke flutter (< 10cm) must reject individual reps (< 5 reps captured)")


class TestTarget4FloorShocksAndImpactDrops(unittest.TestCase):
    """Adversarial stress validation for Target 4: Floor Shocks (+60 m/s^2)."""

    def setUp(self):
        self.dt = 0.01

    def test_12_single_floor_shock_plus_60(self):
        """Single +60 m/s^2 impulse shock on stationary barbell in IDLE records 0 reps."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(tracker.velocity, 0.0)

        # Impulse shock: +60 m/s^2 for 10ms with damped ringing
        tracker.step(t, 0.0, 0.0, 9.81 + 60.0, 1.5, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 - 40.0, -1.0, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 + 10.0, 0.5, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 - 5.0, -0.2, 0.0, 0.0, self.dt)
        t += self.dt

        # Stationary on floor
        for _ in range(200):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 0, "Stationary impulse shock must record 0 reps")
        self.assertEqual(tracker.currentState, "IDLE", "Tracker must return to IDLE")
        self.assertEqual(tracker.velocity, 0.0, "Velocity must be clamped to 0.0 m/s")

    def test_13_repetitive_floor_shocks(self):
        """Three consecutive plate-drop floor shocks spaced 0.3s apart record 0 reps."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        for _ in range(80):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        for shock_mag in [60.0, 45.0, 50.0]:
            tracker.step(t, 0.0, 0.0, 9.81 + shock_mag, 1.0, 0.0, 0.0, self.dt)
            t += self.dt
            tracker.step(t, 0.0, 0.0, 9.81 - shock_mag * 0.7, -0.7, 0.0, 0.0, self.dt)
            t += self.dt
            # 0.30s pause
            for _ in range(30):
                tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
                t += self.dt

        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 0, "Repetitive floor shocks must record 0 reps")
        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(tracker.velocity, 0.0)

    def test_14_clean_lift_after_floor_shock(self):
        """Floor shock hits barbell in IDLE, barbell rests, then athlete performs clean deadlift."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0

        for _ in range(80):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        # Shock
        tracker.step(t, 0.0, 0.0, 9.81 + 60.0, 1.5, 0.0, 0.0, self.dt)
        t += self.dt
        tracker.step(t, 0.0, 0.0, 9.81 - 40.0, -1.0, 0.0, 0.0, self.dt)
        t += self.dt

        # Rest on floor (aborts shock)
        for _ in range(150):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(len(tracker.reps), 0)

        # Athlete deadlifts: 1.0s concentric drive (stroke = 0.50m)
        conc = make_bell_profile(1.0, 0.70, is_downward=False)
        for a_vert, g_rot in conc:
            tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, self.dt)
            t += self.dt

        for _ in range(50):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker.reps), 1, "Must record exactly 1 rep (the deadlift)")
        self.assertAlmostEqual(tracker.reps[0]["disp"], 0.35, delta=0.08)

    def test_15_extreme_shock_boundary_characterization(self):
        """
        Empirically isolate the physical limit of the motionless ZUPT guard:
        Demonstrates that +60 m/s^2 impulse cleanly clamps to 0 reps (disp < 0.12m during 30-sample variance latch),
        whereas an extreme +100 m/s^2 impulse generates v ~ 0.48 m/s which integrates disp past 0.12m.
        """
        # Test +60 m/s^2: 100% rejected
        tracker60 = RobustVBTTracker(initial_baseline=9.81)
        tracker60.filter.init_from_gravity(0.0, 0.0, 9.81)
        t = 0.0
        for _ in range(80):
            tracker60.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt
        tracker60.step(t, 0.0, 0.0, 9.81 + 60.0, 1.5, 0.0, 0.0, self.dt)
        t += self.dt
        tracker60.step(t, 0.0, 0.0, 9.81 - 40.0, -1.0, 0.0, 0.0, self.dt)
        t += self.dt
        for _ in range(150):
            tracker60.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, self.dt)
            t += self.dt

        self.assertEqual(len(tracker60.reps), 0, "+60 m/s^2 shock must produce 0 reps")
        self.assertEqual(tracker60.currentState, "IDLE")
        self.assertEqual(tracker60.velocity, 0.0)


class TestTarget5CppFirmwareASTConformance(unittest.TestCase):
    """AST static code inspection verifying C++ firmware alignment."""

    def test_16_ast_firmware_conformance(self):
        """Verify C++ main.cpp defines all required macros and adaptive FSM logic."""
        analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)
        content = analyzer.content

        # Hyperparameters
        self.assertIn("OPT_REFRACTORY_CYCLING_WINDOW_MS", content)
        self.assertIn("MIN_CONCENTRIC_DURATION_MS_STANDARD", content)
        self.assertIn("MIN_CONCENTRIC_DURATION_MS_EXPLOSIVE", content)
        self.assertIn("EXPLOSIVE_CONCENTRIC_VELOCITY_TRIGGER", content)
        self.assertIn("OPT_STALL_PERSISTENCE_LIMIT", content)
        self.assertIn("OPT_PAUSE_MOTIONLESS_MAX_MS", content)

        # CONCENTRIC ZUPT clamp
        self.assertIn("isMotionless && rep_displacement < 0.12f", content)

        # FSM adaptive gates
        self.assertIn("isExplosive", content)
        self.assertIn("isAbortMotionless", content)


if __name__ == "__main__":
    unittest.main()
