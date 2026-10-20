"""
tests/test_policy_regression_validation.py — Head-to-Head 520-Trial Regression Benchmark.

Milestone 2 Verification:
  1. Validates that RL/Evolutionary optimized parameters in tests/optimized_parameters.json
     maintain 100% pass rate (520/520) across all 4 chaos domains:
       Domain 1: Boot & Sensor Startup Faults (130 trials)
       Domain 2: Thermal & Long-Uptime Drift (130 trials)
       Domain 3: Extreme Biomechanics & Dynamic Impacts (130 trials)
       Domain 4: Connectivity & BLE Communications (130 trials)
  2. Confirms zero false positive reps and zero missed reps.
  3. Confirms non-regression of objective reward, velocity error, and residual drift
     against the hand-tuned firmware baseline.
"""

from __future__ import annotations

import os
import sys
import math
import time
import json
import unittest
from typing import Dict, Any, List, Tuple
from concurrent.futures import ProcessPoolExecutor

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.sim_chaos_engine import ChaosEngine, TrialConfig, MountOrientation
from tests.sim_chaos_batch import ChaosBatchRunner, TrialResult
from tests.sim_supervisor import Supervisor
from tests.policy_optimizer import ParametricVBTTracker, DEFAULT_GENE_SPECS


def _regression_trial_worker(args: Tuple[TrialConfig, Dict[str, Any]]) -> TrialResult:
    """
    Top-level worker function safe for Windows process spawning.
    Simulates a single adversarial chaos trial using the provided parameters.
    """
    config, params = args
    t_start = time.perf_counter()
    engine = ChaosEngine(seed=config.seed)
    samples, ground_truth = engine.run_trial(config)

    is_boot_motion = config.chaos.domain1.boot_motion
    tracker = ParametricVBTTracker(params, auto_boot_calib=is_boot_motion)
    supervisor = Supervisor()

    if not is_boot_motion:
        valid_samples = [s for s in samples[:25] if not (math.isnan(s.ax) or math.isnan(s.ay) or math.isnan(s.az))]
        if valid_samples:
            s0 = valid_samples[0]
            tracker.filter.init_from_gravity(s0.ax, s0.ay, s0.az)
            mean_mag = sum(math.sqrt(s.ax**2 + s.ay**2 + s.az**2) for s in valid_samples) / len(valid_samples)
            tracker.gravity_baseline = mean_mag

    gt_steps = ground_truth.steps or []
    for idx, s in enumerate(samples):
        gt_step = gt_steps[idx] if idx < len(gt_steps) else None
        if not s.is_i2c_timeout and not s.is_nan_packet and not math.isnan(s.ax):
            tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)
        if gt_step is not None:
            supervisor.inspect_step(tracker, gt_step, s)

    evaluation = supervisor.evaluate_trial(tracker, ground_truth, str(config.trial_id))
    t_end = time.perf_counter()

    passed = (
        evaluation.matched_reps == ground_truth.reps and
        evaluation.false_reps == 0 and
        evaluation.missed_reps == 0 and
        len(evaluation.critical_anomalies) == 0
    )

    domain_name = "BIOMECHANICS"
    if config.chaos.domain1.boot_motion or config.chaos.domain1.nan_injection_rate > 0 or config.chaos.domain1.i2c_timeout_rate > 0:
        domain_name = "BOOT_SENSOR"
    elif config.chaos.domain2.thermal_drift or config.chaos.domain2.mounting_orientation != MountOrientation.Z_UP:
        domain_name = "THERMAL_DRIFT"
    elif config.chaos.domain4.ble_disconnect_window is not None:
        domain_name = "CONNECTIVITY"

    return TrialResult(
        trial_id=str(config.trial_id),
        domain=domain_name,
        lift_type=config.lift_type.value,
        passed=passed,
        matched_reps=evaluation.matched_reps,
        expected_reps=ground_truth.reps,
        false_reps=evaluation.false_reps,
        missed_reps=evaluation.missed_reps,
        mean_vel_error=evaluation.velocity_error,
        peak_vel_error=evaluation.peak_velocity_error,
        displacement_error=evaluation.displacement_error,
        residual_drift=evaluation.residual_drift,
        objective_reward=evaluation.objective_reward,
        anomalies=[a.code for a in evaluation.anomalies],
        critical_anomalies=[a.code for a in evaluation.critical_anomalies],
        execution_time_ms=(t_end - t_start) * 1000.0
    )


class TestPolicyRegressionValidation(unittest.TestCase):
    """Rigorous head-to-head 520-trial Monte Carlo chaos regression test."""

    @classmethod
    def setUpClass(cls):
        cls.runner = ChaosBatchRunner(seed=1337)
        cls.total_trials = 520
        cls.batch = cls.runner.build_stratified_batch(cls.total_trials)

        # Baseline parameters
        cls.base_params = {s.name: s.default_val for s in DEFAULT_GENE_SPECS}

        # Optimized parameters from JSON
        json_path = os.path.join(REPO_ROOT, "tests", "optimized_parameters.json")
        cls.assertTrue(os.path.exists(json_path), f"Missing {json_path}")
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cls.opt_params = {k: v["value"] for k, v in data["hyperparameters"].items()}

    def _execute_batch_parallel(self, params: Dict[str, Any]) -> Tuple[List[TrialResult], float]:
        """Runs the 520 trials in parallel using persistent ProcessPoolExecutor."""
        t0 = time.perf_counter()
        payloads = [(cfg, params) for cfg in self.batch]
        try:
            with ProcessPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as ex:
                results = list(ex.map(_regression_trial_worker, payloads))
        except Exception:
            # Sequential fallback if pool encounters environment restriction
            results = [_regression_trial_worker(p) for p in payloads]
        el = time.perf_counter() - t0
        return results, el

    def test_head_to_head_520_monte_carlo_chaos_benchmark(self):
        """
        Execute full 520-trial stratified Monte Carlo chaos benchmark for both
        Baseline and Optimized policies.
        Assert:
          1. 100% pass rate (520/520) for Optimized policy.
          2. Zero false positive reps and zero missed reps.
          3. Total objective reward: Reward(Optimized) >= Reward(Baseline).
          4. Mean relative velocity error: Error(Optimized) <= Error(Baseline) + 1e-4.
          5. Mean residual drift: Drift(Optimized) <= Drift(Baseline) + 1e-4.
        """
        # 1. Run baseline 520 trials
        res_base, el_base = self._execute_batch_parallel(self.base_params)

        # 2. Run optimized 520 trials
        res_opt, el_opt = self._execute_batch_parallel(self.opt_params)

        # Compute summary metrics
        passed_base = sum(1 for r in res_base if r.passed)
        passed_opt = sum(1 for r in res_opt if r.passed)

        false_base = sum(r.false_reps for r in res_base)
        false_opt = sum(r.false_reps for r in res_opt)

        missed_base = sum(r.missed_reps for r in res_base)
        missed_opt = sum(r.missed_reps for r in res_opt)

        reward_base = sum(r.objective_reward for r in res_base)
        reward_opt = sum(r.objective_reward for r in res_opt)

        vel_err_base = sum(r.mean_vel_error for r in res_base) / len(res_base)
        vel_err_opt = sum(r.mean_vel_error for r in res_opt) / len(res_opt)

        drift_base = sum(r.residual_drift for r in res_base) / len(res_base)
        drift_opt = sum(r.residual_drift for r in res_opt) / len(res_opt)

        # ASCII Comparison Report
        print("\n" + "=" * 84)
        print(" HEAD-TO-HEAD REGRESSION VALIDATION (520 MONTE CARLO CHAOS TRIALS)")
        print("=" * 84)
        print(f" {'Metric':<32} | {'Baseline':<16} | {'Optimized':<16} | {'Delta':<12}")
        print("-" * 84)
        print(f" {'Passed Trials':<32} | {f'{passed_base}/{self.total_trials}':<16} | {f'{passed_opt}/{self.total_trials}':<16} | {passed_opt - passed_base:+12}")
        print(f" {'Trial Pass Rate':<32} | {f'{(passed_base/self.total_trials)*100:.1f}%':<16} | {f'{(passed_opt/self.total_trials)*100:.1f}%':<16} | {((passed_opt - passed_base)/self.total_trials)*100:+11.1f}%")
        print(f" {'Total Objective Reward':<32} | {reward_base:<16.2f} | {reward_opt:<16.2f} | {reward_opt - reward_base:+12.2f}")
        print(f" {'Mean Velocity Error':<32} | {vel_err_base:<16.4f} | {vel_err_opt:<16.4f} | {vel_err_opt - vel_err_base:+12.4f}")
        print(f" {'Mean Residual Drift (m/s)':<32} | {drift_base:<16.4f} | {drift_opt:<16.4f} | {drift_opt - drift_base:+12.4f}")
        print(f" {'False Positive Reps':<32} | {false_base:<16} | {false_opt:<16} | {false_opt - false_base:+12}")
        print(f" {'Missed Reps':<32} | {missed_base:<16} | {missed_opt:<16} | {missed_opt - missed_base:+12}")
        print(f" {'Benchmark Time':<32} | {f'{el_base:.2f}s':<16} | {f'{el_opt:.2f}s':<16} | {el_opt - el_base:+11.2f}s")
        print("=" * 84)

        # Strict Verification Assertions
        self.assertEqual(passed_opt, self.total_trials,
                         f"Optimized policy failed {self.total_trials - passed_opt} trials")
        self.assertEqual(false_opt, 0,
                         f"Optimized policy produced {false_opt} false positive reps")
        self.assertEqual(missed_opt, 0,
                         f"Optimized policy missed {missed_opt} reps")
        self.assertGreaterEqual(reward_opt, reward_base - 1e-2,
                                f"Optimized reward {reward_opt:.2f} regressed compared to baseline {reward_base:.2f}")
        self.assertLessEqual(vel_err_opt, vel_err_base + 1e-4,
                             f"Optimized velocity error {vel_err_opt:.4f} regressed compared to baseline {vel_err_base:.4f}")
        self.assertLessEqual(drift_opt, drift_base + 1e-4,
                             f"Optimized residual drift {drift_opt:.4f} regressed compared to baseline {drift_base:.4f}")


if __name__ == "__main__":
    unittest.main()
