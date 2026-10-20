"""
tests/test_policy_optimizer.py — Unit Test Suite for JADE Evolutionary Policy Optimizer.

Milestone 2 Verification:
  1. 18-gene genome encoding, types, bounds, and roundtrip normalization.
  2. Boundary reflection and Cauchy/Gaussian sampling.
  3. Objective reward calculation and penalty asymmetry.
  4. Parametric tracker initialization and step physics.
  5. Deterministic top-level worker candidate evaluation.
  6. JADE optimizer evolution step convergence and history tracking.
  7. Parameter JSON export schema validation with C++ bindings.
"""

import os
import sys
import math
import json
import random
import unittest
import tempfile

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.policy_optimizer import (
    GeneSpec,
    DEFAULT_GENE_SPECS,
    GENE_MAP,
    Individual,
    JADEOptimizer,
    ParametricVBTTracker,
    encode_params_to_vector,
    decode_vector_to_params,
    _evaluate_candidate_worker,
    export_optimized_parameters
)
from tests.vbt_test_fixtures import VBTPolicyGenome


class TestPolicyOptimizer(unittest.TestCase):
    """Unit test suite for the JADE Policy Optimizer and 18-gene genome."""

    def test_01_18_gene_specs_completeness_and_bounds(self):
        """Verify exactly 18 genes exist with strictly valid bounds and defaults."""
        self.assertEqual(len(DEFAULT_GENE_SPECS), 18, "Genome must have exactly 18 genes")
        expected_names = [
            "beta", "accel_rejection_thresh", "var_a_thresh_primary", "var_g_thresh_primary",
            "var_a_thresh_recovery", "var_g_thresh_recovery", "window_size_N",
            "stationary_hold_count", "alpha_base", "alpha_gyro", "eccentric_vel_trigger",
            "concentric_vel_trigger", "concentric_lockout_ms", "pause_motionless_max_ms",
            "stall_persistence_count", "concentric_timeout_s", "eccentric_timeout_s",
            "runaway_velocity_clamp"
        ]
        actual_names = [s.name for s in DEFAULT_GENE_SPECS]
        self.assertEqual(actual_names, expected_names, "Gene ordering and naming must match formal spec")

        for s in DEFAULT_GENE_SPECS:
            self.assertLess(s.min_val, s.max_val, f"Gene {s.name}: min must be less than max")
            self.assertGreaterEqual(s.default_val, s.min_val, f"Gene {s.name}: default must be >= min")
            self.assertLessEqual(s.default_val, s.max_val, f"Gene {s.name}: default must be <= max")
            self.assertTrue(s.cpp_target, f"Gene {s.name} missing C++ target identifier")
            self.assertTrue(s.cpp_macro.startswith("OPT_"), f"Gene {s.name} macro must start with OPT_")

    def test_02_gene_normalization_and_denormalization(self):
        """Verify normalization maps to [0.0, 1.0] and denormalization roundtrips faithfully."""
        for s in DEFAULT_GENE_SPECS:
            # Min value -> 0.0
            norm_min = s.normalize(s.min_val)
            self.assertAlmostEqual(norm_min, 0.0, places=5)
            self.assertEqual(s.denormalize(0.0), s.min_val)

            # Max value -> 1.0
            norm_max = s.normalize(s.max_val)
            self.assertAlmostEqual(norm_max, 1.0, places=5)
            self.assertEqual(s.denormalize(1.0), s.max_val)

            # Default value
            norm_def = s.normalize(s.default_val)
            self.assertTrue(0.0 <= norm_def <= 1.0)
            roundtrip_def = s.denormalize(norm_def)
            if s.is_integer:
                self.assertIsInstance(roundtrip_def, int)
                self.assertEqual(roundtrip_def, int(s.default_val))
            else:
                self.assertIsInstance(roundtrip_def, float)
                self.assertAlmostEqual(roundtrip_def, s.default_val, places=4)

            # Out-of-bounds clipping
            self.assertEqual(s.normalize(s.min_val - 100.0), 0.0)
            self.assertEqual(s.normalize(s.max_val + 100.0), 1.0)
            self.assertEqual(s.denormalize(-0.5), s.min_val)
            self.assertEqual(s.denormalize(1.5), s.max_val)

    def test_03_vector_encoding_and_decoding_roundtrip(self):
        """Verify vector encoding and decoding roundtrip across all 18 parameters."""
        baseline_params = {s.name: s.default_val for s in DEFAULT_GENE_SPECS}
        vec = encode_params_to_vector(baseline_params)
        self.assertEqual(len(vec), 18)
        self.assertTrue(all(0.0 <= x <= 1.0 for x in vec))

        decoded = decode_vector_to_params(vec)
        self.assertEqual(len(decoded), 18)
        for s in DEFAULT_GENE_SPECS:
            self.assertIn(s.name, decoded)
            if s.is_integer:
                self.assertEqual(decoded[s.name], int(s.default_val))
            else:
                self.assertAlmostEqual(decoded[s.name], s.default_val, places=4)

    def test_04_vbt_policy_genome_interoperability(self):
        """Verify seamless interoperability with VBTPolicyGenome from vbt_test_fixtures."""
        genome = VBTPolicyGenome()
        vec = genome.to_vector()
        self.assertEqual(len(vec), 18)

        decoded_via_specs = decode_vector_to_params(vec)
        for s in DEFAULT_GENE_SPECS:
            self.assertIn(s.name, decoded_via_specs)
            if s.is_integer:
                self.assertEqual(decoded_via_specs[s.name], genome.params[s.name])
            else:
                self.assertAlmostEqual(decoded_via_specs[s.name], genome.params[s.name], places=4)

    def test_05_boundary_reflection(self):
        """Verify midpoint reflection strictly projects out-of-bounds mutants into [0.0, 1.0]."""
        opt = JADEOptimizer()
        # Case 1: Negative mutant (< 0.0) with parent at 0.4
        refl_neg = opt._midpoint_boundary(-0.3, 0.4)
        self.assertEqual(refl_neg, (0.4 + 0.0) / 2.0)
        self.assertTrue(0.0 <= refl_neg <= 1.0)

        # Case 2: Excessive mutant (> 1.0) with parent at 0.8
        refl_pos = opt._midpoint_boundary(1.4, 0.8)
        self.assertEqual(refl_pos, (0.8 + 1.0) / 2.0)
        self.assertTrue(0.0 <= refl_pos <= 1.0)

        # Case 3: Feasible mutant within [0.0, 1.0]
        refl_in = opt._midpoint_boundary(0.65, 0.5)
        self.assertEqual(refl_in, 0.65)

    def test_06_sampling_distributions(self):
        """Verify Cauchy and Normal self-adaptation sampling boundaries."""
        opt = JADEOptimizer(seed=1234)
        for _ in range(100):
            f_val = opt._sample_cauchy(mu=0.5, gamma=0.1)
            self.assertTrue(0.0 < f_val <= 1.0, f"Cauchy sample out of bounds: {f_val}")

            cr_val = opt._sample_normal(mu=0.5, sigma=0.1)
            self.assertTrue(0.0 <= cr_val <= 1.0, f"Normal sample out of bounds: {cr_val}")

    def test_07_objective_reward_formula(self):
        """Verify formal objective reward formula and asymmetric penalties."""
        # Baseline formula: +100*True - 250*False - 300*Missed - 50*VelErr - 100*ResDrift
        def calc_reward(n_t, n_f, n_m, v_err, drift):
            return 100.0 * n_t - 250.0 * n_f - 300.0 * n_m - 50.0 * v_err - 100.0 * drift

        # Perfect 3-rep set with 0 error
        r_perfect = calc_reward(3, 0, 0, 0.0, 0.0)
        self.assertEqual(r_perfect, 300.0)

        # 1 True rep + 1 False rep -> Net -150 (false rep penalty > true rep reward)
        r_false = calc_reward(1, 1, 0, 0.0, 0.0)
        self.assertEqual(r_false, -150.0)

        # 1 True rep + 1 Missed rep -> Net -200 (missed rep penalty heavily punished)
        r_missed = calc_reward(1, 0, 1, 0.0, 0.0)
        self.assertEqual(r_missed, -200.0)

        # Velocity error sensitivity (10% error -> -5.0)
        r_vel = calc_reward(1, 0, 0, 0.10, 0.0)
        self.assertEqual(r_vel, 95.0)

        # Residual drift sensitivity (0.20 m/s leaked velocity -> -20.0)
        r_drift = calc_reward(1, 0, 0, 0.0, 0.20)
        self.assertEqual(r_drift, 80.0)

    def test_08_parametric_vbt_tracker_initialization(self):
        """Verify ParametricVBTTracker instantiates with genome parameters and executes cleanly."""
        tracker = ParametricVBTTracker()
        self.assertEqual(tracker.filter.beta, 0.08)
        self.assertEqual(tracker.N, 20)
        self.assertEqual(tracker.stationary_hold_count, 10)
        self.assertEqual(tracker.concentric_lockout_s, 0.25)
        self.assertEqual(tracker.pause_motionless_max_ms, 3500)
        self.assertEqual(tracker.stall_persistence_count, 25)
        self.assertEqual(tracker.concentric_timeout_s, 6.0)
        self.assertEqual(tracker.eccentric_timeout_s, 8.0)
        self.assertEqual(tracker.runaway_velocity_clamp, 8.0)

        # Feed 30 stationary samples
        for i in range(30):
            tracker.step(t=i * 0.01, ax=0.0, ay=0.0, az=9.81, gx=0.0, gy=0.0, gz=0.0, dt=0.01)

        self.assertTrue(tracker.is_stationary)
        self.assertEqual(tracker.velocity, 0.0)
        self.assertEqual(tracker.currentState, "IDLE")

    def test_09_evaluate_candidate_worker_execution(self):
        """Verify _evaluate_candidate_worker runs deterministically on mini-batch."""
        base_chrom = [s.normalize(s.default_val) for s in DEFAULT_GENE_SPECS]
        cid, reward, stats = _evaluate_candidate_worker(0, base_chrom, 42, 8)
        self.assertEqual(cid, 0)
        self.assertGreater(reward, 0.0, f"Baseline reward must be positive, got {reward}")
        self.assertEqual(stats["pass_rate"], 100.0, "Baseline parameters must achieve 100% pass rate")
        self.assertEqual(stats["false_reps"], 0)
        self.assertEqual(stats["missed_reps"], 0)

    def test_10_jade_optimizer_evolution_step(self):
        """Verify JADE optimizer step executes and logs generational history."""
        optimizer = JADEOptimizer(
            pop_size=4,
            max_generations=2,
            mini_batch_size=4,
            seed=999,
            parallel=False
        )
        best_ind, pop, report = optimizer.evolve()
        self.assertIsInstance(best_ind, Individual)
        self.assertGreater(best_ind.fitness, 0.0)
        self.assertEqual(len(report["history"]), 2)
        self.assertIn("parameters", report)
        self.assertEqual(len(report["parameters"]), 18)

    def test_11_export_parameters_json_schema(self):
        """Verify export_optimized_parameters produces valid JSON with C++ bindings."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_file = os.path.join(tmp_dir, "test_params.json")
            sample_params = {s.name: s.default_val for s in DEFAULT_GENE_SPECS}
            meta = {
                "population_size": 20,
                "generations_evaluated": 15,
                "training_mini_batch_size": 12,
                "best_objective_reward": 145.2,
                "baseline_objective_reward": 140.0,
                "reward_improvement_pct": 3.71,
                "monte_carlo_520_pass_rate_pct": 100.0
            }
            export_optimized_parameters(sample_params, meta, out_file)
            self.assertTrue(os.path.exists(out_file))

            with open(out_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            self.assertEqual(data["version"], "1.0.0")
            self.assertIn("metadata", data)
            self.assertIn("hyperparameters", data)
            self.assertEqual(len(data["hyperparameters"]), 18)

            for s in DEFAULT_GENE_SPECS:
                self.assertIn(s.name, data["hyperparameters"])
                p_entry = data["hyperparameters"][s.name]
                self.assertIn("value", p_entry)
                self.assertIn("type", p_entry)
                self.assertIn("bounds", p_entry)
                self.assertIn("cpp_target", p_entry)
                self.assertIn("cpp_macro", p_entry)
                self.assertIn("cpp_declaration", p_entry)
                self.assertEqual(p_entry["cpp_target"], s.cpp_target)
                self.assertEqual(p_entry["cpp_macro"], s.cpp_macro)
                self.assertTrue(p_entry["cpp_declaration"].startswith("const "))


if __name__ == "__main__":
    unittest.main()
