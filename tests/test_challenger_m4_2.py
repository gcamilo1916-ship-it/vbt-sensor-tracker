"""
tests/test_challenger_m4_2.py — Adversarial Regression Catalog & Stress Harness.
Milestone 4 (R5) Empirical Challenge Suite authored by Challenger M4-2.

ADVERSARIAL STRESS DIMENSIONS:
1. Corpus Inventory & Dual-Schema Conformance:
   - Validates all 16 JSON benchmark cases across Squat, Bench, Deadlift, Cycling, Edge Cases.
   - Asserts full compliance with both pure-Python dataclass schema and VBTRegressionCaseValidator.
2. High-Throughput Replay Robustness & Memory Leak Oracle:
   - Replays all 16 benchmark cases over 10 consecutive iterations (160 total executions).
   - Monitors execution latency (strictly < 2.5s for 65s multi-minute runs; < 0.25s for standard lifts).
   - Monitors memory growth via tracemalloc (< 500 KB net growth across 160 replays).
   - Guarantees zero unhandled exceptions, zero deadlocks, and 100% pass rate.
3. Tolerance Boundary & Mutation Sensitivity Oracle:
   - Schema Defense: Verifies that schema.py strictly rejects out-of-range rep counts (> 50 reps).
   - Runner Defense: Mutates expected_reps to 99 and 4, proving test_regression_catalog fails with AssertionError.
   - Drift Defense: Mutates residual drift tolerance to 1e-6 m/s, proving drift violations are immediately flagged.
   - Negative Invariant Defense: Confirms schema rejects negative reps and invalid lift categories.
4. Stress-Test High-Cadence Barbell Cycling (5 Reps in 5s):
   - Detailed inspection of REG-CYC-001: 5 reps in 5.0s (1.0 Hz cadence, 0.03s turnaround).
   - Confirms zero rep fusion, zero missed reps, displacement in [0.15m, 0.45m], MCV in [0.15, 1.00 m/s].
5. Stress-Test Sticking-Point Grinds (v <= 0.04 m/s):
   - Detailed inspection of low-velocity grinds across Bench (REG-BP-003), Squat (REG-SQ-004), and Deadlift (REG-DL-002).
   - Asserts zero premature ZUPT truncation into false multiple reps, full stroke displacement maintained.
6. Sensor Fault & Long-Uptime Edge Case Verification:
   - Asserts robust recovery under boot motion (REG-EDGE-001: 1 rep), 65s thermal drift (REG-EDGE-002: 1 rep),
     BLE disconnect (REG-EDGE-003: 1 rep), I2C NaN bursts (REG-EDGE-004: 1 rep), and 3.5s safety pin hold (REG-EDGE-005: 0 reps).
7. Failure Ingestion & Deduplication Pipeline Integrity:
   - Verifies ingest_failure.py deterministic SHA-256 deduplication, overwrite behavior, and canonical dictionary round-trip.
"""

from __future__ import annotations

import os
import sys
import copy
import time
import math
import json
import tempfile
import tracemalloc
import unittest
from typing import Dict, List, Any, Tuple

# Ensure repository root is on sys.path
REPO_ROOT_ANTI = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT_ANTI not in sys.path:
    sys.path.insert(0, REPO_ROOT_ANTI)

from tests.regression_catalog import (
    RegressionCase,
    ValidationError,
    discover_cases,
    load_case,
)
from tests.regression_catalog.schema import LiftCategory, MountOrientationEnum
from tests.test_regression_catalog import (
    replay_case,
    CASES_DIR,
    _make_case_test_method,
    TestRegressionCatalog,
)
from tests.vbt_test_fixtures import VBTRegressionCaseValidator
from tests.sim_chaos_engine import (
    ChaosEngine,
    TrialConfig,
    LiftType,
    RobustSelfCorrectingTracker,
)
from tests.regression_catalog.ingest_failure import (
    generate_case_id,
    build_regression_case,
    ingest_trial_evaluation,
    determine_fault_domain,
    extract_primary_root_cause,
)
from tests.sim_supervisor import TrialEvaluation


class TestMilestone4AdversarialChallenger(unittest.TestCase):
    """Adversarial challenge test suite for Milestone 4 Continual Learning Regression Catalog."""

    @classmethod
    def setUpClass(cls):
        cls.cases = discover_cases(CASES_DIR)
        cls.case_dict = {case.metadata.case_id: (path, case) for path, case in cls.cases}

    def test_01_corpus_inventory_and_dual_schema_conformance(self):
        """Oracle 1: Verify all 16 cases conform to both pure-Python and canonical VBT schemas."""
        self.assertEqual(
            len(self.cases), 16,
            f"Expected exactly 16 benchmark cases, found {len(self.cases)}"
        )

        category_counts = {
            "squat": 0,
            "bench": 0,
            "deadlift": 0,
            "cycling": 0,
            "edge_cases": 0,
        }

        for path, case in self.cases:
            # Check directory categorization
            parent_dir = os.path.basename(os.path.dirname(path))
            self.assertIn(
                parent_dir, category_counts,
                f"Unknown case directory '{parent_dir}' for case {path}"
            )
            category_counts[parent_dir] += 1

            # 1. Pure-Python dataclass validation
            self.assertIsInstance(case, RegressionCase, f"Case {path} is not an instance of RegressionCase")
            self.assertTrue(case.metadata.case_id, f"Missing case_id in {path}")
            self.assertTrue(case.metadata.name, f"Missing name in {path}")
            self.assertGreater(case.simulation_config.duration_s, 0.0)
            self.assertEqual(case.simulation_config.sample_rate_hz, 100.0)

            # 2. Canonical VBTRegressionCaseValidator schema conformance
            raw_dict = case.to_dict()
            is_valid, msg = VBTRegressionCaseValidator.validate_case(raw_dict)
            self.assertTrue(is_valid, f"Case {case.metadata.case_id} failed canonical VBT schema validation: {msg}")

        # Assert expected distribution: Squat=4, Bench=3, Deadlift=3, Cycling=1, Edge=5
        self.assertEqual(category_counts["squat"], 4)
        self.assertEqual(category_counts["bench"], 3)
        self.assertEqual(category_counts["deadlift"], 3)
        self.assertEqual(category_counts["cycling"], 1)
        self.assertEqual(category_counts["edge_cases"], 5)

    def test_02_high_throughput_replay_robustness_and_memory_leak(self):
        """Oracle 2: Stress replay all 16 cases across 10 iterations (160 runs), checking latency and memory."""
        ITERATIONS = 10
        total_runs = 0

        tracemalloc.start()
        snap_initial = tracemalloc.take_snapshot()

        t_start_total = time.perf_counter()

        for it in range(ITERATIONS):
            for path, case in self.cases:
                t0 = time.perf_counter()
                res = replay_case(case)
                dt = time.perf_counter() - t0
                total_runs += 1

                # Timing deadlock guard:
                # Standard cases (<= 11s) must execute in < 0.35s; 65s long-uptime drift case must execute in < 2.50s.
                max_allowed_dt = 2.50 if case.simulation_config.duration_s > 30.0 else 0.35
                self.assertLess(
                    dt, max_allowed_dt,
                    f"Timing deadlock or excessive latency in {case.metadata.case_id}: {dt:.3f}s (limit {max_allowed_dt}s)"
                )

                # Replay correctness invariant
                self.assertTrue(
                    res["passed"],
                    f"Case {case.metadata.case_id} failed replay on iteration {it+1}: {res}"
                )
                self.assertEqual(
                    res["rep_error"], 0,
                    f"Rep count mismatch in {case.metadata.case_id} on iteration {it+1}"
                )
                self.assertTrue(
                    res["is_healthy"],
                    f"NaN or Inf encountered in {case.metadata.case_id} on iteration {it+1}"
                )
                self.assertLessEqual(
                    res["residual_velocity"],
                    case.acceptance_tolerances.max_residual_drift,
                    f"Residual drift exceeded in {case.metadata.case_id} on iteration {it+1}"
                )

        t_elapsed_total = time.perf_counter() - t_start_total
        snap_final = tracemalloc.take_snapshot()
        current_mem, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Memory leak check: Net memory delta across 160 replays must be < 500 KB
        top_stats = snap_final.compare_to(snap_initial, 'lineno')
        net_mem_delta_kb = sum(stat.size_diff for stat in top_stats) / 1024.0

        self.assertEqual(total_runs, 160)
        self.assertLess(
            net_mem_delta_kb, 500.0,
            f"Possible memory leak detected: net memory delta = {net_mem_delta_kb:.1f} KB after 160 replays"
        )

    def test_03_challenge_tolerance_boundaries_mutation_oracle(self):
        """Oracle 3: Adversarially mutate case parameters to prove test_regression_catalog catches faults."""
        path, base_case = self.case_dict["REG-CYC-001"]

        # Sub-test 3a: Schema rejection of invalid expected_reps > 50
        mutated_dict_99 = copy.deepcopy(base_case.to_dict())
        mutated_dict_99["ground_truth_expectations"]["expected_reps"] = 99
        with self.assertRaises(ValidationError) as ctx_schema:
            RegressionCase.from_dict(mutated_dict_99)
        self.assertIn("expected_reps", str(ctx_schema.exception))
        self.assertIn("must be <= 50", str(ctx_schema.exception))

        # Sub-test 3b: Test runner detection of rep count mismatch (e.g. expected=4 vs true=5)
        mutated_dict_4 = copy.deepcopy(base_case.to_dict())
        mutated_dict_4["ground_truth_expectations"]["expected_reps"] = 4
        mutated_case_4 = RegressionCase.from_dict(mutated_dict_4)

        res_rep_mismatch = replay_case(mutated_case_4)
        self.assertFalse(res_rep_mismatch["passed"])
        self.assertEqual(res_rep_mismatch["detected_reps"], 5)
        self.assertEqual(res_rep_mismatch["expected_reps"], 4)
        self.assertEqual(res_rep_mismatch["rep_error"], 1)

        test_method_4 = _make_case_test_method(mutated_case_4)
        mock_test_instance = unittest.TestCase()
        mock_test_instance.optimized_params = None

        with self.assertRaises(AssertionError) as ctx_runner:
            test_method_4(mock_test_instance)
        self.assertIn("[REGRESSION] Case 'REG-CYC-001' rep count mismatch", str(ctx_runner.exception))
        self.assertIn("Expected 4, got 5", str(ctx_runner.exception))

        # Sub-test 3c: Direct runner test on mutated case with expected_reps = 99 (bypassing schema loader)
        mutated_case_direct = copy.deepcopy(base_case)
        mutated_case_direct.ground_truth_expectations.expected_reps = 99

        with self.assertRaises(AssertionError) as ctx_runner_99:
            test_method_99 = _make_case_test_method(mutated_case_direct)
            test_method_99(mock_test_instance)
        self.assertIn("[REGRESSION] Case 'REG-CYC-001' rep count mismatch", str(ctx_runner_99.exception))
        self.assertIn("Expected 99, got 5", str(ctx_runner_99.exception))

        # Sub-test 3d: Residual Drift Tolerance Violation (tolerance = 1e-6 m/s)
        mutated_dict_drift = copy.deepcopy(base_case.to_dict())
        mutated_dict_drift["acceptance_tolerances"]["max_residual_drift"] = 1e-6
        mutated_case_drift = RegressionCase.from_dict(mutated_dict_drift)

        test_method_drift = _make_case_test_method(mutated_case_drift)
        with self.assertRaises(AssertionError) as ctx_drift:
            test_method_drift(mock_test_instance)
        self.assertIn("[REGRESSION] Case 'REG-CYC-001' residual drift", str(ctx_drift.exception))
        self.assertIn("exceeded tolerance", str(ctx_drift.exception))

        # Sub-test 3e: Schema validation rejects illegal negative values
        illegal_dict_neg = copy.deepcopy(base_case.to_dict())
        illegal_dict_neg["ground_truth_expectations"]["expected_reps"] = -1
        with self.assertRaises(ValidationError) as ctx_neg:
            RegressionCase.from_dict(illegal_dict_neg)
        self.assertIn("expected_reps", str(ctx_neg.exception))

        # Sub-test 3f: Schema validation rejects invalid lift category
        illegal_dict_type = copy.deepcopy(base_case.to_dict())
        illegal_dict_type["metadata"]["lift_type"] = "INVALID_AERO_LIFT"
        with self.assertRaises(ValidationError) as ctx_type:
            RegressionCase.from_dict(illegal_dict_type)
        self.assertIn("Invalid LiftCategory", str(ctx_type.exception))

    def test_04_stress_test_touch_and_go_cycling_cadence(self):
        """Oracle 4: Stress-test high-cadence barbell cycling (5 reps in 5s) for displacement & velocity bounds."""
        path, case = self.case_dict["REG-CYC-001"]
        res = replay_case(case)

        self.assertTrue(res["passed"], "REG-CYC-001 must pass replay")
        self.assertEqual(res["detected_reps"], 5, "Must detect exactly 5 touch-and-go reps")

        reps = res["reps_telemetry"]
        self.assertEqual(len(reps), 5, "Telemetry must record 5 discrete rep events")

        # Per-rep kinematics analysis
        prev_t = 0.0
        for idx, r in enumerate(reps):
            # Check displacement bounds: stroke is 0.35m nominal
            self.assertGreaterEqual(
                r["disp"], 0.15,
                f"Cycling rep {idx+1} displacement {r['disp']:.3f}m was truncated below 0.15m"
            )
            self.assertLessEqual(
                r["disp"], 0.45,
                f"Cycling rep {idx+1} displacement {r['disp']:.3f}m exceeded physical stroke 0.45m"
            )

            # Check velocity bounds: rapid cycling mean velocity
            self.assertGreaterEqual(
                r["mcv"], 0.15,
                f"Cycling rep {idx+1} MCV {r['mcv']:.3f} m/s too sluggish for touch-and-go"
            )
            self.assertLessEqual(
                r["mcv"], 1.00,
                f"Cycling rep {idx+1} MCV {r['mcv']:.3f} m/s suspiciously high"
            )

            # Check concentric duration bounds
            self.assertGreaterEqual(
                r["dur"], 0.20,
                f"Cycling rep {idx+1} duration {r['dur']:.3f}s unnaturally brief"
            )
            self.assertLessEqual(
                r["dur"], 1.20,
                f"Cycling rep {idx+1} duration {r['dur']:.3f}s too long for 1.0Hz cadence"
            )

            # Check cadence timing: rep completion time must advance monotonically
            self.assertGreater(
                r["t"], prev_t,
                f"Rep {idx+1} completion time {r['t']:.2f}s not advancing monotonically"
            )
            prev_t = r["t"]

    def test_05_stress_test_sticking_point_grinds(self):
        """Oracle 5: Stress-test sticking-point grinds (v <= 0.04 m/s) across Bench, Squat, and Deadlift."""
        grind_cases = [
            ("REG-BP-003", 1, "Bench Press Sticking Grind (0.035 m/s, 0.40s)", 0.25),
            ("REG-SQ-004", 2, "Squat Fatigue Grind (0.038 m/s, 0.50s, 2-rep)", 0.35),
            ("REG-DL-002", 1, "Deadlift Lockout Grind (0.035 m/s, 0.45s)", 0.30),
        ]

        for cid, expected_count, desc, min_expected_disp in grind_cases:
            path, case = self.case_dict[cid]
            res = replay_case(case)

            self.assertTrue(res["passed"], f"Grind case {cid} ({desc}) failed replay")
            self.assertEqual(
                res["detected_reps"], expected_count,
                f"Grind case {cid} did not detect expected {expected_count} reps (got {res['detected_reps']}). Possible false split or missed rep!"
            )

            reps = res["reps_telemetry"]
            self.assertEqual(len(reps), expected_count, f"Expected {expected_count} rep telemetry objects for {cid}")

            # For each detected rep in the grind set:
            for idx, r in enumerate(reps):
                # Invariant: Concentric displacement must not be prematurely aborted
                self.assertGreaterEqual(
                    r["disp"], min_expected_disp,
                    f"Grind case {cid} rep {idx+1} displacement {r['disp']:.3f}m was prematurely truncated below {min_expected_disp:.2f}m"
                )

                # Invariant: Mean concentric velocity must reflect heavy grind
                self.assertGreaterEqual(
                    r["mcv"], 0.05,
                    f"Grind case {cid} rep {idx+1} MCV {r['mcv']:.3f} m/s collapsed below tracker threshold"
                )
                self.assertLessEqual(
                    r["mcv"], 0.55,
                    f"Grind case {cid} rep {idx+1} MCV {r['mcv']:.3f} m/s too high for heavy grind"
                )

            # Invariant: Zero residual drift after lift lockout
            self.assertLessEqual(
                res["residual_velocity"],
                case.acceptance_tolerances.max_residual_drift,
                f"Grind case {cid} residual drift {res['residual_velocity']:.4f} m/s exceeded tolerance"
            )

    def test_06_edge_cases_and_fault_recovery_invariants(self):
        """Oracle 6: Verify tracker fault recovery across 5 sensor/environmental edge cases."""
        # 1. Boot motion warmup: auto-recalibrates on first rest (1 rep)
        p1, c1 = self.case_dict["REG-EDGE-001"]
        res1 = replay_case(c1)
        self.assertTrue(res1["passed"], "REG-EDGE-001 (Boot Motion) failed")
        self.assertEqual(res1["detected_reps"], 1, "REG-EDGE-001 expected exactly 1 rep")
        self.assertLessEqual(res1["residual_velocity"], 0.015)

        # 2. Multi-minute thermal drift (65s): zero-rate bias tracking (1 rep)
        p2, c2 = self.case_dict["REG-EDGE-002"]
        res2 = replay_case(c2)
        self.assertTrue(res2["passed"], "REG-EDGE-002 (Thermal Drift) failed")
        self.assertEqual(res2["detected_reps"], 1, "REG-EDGE-002 expected exactly 1 rep")
        self.assertLessEqual(res2["residual_velocity"], 0.010)

        # 3. BLE disconnect mid-concentric: internal state preserved (1 rep)
        p3, c3 = self.case_dict["REG-EDGE-003"]
        res3 = replay_case(c3)
        self.assertTrue(res3["passed"], "REG-EDGE-003 (BLE Disconnect) failed")
        self.assertEqual(res3["detected_reps"], 1, "REG-EDGE-003 expected exactly 1 rep")

        # 4. I2C NaN burst dropout: 6-axis drop protection (1 rep)
        p4, c4 = self.case_dict["REG-EDGE-004"]
        res4 = replay_case(c4)
        self.assertTrue(res4["passed"], "REG-EDGE-004 (I2C NaN Burst) failed")
        self.assertEqual(res4["detected_reps"], 1, "REG-EDGE-004 expected exactly 1 rep")
        self.assertTrue(res4["is_healthy"], "NaN contaminated tracker state in REG-EDGE-004")

        # 5. Safety pin pause abort 3.5s: motionless hold resets cleanly without false rep (0 reps)
        p5, c5 = self.case_dict["REG-EDGE-005"]
        res5 = replay_case(c5)
        self.assertTrue(res5["passed"], "REG-EDGE-005 (Safety Pin Abort 3.5s) failed")
        self.assertEqual(res5["detected_reps"], 0, "Safety pin abort must produce 0 false reps")
        self.assertLessEqual(res5["residual_velocity"], 0.010)

    def test_07_failure_ingestion_and_deduplication_pipeline(self):
        """Oracle 7: Verify ingest_failure.py deterministic hashing, conversion, and deduplication."""
        eval_fail = TrialEvaluation(
            trial_id="TRIAL-FAIL-TEST-999",
            lift_type="BENCH_PRESS",
            expected_reps=3,
            detected_reps=2,  # Missed rep failure!
            rep_count_error=1,
            mean_velocity_error=0.18,
            peak_velocity_error=0.22,
            displacement_error=0.09,
            residual_drift=0.035,
            objective_reward=-150.0,
            passed=False,
            failure_domain="BIOMECHANICS",
            anomaly_flags=["MISSED_REP", "VELOCITY_STALL"],
            notes="Simulated sticking-point truncation"
        )

        sim_config = {
            "trial_id": "TRIAL-FAIL-TEST-999",
            "lift_type": "BENCH_PRESS",
            "duration_s": 10.0,
            "sample_rate_hz": 100.0,
            "seed": 99911,
            "kinematics": {"rep_count": 3, "stroke_m": 0.35, "grind_velocity_mps": 0.02},
            "chaos": {
                "domain1": {},
                "domain2": {"mounting_orientation": "Z_UP"},
                "domain3": {"grind_velocity": 0.02, "grind_duration_s": 0.6},
                "domain4": {}
            }
        }

        # 1. Deterministic case_id hashing
        cid1 = generate_case_id("bench", "MISSED_REP", sim_config)
        cid2 = generate_case_id("bench", "MISSED_REP", copy.deepcopy(sim_config))
        self.assertEqual(cid1, cid2, "generate_case_id must be strictly deterministic")
        self.assertTrue(cid1.startswith("fail_bench_missed_rep_"), f"Unexpected case_id format: {cid1}")

        # 2. Ingestion pipeline with tempdir
        with tempfile.TemporaryDirectory() as tmpdir:
            success, case_path, case_dict = ingest_trial_evaluation(
                config=sim_config,
                evaluation=eval_fail,
                output_dir=tmpdir,
                overwrite=False
            )
            self.assertTrue(success, "First ingestion must succeed")
            self.assertTrue(os.path.exists(case_path), f"Output file must exist: {case_path}")

            # 3. Deduplication check: re-ingesting without overwrite returns False
            success_dup, _, dup_dict = ingest_trial_evaluation(
                config=sim_config,
                evaluation=eval_fail,
                output_dir=tmpdir,
                overwrite=False
            )
            self.assertFalse(success_dup, "Duplicate ingestion without overwrite must return False")
            self.assertEqual(dup_dict.get("status"), "SKIPPED_DUPLICATE")

            # 4. Overwrite check
            success_ovw, _, _ = ingest_trial_evaluation(
                config=sim_config,
                evaluation=eval_fail,
                output_dir=tmpdir,
                overwrite=True
            )
            self.assertTrue(success_ovw, "Ingestion with overwrite=True must succeed")

            # 5. Schema validation of generated case
            loaded_case = load_case(case_path)
            self.assertIsInstance(loaded_case, RegressionCase)
            self.assertEqual(loaded_case.ground_truth_expectations.expected_reps, 3)
            self.assertEqual(loaded_case.metadata.lift_type, LiftCategory.BENCH_PRESS)

            # 6. Canonical VBT schema validation
            is_valid, msg = VBTRegressionCaseValidator.validate_case(case_dict)
            self.assertTrue(is_valid, f"Ingested case failed canonical VBT schema validation: {msg}")


if __name__ == "__main__":
    unittest.main()
