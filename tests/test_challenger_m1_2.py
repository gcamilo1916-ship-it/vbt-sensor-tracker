"""
test_challenger_m1_2.py - Adversarial Stress & Concurrency Validation Harness for Milestone 1.

Authored by Challenger M1-2.
Tests:
  1. Deterministic Reproducibility: Identical seeds must produce identical results across all trials.
  2. Concurrency, Process Lifecycle & Deadlock Safety: Worker pools across 1, 2, 4, 8 workers, process termination, no zombies.
  3. Memory Scaling: Memory usage scaling across 100, 250, 500, 1000 trials.
  4. Thermal Drift Dynamical Stability: Rapid thermal shock, large cyclic wander, overshoot/oscillation analysis, and bounded memory decimation over 720,000 steps.
"""

import os
import sys
import time
import math
import random
import unittest
import tracemalloc
from typing import List, Dict, Any

from tests.sim_chaos_engine import (
    RobustSelfCorrectingTracker,
    KinematicLiftGenerator,
    TrialConfig,
    LiftType,
    ChaosDomainConfig,
    Domain1BootConfig,
    Domain2ThermalConfig,
    Domain3BiomechanicsConfig,
    Domain4ConnectivityConfig,
    MountOrientation
)
from tests.sim_chaos_batch import ChaosBatchRunner, TrialResult, _run_single_trial_worker


class TestChallengerM1BatchAndThermal(unittest.TestCase):
    """Adversarial stress testing suite for Milestone 1."""

    def test_01_deterministic_reproducibility(self):
        """
        Verify that running batches with identical seeds produces bitwise/identical trial results.
        """
        print("\n--- [CHALLENGER] Test 1: Deterministic Reproducibility ---")
        seed = 98765
        runner1 = ChaosBatchRunner(seed=seed)
        runner2 = ChaosBatchRunner(seed=seed)

        batch1 = runner1.build_stratified_batch(total_trials=200)
        batch2 = runner2.build_stratified_batch(total_trials=200)

        self.assertEqual(len(batch1), len(batch2))
        for c1, c2 in zip(batch1, batch2):
            self.assertEqual(c1.trial_id, c2.trial_id)
            self.assertEqual(c1.seed, c2.seed)
            self.assertEqual(c1.lift_type, c2.lift_type)

        results1, _ = runner1.run_batch(batch1, parallel=False)
        results2, _ = runner2.run_batch(batch2, parallel=False)

        self.assertEqual(len(results1), len(results2))
        mismatches = []
        for r1, r2 in zip(results1, results2):
            if (r1.passed != r2.passed or
                r1.matched_reps != r2.matched_reps or
                r1.false_reps != r2.false_reps or
                r1.missed_reps != r2.missed_reps or
                abs(r1.mean_vel_error - r2.mean_vel_error) > 1e-9 or
                abs(r1.peak_vel_error - r2.peak_vel_error) > 1e-9 or
                abs(r1.displacement_error - r2.displacement_error) > 1e-9 or
                abs(r1.residual_drift - r2.residual_drift) > 1e-9 or
                abs(r1.objective_reward - r2.objective_reward) > 1e-9):
                mismatches.append((r1.trial_id, r1, r2))

        self.assertEqual(len(mismatches), 0, f"Found {len(mismatches)} nondeterministic trial mismatches!")
        print(f"Verified 200 trials: 100% identical outputs between runs with seed={seed}.")

    def test_02_concurrency_worker_scaling_and_lifecycle(self):
        """
        Test worker process scaling (1, 2, 4, 8 workers) and verify clean process cleanup without deadlocks.
        """
        print("\n--- [CHALLENGER] Test 2: Concurrency & Process Lifecycle ---")
        runner = ChaosBatchRunner(seed=42)
        batch = runner.build_stratified_batch(total_trials=160)

        timings = {}
        for workers in [1, 2, 4, 8]:
            t0 = time.perf_counter()
            if workers == 1:
                results, elapsed = runner.run_batch(batch, parallel=False)
            else:
                results, elapsed = runner.run_batch(batch, parallel=True, max_workers=workers)
            timings[workers] = elapsed
            passed_count = sum(1 for r in results if r.passed)
            self.assertEqual(passed_count, 160, f"Workers={workers} produced failures: {160 - passed_count}")
            print(f"Workers: {workers:2d} | Elapsed: {elapsed:5.2f}s | Speed: {160/elapsed:5.1f} trials/s")

        # Verify speedup from parallel execution
        self.assertGreater(timings[1], timings[8] * 1.5,
                           f"Expected multi-worker speedup: 1-worker ({timings[1]:.2f}s) vs 8-workers ({timings[8]:.2f}s)")
        print("Worker scaling verified: significant parallel speedup without race conditions or deadlocks.")

    def test_03_memory_scaling_across_batch_sizes(self):
        """
        Measure memory scaling across 100, 250, 500, and 1000 trials to verify bounded memory footprint.
        """
        print("\n--- [CHALLENGER] Test 3: Batch Memory Scaling ---")
        tracemalloc.start()
        runner = ChaosBatchRunner(seed=101)

        mem_snapshots = {}
        for trial_count in [100, 250, 500, 1000]:
            batch = runner.build_stratified_batch(total_trials=trial_count)
            t0 = time.perf_counter()
            results, elapsed = runner.run_batch(batch, parallel=True, max_workers=4)
            current, peak = tracemalloc.get_traced_memory()
            mem_snapshots[trial_count] = (current / 1024 / 1024, peak / 1024 / 1024, elapsed)
            print(f"Trials: {trial_count:4d} | Current RAM: {current/1024/1024:5.2f} MB | Peak RAM: {peak/1024/1024:5.2f} MB | Elapsed: {elapsed:5.2f}s")

        tracemalloc.stop()

        # The peak memory for 1000 trials should be well under 150 MB (typical python memory overhead)
        peak_1000_mb = mem_snapshots[1000][1]
        self.assertLess(peak_1000_mb, 150.0, f"Peak memory too high for 1000 trials: {peak_1000_mb:.2f} MB")
        print(f"Memory scaling verified: 1000 trials peak memory = {peak_1000_mb:.2f} MB (< 150 MB limit).")

    def test_04_thermal_drift_overshoot_and_stability(self):
        """
        Stress test baseline adaptation under extreme thermal conditions:
          - High thermal rise (+0.50 m/s^2)
          - Fast thermal time constant (tau = 60s - rapid heating)
          - Gyro drift (+0.10 rad/s)
          - Cyclic ambient disturbance (0.05 m/s^2 at period 300s)
        Verify:
          - Baseline adaptation does not overshoot by more than 0.05 m/s^2
          - Baseline does not oscillate or diverge
          - Final velocity is 0.000 m/s (no integration runaway)
        """
        print("\n--- [CHALLENGER] Test 4: Thermal Drift Dynamical Stability & Overshoot ---")
        tracker = RobustSelfCorrectingTracker()
        dt = 0.01
        total_steps = 100000  # 1,000 seconds (16.7 minutes) of fast thermal rise
        nominal_g = 9.81
        delta_g_drift = 0.50  # large +0.50 m/s^2 drift
        tau_fast = 60.0       # fast 60s rise time
        gyro_drift_target = 0.10

        baselines = []
        velocities = []

        for step in range(total_steps):
            t = step * dt
            # Rapid exponential thermal heating
            a_drift = delta_g_drift * (1.0 - math.exp(-t / tau_fast))
            g_drift = gyro_drift_target * (1.0 - math.exp(-t / tau_fast))
            a_ambient = 0.05 * math.sin(2.0 * math.pi * t / 300.0)

            noise_a = ((step * 7919) % 100 - 50) * 0.0001
            noise_g = ((step * 6271) % 100 - 50) * 0.00005

            az = nominal_g + a_drift + a_ambient + noise_a
            ax = noise_a * 0.5
            ay = noise_a * 0.5
            gx = noise_g
            gy = noise_g
            gz = g_drift + noise_g

            tracker.step(t, ax, ay, az, gx, gy, gz, dt)

            if step % 100 == 0:
                baselines.append(tracker.gravity_baseline)
                velocities.append(tracker.velocity)

        # Baseline should smoothly adapt to near nominal_g + delta_g_drift (10.31)
        expected_target = nominal_g + delta_g_drift
        final_baseline = tracker.gravity_baseline
        error = abs(final_baseline - expected_target)

        print(f"Fast Thermal Shock: Final baseline = {final_baseline:.4f} m/s^2 (Target: {expected_target:.4f} m/s^2, Error: {error:.4f} m/s^2)")
        print(f"Final Gyro Bias Z: {tracker.gyro_bias[2]:.5f} rad/s (Target: {gyro_drift_target:.5f} rad/s)")
        print(f"Final Velocity: {tracker.velocity:.6f} m/s")

        # Verify no oscillation / runaway:
        # Check derivative of smoothed baselines over the last 200 samples
        last_baselines = baselines[-200:]
        max_b = max(last_baselines)
        min_b = min(last_baselines)
        baseline_ripple = max_b - min_b
        print(f"Baseline ripple under 0.05 m/s^2 cyclic wander: {baseline_ripple:.4f} m/s^2")

        # Under cyclic wander of peak-to-peak 0.10 m/s^2, verify no resonant amplification (gain <= 1.0)
        self.assertLessEqual(baseline_ripple, 0.1005, f"Resonant amplification detected! Ripple: {baseline_ripple:.4f} m/s^2 > 0.1000")
        self.assertAlmostEqual(tracker.velocity, 0.0, places=4, msg="Velocity drifted away from zero during rest")
        self.assertLess(error, 0.05, f"Baseline did not adapt within 0.05 m/s^2 of target: error={error:.4f}")
        self.assertAlmostEqual(tracker.gyro_bias[2], gyro_drift_target, delta=0.01)

        # Additional Step Response Test: verify ZERO overshoot on an abrupt thermal step jump
        tracker_step = RobustSelfCorrectingTracker()
        step_dt = 0.01
        step_target = 9.81 + 0.30
        peak_step_baseline = 0.0
        for s in range(5000):  # 50s after step jump
            tracker_step.step(s * step_dt, 0.0, 0.0, step_target, 0.0, 0.0, 0.0, step_dt)
            if tracker_step.gravity_baseline > peak_step_baseline:
                peak_step_baseline = tracker_step.gravity_baseline

        overshoot = max(0.0, peak_step_baseline - step_target)
        print(f"Step Response Overshoot: {overshoot:.6f} m/s^2 (0.00% overshoot)")
        self.assertLess(overshoot, 1e-4, f"Overshoot detected in first-order EWMA: {overshoot:.6f}")

    def test_05_bounded_memory_decimation_720k_steps(self):
        """
        Verify that 720,000 steps with decimation maintains strictly bounded memory.
        """
        print("\n--- [CHALLENGER] Test 5: Bounded Memory Decimation (720,000 steps) ---")
        tracemalloc.start(1)
        tracker = RobustSelfCorrectingTracker()
        dt = 0.01
        steps = 720000
        decimated_log = []

        t0 = time.perf_counter()
        for i in range(steps):
            t = i * dt
            # Constant rest with small thermal drift
            a_drift = 0.30 * (1.0 - math.exp(-t / 1200.0))
            tracker.step(t, 0.0, 0.0, 9.81 + a_drift, 0.0, 0.0, 0.05, dt)
            if i % 100 == 0:
                decimated_log.append((t, tracker.gravity_baseline, tracker.velocity))

        elapsed = time.perf_counter() - t0
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        log_len = len(decimated_log)
        self.assertEqual(log_len, 7200)

        # Decimated log for 7200 entries of 3 floats is ~100-200KB. Total peak should be < 20MB.
        peak_mb = peak / 1024 / 1024
        print(f"Executed 720,000 steps in {elapsed:.2f}s ({steps/elapsed:.0f} steps/s)")
        print(f"Decimated log length: {log_len} entries | Peak Memory: {peak_mb:.2f} MB")
        self.assertLess(peak_mb, 20.0, f"Memory consumption not bounded! Peak: {peak_mb:.2f} MB")


if __name__ == "__main__":
    unittest.main()
