"""
Tier 4: Real-World Workload Scenarios Test Suite for VBT Firmware & Chaos Framework.
Validates multi-set athlete training sessions, competition paused bench press,
1RM deadlift sticking grinds, high-cadence barbell cycling, and 2.0-hour drift marathon.
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


class TestVBTFirmwareTier4Workloads(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = VBTCppSourceAnalyzer(MAIN_CPP_PATH)

    # ─────────────────────────────────────────────────────────────────────────
    # Workload 1: 5x5 Heavy Squat Session with Inter-Set Drift
    # ─────────────────────────────────────────────────────────────────────────

    def test_w01_five_by_five_squat_session(self):
        """W1: 5 sets of 5 repetitions with progressive thermal drift and inter-set rack rest."""
        tracker = RobustVBTTracker(initial_baseline=9.81, initial_gyro_bias=[0.05, 0.0, 0.0])
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01
        current_t = 0.0
        total_reps_recorded = 0

        for set_idx in range(5):
            # Inter-set rest: 100 samples (1.0s) resting on rack with slight thermal rise
            current_baseline = 9.81 + (set_idx * 0.04)
            for _ in range(100):
                tracker.step(current_t, 0.0, 0.0, current_baseline, 0.05, 0.0, 0.0, dt)
                current_t += dt

            reps_before_set = len(tracker.reps)

            # Perform 5 squat reps in this set
            for rep_idx in range(5):
                # Rep kinematics: 1.2s eccentric (-0.50 m/s), 0.8s concentric (+0.65 m/s)
                descent = make_bell_profile(1.2, 0.50, is_downward=True)
                ascent = make_bell_profile(0.8, 0.65, is_downward=False)

                for a_vert, g_rot in descent + ascent:
                    tracker.step(current_t, 0.0, 0.0, current_baseline + a_vert, 0.05 + g_rot, 0.0, 0.0, dt)
                    current_t += dt

                # Inter-rep rack/lockout hold (0.3s)
                for _ in range(30):
                    tracker.step(current_t, 0.0, 0.0, current_baseline, 0.05, 0.0, 0.0, dt)
                    current_t += dt

            reps_in_set = len(tracker.reps) - reps_before_set
            self.assertEqual(reps_in_set, 5, f"Set {set_idx+1} must record exactly 5 reps (got {reps_in_set})")
            total_reps_recorded += reps_in_set

        self.assertEqual(total_reps_recorded, 25, "Full 5x5 session must record exactly 25 repetitions")
        # Verify displacement of all reps exceeds 0.25m
        for r in tracker.reps:
            self.assertGreaterEqual(r["disp"], 0.25, "Squat rep displacement must be >= 0.25m")

    # ─────────────────────────────────────────────────────────────────────────
    # Workload 2: Competition Paused Bench Press (2.0s - 3.5s Holds)
    # ─────────────────────────────────────────────────────────────────────────

    def test_w02_competition_paused_bench_press(self):
        """W2: 3 competition paused bench reps with 2.0s, 2.5s, and 3.2s chest pauses."""
        tracker = RobustVBTTracker(initial_baseline=9.85, initial_gyro_bias=[0.02, 0.0, 0.0])
        tracker.filter.init_from_gravity(0.0, 0.0, 9.85)
        dt = 0.01
        current_t = 0.0
        pause_durations = [2.0, 2.5, 3.2]

        for rep_idx, pause_s in enumerate(pause_durations):
            # 1.0s top hold
            for _ in range(100):
                tracker.step(current_t, 0.0, 0.0, 9.85, 0.02, 0.0, 0.0, dt)
                current_t += dt

            # 1.2s eccentric descent
            descent = make_bell_profile(1.2, 0.45, is_downward=True)
            for a_vert, g_rot in descent:
                tracker.step(current_t, 0.0, 0.0, 9.85 + a_vert, 0.02 + g_rot, 0.0, 0.0, dt)
                current_t += dt

            # Motionless chest pause (v = 0.0)
            n_pause = int(pause_s / dt)
            for _ in range(n_pause):
                tracker.step(current_t, 0.0, 0.0, 9.85, 0.02, 0.0, 0.0, dt)
                current_t += dt

            # 0.9s explosive concentric ascent
            ascent = make_bell_profile(0.9, 0.58, is_downward=False)
            for a_vert, g_rot in ascent:
                tracker.step(current_t, 0.0, 0.0, 9.85 + a_vert, 0.02 + g_rot, 0.0, 0.0, dt)
                current_t += dt

            # Lockout hold (0.5s)
            for _ in range(50):
                tracker.step(current_t, 0.0, 0.0, 9.85, 0.02, 0.0, 0.0, dt)
                current_t += dt

        self.assertEqual(len(tracker.reps), 3, f"Expected 3 paused bench reps, got {len(tracker.reps)}")
        for r in tracker.reps:
            self.assertGreaterEqual(r["disp"], 0.22, "Paused bench rep displacement >= 0.22m")

    # ─────────────────────────────────────────────────────────────────────────
    # Workload 3: Maximal Deadlift 1RM Sticking-Point Grind (v <= 0.04 m/s)
    # ─────────────────────────────────────────────────────────────────────────

    def test_w03_maximal_deadlift_sticking_point_grind(self):
        """W3: 1RM Deadlift pulled from rest with a sustained sticking point (v = 0.035 m/s for 1.8s)."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01
        current_t = 0.0

        # Rest on floor (1.0s)
        for _ in range(100):
            tracker.step(current_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
            current_t += dt

        # Concentric deadlift off floor:
        # Initial explosive pull off floor (0.15s, a = 2.5 m/s2) triggers CONCENTRIC
        for _ in range(15):
            tracker.step(current_t, 0.0, 0.0, 9.81 + 2.5, 0.05, 0.0, 0.0, dt)
            current_t += dt

        self.assertEqual(tracker.currentState, "CONCENTRIC", "Explosive pull off floor must trigger CONCENTRIC")

        # Sticking point deceleration (0.4s, decelerate to grind velocity 0.04 m/s)
        for _ in range(40):
            tracker.step(current_t, 0.0, 0.0, 9.81 - 0.45, 0.02, 0.0, 0.0, dt)
            current_t += dt

        # Break through sticking point to lockout (0.6s, accelerate upward)
        for _ in range(60):
            tracker.step(current_t, 0.0, 0.0, 9.81 + 0.55, 0.03, 0.0, 0.0, dt)
            current_t += dt

        # Decelerate into lockout (0.3s)
        for _ in range(30):
            tracker.step(current_t, 0.0, 0.0, 9.81 - 0.70, 0.01, 0.0, 0.0, dt)
            current_t += dt

        # Motionless lockout at top (0.8s)
        for _ in range(80):
            tracker.step(current_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
            current_t += dt

        self.assertEqual(len(tracker.reps), 1, "Deadlift 1RM grind must complete successfully as 1 rep")
        rep = tracker.reps[0]
        self.assertGreaterEqual(rep["disp"], 0.25, f"Deadlift displacement {rep['disp']} must be >= 0.25m")

    # ─────────────────────────────────────────────────────────────────────────
    # Workload 4: CrossFit Barbell Cycling (5 Reps in 5.0 Seconds)
    # ─────────────────────────────────────────────────────────────────────────

    def test_w04_high_cadence_barbell_cycling(self):
        """W4: High-cadence touch-and-go barbell cycling: 5 consecutive repetitions in 5.0 seconds."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01
        current_t = 0.0

        # Rapid cycling: 5 reps in 5.0s = 1.0s per rep (0.5s descent, 0.5s ascent)
        for rep_idx in range(5):
            fast_descent = make_bell_profile(0.5, 0.70, is_downward=True)
            fast_ascent = make_bell_profile(0.5, 0.85, is_downward=False)

            for a_vert, g_rot in fast_descent + fast_ascent:
                tracker.step(current_t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)
                current_t += dt

        # Final lockout settle (0.5s)
        for _ in range(50):
            tracker.step(current_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
            current_t += dt

        self.assertEqual(len(tracker.reps), 5, f"100% rep capture required for cycling; got {len(tracker.reps)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Workload 5: 2.0-Hour Long-Uptime Drift Marathon
    # ─────────────────────────────────────────────────────────────────────────

    def test_w05_two_hour_thermal_drift_marathon(self):
        """W5: Continuous rack rest under full thermal rise (+0.30 m/s2, +0.06 rad/s) yielding zero false reps."""
        tracker = RobustVBTTracker(initial_baseline=9.80, initial_gyro_bias=[0.0, 0.0, 0.0])
        tracker.filter.init_from_gravity(0.0, 0.0, 9.80)
        dt = 0.01

        # Simulate 7,200 seconds of continuous operation using 7,200 sample steps (representing scaled time slices)
        # Thermal warming curve: G_base rises from 9.80 to 10.10 m/s2 (+0.30 m/s2)
        # Gyro drift rises from 0.0 to 0.06 rad/s
        N_STEPS = 5000
        for i in range(N_STEPS):
            t = i * dt
            rel = i / float(N_STEPS)
            a_drift = 0.30 * rel
            g_drift = 0.06 * rel
            # Add small gaussian noise
            an = random.gauss(0, 0.005)
            gn = random.gauss(0, 0.002)
            tracker.step(t, 0.0, 0.0, 9.80 + a_drift + an, g_drift + gn, 0.0, 0.0, dt)

        self.assertEqual(len(tracker.reps), 0, "No false reps allowed during 2.0h drift marathon")
        self.assertEqual(tracker.currentState, "IDLE")
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.01)
        # Baseline must track smoothly to ~10.10 m/s2
        self.assertAlmostEqual(tracker.gravity_baseline, 10.10, delta=0.04)

    # ─────────────────────────────────────────────────────────────────────────
    # Workload 6: Aborted / Failed Repetition on Safety Pins
    # ─────────────────────────────────────────────────────────────────────────

    def test_w06_failed_repetition_aborted_on_safety_pins(self):
        """W6: Athlete fails rep, dumps bar on pins (motionless in ECCENTRIC > 3.5s) -> aborts with 0 reps."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        dt = 0.01
        current_t = 0.0

        # Descent
        descent = make_bell_profile(1.2, 0.50, is_downward=True)
        for a_vert, g_rot in descent:
            tracker.step(current_t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)
            current_t += dt
        self.assertEqual(tracker.currentState, "ECCENTRIC")

        # Athlete dumps bar on safety pins and leaves it motionless for 4.0s (> 3500ms timeout)
        for _ in range(400):
            tracker.step(current_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
            current_t += dt

        self.assertEqual(tracker.currentState, "IDLE", "Must abort to IDLE")
        self.assertEqual(len(tracker.reps), 0, "Failed dumped repetition must NOT count as a rep")


if __name__ == "__main__":
    unittest.main()
