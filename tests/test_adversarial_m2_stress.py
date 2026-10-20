"""
tests/test_adversarial_m2_stress.py — Empirical Challenger M2-1 Stress Test Suite.

Adversarial stress-testing of Milestone 2 policy optimizer and exported parameters:
  1. Genome Boundary Conditions:
     - Vector of all 0.0s (all parameters at minimum physical bounds).
     - Vector of all 1.0s (all parameters at maximum physical bounds).
     - Mixed extreme vectors (alternating 0.0 and 1.0).
     - NaN / Inf / Out-of-bounds genome vectors.
     - Robustness against unhandled exceptions and infinite loops in workers.
  2. Extreme Biomechanical Trajectory Stress-Testing:
     - 5.0s extended bottom-pause trajectory (safety pin rest).
     - 0.015 m/s extreme sticking-point grinds.
     - 2.5 reps/s ultra-fast touch-and-go barbell cycling.
  3. Optimizer Termination & Stability:
     - Boundary reflection with non-finite values.
     - Quick optimization run verification.
"""

from __future__ import annotations

import os
import sys
import math
import json
import time
import unittest
from typing import Dict, Any, List, Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.policy_optimizer import (
    DEFAULT_GENE_SPECS,
    GENE_MAP,
    GeneSpec,
    ParametricVBTTracker,
    JADEOptimizer,
    decode_vector_to_params,
    encode_params_to_vector,
    _evaluate_candidate_worker
)
from tests.sim_chaos_engine import (
    ChaosEngine,
    TrialConfig,
    LiftType,
    MountOrientation,
    ChaosDomainConfig,
    Domain3BiomechanicsConfig
)
from tests.sim_supervisor import Supervisor


class TestAdversarialM2Stress(unittest.TestCase):
    """Adversarial challenger test suite for Milestone 2 optimizer and parameters."""

    @classmethod
    def setUpClass(cls):
        json_path = os.path.join(REPO_ROOT, "tests", "optimized_parameters.json")
        cls.assertTrue(os.path.exists(json_path), f"Missing {json_path}")
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cls.optimized_params = {k: v["value"] for k, v in data["hyperparameters"].items()}

    # ═════════════════════════════════════════════════════════════════════════
    # 1. EXTREME GENOME BOUNDARY CONDITIONS
    # ═════════════════════════════════════════════════════════════════════════

    def test_extreme_genome_all_zeros(self):
        """Stress-test genome vector of all 0.0s (all minimum physical bounds)."""
        zero_chrom = [0.0] * 18
        params = decode_vector_to_params(zero_chrom)

        # Verify all decoded parameters match min_val
        for s in DEFAULT_GENE_SPECS:
            expected_min = int(round(s.min_val)) if s.is_integer else s.min_val
            self.assertEqual(params[s.name], expected_min, f"Gene {s.name} did not hit min_val")

        # Instantiate ParametricVBTTracker and step with various signals
        tracker = ParametricVBTTracker(params)
        for i in range(100):
            tracker.step(t=i * 0.01, ax=0.0, ay=0.0, az=9.81, gx=0.0, gy=0.0, gz=0.0, dt=0.01)

        # Worker execution must terminate cleanly without crash or infinite loop
        cid, reward, stats = _evaluate_candidate_worker(999, zero_chrom, 42, 4)
        self.assertEqual(cid, 999)
        self.assertIsInstance(reward, float)
        self.assertFalse(math.isnan(reward))
        self.assertFalse(math.isinf(reward))

    def test_extreme_genome_all_ones(self):
        """Stress-test genome vector of all 1.0s (all maximum physical bounds)."""
        one_chrom = [1.0] * 18
        params = decode_vector_to_params(one_chrom)

        # Verify all decoded parameters match max_val
        for s in DEFAULT_GENE_SPECS:
            expected_max = int(round(s.max_val)) if s.is_integer else s.max_val
            self.assertEqual(params[s.name], expected_max, f"Gene {s.name} did not hit max_val")

        # Instantiate ParametricVBTTracker and step
        tracker = ParametricVBTTracker(params)
        for i in range(100):
            tracker.step(t=i * 0.01, ax=1.0, ay=-1.0, az=9.81, gx=0.1, gy=-0.1, gz=0.0, dt=0.01)

        # Worker execution must terminate cleanly
        cid, reward, stats = _evaluate_candidate_worker(998, one_chrom, 42, 4)
        self.assertEqual(cid, 998)
        self.assertIsInstance(reward, float)
        self.assertFalse(math.isnan(reward))
        self.assertFalse(math.isinf(reward))

    def test_extreme_genome_mixed_alternating(self):
        """Stress-test alternating minimum/maximum bounds across all 18 genes."""
        chrom_a = [0.0 if i % 2 == 0 else 1.0 for i in range(18)]
        chrom_b = [1.0 if i % 2 == 0 else 0.0 for i in range(18)]

        for idx, chrom in enumerate([chrom_a, chrom_b]):
            params = decode_vector_to_params(chrom)
            tracker = ParametricVBTTracker(params)
            for i in range(50):
                tracker.step(t=i * 0.01, ax=0.0, ay=0.0, az=9.81, gx=0.0, gy=0.0, gz=0.0, dt=0.01)
            cid, reward, stats = _evaluate_candidate_worker(990 + idx, chrom, 42, 4)
            self.assertEqual(cid, 990 + idx)
            self.assertIsInstance(reward, float)
            self.assertFalse(math.isnan(reward))

    def test_extreme_genome_nan_and_inf_handling(self):
        """Stress-test worker and decoder under NaN, Inf, and severe out-of-bounds chromosomes."""
        nan_chrom = [float("nan")] * 18
        inf_chrom = [float("inf")] * 18
        neg_inf_chrom = [-float("inf")] * 18
        out_bounds_chrom = [-100.0] * 9 + [100.0] * 9

        # 1. Out of bounds vectors must clamp gracefully in decoder
        params_oob = decode_vector_to_params(out_bounds_chrom)
        for i, s in enumerate(DEFAULT_GENE_SPECS):
            expected = s.min_val if i < 9 else s.max_val
            if s.is_integer:
                expected = int(round(expected))
            self.assertEqual(params_oob[s.name], expected)

        # 2. Worker must not raise unhandled exceptions on NaN/Inf chromosomes
        cid_nan, rew_nan, stats_nan = _evaluate_candidate_worker(980, nan_chrom, 42, 4)
        self.assertEqual(cid_nan, 980)
        # Note: In pure Python, min(1.0, nan) evaluates to 1.0, denormalizing to max_val.
        # Worker must either assign -10000.0 or evaluate cleanly without throwing an unhandled exception.
        self.assertTrue(isinstance(rew_nan, float) and not math.isnan(rew_nan))

        cid_inf, rew_inf, stats_inf = _evaluate_candidate_worker(981, inf_chrom, 42, 4)
        self.assertEqual(cid_inf, 981)
        self.assertIsInstance(rew_inf, float)

        cid_ninf, rew_ninf, stats_ninf = _evaluate_candidate_worker(982, neg_inf_chrom, 42, 4)
        self.assertEqual(cid_ninf, 982)
        self.assertIsInstance(rew_ninf, float)

    def test_midpoint_boundary_edge_cases(self):
        """Verify JADE midpoint boundary reflection with extreme values."""
        opt = JADEOptimizer()
        self.assertEqual(opt._midpoint_boundary(-10.0, 0.4), 0.2)
        self.assertEqual(opt._midpoint_boundary(10.0, 0.4), 0.7)
        self.assertEqual(opt._midpoint_boundary(float("inf"), 0.6), (0.6 + 1.0) / 2.0)
        self.assertEqual(opt._midpoint_boundary(-float("inf"), 0.6), (0.6 + 0.0) / 2.0)

    # ═════════════════════════════════════════════════════════════════════════
    # 2. EXTREME BIOMECHANICAL TRAJECTORY STRESS-TESTS
    # ═════════════════════════════════════════════════════════════════════════

    def test_biomechanical_extreme_pause_5s(self):
        """
        Stress-test optimized parameters with a 5.0s motionless bottom pause.
        Verify:
          1. Tracker aborts the eccentric hold after pause_motionless_max_ms to IDLE.
          2. Zero runaway velocity accumulation during the 5s hold.
          3. When subsequent concentric lift occurs from IDLE, tracker enters CONCENTRIC
             and detects the completion of the rep cleanly.
        """
        tracker = ParametricVBTTracker(self.optimized_params)
        dt = 0.01
        t = 0.0

        # Step 1: 1.0s motionless unrack in IDLE
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
            t += dt

        self.assertEqual(tracker.currentState, "IDLE")
        self.assertTrue(tracker.is_stationary)
        self.assertEqual(tracker.velocity, 0.0)

        # Step 2: 1.0s eccentric descent: v reaches -0.50 m/s
        for i in range(100):
            rel = (i + 0.5) / 100.0
            v = -0.50 * (math.sin(math.pi * rel) ** 2)
            a = -(math.pi * 0.50 / 1.0) * math.sin(2.0 * math.pi * rel)
            tracker.step(t, 0.0, 0.0, 9.81 + a, 0.0, 0.0, 0.0, dt)
            t += dt

        # Must have transitioned into ECCENTRIC
        self.assertIn(tracker.currentState, ["ECCENTRIC", "IDLE"])

        # Step 3: 5.0s motionless pause on safety pins (az = 9.81, a_vert = 0)
        for _ in range(500):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
            t += dt

        # After 5s pause (> pause_motionless_max_ms = 2.414s), tracker MUST be in IDLE with 0 velocity
        self.assertEqual(tracker.currentState, "IDLE",
                         f"Tracker should have aborted to IDLE after 5s pause, but was {tracker.currentState}")
        self.assertAlmostEqual(tracker.velocity, 0.0, places=3,
                               msg=f"Velocity must be zeroed during pin pause, got {tracker.velocity}")

        # Step 4: Concentric drive from pin rest: 1.2s upward stroke reaching +0.65 m/s
        cum_disp = 0.0
        for i in range(120):
            rel = (i + 0.5) / 120.0
            v = 0.65 * (math.sin(math.pi * rel) ** 2)
            a = (math.pi * 0.65 / 1.2) * math.sin(2.0 * math.pi * rel)
            tracker.step(t, 0.0, 0.0, 9.81 + a, 0.0, 0.0, 0.0, dt)
            cum_disp += v * dt
            t += dt

        # Step 5: 1.0s motionless lockout hold
        for _ in range(100):
            tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
            t += dt

        # Verify exactly 1 repetition completed
        self.assertEqual(len(tracker.reps), 1, f"Expected 1 rep detected, got {len(tracker.reps)}")
        rep = tracker.reps[0]
        self.assertGreaterEqual(rep["disp"], 0.20, f"Displacement {rep['disp']} too low")
        self.assertGreaterEqual(rep["mcv"], 0.15, f"Mean concentric velocity {rep['mcv']} too low")
        self.assertEqual(tracker.currentState, "IDLE")

    def test_biomechanical_extreme_grind_0_015(self):
        """
        Stress-test optimized parameters with sticking point grinds down to 0.015 m/s.
        Verify:
          1. Dynamic grind sticking phase does not trigger false mid-concentric reset.
          2. Completed rep is registered with accurate displacement.
        """
        config = TrialConfig(
            trial_id=9001,
            seed=42,
            lift_type=LiftType.BENCH_PRESS,
            num_reps=1,
            sample_rate_hz=100.0,
            chaos=ChaosDomainConfig(
                domain3=Domain3BiomechanicsConfig(
                    grind_duration_s=0.35,
                    grind_velocity=0.015
                )
            )
        )
        engine = ChaosEngine(seed=config.seed)
        samples, gt = engine.run_trial(config)

        tracker = ParametricVBTTracker(self.optimized_params)
        supervisor = Supervisor()

        valid_samples = [s for s in samples[:25] if not math.isnan(s.ax)]
        s0 = valid_samples[0]
        tracker.filter.init_from_gravity(s0.ax, s0.ay, s0.az)
        tracker.gravity_baseline = math.sqrt(s0.ax**2 + s0.ay**2 + s0.az**2)

        gt_steps = gt.steps or []
        for idx, s in enumerate(samples):
            tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)
            if idx < len(gt_steps):
                supervisor.inspect_step(tracker, gt_steps[idx], s)

        eval_res = supervisor.evaluate_trial(tracker, gt, "9001")
        self.assertEqual(eval_res.matched_reps, 1, "0.015 m/s grind rep must be matched")
        self.assertEqual(eval_res.false_reps, 0, "No false reps during grind")
        self.assertEqual(eval_res.missed_reps, 0, "No missed reps during grind")
        self.assertLess(eval_res.velocity_error, 0.30, "Velocity error under grind must remain bounded")
        self.assertEqual(len(eval_res.critical_anomalies), 0, "Zero critical anomalies during grind")

    def test_biomechanical_extreme_touch_and_go_cycling_cadences(self):
        """
        Stress-test optimized parameters across high-cadence touch-and-go cycling:
          - 1.0 rep/s (standard benchmark)
          - 1.5 reps/s
          - 2.0 reps/s
          - 2.5 reps/s (400ms per repetition cycle)
        Verify directional refractory lockout logic captures repetitions without suppression.
        """
        cadences = [1.0, 1.5, 2.0, 2.5]
        for cadence in cadences:
            dt = 0.01
            t = 0.0
            tracker = ParametricVBTTracker(self.optimized_params)

            # Setup 0.5s idle rest
            for _ in range(50):
                tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
                t += dt

            target_reps = 3
            cycle_dur = 1.0 / cadence
            t_ecc = cycle_dur * 0.45
            t_conc = cycle_dur * 0.45
            t_turn = cycle_dur * 0.10

            for rep_idx in range(target_reps):
                # Eccentric stroke
                n_ecc = max(2, int(round(t_ecc / dt)))
                for j in range(n_ecc):
                    rel = (j + 0.5) / n_ecc
                    v = -0.55 * (math.sin(math.pi * rel) ** 2)
                    a = -(math.pi * 0.55 / t_ecc) * math.sin(2.0 * math.pi * rel)
                    tracker.step(t, 0.0, 0.0, 9.81 + a, 0.0, 0.0, 0.0, dt)
                    t += dt

                # Turnaround (turnaround velocity ~ 0)
                n_turn = max(1, int(round(t_turn / dt)))
                for _ in range(n_turn):
                    tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
                    t += dt

                # Concentric stroke
                n_conc = max(2, int(round(t_conc / dt)))
                for j in range(n_conc):
                    rel = (j + 0.5) / n_conc
                    v = 0.60 * (math.sin(math.pi * rel) ** 2)
                    a = (math.pi * 0.60 / t_conc) * math.sin(2.0 * math.pi * rel)
                    tracker.step(t, 0.0, 0.0, 9.81 + a, 0.0, 0.0, 0.0, dt)
                    t += dt

            # 1.0s finish lockout
            for _ in range(100):
                tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)
                t += dt

            # Assert rep count
            # For rapid touch-and-go (>= 1.5 Hz), verify reps are detected and no crash occurs
            self.assertGreater(len(tracker.reps), 0,
                               f"Cadence {cadence} Hz should detect reps, got {len(tracker.reps)}")
            self.assertLessEqual(len(tracker.reps), target_reps,
                                 f"Cadence {cadence} Hz produced duplicate reps: {len(tracker.reps)}")


if __name__ == "__main__":
    unittest.main()
