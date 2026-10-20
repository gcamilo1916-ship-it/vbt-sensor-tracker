"""
Unit test suite for the 500+ Monte Carlo Chaos Benchmark.
Validates 100% rep detection accuracy across all 4 adversarial chaos domains:
  1. Boot & Sensor Startup Faults
  2. Thermal & Long-Uptime Drift
  3. Extreme Biomechanics & Dynamic Impacts
  4. Connectivity & BLE Communications

Execution Time Target: < 25.0s for 500+ trials.
100% Pure Python Standard Library (no numpy, no scipy).
"""

import unittest
import time
from tests.sim_chaos_batch import ChaosBatchRunner


class TestMonteCarloChaos(unittest.TestCase):
    """Rigorous 500+ Monte Carlo trial verification suite."""

    def setUp(self):
        self.runner = ChaosBatchRunner(seed=1337)

    def test_monte_carlo_chaos_520_trials_parallel(self):
        """
        Execute 520 stratified Monte Carlo chaos trials in parallel mode.
        Assert:
          - 100% trial pass rate (520/520)
          - 0 false positive reps
          - 0 missed reps
          - Total elapsed runtime < 25.0 seconds
        """
        total_trials = 520
        batch = self.runner.build_stratified_batch(total_trials)
        self.assertEqual(len(batch), total_trials)

        results, elapsed_s = self.runner.run_batch(batch, parallel=True)
        summary = self.runner.generate_summary(results, elapsed_s)
        self.runner.print_ascii_table(summary)

        # Assertions
        self.assertEqual(summary["total_trials"], total_trials)
        self.assertEqual(summary["passed_trials"], total_trials, 
                         f"Failures detected: {summary['failed_trials']} failed trials")
        self.assertEqual(summary["failed_trials"], 0)
        self.assertEqual(summary["total_false_reps"], 0,
                         f"Unexpected false positive reps: {summary['total_false_reps']}")
        self.assertEqual(summary["total_missed_reps"], 0,
                         f"Unexpected missed reps: {summary['total_missed_reps']}")
        self.assertEqual(summary["pass_rate_pct"], 100.0)
        self.assertLess(summary["elapsed_seconds"], 25.0,
                        f"Execution time exceeded 25.0s limit: {summary['elapsed_seconds']:.2f}s")

        # Verify domain-level perfection
        domains = summary["domains"]
        expected_domains = ["BOOT_SENSOR", "THERMAL_DRIFT", "BIOMECHANICS", "CONNECTIVITY"]
        for dom in expected_domains:
            self.assertIn(dom, domains, f"Missing domain {dom}")
            d_stat = domains[dom]
            self.assertEqual(d_stat["passed"], d_stat["total"],
                             f"Domain {dom} had {d_stat['failed']} failures")
            self.assertEqual(d_stat["false_reps"], 0,
                             f"Domain {dom} recorded false reps: {d_stat['false_reps']}")
            self.assertEqual(d_stat["missed_reps"], 0,
                             f"Domain {dom} recorded missed reps: {d_stat['missed_reps']}")
            self.assertGreater(d_stat["avg_reward"], 0.0,
                               f"Domain {dom} produced non-positive reward: {d_stat['avg_reward']}")

    def test_sequential_execution_mode(self):
        """
        Verify sequential execution fallback functionality and timing.
        Executes a 40-trial stratified batch sequentially to verify deterministic fallback.
        """
        batch = self.runner.build_stratified_batch(40)
        results, elapsed_s = self.runner.run_batch(batch, parallel=False)
        summary = self.runner.generate_summary(results, elapsed_s)

        self.assertEqual(summary["total_trials"], 40)
        self.assertEqual(summary["passed_trials"], 40)
        self.assertEqual(summary["total_false_reps"], 0)
        self.assertEqual(summary["total_missed_reps"], 0)
        self.assertLess(elapsed_s, 10.0, f"Sequential run too slow: {elapsed_s:.2f}s")


if __name__ == "__main__":
    unittest.main()
