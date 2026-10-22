"""
tests/test_adversarial_m4_challenge.py
Adversarial Stress Test Suite for Milestone 4 (R5) Failure Ingestion & Schema.
Written by Challenger M4-1 (EMPIRICAL CHALLENGER).

Tests:
1. Schema Validation (schema.py):
   - Missing required root sections
   - Out-of-bounds ranges
   - Inverted range bounds
   - Cross-field integrity checks (FLOOR_DROP reps == 0, etc.)
   - Invalid enums and corrupted primitive types
   - Canonical format fallback handling
2. Failure Ingestion Functional Tests (ingest_failure.py):
   - Priority-based root-cause extraction hierarchy
   - SHA-256 deduplication and key-order invariance
   - Automatic directory hierarchy creation
   - CLI execution and report scanning
3. Empirical Bug Demonstrations (ingest_failure.py):
   - Bug 1: Trajectory slice with < 50 samples writes duration_s < 0.5, crashing schema loader
   - Bug 2: Ingesting FLOOR_DROP with num_reps > 0 writes expected_reps > 0, crashing schema loader
   - Bug 3: Anomaly type containing '/' (e.g. NAN/INF_POISONING) creates subdirectories and illegal case_id
   - Bug 4: String-typed anomalies ignored by extract_primary_root_cause
   - Bug 5: FAILED_CONCENTRIC falls through to SQUAT category
"""

import os
import sys
import json
import shutil
import tempfile
import unittest
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.regression_catalog.schema import (
    RegressionCase,
    CaseMetadata,
    SimulationConfig,
    KinematicsProfile,
    ChaosFaultProfile,
    BootFaultConfig,
    ThermalFaultConfig,
    BiomechanicsFaultConfig,
    ConnectivityFaultConfig,
    GroundTruthExpectations,
    AcceptanceTolerances,
    LiftCategory,
    MountOrientationEnum,
    FSMPhaseEnum,
    ValidationError,
    to_canonical_lift_type,
)
from tests.regression_catalog.ingest_failure import (
    ingest_trial_evaluation,
    ingest_policy_trial_result,
    ingest_trajectory_slice,
    ingest_failure,
    scan_and_ingest_report_failures,
    extract_primary_root_cause,
    generate_case_id,
    determine_fault_domain,
    normalize_lift_category,
)
from tests.vbt_test_fixtures import VBTRegressionCaseValidator


class TestAdversarialSchemaValidation(unittest.TestCase):
    """Adversarial attacks against schema.py validation rules and error reporting."""

    def _get_valid_case_dict(self):
        return {
            "metadata": {
                "case_id": "ADV-001",
                "name": "Adversarial Base Case",
                "lift_type": "SQUAT",
                "author": "Challenger M4-1",
                "created_at": "2026-10-16T00:00:00Z",
                "description": "Baseline valid case for mutation attacks",
                "tags": ["test", "squat"],
                "version": "1.0.0"
            },
            "simulation_config": {
                "duration_s": 10.0,
                "sample_rate_hz": 100.0,
                "seed": 42,
                "kinematics": {
                    "rep_count": 3,
                    "stroke_m": 0.50,
                    "eccentric_duration_s": 1.2,
                    "concentric_duration_s": 1.0,
                    "pause_duration_s": 0.0,
                    "grind_velocity_mps": 0.0,
                    "grind_duration_s": 0.0,
                    "cadence_hz": 1.0,
                    "is_touch_and_go": False
                },
                "chaos_faults": {
                    "domain1_boot": {},
                    "domain2_thermal": {},
                    "domain3_biomechanics": {},
                    "domain4_connectivity": {}
                }
            },
            "ground_truth_expectations": {
                "expected_reps": 3,
                "true_displacement_range_m": [0.45, 0.55],
                "true_peak_velocity_range_mps": [0.50, 0.80],
                "true_mean_velocity_range_mps": [0.30, 0.50],
                "expected_fsm_states": ["IDLE", "ECCENTRIC", "CONCENTRIC", "LOCKOUT", "IDLE"],
                "min_concentric_duration_s": 0.20,
                "max_concentric_duration_s": 3.00
            },
            "acceptance_tolerances": {
                "max_false_reps": 0,
                "max_missed_reps": 0,
                "max_mean_velocity_error": 0.15,
                "max_peak_velocity_error_mps": 0.12,
                "max_displacement_error_m": 0.08,
                "max_residual_drift": 0.03,
                "min_objective_reward": 50.0,
                "forbidden_anomalies": []
            }
        }

    def test_baseline_case_is_valid(self):
        """Sanity check: base case dict passes without error."""
        case = RegressionCase.from_dict(self._get_valid_case_dict())
        self.assertEqual(case.metadata.case_id, "ADV-001")
        self.assertEqual(case.ground_truth_expectations.expected_reps, 3)

    # 1. Missing Root Sections
    def test_missing_metadata(self):
        d = self._get_valid_case_dict()
        del d["metadata"]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Missing required top-level object 'metadata'", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$")

    def test_missing_simulation_config(self):
        d = self._get_valid_case_dict()
        del d["simulation_config"]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Missing required top-level object 'simulation_config'", ctx.exception.message)

    def test_missing_ground_truth_expectations(self):
        d = self._get_valid_case_dict()
        del d["ground_truth_expectations"]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Missing required top-level object 'ground_truth_expectations'", ctx.exception.message)

    def test_missing_acceptance_tolerances(self):
        d = self._get_valid_case_dict()
        del d["acceptance_tolerances"]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Missing required top-level object 'acceptance_tolerances'", ctx.exception.message)

    # 2. Out-of-Bounds Range Checks
    def test_duration_out_of_bounds_negative(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["duration_s"] = -5.0
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be >= 0.5", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$.simulation_config.duration_s")

    def test_duration_out_of_bounds_excessive(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["duration_s"] = 10000.0
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be <= 7200.0", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$.simulation_config.duration_s")

    def test_rep_count_negative(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["kinematics"]["rep_count"] = -1
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be >= 0", ctx.exception.message)

    def test_rep_count_excessive(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["kinematics"]["rep_count"] = 51
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be <= 50", ctx.exception.message)

    def test_max_false_reps_non_zero_rejected(self):
        d = self._get_valid_case_dict()
        d["acceptance_tolerances"]["max_false_reps"] = 1
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be <= 0", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$.acceptance_tolerances.max_false_reps")

    def test_max_missed_reps_non_zero_rejected(self):
        d = self._get_valid_case_dict()
        d["acceptance_tolerances"]["max_missed_reps"] = 2
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be <= 0", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$.acceptance_tolerances.max_missed_reps")

    # 3. Inverted Ranges and Range Structure
    def test_inverted_displacement_range(self):
        d = self._get_valid_case_dict()
        d["ground_truth_expectations"]["true_displacement_range_m"] = [0.80, 0.20]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("min (0.8) cannot exceed max (0.2)", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$.ground_truth_expectations.true_displacement_range_m")

    def test_malformed_range_length_one(self):
        d = self._get_valid_case_dict()
        d["ground_truth_expectations"]["true_peak_velocity_range_mps"] = [0.50]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be [min, max] 2-element list", ctx.exception.message)

    def test_malformed_range_length_three(self):
        d = self._get_valid_case_dict()
        d["ground_truth_expectations"]["true_mean_velocity_range_mps"] = [0.1, 0.2, 0.3]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be [min, max] 2-element list", ctx.exception.message)

    # 4. Cross-Field Integrity Checks
    def test_floor_drop_with_non_zero_reps_rejected(self):
        d = self._get_valid_case_dict()
        d["metadata"]["lift_type"] = "FLOOR_DROP"
        d["ground_truth_expectations"]["expected_reps"] = 1
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must expect exactly 0 reps", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$.ground_truth_expectations.expected_reps")

    def test_aborted_descent_with_non_zero_reps_rejected(self):
        d = self._get_valid_case_dict()
        d["metadata"]["lift_type"] = "ABORTED_DESCENT"
        d["ground_truth_expectations"]["expected_reps"] = 2
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must expect exactly 0 reps", ctx.exception.message)

    def test_failed_concentric_with_non_zero_reps_rejected(self):
        d = self._get_valid_case_dict()
        d["metadata"]["lift_type"] = "FAILED_CONCENTRIC"
        d["ground_truth_expectations"]["expected_reps"] = 1
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must expect exactly 0 reps", ctx.exception.message)

    def test_rack_collision_with_non_zero_reps_rejected(self):
        d = self._get_valid_case_dict()
        d["metadata"]["lift_type"] = "RACK_COLLISION"
        d["ground_truth_expectations"]["expected_reps"] = 3
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must expect exactly 0 reps", ctx.exception.message)

    def test_kinematics_rep_count_mismatch_with_expected_reps(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["kinematics"]["rep_count"] = 3
        d["ground_truth_expectations"]["expected_reps"] = 5
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must match ground_truth_expectations.expected_reps (5)", ctx.exception.message)
        self.assertEqual(ctx.exception.path, "$.simulation_config.kinematics.rep_count")

    # 5. Invalid Enums and Type Corruptions
    def test_invalid_lift_type_enum(self):
        d = self._get_valid_case_dict()
        d["metadata"]["lift_type"] = "SUPER_SNATCH"
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Invalid enum value 'SUPER_SNATCH'", ctx.exception.message)

    def test_invalid_mounting_orientation_enum(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["chaos_faults"]["domain2_thermal"]["mounting_orientation"] = "UPSIDE_DOWN"
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Invalid enum value 'UPSIDE_DOWN'", ctx.exception.message)

    def test_invalid_fsm_phase_enum(self):
        d = self._get_valid_case_dict()
        d["ground_truth_expectations"]["expected_fsm_states"] = ["IDLE", "FLYING", "IDLE"]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Invalid enum value 'FLYING'", ctx.exception.message)

    def test_invalid_case_id_regex_with_spaces(self):
        d = self._get_valid_case_dict()
        d["metadata"]["case_id"] = "CASE WITH SPACES"
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("case_id must match regex", ctx.exception.message)

    def test_invalid_case_id_type_integer(self):
        d = self._get_valid_case_dict()
        d["metadata"]["case_id"] = 12345
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Expected type str, got int", ctx.exception.message)

    def test_invalid_created_at_not_iso(self):
        d = self._get_valid_case_dict()
        d["metadata"]["created_at"] = "yesterday at 3pm"
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("created_at must be valid ISO 8601 string", ctx.exception.message)

    def test_invalid_tags_type(self):
        d = self._get_valid_case_dict()
        d["metadata"]["tags"] = "not_a_list"
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Expected type list, got str", ctx.exception.message)

    def test_invalid_tag_item_type(self):
        d = self._get_valid_case_dict()
        d["metadata"]["tags"] = ["squat", 12345]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("Expected type str, got int", ctx.exception.message)

    def test_invalid_custom_euler_deg_length(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["chaos_faults"]["domain2_thermal"]["custom_euler_deg"] = [10.0, 20.0]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("must be [roll, pitch, yaw] triplet", ctx.exception.message)

    def test_invalid_ble_disconnect_window_inversion(self):
        d = self._get_valid_case_dict()
        d["simulation_config"]["chaos_faults"]["domain4_connectivity"]["ble_disconnect_window"] = [5.0, 2.0]
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_dict(d)
        self.assertIn("t_end (2.0) must be > t_start (5.0)", ctx.exception.message)

    def test_from_json_syntax_error(self):
        with self.assertRaises(ValidationError) as ctx:
            RegressionCase.from_json("invalid json syntax {")
        self.assertIn("Invalid JSON syntax", ctx.exception.message)

    # 6. Canonical Schema Fallback & Dual-Compatibility
    def test_canonical_schema_fallback(self):
        canonical_dict = {
            "case_id": "CANONICAL-TEST-01",
            "lift_type": "Bench",
            "ground_truth": {
                "reps": 2,
                "displacement_m": 0.38,
                "duration_s": 8.0,
                "peak_velocity_mps": 0.52,
                "mean_velocity_mps": 0.31
            },
            "tolerances": {
                "rep_count_error": 0,
                "max_velocity_error_mps": 0.05,
                "max_residual_drift_mps": 0.02
            }
        }
        case = RegressionCase.from_dict(canonical_dict)
        self.assertEqual(case.metadata.case_id, "CANONICAL-TEST-01")
        self.assertEqual(case.metadata.lift_type, LiftCategory.BENCH_PRESS)
        self.assertEqual(case.ground_truth_expectations.expected_reps, 2)
        exported = case.to_dict()
        is_valid, msg = VBTRegressionCaseValidator.validate_case(exported)
        self.assertTrue(is_valid, f"Exported dict failed canonical validation: {msg}")


class TestAdversarialFailureIngestion(unittest.TestCase):
    """Adversarial attacks against failure ingestion pipeline, deduplication, and file generation."""

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="vbt_ingest_test_")

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_root_cause_extraction_severity_hierarchy(self):
        anomalies_1 = [
            {"root_cause": "Sensor Noise", "anomaly_type": "HIGH_JITTER"},
            {"root_cause": "FSM Deadlock", "anomaly_type": "CONCENTRIC_FREEZE"},
            {"root_cause": "Threshold Mismatch", "anomaly_type": "EARLY_LOCKOUT"}
        ]
        rc, anom = extract_primary_root_cause(anomalies_1)
        self.assertEqual(rc, "FSM Deadlock")
        self.assertEqual(anom, "CONCENTRIC_FREEZE")

        anomalies_2 = [
            {"root_cause": "Sensor Noise", "anomaly_type": "HIGH_JITTER"},
            {"root_cause": "Numerical Drift", "anomaly_type": "RUNAWAY_VELOCITY"}
        ]
        rc, anom = extract_primary_root_cause(anomalies_2)
        self.assertEqual(rc, "Numerical Drift")
        self.assertEqual(anom, "RUNAWAY_VELOCITY")

        rc, anom = extract_primary_root_cause([])
        self.assertEqual(rc, "Threshold Mismatch")
        self.assertEqual(anom, "UNSPECIFIED_ANOMALY")

    def test_sha256_deduplication_exact_match(self):
        cfg = {
            "trial_id": "TRIAL-CHAOS-001",
            "lift_type": "SQUAT",
            "num_reps": 3,
            "duration_s": 12.0,
            "seed": 12345
        }
        eval_data = {
            "trial_id": "TRIAL-CHAOS-001",
            "expected_reps": 3,
            "matched_reps": 1,
            "false_reps": 0,
            "missed_reps": 2,
            "objective_reward": -25.0,
            "anomalies": [{"root_cause": "FSM Deadlock", "anomaly_type": "CONCENTRIC_DEADLOCK"}]
        }

        ok1, path1, res1 = ingest_trial_evaluation(cfg, eval_data, output_dir=self.test_dir)
        self.assertTrue(ok1)
        self.assertTrue(os.path.exists(path1))
        file_mtime1 = os.path.getmtime(path1)

        ok2, path2, res2 = ingest_trial_evaluation(cfg, eval_data, output_dir=self.test_dir, overwrite=False)
        self.assertFalse(ok2)
        self.assertEqual(path1, path2)
        self.assertEqual(res2.get("status"), "SKIPPED_DUPLICATE")
        file_mtime2 = os.path.getmtime(path2)
        self.assertEqual(file_mtime1, file_mtime2)

        ok3, path3, res3 = ingest_trial_evaluation(cfg, eval_data, output_dir=self.test_dir, overwrite=True)
        self.assertTrue(ok3)

    def test_sha256_case_id_invariance_under_dict_key_ordering(self):
        cfg_order_a = {"lift_type": "DEADLIFT", "num_reps": 1, "duration_s": 8.0, "seed": 999}
        cfg_order_b = {"seed": 999, "duration_s": 8.0, "lift_type": "DEADLIFT", "num_reps": 1}

        id_a = generate_case_id("deadlift", "LOCKOUT_GRIND", cfg_order_a)
        id_b = generate_case_id("deadlift", "LOCKOUT_GRIND", cfg_order_b)
        self.assertEqual(id_a, id_b, f"Case IDs differ under key reordering: {id_a} vs {id_b}")

    def test_directory_auto_creation_in_deeply_nested_path(self):
        deep_dir = os.path.join(self.test_dir, "nested_1", "nested_2", "custom_cases")
        self.assertFalse(os.path.exists(deep_dir))

        cfg = {"trial_id": "NESTED-01", "lift_type": "BENCH_PRESS", "num_reps": 2, "seed": 42}
        eval_data = {"expected_reps": 2, "anomalies": [{"root_cause": "Sensor Noise", "anomaly_type": "I2C_BURST"}]}

        ok, path, _ = ingest_trial_evaluation(cfg, eval_data, output_dir=deep_dir)
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(path))
        self.assertTrue(os.path.exists(os.path.join(deep_dir, "bench")))

    def test_ingest_policy_trial_result(self):
        trial_res = {
            "trial_id": "OPT-POLICY-FAIL-44",
            "lift_type": "SQUAT",
            "expected_reps": 3,
            "matched_reps": 0,
            "false_reps": 0,
            "missed_reps": 3,
            "mean_vel_error": 0.45,
            "residual_drift": 0.22,
            "objective_reward": -150.0,
            "anomalies": ["CONCENTRIC_DEADLOCK"]
        }
        ok, path, res = ingest_policy_trial_result(trial_res, output_dir=self.test_dir)
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(path))
        loaded = RegressionCase.from_file(path)
        self.assertEqual(loaded.ground_truth_expectations.expected_reps, 3)

    def test_ingest_trajectory_slice_standard_length(self):
        """Standard length trajectory slice (>= 50 samples) ingests cleanly."""
        mock_sample = {
            "t": 1.0, "ax": 0.0, "ay": 0.0, "az": 9.81,
            "gx": 0.0, "gy": 0.0, "gz": 0.0, "dt": 0.01
        }
        slice_obj = {
            "case_id": "traj_slice_impact_01",
            "primary_anomaly": {"anomaly_type": "FLOOR_DROP_IMPACT", "root_cause": "Extreme Biomechanics"},
            "pre_buffer": [mock_sample] * 20,
            "event_buffer": [mock_sample] * 20,
            "post_buffer": [mock_sample] * 20
        }
        ok, path, res = ingest_trajectory_slice(slice_obj, lift_type="FLOOR_DROP", output_dir=self.test_dir)
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(path))
        loaded = RegressionCase.from_file(path)
        self.assertEqual(loaded.metadata.case_id, "traj_slice_impact_01")
        self.assertEqual(len(loaded.telemetry_samples), 60)

    def test_scan_and_ingest_report_failures_with_cap(self):
        report_data = {
            "timestamp": "2026-10-16T02:00:00Z",
            "trials": [
                {
                    "trial_id": "TRIAL-PASS-01",
                    "passed": True,
                    "objective_reward": 250.0,
                    "config": {"lift_type": "SQUAT", "num_reps": 3, "seed": 101},
                    "evaluation": {"expected_reps": 3, "matched_reps": 3, "anomalies": []}
                },
                {
                    "trial_id": "TRIAL-FAIL-D1-01",
                    "passed": False,
                    "objective_reward": -50.0,
                    "config": {"lift_type": "SQUAT", "num_reps": 3, "seed": 102, "chaos": {"domain1": {"boot_motion": True}}},
                    "evaluation": {"expected_reps": 3, "matched_reps": 0, "anomalies": [{"root_cause": "FSM Deadlock", "anomaly_type": "BOOT_CORRUPT"}]}
                },
                {
                    "trial_id": "TRIAL-FAIL-D3-01",
                    "passed": False,
                    "objective_reward": -80.0,
                    "config": {"lift_type": "BENCH_PRESS", "num_reps": 2, "seed": 103, "chaos": {"domain3": {"touch_and_go": True}}},
                    "evaluation": {"expected_reps": 2, "matched_reps": 1, "anomalies": [{"root_cause": "Threshold Mismatch", "anomaly_type": "MISSED_REP"}]}
                }
            ]
        }
        rep_path = os.path.join(self.test_dir, "batch_report.json")
        with open(rep_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f)

        ingested = scan_and_ingest_report_failures(rep_path, output_dir=self.test_dir, max_cases_per_domain=2)
        self.assertEqual(len(ingested), 2)
        for p in ingested:
            self.assertTrue(os.path.exists(p))

        re_ingested = scan_and_ingest_report_failures(rep_path, output_dir=self.test_dir, max_cases_per_domain=2)
        self.assertEqual(len(re_ingested), 0)


class TestEmpiricalBugReproductions(unittest.TestCase):
    """
    Direct empirical evidence of bugs identified by Challenger M4-1.
    These tests demonstrate specific edge cases where ingest_failure.py
    writes schema-invalid files or corrupts metadata.
    """

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="vbt_bug_repro_")

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_bug_1_short_trajectory_slice_creates_unparseable_case(self):
        """
        Regression Test 1: When a trajectory slice has fewer than 50 samples,
        ingest_trajectory_slice clamps duration_s >= 0.5s so the case parses cleanly.
        """
        mock_sample = {
            "t": 1.0, "ax": 0.0, "ay": 0.0, "az": 9.81,
            "gx": 0.0, "gy": 0.0, "gz": 0.0, "dt": 0.01
        }
        slice_obj = {
            "case_id": "short_slice_01",
            "primary_anomaly": "HIGH_JITTER",
            "pre_buffer": [mock_sample] * 5,
            "event_buffer": [mock_sample] * 10,
            "post_buffer": [mock_sample] * 5
        }
        ok, path, _ = ingest_trajectory_slice(slice_obj, lift_type="General", output_dir=self.test_dir)
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(path))

        # Verified regression invariant: file loads without error and duration is clamped to 0.5s
        loaded = RegressionCase.from_file(path)
        self.assertGreaterEqual(loaded.simulation_config.duration_s, 0.5)
        self.assertEqual(loaded.simulation_config.duration_s, 0.5)

    def test_bug_2_floor_drop_num_reps_creates_invalid_case(self):
        """
        Regression Test 2: When ingesting a trial with lift_type='FLOOR_DROP',
        build_regression_case enforces reps=0 so the case conforms to schema.
        """
        cfg = {"lift_type": "FLOOR_DROP", "num_reps": 1, "duration_s": 5.0}
        eval_data = {
            "expected_reps": 1,
            "anomalies": [{"root_cause": "Threshold Mismatch", "anomaly_type": "BAR_DROP"}]
        }
        ok, path, _ = ingest_trial_evaluation(cfg, eval_data, output_dir=self.test_dir)
        self.assertTrue(ok)

        # Verified regression invariant: edge cases enforce expected_reps = 0 and load cleanly
        loaded = RegressionCase.from_file(path)
        self.assertEqual(loaded.ground_truth_expectations.expected_reps, 0)

    def test_bug_3_anomaly_name_with_slash_causes_path_and_regex_failure(self):
        """
        Regression Test 3: When anomaly_type contains a slash (e.g. 'NAN/INF_POISONING'),
        generate_case_id sanitizes slashes into underscores and avoids nested directory errors.
        """
        cfg = {"lift_type": "SQUAT", "num_reps": 3, "duration_s": 5.0}
        eval_data = {
            "expected_reps": 3,
            "anomalies": [{"root_cause": "Sensor Noise", "anomaly_type": "NAN/INF_POISONING"}]
        }
        ok, path, _ = ingest_trial_evaluation(cfg, eval_data, output_dir=self.test_dir)
        self.assertTrue(ok)

        # Verified regression invariant: slash is sanitized, file path and case_id are valid
        self.assertIn("fail_squat_nan_inf_poisoning", path)
        loaded = RegressionCase.from_file(path)
        self.assertNotIn("/", loaded.metadata.case_id)
        self.assertIn("nan_inf_poisoning", loaded.metadata.case_id)

    def test_bug_4_string_anomaly_ignored_in_root_cause_extraction(self):
        """
        Regression Test 4: extract_primary_root_cause parses string anomalies and correctly
        extracts root cause priority ('FSM Deadlock').
        """
        rc, anom = extract_primary_root_cause(["FSM Deadlock: CONCENTRIC_DEADLOCK"])
        self.assertEqual(rc, "FSM Deadlock")
        self.assertEqual(anom, "FSM Deadlock: CONCENTRIC_DEADLOCK")

    def test_bug_5_failed_concentric_falls_through_to_squat(self):
        """
        Regression Test 5: build_regression_case maps FAILED_CONCENTRIC to LiftCategory.FAILED_CONCENTRIC.
        """
        cfg = {"lift_type": "FAILED_CONCENTRIC", "num_reps": 1, "duration_s": 5.0}
        eval_data = {
            "expected_reps": 1,
            "anomalies": [{"root_cause": "Threshold Mismatch", "anomaly_type": "STICKING_POINT"}]
        }
        ok, path, _ = ingest_trial_evaluation(cfg, eval_data, output_dir=self.test_dir)
        self.assertTrue(ok)
        loaded = RegressionCase.from_file(path)
        self.assertEqual(loaded.metadata.lift_type, LiftCategory.FAILED_CONCENTRIC)


class TestAdversarialCLIExecution(unittest.TestCase):
    """Adversarial CLI stress tests via subprocess."""

    def test_cli_help(self):
        cmd = [sys.executable, "-m", "tests.regression_catalog.ingest_failure", "--help"]
        res = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
        self.assertEqual(res.returncode, 0)
        self.assertIn("VBT Milestone 4 Continual Learning Failure Ingestion Pipeline", res.stdout)
        self.assertIn("--scan-report", res.stdout)
        self.assertIn("--output-dir", res.stdout)

    def test_cli_scan_report_execution(self):
        with tempfile.TemporaryDirectory(prefix="vbt_cli_test_") as tmp_dir:
            report_data = {
                "trials": [
                    {
                        "trial_id": "CLI-FAIL-01",
                        "passed": False,
                        "objective_reward": -10.0,
                        "config": {"lift_type": "DEADLIFT", "num_reps": 1, "seed": 777},
                        "evaluation": {"expected_reps": 1, "matched_reps": 0, "anomalies": [{"root_cause": "Numerical Drift", "anomaly_type": "RUNAWAY_VELOCITY"}]}
                    }
                ]
            }
            rep_file = os.path.join(tmp_dir, "cli_report.json")
            with open(rep_file, "w", encoding="utf-8") as f:
                json.dump(report_data, f)

            out_catalog = os.path.join(tmp_dir, "cases")
            cmd = [
                sys.executable, "-m", "tests.regression_catalog.ingest_failure",
                "--scan-report", rep_file,
                "--output-dir", out_catalog
            ]
            res = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
            self.assertEqual(res.returncode, 0)
            self.assertIn("Ingested 1 failure cases", res.stdout)
            self.assertTrue(os.path.exists(os.path.join(out_catalog, "deadlift")))


if __name__ == "__main__":
    unittest.main()
