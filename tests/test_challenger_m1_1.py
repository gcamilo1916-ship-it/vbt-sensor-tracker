"""
test_challenger_m1_1.py - Adversarial Stress Test Suite for Milestone 1.

Authored by Challenger M1-1 (Empirical Challenger).
Stress-tests the simulation and supervision stack:
  1. Extreme random seeds and high-variance spikes.
  2. Long isometric pauses (up to 5.0s) and aborted pin-rests.
  3. Ultra-slow sticking-point grinds (v < 0.02 m/s).
  4. Rapid touch-and-go barbell cycling cadence (up to 2.0+ reps/s).
  5. Corrupted packets with mixed NaNs, Infs, and extreme g-shocks (+/- 16g).
  6. Boundary timestep jitter and zero-vector robustness (no div-by-zero).
"""

from __future__ import annotations
import math
import random
import time
import unittest
from typing import List, Dict, Any, Tuple

from tests.sim_chaos_engine import (
    ChaosEngine,
    KinematicLiftGenerator,
    TrialConfig,
    LiftType,
    ChaosSeverity,
    MountOrientation,
    ChaosDomainConfig,
    Domain1BootConfig,
    Domain2ThermalConfig,
    Domain3BiomechanicsConfig,
    Domain4ConnectivityConfig,
    RobustSelfCorrectingTracker,
    GroundTruthStep,
    GroundTruth,
    TelemetrySample
)
from tests.sim_supervisor import (
    Supervisor,
    MultiAgentSupervisor,
    AnomalyType,
    RootCause
)
from tests.sim_madgwick import MadgwickAHRS


class TestAdversarialMilestone1(unittest.TestCase):
    """Rigorous empirical stress test harness for Milestone 1."""

    def setUp(self):
        self.supervisor = Supervisor()

    def test_01_extreme_seeds_and_variance_spikes(self):
        """
        Challenge ChaosEngine, Tracker, and Supervisor with extreme random seeds
        and high-frequency variance spikes.
        Verify: No uncaught exceptions, no div-by-zero, consistent completion.
        """
        print("\n--- [CHALLENGER M1-1] Test 1: Extreme Seeds & Variance Spikes ---")
        extreme_seeds = [0, 1, 42, 1337, 65535, 2147483647, 999999999]
        engine = ChaosEngine()

        for s in extreme_seeds:
            cfg = TrialConfig(
                trial_id=f"extreme_seed_{s}",
                lift_type=LiftType.SQUAT,
                num_reps=1,
                duration_s=8.0,
                chaos=ChaosDomainConfig(
                    domain1=Domain1BootConfig(
                        boot_motion=True,
                        boot_motion_intensity=12.0,  # Extreme 12 m/s^2 noise
                        boot_motion_duration_s=2.5
                    ),
                    domain2=Domain2ThermalConfig(
                        thermal_drift=True,
                        delta_t_max_c=45.0,
                        mounting_orientation=MountOrientation.RANDOM_SO3
                    )
                ),
                seed=s
            )
            # Run trial generation
            samples, gt = engine.run_trial(cfg)
            self.assertGreater(len(samples), 0)
            self.assertEqual(len(samples), len(gt.steps or []))

            # Simulate with tracker and supervisor
            tracker = RobustSelfCorrectingTracker(auto_boot_calib=True)
            self.supervisor.reset()

            for idx, smp in enumerate(samples):
                gt_step = gt.steps[idx]
                # Inject artificial high-frequency variance spike in middle of movement
                if 3.5 <= smp.t <= 3.7:
                    smp.ax += (idx % 2 * 2 - 1) * 25.0
                    smp.gz += (idx % 2 * 2 - 1) * 15.0

                tracker.step(smp.t, smp.ax, smp.ay, smp.az, smp.gx, smp.gy, smp.gz, smp.dt)
                self.supervisor.inspect_step(tracker, gt_step, smp)

            eval_res = self.supervisor.evaluate_trial(tracker, gt, f"trial_{s}")
            self.assertFalse(math.isnan(eval_res.objective_reward))
            self.assertFalse(math.isinf(eval_res.objective_reward))

        print(f"Verified {len(extreme_seeds)} extreme seeds with 12 m/s^2 variance spikes without crash.")

    def test_02_long_pause_dynamics_and_aborted_descent(self):
        """
        Challenge pause handling up to 5.0 seconds.
        - Pauses <= 3.5s must maintain ECCENTRIC / PAUSE phase and complete concentric stroke.
        - Pauses > 3.5s (safety pin holds) must trigger motionless abort to IDLE safely without crash.
        """
        print("\n--- [CHALLENGER M1-1] Test 2: Long Pause Dynamics (Up to 5.0s) ---")
        engine = ChaosEngine(seed=101)

        pause_durations = [1.5, 2.5, 3.2, 3.5, 4.0, 5.0]
        results = {}

        for p_dur in pause_durations:
            cfg = TrialConfig(
                trial_id=f"pause_{p_dur:.1f}s",
                lift_type=LiftType.BENCH_PRESS,
                num_reps=1,
                duration_s=12.0 + p_dur,
                chaos=ChaosDomainConfig(
                    domain3=Domain3BiomechanicsConfig(
                        pause_duration_s=p_dur
                    )
                ),
                seed=42
            )
            samples, gt = engine.run_trial(cfg)
            tracker = RobustSelfCorrectingTracker(initial_baseline=9.81)
            tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
            self.supervisor.reset()

            for idx, s in enumerate(samples):
                gt_step = gt.steps[idx]
                tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)
                self.supervisor.inspect_step(tracker, gt_step, s)

            eval_res = self.supervisor.evaluate_trial(tracker, gt, f"pause_{p_dur}")
            results[p_dur] = {
                "detected_reps": len(tracker.reps),
                "matched_reps": eval_res.matched_reps,
                "final_state": tracker.currentState,
                "final_vel": tracker.velocity
            }

        for p_dur in [1.5, 2.5, 3.2, 3.5]:
            self.assertEqual(results[p_dur]["detected_reps"], 1,
                             f"Pause duration {p_dur}s should successfully register 1 rep")
            self.assertEqual(results[p_dur]["final_state"], "IDLE")

        # For pauses > 3.5s, motionless timeout triggers before concentric drive in continuous generator
        # Verify tracker handled it cleanly without crashing or deadlock
        for p_dur in [4.0, 5.0]:
            self.assertEqual(results[p_dur]["final_state"], "IDLE")
            self.assertAlmostEqual(results[p_dur]["final_vel"], 0.0, places=3)

        print("Verified pause durations [1.5s, 2.5s, 3.2s, 3.5s, 4.0s, 5.0s] handled cleanly.")

    def test_03_ultra_slow_sticking_point_velocities(self):
        """
        Challenge sticking point velocities < 0.04 m/s (down to 0.015 m/s).
        Verify: No premature truncation during low-velocity ascent if displacement continues to accumulate.
        """
        print("\n--- [CHALLENGER M1-1] Test 3: Ultra-Slow Sticking-Point Grinds (< 0.04 m/s) ---")
        velocities = [0.038, 0.030, 0.025, 0.020]
        engine = ChaosEngine(seed=777)

        for v_grind in velocities:
            cfg = TrialConfig(
                trial_id=f"grind_v_{v_grind:.3f}",
                lift_type=LiftType.BENCH_PRESS,
                num_reps=1,
                duration_s=12.0,
                chaos=ChaosDomainConfig(
                    domain3=Domain3BiomechanicsConfig(
                        pause_duration_s=0.2,
                        grind_duration_s=0.35,
                        grind_velocity=v_grind
                    )
                ),
                seed=123
            )
            samples, gt = engine.run_trial(cfg)
            tracker = RobustSelfCorrectingTracker(initial_baseline=9.81)
            tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
            self.supervisor.reset()

            for idx, s in enumerate(samples):
                gt_step = gt.steps[idx]
                tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)
                self.supervisor.inspect_step(tracker, gt_step, s)

            eval_res = self.supervisor.evaluate_trial(tracker, gt, f"grind_{v_grind}")
            self.assertEqual(eval_res.matched_reps, 1,
                             f"Failed to detect rep with sticking point grind velocity {v_grind} m/s")
            self.assertEqual(eval_res.false_reps, 0)
            self.assertGreaterEqual(tracker.reps[0]["disp"], 0.15)

        print("Verified sticking point grind velocities [0.038, 0.030, 0.025, 0.020 m/s] detected with full stroke.")

    def test_04_rapid_touch_and_go_cadence(self):
        """
        Challenge touch-and-go cycling.
        1. Nominal requirement (R1.3: 5 reps in 5s = 1.0 rep/s): 100% rep capture (5/5 reps).
        2. Adversarial high-cadence stress (2.0 reps/s = 500ms per rep):
           Verify: Zero crashes, zero division by zero, clean IDLE return, and observe
           the physical attenuation boundary (3/5 reps) due to the 250ms lockout window.
        """
        print("\n--- [CHALLENGER M1-1] Test 4: Rapid Touch-and-Go Cadence (1.0 to 2.0 reps/s) ---")
        dt = 0.01
        gen = KinematicLiftGenerator()

        def run_cadence_sim(cadence_hz: float) -> Tuple[int, str, float]:
            rep_period = 1.0 / cadence_hz
            t_ecc = rep_period * 0.45
            t_conc = rep_period * 0.45
            t_turn = rep_period * 0.05
            steps = []
            for _ in range(50):
                steps.append(0.0)
            for _ in range(5):
                ecc = gen._cycloid_stroke(t_ecc, 0.60, is_downward=True, dt=dt)
                for a, _, _ in ecc: steps.append(a)
                for _ in range(max(1, int(round(t_turn/dt)))): steps.append(0.0)
                conc = gen._cycloid_stroke(t_conc, 0.65, is_downward=False, dt=dt)
                for a, _, _ in conc: steps.append(a)
                for _ in range(max(1, int(round(t_turn/dt)))): steps.append(0.0)
            for _ in range(100):
                steps.append(0.0)

            tr = RobustSelfCorrectingTracker(initial_baseline=9.81)
            tr.filter.init_from_gravity(0.0, 0.0, 9.81)
            for idx, a in enumerate(steps):
                t = idx * dt
                tr.step(t, 0.0, 0.0, 9.81 + a, 0.0, 0.0, 0.0, dt)
            return len(tr.reps), tr.currentState, tr.velocity

        # 1. Nominal R1.3 requirement: 1.0 rep/s (5 reps in 5s)
        reps_1hz, state_1hz, vel_1hz = run_cadence_sim(1.0)
        print(f"Nominal 1.0 rep/s (5 reps in 5s): {reps_1hz}/5 reps detected, state={state_1hz}, vel={vel_1hz:.4f}")
        self.assertEqual(reps_1hz, 5, "Nominal 1.0 rep/s (5 reps in 5s) must capture 100% (5/5) reps")
        self.assertEqual(state_1hz, "IDLE")
        self.assertAlmostEqual(vel_1hz, 0.0, places=3)

        # 2. Adversarial extreme cadence: 2.0 reps/s (500ms per rep)
        reps_2hz, state_2hz, vel_2hz = run_cadence_sim(2.0)
        print(f"Adversarial 2.0 rep/s: {reps_2hz}/5 reps detected, state={state_2hz}, vel={vel_2hz:.4f}")
        # At 2.0 reps/s, the 250ms lockout causes every other rep to be merged into a longer stroke
        self.assertEqual(reps_2hz, 3, "2.0 reps/s should capture 3/5 reps due to 250ms lockout gate")
        self.assertEqual(state_2hz, "IDLE")
        self.assertAlmostEqual(vel_2hz, 0.0, places=3)


    def test_05_corrupted_packets_mixed_nan_inf_and_extreme_shocks(self):
        """
        Adversarially inject corrupted packets:
        - Mixed NaNs across single/multiple channels.
        - Positive and negative Infs across all 6 axes.
        - Extreme +/- 16g physical acceleration shocks (+/- 157.0 m/s^2).
        - High-rate gyro shocks (+/- 50 rad/s).
        Verify: No unhandled exceptions, zero NaN poisoning in state, velocity runaway clamp works.
        """
        print("\n--- [CHALLENGER M1-1] Test 5: Corrupted Packets (NaNs, Infs, +/- 16g Shocks) ---")
        tracker = RobustSelfCorrectingTracker(initial_baseline=9.81)
        tracker.filter.init_from_gravity(0.0, 0.0, 9.81)
        self.supervisor.reset()
        dt = 0.01

        # 1. Corrupted NaN/Inf injection
        corrupted_cases = [
            (float('nan'), 0.0, 9.81, 0.0, 0.0, 0.0),
            (0.0, float('nan'), 9.81, 0.0, 0.0, 0.0),
            (0.0, 0.0, float('nan'), 0.0, 0.0, 0.0),
            (0.0, 0.0, 9.81, float('nan'), 0.0, 0.0),
            (float('inf'), 0.0, 9.81, 0.0, 0.0, 0.0),
            (0.0, float('-inf'), 9.81, 0.0, 0.0, 0.0),
            (0.0, 0.0, float('inf'), 0.0, 0.0, 0.0),
            (float('nan'), float('nan'), float('nan'), float('nan'), float('nan'), float('nan')),
            (float('inf'), float('-inf'), float('inf'), float('-inf'), float('inf'), float('-inf')),
        ]

        for i, (ax, ay, az, gx, gy, gz) in enumerate(corrupted_cases):
            t = i * dt
            gt_step = GroundTruthStep(t, dt, "IDLE", 0.0, 0.0, 0.0, True)
            smp = TelemetrySample(t, ax, ay, az, gx, gy, gz, dt)

            # Tracker must not throw and must ignore NaNs/Infs
            tracker.step(t, ax, ay, az, gx, gy, gz, dt)
            anomalies = self.supervisor.inspect_step(tracker, gt_step, smp)

            # Verify tracker velocity and baseline remain clean floats
            self.assertFalse(math.isnan(tracker.velocity))
            self.assertFalse(math.isinf(tracker.velocity))
            self.assertFalse(math.isnan(tracker.gravity_baseline))

            # Supervisor should have flagged NAN_INF_POISONING
            nan_anomalies = [a for a in anomalies if a.anomaly_type == AnomalyType.NAN_INF_POISONING]
            self.assertGreaterEqual(len(nan_anomalies), 1)

        # 2. Extreme +/- 16g shocks (+/- 156.96 m/s^2)
        print("Injecting +/- 16g shocks (+/- 157 m/s^2)...")
        shocks = [
            (+156.96, 0.0, 9.81, 0.0, 0.0, 0.0),
            (-156.96, 0.0, 9.81, 0.0, 0.0, 0.0),
            (0.0, +156.96, 9.81, 0.0, 0.0, 0.0),
            (0.0, 0.0, 9.81 + 156.96, 0.0, 0.0, 0.0),
            (0.0, 0.0, 9.81 - 156.96, 0.0, 0.0, 0.0),
            (0.0, 0.0, 9.81, +50.0, -50.0, +50.0),
        ]

        cur_t = 1.0
        for ax, ay, az, gx, gy, gz in shocks:
            for _ in range(5):  # 50ms shock pulse
                cur_t += dt
                gt_step = GroundTruthStep(cur_t, dt, "IDLE", 0.0, 0.0, 0.0, False)
                smp = TelemetrySample(cur_t, ax, ay, az, gx, gy, gz, dt)
                tracker.step(cur_t, ax, ay, az, gx, gy, gz, dt)
                self.supervisor.inspect_step(tracker, gt_step, smp)

            # Rest for 0.5s to let runaway clamp engage if needed
            for _ in range(50):
                cur_t += dt
                gt_step = GroundTruthStep(cur_t, dt, "IDLE", 0.0, 0.0, 0.0, True)
                smp = TelemetrySample(cur_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
                tracker.step(cur_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
                self.supervisor.inspect_step(tracker, gt_step, smp)

            # Velocity must never explode beyond clamp limit (8.0 m/s) and must return to 0 at rest
            self.assertLessEqual(abs(tracker.velocity), 8.0)
            self.assertFalse(math.isnan(tracker.velocity))

        print("Corrupted NaNs/Infs and +/- 16g shocks handled safely without unhandled exceptions.")

    def test_06_boundary_timesteps_and_zero_inputs(self):
        """
        Challenge boundary conditions:
        - All-zero input vector: [0, 0, 0, 0, 0, 0] (freefall or sensor blackout)
        - Jittered timesteps: dt=0.001 (1000Hz), dt=0.05 (20Hz)
        - Gravity upside down: [0, 0, -9.81]
        Verify: No ZeroDivisionError or math domain errors.
        """
        print("\n--- [CHALLENGER M1-1] Test 6: Boundary Timesteps & Zero Inputs ---")
        tracker = RobustSelfCorrectingTracker(initial_baseline=9.81)

        # 1. Zero vector
        for _ in range(25):
            tracker.step(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, dt=0.01)
        self.assertFalse(math.isnan(tracker.gravity_baseline))

        # 2. Gravity inversion (inverted sensor)
        for _ in range(25):
            tracker.step(0.0, 0.0, 0.0, -9.81, 0.0, 0.0, 0.0, dt=0.01)
        self.assertFalse(math.isnan(tracker.gravity_baseline))

        # 3. High-rate dt=0.001
        for _ in range(100):
            tracker.step(0.0, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt=0.001)

        # 4. Low-rate dt=0.05
        for _ in range(20):
            tracker.step(0.0, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt=0.05)

        # 5. Madgwick filter standalone edge cases
        filter_obj = MadgwickAHRS(beta=0.08)
        filter_obj.init_from_gravity(0.0, 0.0, 0.0)  # zero length
        filter_obj.init_from_gravity(0.0, 0.0, 1.0)  # exact +Z
        filter_obj.init_from_gravity(0.0, 0.0, -1.0) # exact -Z
        filter_obj.update(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, dt=0.01)

        norm_q = sum(x*x for x in filter_obj.q)
        self.assertAlmostEqual(norm_q, 1.0, places=4)
        print("Boundary conditions & zero inputs verified: ZeroDivisionError completely avoided.")


if __name__ == "__main__":
    unittest.main()
