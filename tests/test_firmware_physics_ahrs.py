"""
Unit and System Verification Test Suite for 100Hz Madgwick AHRS & ZUPT Physics Engine.
Tests all biomechanical scenarios: thermal drift, paused reps, deadlifts, aborted lifts,
touch-and-go cycling, concentric sticking points, and 3D orientation invariance.
"""

import math
import random
import unittest
from .sim_madgwick import RobustVBTTracker, OldVBTTracker, make_bell_profile

class TestFirmwarePhysicsAHRS(unittest.TestCase):

    def test_thermal_drift_adaptation(self):
        """Verify tracker tracks sensor warming up (+0.14 m/s2, +0.04 rad/s) without false reps or lockup."""
        tracker = RobustVBTTracker(initial_baseline=9.78, initial_gyro_bias=[0.14, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.78)

        dt = 0.01
        for i in range(6000): # 60 seconds of resting on rack
            t = i * dt
            accel_drift = 0.14 * (i / 6000.0)
            gyro_drift = 0.04 * (i / 6000.0)
            an = random.gauss(0, 0.01)
            gn = random.gauss(0, 0.005)
            ax, ay, az = 0.0, 0.0, 9.78 + accel_drift + an
            gx, gy, gz = 0.14 + gyro_drift + gn, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        # Baseline should have smoothly tracked up to ~9.91
        self.assertAlmostEqual(tracker.gravity_baseline, 9.91, delta=0.03)
        self.assertEqual(tracker.currentState, "IDLE")
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.01)
        self.assertEqual(len(tracker.reps), 0, "No false reps should be generated during idle drift")

    def test_large_boot_offset_and_gyro_bias_adaptation(self):
        """Verify tracker overcomes large initial baseline offset (0.57 m/s2) and factory gyro bias (0.25 rad/s)."""
        tracker = RobustVBTTracker(initial_baseline=9.78, initial_gyro_bias=[0.0, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 10.35)

        dt = 0.01
        for i in range(1500): # 15 seconds resting
            t = i * dt
            an = random.gauss(0, 0.01)
            gn = random.gauss(0, 0.005)
            ax, ay, az = 0.0, 0.0, 10.35 + an
            gx, gy, gz = 0.25 + gn, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        self.assertTrue(tracker.is_stationary, "Tracker must detect rest even with large offset")
        self.assertAlmostEqual(tracker.gravity_baseline, 10.35, delta=0.05)
        self.assertAlmostEqual(tracker.gyro_bias[0], 0.25, delta=0.03)
        self.assertEqual(tracker.currentState, "IDLE")
        self.assertEqual(len(tracker.reps), 0)

    def test_squat_rep_detection(self):
        """Verify dynamic squat repetition after drift is detected with accurate metrics."""
        tracker = RobustVBTTracker(initial_baseline=9.92, initial_gyro_bias=[0.18, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.92)

        dt = 0.01
        squat_samples = ([(0.0, 0.0)] * 100 +
                         make_bell_profile(1.2, 0.60, is_downward=True) +
                         make_bell_profile(1.0, 0.65, is_downward=False) +
                         [(0.0, 0.0)] * 200)

        for i, (a_vert, g_rot) in enumerate(squat_samples):
            t = i * dt
            an = random.gauss(0, 0.01)
            gn = random.gauss(0, 0.005)
            ax, ay, az = 0.0, 0.0, 9.92 + a_vert + an
            gx, gy, gz = 0.18 + g_rot + gn, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        self.assertEqual(len(tracker.reps), 1, "Exactly one squat rep should be detected")
        rep = tracker.reps[0]
        self.assertTrue(0.20 <= rep["mcv"] <= 0.60, f"MCV {rep['mcv']} out of realistic bounds")
        self.assertTrue(rep["disp"] >= 0.25, f"Displacement {rep['disp']} too small")

    def test_paused_bench_press(self):
        """Verify 2-second paused bench press records exactly 1 rep without premature bottom abort."""
        tracker = RobustVBTTracker(initial_baseline=9.92, initial_gyro_bias=[0.18, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.92)

        dt = 0.01
        # 0.5s top hold, 1.4s descent (-0.50 m/s), 2.0s chest pause (v=0), 1.2s ascent (+0.55 m/s), 1.5s lockout
        bench_samples = ([(0.0, 0.0)] * 50 +
                         make_bell_profile(1.4, 0.50, is_downward=True) +
                         [(0.0, 0.0)] * 200 +
                         make_bell_profile(1.2, 0.55, is_downward=False) +
                         [(0.0, 0.0)] * 150)

        states_during_pause = []
        pause_start_idx = 50 + 140
        pause_end_idx = pause_start_idx + 200

        for i, (a_vert, g_rot) in enumerate(bench_samples):
            t = i * dt
            an = random.gauss(0, 0.01)
            gn = random.gauss(0, 0.005)
            ax, ay, az = 0.0, 0.0, 9.92 + a_vert + an
            gx, gy, gz = 0.18 + g_rot + gn, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)
            if pause_start_idx <= i <= pause_end_idx:
                states_during_pause.append(tracker.currentState)

        self.assertEqual(len(tracker.reps), 1, f"Expected 1 rep for paused bench, got {len(tracker.reps)}")
        rep = tracker.reps[0]
        self.assertTrue(0.20 <= rep["mcv"] <= 0.50)
        self.assertTrue(rep["disp"] >= 0.25, f"Displacement {rep['disp']} should cover full ascent")
        # Verify it remained in ECCENTRIC during the bottom pause
        self.assertIn("ECCENTRIC", states_during_pause)
        self.assertNotIn("CONCENTRIC", states_during_pause)

    def test_concentric_sticking_point_no_premature_cutoff(self):
        """Verify grinding through a sticking point (v dips to 0.035 m/s) does not truncate concentric phase."""
        tracker = RobustVBTTracker(initial_baseline=9.81, initial_gyro_bias=[0.0, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.81)

        dt = 0.01
        # 1.0s descent (-0.45 m/s)
        descent = make_bell_profile(1.0, 0.45, is_downward=True)
        # Concentric: Drive off chest, dip at sticking point, break through to lockout
        # We construct custom acceleration samples for concentric grind:
        concentric_samples = []
        # Phase A: Initial drive off chest (0.4s, v reaches 0.25 m/s)
        for j in range(40):
            concentric_samples.append((0.625, 0.02))
        # Phase B: Sticking point deceleration (0.4s, v drops from 0.25 to 0.035 m/s)
        for j in range(40):
            concentric_samples.append((-0.5375, 0.05)) # a < 0, v dips to 0.035
        # Phase C: Push through sticking point (0.6s, v accelerates from 0.035 to 0.30 m/s)
        for j in range(60):
            concentric_samples.append((0.441, 0.03))
        # Phase D: Decelerate into lockout (0.4s, v drops to 0.0 m/s)
        for j in range(40):
            concentric_samples.append((-0.75, 0.01))

        samples = [(0.0, 0.0)] * 50 + descent + [(0.0, 0.0)] * 30 + concentric_samples + [(0.0, 0.0)] * 100

        for i, (a_vert, g_rot) in enumerate(samples):
            t = i * dt
            ax, ay, az = 0.0, 0.0, 9.81 + a_vert
            gx, gy, gz = g_rot, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        self.assertEqual(len(tracker.reps), 1, "Rep should not be prematurely cut off into multiple reps")
        rep = tracker.reps[0]
        self.assertTrue(rep["disp"] >= 0.25, f"Displacement {rep['disp']} should reflect full concentric stroke")

    def test_rapid_touch_and_go_cycling(self):
        """Verify rapid barbell cycling (no pause at lockout) detects both reps accurately without blinding."""
        tracker = RobustVBTTracker(initial_baseline=9.81, initial_gyro_bias=[0.0, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.81)

        dt = 0.01
        r1 = make_bell_profile(0.8, 0.60, is_downward=True) + make_bell_profile(0.7, 0.65, is_downward=False)
        r2 = make_bell_profile(0.8, 0.60, is_downward=True) + make_bell_profile(0.7, 0.65, is_downward=False)
        samples = [(0.0, 0.0)] * 50 + r1 + r2 + [(0.0, 0.0)] * 100

        for i, (a_vert, g_rot) in enumerate(samples):
            t = i * dt
            ax, ay, az = 0.0, 0.0, 9.81 + a_vert
            gx, gy, gz = g_rot, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        self.assertEqual(len(tracker.reps), 2, "Both touch-and-go reps must be detected")
        rep1, rep2 = tracker.reps[0], tracker.reps[1]
        self.assertAlmostEqual(rep1["disp"], 0.25, delta=0.06)
        self.assertAlmostEqual(rep2["disp"], 0.30, delta=0.08)
        self.assertTrue(rep2["disp"] < 0.45, "Rep 2 displacement must not be blown up to 0.78m")

    def test_arbitrary_mounting_orientation_invariance(self):
        """Verify tracker accurately detects reps whether mounted Z-up, X-up, Y-up, or 45-degree tilted."""
        orientations = [
            ("Z-Up", (0.0, 0.0, 9.81)),
            ("X-Up", (9.81, 0.0, 0.0)),
            ("Y-Up", (0.0, 9.81, 0.0)),
            ("45-Tilt", (6.936, 0.0, 6.936))
        ]

        dt = 0.01
        squat = make_bell_profile(1.2, 0.60, is_downward=True) + make_bell_profile(1.0, 0.65, is_downward=False)

        for name, (gx0, gy0, gz0) in orientations:
            tracker = RobustVBTTracker(initial_baseline=9.81, initial_gyro_bias=[0.0, 0.0, 0.0])
            tracker.filter.init_from_gravity(gx0, gy0, gz0)

            # Unit gravity direction vector
            g_norm = math.sqrt(gx0*gx0 + gy0*gy0 + gz0*gz0)
            ugx, ugy, ugz = gx0/g_norm, gy0/g_norm, gz0/g_norm

            samples = [(0.0, 0.0)] * 50 + squat + [(0.0, 0.0)] * 100
            for i, (a_vert, g_rot) in enumerate(samples):
                t = i * dt
                ax = gx0 + a_vert * ugx
                ay = gy0 + a_vert * ugy
                az = gz0 + a_vert * ugz
                # Rotational jitter along transverse axis
                gx_r = g_rot if name != "X-Up" else 0.0
                gy_r = g_rot if name == "X-Up" else 0.0
                tracker.step(t, ax, ay, az, gx_r, gy_r, 0.0, dt)

            self.assertEqual(len(tracker.reps), 1, f"Orientation {name} failed to detect exactly 1 rep")
            rep = tracker.reps[0]
            self.assertTrue(0.20 <= rep["mcv"] <= 0.55, f"Orientation {name} MCV {rep['mcv']} out of range")
            self.assertTrue(rep["disp"] >= 0.25, f"Orientation {name} Disp {rep['disp']} too small")

    def test_aborted_rep_on_safety_pins(self):
        """Verify failing a rep onto safety pins recovers to IDLE without lockup after 3.5s motionless."""
        tracker = RobustVBTTracker(initial_baseline=9.92, initial_gyro_bias=[0.18, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.92)

        dt = 0.01
        abort_samples = [(0.0, 0.0)] * 50 + make_bell_profile(1.2, 0.50, is_downward=True) + [(0.0, 0.0)] * 400

        for i, (a_vert, g_rot) in enumerate(abort_samples):
            t = i * dt
            ax, ay, az = 0.0, 0.0, 9.92 + a_vert
            gx, gy, gz = 0.18 + g_rot, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        self.assertEqual(tracker.currentState, "IDLE", "Tracker must abort cleanly to IDLE")
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.01)
        self.assertEqual(len(tracker.reps), 0, "Aborted rep should not count as completed rep")

    def test_deadlift_concentric_pull(self):
        """Verify deadlift starting concentric from floor is accurately detected."""
        tracker = RobustVBTTracker(initial_baseline=9.92, initial_gyro_bias=[0.18, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.92)

        dt = 0.01
        deadlift_samples = [(0.0, 0.0)] * 100 + make_bell_profile(1.2, 0.60, is_downward=False) + [(0.0, 0.0)] * 200

        for i, (a_vert, g_rot) in enumerate(deadlift_samples):
            t = i * dt
            an = random.gauss(0, 0.01)
            gn = random.gauss(0, 0.005)
            ax, ay, az = 0.0, 0.0, 9.92 + a_vert + an
            gx, gy, gz = 0.18 + g_rot + gn, 0.0, 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        self.assertEqual(len(tracker.reps), 1, "Deadlift rep should be detected")
        rep = tracker.reps[0]
        self.assertTrue(0.20 <= rep["mcv"] <= 0.50)

    def test_lateral_vibration_rejection(self):
        """Verify high-frequency lateral bar shaking does not cause positive velocity runaway."""
        tracker = RobustVBTTracker(initial_baseline=9.92, initial_gyro_bias=[0.18, 0.0, 0.0])
        tracker.filter.init_from_gravity(0, 0, 9.92)

        dt = 0.01
        for i in range(500): # 5 seconds of shaking
            t = i * dt
            wobble_x = 1.2 * math.sin(50.0 * t)
            wobble_y = 1.2 * math.cos(50.0 * t)
            ax = wobble_x; ay = wobble_y; az = 9.92
            gx = 0.18; gy = 0.0; gz = 0.0
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

        self.assertEqual(tracker.currentState, "IDLE")
        self.assertAlmostEqual(tracker.velocity, 0.0, delta=0.01)
        self.assertEqual(len(tracker.reps), 0)

if __name__ == '__main__':
    unittest.main()
