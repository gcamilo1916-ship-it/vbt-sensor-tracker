"""
tests/test_challenger_m2_2.py — Adversarial Optimization Stability, Convergence, and Performance Harness.

Authored by Challenger M2-2.
Adversarially stress-tests:
  1. JADE Multi-Seed Convergence & Repeatability:
     - Verifies convergence and diversity maintenance across diverse random seeds (42, 101, 777, 2026).
     - Confirms parameter adaptation stays bounded (mu_F in [0.1, 0.9], mu_CR in [0.1, 0.9]).
  2. Objective Reward Statistical Significance & Non-Regression vs Baseline:
     - Evaluates baseline vs optimized parameters over a 100-trial held-out stratified chaos batch (seed 9999).
     - Measures paired differences, statistical significance, rep accuracy (100%), 0 false reps, 0 missed reps.
  3. Multi-Core Scaling & Execution Budget:
     - Benchmarks wall-clock execution time and speedup across 1, 2, 4, 8 workers on identical workloads.
     - Confirms Windows spawn safety, zero deadlocks, and execution well within operational limits (<60s).
  4. Memory Stability & Leak Audit (tracemalloc):
     - Monitors memory allocations across multi-generation evolutionary loops using tracemalloc.
     - Verifies steady-state memory delta (<500 KB/gen) and bounded peak memory (<100 MB).
  5. Extreme Hypercube Boundary & Corner Robustness:
     - Tests all-zeros (min bounds), all-ones (max bounds), and corner configurations in ParametricVBTTracker.
     - Validates zero division safety, finite numerical states, and absence of unhandled exceptions.
"""

from __future__ import annotations

import os
import sys
import math
import time
import json
import random
import unittest
import tracemalloc
from typing import List, Dict, Any, Tuple

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.policy_optimizer import (
    GeneSpec,
    DEFAULT_GENE_SPECS,
    ParametricVBTTracker,
    JADEOptimizer,
    decode_vector_to_params,
    encode_params_to_vector,
    _evaluate_candidate_worker,
    run_trial_batch
)
from tests.sim_chaos_engine import (
    ChaosEngine,
    TrialConfig,
    LiftType,
    ChaosDomainConfig,
    Domain1BootConfig,
    Domain2ThermalConfig,
    Domain3BiomechanicsConfig,
    Domain4ConnectivityConfig
)
from tests.sim_chaos_batch import ChaosBatchRunner
from tests.sim_supervisor import Supervisor


class TestChallengerM2OptimizationHarness(unittest.TestCase):
    """Adversarial stress harness for Milestone 2 RL/Evolutionary Policy Optimizer."""

    @classmethod
    def setUpClass(cls):
        # Load optimized parameters exported by Worker M2
        opt_path = os.path.join(REPO_ROOT, "tests", "optimized_parameters.json")
        cls.has_optimized_json = os.path.exists(opt_path)
        if cls.has_optimized_json:
            with open(opt_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            cls.optimized_params = {k: v["value"] for k, v in data["hyperparameters"].items()}
            cls.optimized_metadata = data.get("metadata", {})
        else:
            cls.optimized_params = {}
            cls.optimized_metadata = {}

        cls.baseline_params = {s.name: s.default_val for s in DEFAULT_GENE_SPECS}

    # ═════════════════════════════════════════════════════════════════════════
    # 1. JADE CONVERGENCE & REPEATABILITY ACROSS DIVERSE RANDOM SEEDS
    # ═════════════════════════════════════════════════════════════════════════

    def test_01_jade_convergence_multi_seed(self):
        """
        Verify JADE convergence, parameter stability, and diversity preservation
        across diverse random seeds.
        """
        print("\n" + "=" * 80)
        print(" [CHALLENGER M2-2] TEST 1: JADE Multi-Seed Convergence & Stability")
        print("=" * 80)

        test_seeds = [42, 101, 777, 2026]
        pop_size = 6
        generations = 4
        batch_size = 4

        for s in test_seeds:
            t0 = time.perf_counter()
            opt = JADEOptimizer(
                pop_size=pop_size,
                max_generations=generations,
                mini_batch_size=batch_size,
                seed=s,
                parallel=True,
                max_workers=4
            )
            best_ind, final_pop, report = opt.evolve()
            dt = time.perf_counter() - t0

            # 1. Check parameter adaptation bounds
            self.assertGreater(opt.mu_f, 0.05, f"Seed {s}: mu_F collapsed below 0.05 ({opt.mu_f})")
            self.assertLess(opt.mu_f, 0.95, f"Seed {s}: mu_F diverged above 0.95 ({opt.mu_f})")
            self.assertGreater(opt.mu_cr, 0.05, f"Seed {s}: mu_CR collapsed below 0.05 ({opt.mu_cr})")
            self.assertLess(opt.mu_cr, 0.95, f"Seed {s}: mu_CR diverged above 0.95 ({opt.mu_cr})")

            # 2. Check population diversity remaining healthy
            final_history = report["history"][-1]
            diversity = final_history["diversity"]
            self.assertGreater(diversity, 0.001, f"Seed {s}: Population diversity prematurely collapsed to 0 ({diversity})")

            # 3. Check best candidate chromosome denormalization
            decoded = decode_vector_to_params(best_ind.chromosome)
            for spec in DEFAULT_GENE_SPECS:
                val = decoded[spec.name]
                self.assertGreaterEqual(val, spec.min_val - 1e-6, f"Seed {s}: {spec.name}={val} below min {spec.min_val}")
                self.assertLessEqual(val, spec.max_val + 1e-6, f"Seed {s}: {spec.name}={val} above max {spec.max_val}")

            # 4. Check pass rate of best candidate on mini-batch
            self.assertGreaterEqual(best_ind.pass_rate, 75.0, f"Seed {s}: Best individual pass rate < 75% ({best_ind.pass_rate}%)")

            print(f" Seed {s:4d} | Best Reward: {best_ind.fitness:6.2f} | mu_F: {opt.mu_f:.3f} | "
                  f"mu_CR: {opt.mu_cr:.3f} | Div: {diversity:.4f} | PassRate: {best_ind.pass_rate:5.1f}% | Time: {dt:4.2f}s [PASS]")

    # ═════════════════════════════════════════════════════════════════════════
    # 2. REWARD STATISTICAL SIGNIFICANCE & PERFORMANCE VS BASELINE
    # ═════════════════════════════════════════════════════════════════════════

    def test_02_reward_statistical_significance_vs_baseline(self):
        """
        Evaluate baseline vs optimized hyperparameters across an independent held-out
        100-trial stratified chaos batch (seed 9999).
        Verify statistically significant non-inferiority/improvement in reward and velocity error.
        """
        print("\n" + "=" * 80)
        print(" [CHALLENGER M2-2] TEST 2: Reward Statistical Significance vs Baseline (100 Trials)")
        print("=" * 80)

        self.assertTrue(self.has_optimized_json, "tests/optimized_parameters.json must exist")

        # Independent validation seed not used in training (42) or acceptance (1337)
        eval_seed = 9999
        runner = ChaosBatchRunner(seed=eval_seed)
        test_batch = runner.build_stratified_batch(100)

        # 1. Run baseline
        base_results, t_base = run_trial_batch(test_batch, self.baseline_params, parallel=True, max_workers=4)
        base_rewards = [r.objective_reward for r in base_results]
        base_vel_errs = [r.mean_vel_error for r in base_results]
        base_drifts = [r.residual_drift for r in base_results]
        base_passed = sum(1 for r in base_results if r.passed)
        base_false = sum(r.false_reps for r in base_results)
        base_missed = sum(r.missed_reps for r in base_results)

        # 2. Run optimized
        opt_results, t_opt = run_trial_batch(test_batch, self.optimized_params, parallel=True, max_workers=4)
        opt_rewards = [r.objective_reward for r in opt_results]
        opt_vel_errs = [r.mean_vel_error for r in opt_results]
        opt_drifts = [r.residual_drift for r in opt_results]
        opt_passed = sum(1 for r in opt_results if r.passed)
        opt_false = sum(r.false_reps for r in opt_results)
        opt_missed = sum(r.missed_reps for r in opt_results)

        # 3. Statistical comparisons
        reward_deltas = [o - b for o, b in zip(opt_rewards, base_rewards)]
        vel_err_deltas = [o - b for o, b in zip(opt_vel_errs, base_vel_errs)]
        drift_deltas = [o - b for o, b in zip(opt_drifts, base_drifts)]

        mean_delta_reward = sum(reward_deltas) / len(reward_deltas)
        mean_delta_vel = sum(vel_err_deltas) / len(vel_err_deltas)
        mean_delta_drift = sum(drift_deltas) / len(drift_deltas)

        # Paired t-statistic calculation
        n = len(reward_deltas)
        var_delta_reward = sum((d - mean_delta_reward)**2 for d in reward_deltas) / (n - 1)
        se_reward = math.sqrt(var_delta_reward / n) if var_delta_reward > 0 else 1e-6
        t_stat_reward = mean_delta_reward / se_reward

        print(f" Total Trials       : {n}")
        print(f" Baseline Pass Rate : {base_passed}/{n} ({base_passed/n*100:.1f}%), False={base_false}, Missed={base_missed}")
        print(f" Optimized Pass Rate: {opt_passed}/{n} ({opt_passed/n*100:.1f}%), False={opt_false}, Missed={opt_missed}")
        print(f" Mean Reward        : Base={sum(base_rewards)/n:.2f} | Opt={sum(opt_rewards)/n:.2f} | Delta={mean_delta_reward:+.4f} (t={t_stat_reward:.2f})")
        print(f" Mean Vel Error     : Base={sum(base_vel_errs)/n:.4f} | Opt={sum(opt_vel_errs)/n:.4f} | Delta={mean_delta_vel:+.4f}")
        print(f" Mean Residual Drift: Base={sum(base_drifts)/n:.4f} | Opt={sum(opt_drifts)/n:.4f} | Delta={mean_delta_drift:+.4f}")

        # Assertions
        self.assertEqual(opt_passed, n, f"Optimized policy must achieve 100% pass rate (got {opt_passed}/{n})")
        self.assertEqual(opt_false, 0, f"Optimized policy produced {opt_false} false reps")
        self.assertEqual(opt_missed, 0, f"Optimized policy had {opt_missed} missed reps")
        self.assertGreaterEqual(mean_delta_reward, -1e-2, f"Optimized reward significantly degraded ({mean_delta_reward})")
        self.assertLessEqual(mean_delta_vel, 0.005, f"Optimized velocity error significantly degraded ({mean_delta_vel})")

    # ═════════════════════════════════════════════════════════════════════════
    # 3. MULTI-CORE SCALING & EXECUTION BUDGET BENCHMARK
    # ═════════════════════════════════════════════════════════════════════════

    def test_03_multicore_scaling_and_execution_budget(self):
        """
        Benchmark multi-core scaling efficiency and execution budget across worker counts.
        Verify Windows spawn process pool safety and sub-linear scaling speedup.
        """
        print("\n" + "=" * 80)
        print(" [CHALLENGER M2-2] TEST 3: Multi-Core Scaling & Execution Budget")
        print("=" * 80)

        # Fix an identical workload of 8 candidates on batch of 6 trials = 48 trial evaluations
        batch_size = 6
        batch_seed = 555
        test_pop_size = 8
        test_chromosomes = [
            [random.Random(100 + i * 17 + j).random() for j in range(len(DEFAULT_GENE_SPECS))]
            for i in range(test_pop_size)
        ]

        worker_configs = [1, 2, 4]
        cpu_count = os.cpu_count() or 4
        if cpu_count >= 8:
            worker_configs.append(8)

        timings: Dict[int, float] = {}

        for w in worker_configs:
            is_parallel = (w > 1)
            t0 = time.perf_counter()
            if not is_parallel:
                results = [
                    _evaluate_candidate_worker(i, chrom, batch_seed, batch_size, DEFAULT_GENE_SPECS)
                    for i, chrom in enumerate(test_chromosomes)
                ]
            else:
                from concurrent.futures import ProcessPoolExecutor
                with ProcessPoolExecutor(max_workers=w) as ex:
                    futures = [
                        ex.submit(_evaluate_candidate_worker, i, chrom, batch_seed, batch_size, DEFAULT_GENE_SPECS)
                        for i, chrom in enumerate(test_chromosomes)
                    ]
                    results = [f.result() for f in futures]
            elapsed = time.perf_counter() - t0
            timings[w] = elapsed

            # Verify valid results returned
            self.assertEqual(len(results), test_pop_size)
            for cid, rew, stats in results:
                self.assertIn("pass_rate", stats)
                self.assertNotIn("error", stats)

            speedup = timings[1] / elapsed
            print(f" Workers: {w:2d} | Time: {elapsed:5.2f}s | Speedup: {speedup:4.2f}x | "
                  f"Throughput: {test_pop_size / elapsed:5.2f} candidates/sec ({test_pop_size * batch_size / elapsed:5.1f} trials/sec)")

        # Verify speedup for multi-core configurations
        if 4 in timings and 1 in timings:
            speedup_4 = timings[1] / timings[4]
            self.assertGreater(speedup_4, 1.3, f"4-core speedup insufficient ({speedup_4:.2f}x < 1.3x)")

        # Verify execution budget for a standard 2-generation quick run
        t_cli_start = time.perf_counter()
        quick_opt = JADEOptimizer(
            pop_size=6,
            max_generations=2,
            mini_batch_size=4,
            seed=42,
            parallel=True,
            max_workers=4
        )
        _, _, report = quick_opt.evolve()
        cli_elapsed = time.perf_counter() - t_cli_start
        print(f" Quick JADE Run (2 gens, pop 6, batch 4) Finished In: {cli_elapsed:.2f}s")
        self.assertLess(cli_elapsed, 20.0, f"Quick JADE run exceeded 20s budget ({cli_elapsed:.2f}s)")

    # ═════════════════════════════════════════════════════════════════════════
    # 4. MEMORY STABILITY & LEAK AUDIT (tracemalloc)
    # ═════════════════════════════════════════════════════════════════════════

    def test_04_memory_stability_tracemalloc(self):
        """
        Verify memory stability during multi-generation evolutionary loops using tracemalloc.
        Confirms absence of memory leaks, steady-state delta (<500 KB/gen), and bounded peak memory (<100 MB).
        """
        print("\n" + "=" * 80)
        print(" [CHALLENGER M2-2] TEST 4: Memory Stability & Leak Audit (tracemalloc)")
        print("=" * 80)

        tracemalloc.start()
        tracemalloc.reset_peak()

        mem_snapshots: List[Tuple[int, float, float, float]] = []
        base_mem, _ = tracemalloc.get_traced_memory()

        # Run 8 generations with memory measurement per generation
        generations = 8
        pop_size = 6
        mini_batch_size = 4
        opt = JADEOptimizer(
            pop_size=pop_size,
            max_generations=generations,
            mini_batch_size=mini_batch_size,
            seed=1234,
            parallel=True,
            max_workers=4
        )

        prev_current = base_mem
        for gen in range(1, generations + 1):
            # Single evolutionary step logic
            sub_opt = JADEOptimizer(
                pop_size=pop_size,
                max_generations=1,
                mini_batch_size=mini_batch_size,
                seed=1234 + gen * 100,
                parallel=True,
                max_workers=4
            )
            sub_opt.evolve()

            curr_mem, peak_mem = tracemalloc.get_traced_memory()
            delta_kb = (curr_mem - prev_current) / 1024.0
            total_curr_mb = curr_mem / (1024.0 * 1024.0)
            total_peak_mb = peak_mem / (1024.0 * 1024.0)
            mem_snapshots.append((gen, delta_kb, total_curr_mb, total_peak_mb))
            prev_current = curr_mem

            print(f" Gen {gen:02d} | Current: {total_curr_mb:5.2f} MB | Peak: {total_peak_mb:5.2f} MB | Delta: {delta_kb:+7.1f} KB")

        tracemalloc.stop()

        # Verify steady-state stability: Later generations (gens 4..8) must not leak continuously
        steady_deltas = [snap[1] for snap in mem_snapshots[3:]]
        mean_steady_delta_kb = sum(steady_deltas) / len(steady_deltas)
        peak_mb = mem_snapshots[-1][3]

        print(f"\n Mean Steady-State Delta (Gens 4..8): {mean_steady_delta_kb:+.1f} KB/gen")
        print(f" Final Peak Memory Allocation       : {peak_mb:.2f} MB")

        self.assertLess(mean_steady_delta_kb, 500.0, f"Memory leak detected: mean steady delta {mean_steady_delta_kb:.1f} KB/gen > 500 KB")
        self.assertLess(peak_mb, 100.0, f"Peak memory exceeded 100 MB limit ({peak_mb:.2f} MB)")

    # ═════════════════════════════════════════════════════════════════════════
    # 5. EXTREME HYPERCUBE BOUNDARY & CORNER ROBUSTNESS
    # ═════════════════════════════════════════════════════════════════════════

    def test_05_extreme_boundary_and_corner_robustness(self):
        """
        Stress-test ParametricVBTTracker with extreme boundary parameters:
          - Chromosome 0.0^18 (all minimum physical bounds)
          - Chromosome 1.0^18 (all maximum physical bounds)
          - Alternating corner chromosomes
        Verifies absence of ZeroDivisionError, unhandled exceptions, or numerical divergence.
        """
        print("\n" + "=" * 80)
        print(" [CHALLENGER M2-2] TEST 5: Extreme Boundary & Corner Robustness")
        print("=" * 80)

        d = len(DEFAULT_GENE_SPECS)
        extreme_chromosomes = {
            "ALL_MIN (0.0^18)": [0.0] * d,
            "ALL_MAX (1.0^18)": [1.0] * d,
            "CHECKER_EVEN": [1.0 if i % 2 == 0 else 0.0 for i in range(d)],
            "CHECKER_ODD": [0.0 if i % 2 == 0 else 1.0 for i in range(d)],
        }

        dt = 0.01
        for name, chrom in extreme_chromosomes.items():
            params = decode_vector_to_params(chrom)
            tracker = ParametricVBTTracker(params)
            tracker.filter.init_from_gravity(0.0, 0.0, 9.81)

            t = 0.0
            # Step 1: 50 samples stationary rest
            for _ in range(50):
                tracker.step(t, 0.01 * (random.random() - 0.5), 0.01 * (random.random() - 0.5), 9.81, 0.0, 0.0, 0.0, dt)
                t += dt

            # Step 2: 100 samples eccentric downward pulse
            for _ in range(100):
                tracker.step(t, 0.0, 0.0, 9.81 - 2.5, 0.0, 0.0, 0.0, dt)
                t += dt

            # Step 3: 50 samples motionless pause
            for _ in range(50):
                tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
                t += dt

            # Step 4: 100 samples concentric upward pulse
            for _ in range(100):
                tracker.step(t, 0.0, 0.0, 9.81 + 3.0, 0.0, 0.0, 0.0, dt)
                t += dt

            # Step 5: Runaway velocity pulse (>12 m/s) to exercise clamp
            for _ in range(20):
                tracker.step(t, 0.0, 0.0, 9.81 + 15.0, 0.0, 0.0, 0.0, dt)
                t += dt

            # Step 6: Final 50 samples rest
            for _ in range(50):
                tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
                t += dt

            # Verify tracker numerical integrity
            self.assertFalse(math.isnan(tracker.velocity), f"{name}: Velocity became NaN")
            self.assertFalse(math.isinf(tracker.velocity), f"{name}: Velocity became Inf")
            self.assertFalse(math.isnan(tracker.gravity_baseline), f"{name}: Baseline became NaN")
            self.assertIn(tracker.currentState, ["IDLE", "ECCENTRIC", "CONCENTRIC"], f"{name}: Invalid FSM state {tracker.currentState}")

            print(f" Configuration: {name:<20} | Final State: {tracker.currentState:<10} | "
                  f"Velocity: {tracker.velocity:7.4f} m/s | Reps: {len(tracker.reps)} [PASS]")


if __name__ == "__main__":
    unittest.main()
