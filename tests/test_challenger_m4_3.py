"""
tests/test_challenger_m4_3.py — Adversarial Verification Suite for Milestone 4 Iteration 2.
Empirical validation of Failure Ingestion Pipeline and Schema Validation:
  1. Short trajectory slice ingestion duration clamping (10-sample, 25-sample, edge-cases) and schema reloadability.
  2. CLI argument parser and flag aliases (--file, --lift-type, --dry-run).
  3. Cross-platform / Windows filename sanitization against forbidden characters (colons, slashes, brackets, pipes, etc.).
  4. Programmatic API and package-level export contracts.
"""

from __future__ import annotations

import os
import sys
import json
import tempfile
import subprocess
import unittest
from typing import Dict, Any

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tests.regression_catalog.schema import RegressionCase, ValidationError
from tests.regression_catalog.ingest_failure import (
    ingest_trajectory_slice,
    ingest_from_json,
    generate_case_id,
    create_cli_parser,
)
from tests.vbt_test_fixtures import VBTRegressionCaseValidator


def make_mock_sample(t_sec: float) -> Dict[str, Any]:
    """Generate a valid mock telemetry sample dict."""
    return {
        "t": round(t_sec, 3),
        "ax": 0.05,
        "ay": 0.02,
        "az": 9.81,
        "gx": 0.001,
        "gy": 0.002,
        "gz": -0.001,
        "dt": 0.01,
    }


class TestChallengerM43FailureIngestion(unittest.TestCase):
    """Empirical challenger test suite for M4-2 failure ingestion & schema fixes."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="vbt_challenger_m4_3_")

    def tearDown(self):
        # Clean up temp directory
        if os.path.exists(self.temp_dir):
            import shutil
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    # =========================================================================
    # Objective 1: Short Trajectory Slice Ingestion & Schema Reloadability
    # =========================================================================

    def test_01_short_slice_10_samples_clamped_and_reloadable(self):
        """Verify a 10-sample slice (0.10s) clamps to duration_s=0.5 and reloads cleanly."""
        slice_10 = {
            "case_id": "test_slice_10_samples",
            "primary_anomaly": "HIGH_FREQUENCY_JITTER",
            "pre_buffer": [make_mock_sample(0.01 * i) for i in range(3)],
            "event_buffer": [make_mock_sample(0.01 * (3 + i)) for i in range(4)],
            "post_buffer": [make_mock_sample(0.01 * (7 + i)) for i in range(3)],
        }
        success, case_path, case_dict = ingest_trajectory_slice(
            slice_10, lift_type="SQUAT", output_dir=self.temp_dir
        )
        self.assertTrue(success, "ingest_trajectory_slice should return success=True")
        self.assertTrue(os.path.exists(case_path), f"Output file must exist: {case_path}")

        # Check raw json on disk
        with open(case_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
        self.assertEqual(raw_data["simulation_config"]["duration_s"], 0.5)

        # Reload with RegressionCase.from_file
        loaded_case = RegressionCase.from_file(case_path)
        self.assertEqual(loaded_case.simulation_config.duration_s, 0.5)
        self.assertEqual(len(loaded_case.telemetry_samples), 10)

        # Canonical validator check
        is_valid, err_msg = VBTRegressionCaseValidator.validate_case(loaded_case.to_dict())
        self.assertTrue(is_valid, f"Canonical validator failed on 10-sample slice: {err_msg}")

    def test_02_short_slice_25_samples_clamped_and_reloadable(self):
        """Verify a 25-sample slice (0.25s) clamps to duration_s=0.5 and reloads cleanly."""
        slice_25 = {
            "case_id": "test_slice_25_samples",
            "primary_anomaly": "TRANSIENT_SPIKE",
            "pre_buffer": [make_mock_sample(0.01 * i) for i in range(8)],
            "event_buffer": [make_mock_sample(0.01 * (8 + i)) for i in range(9)],
            "post_buffer": [make_mock_sample(0.01 * (17 + i)) for i in range(8)],
        }
        success, case_path, case_dict = ingest_trajectory_slice(
            slice_25, lift_type="BENCH_PRESS", output_dir=self.temp_dir
        )
        self.assertTrue(success, "ingest_trajectory_slice should return success=True")
        self.assertTrue(os.path.exists(case_path), f"Output file must exist: {case_path}")

        # Reload with RegressionCase.from_file
        loaded_case = RegressionCase.from_file(case_path)
        self.assertEqual(loaded_case.simulation_config.duration_s, 0.5)
        self.assertEqual(len(loaded_case.telemetry_samples), 25)

        # Canonical validator check
        is_valid, err_msg = VBTRegressionCaseValidator.validate_case(loaded_case.to_dict())
        self.assertTrue(is_valid, f"Canonical validator failed on 25-sample slice: {err_msg}")

    def test_03_slice_boundary_clamping_variations(self):
        """Test slices of 0, 1, 49, 50, and 75 samples to verify clamping boundary."""
        test_counts = [0, 1, 49, 50, 75]
        for count in test_counts:
            sl = {
                "case_id": f"test_slice_{count}_samples",
                "primary_anomaly": f"BOUNDARY_{count}",
                "pre_buffer": [make_mock_sample(0.01 * i) for i in range(count)],
                "event_buffer": [],
                "post_buffer": [],
            }
            success, case_path, _ = ingest_trajectory_slice(
                sl, lift_type="DEADLIFT", output_dir=self.temp_dir
            )
            self.assertTrue(success)
            loaded = RegressionCase.from_file(case_path)
            expected_dur = 5.0 if count == 0 else max(0.5, round(count * 0.01, 3))
            self.assertEqual(
                loaded.simulation_config.duration_s,
                expected_dur,
                f"Mismatch for count={count}: expected {expected_dur}, got {loaded.simulation_config.duration_s}"
            )
            self.assertGreaterEqual(loaded.simulation_config.duration_s, 0.5)

    def test_04_ingest_from_json_with_trajectory_slice(self):
        """Verify ingest_from_json handles short trajectory slices in dict and file forms."""
        slice_data = {
            "case_id": "test_from_json_short_slice",
            "primary_anomaly": "MICRO_PAUSE",
            "lift_type": "TOUCH_AND_GO_CYCLING",
            "pre_buffer": [make_mock_sample(0.01 * i) for i in range(12)],
            "event_buffer": [],
            "post_buffer": [],
        }
        # Ingest directly from dictionary
        res_path = ingest_from_json(slice_data, output_dir=self.temp_dir)
        self.assertIsNotNone(res_path)
        self.assertTrue(os.path.exists(res_path))
        loaded = RegressionCase.from_file(res_path)
        self.assertEqual(loaded.simulation_config.duration_s, 0.5)

        # Ingest from saved JSON file
        json_file = os.path.join(self.temp_dir, "slice_input.json")
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(slice_data, f)
        res_file_path = ingest_from_json(json_file, output_dir=self.temp_dir, overwrite=True)
        self.assertIsNotNone(res_file_path)
        loaded_file = RegressionCase.from_file(res_file_path)
        self.assertEqual(loaded_file.simulation_config.duration_s, 0.5)

    # =========================================================================
    # Objective 2: CLI Flags Verification
    # =========================================================================

    def test_05_cli_parser_recognizes_file_and_lift_type_flags(self):
        """Verify argparse recognizes --file and --lift-type flags without error."""
        parser = create_cli_parser()
        args1 = parser.parse_args(["--file", "cases/dummy.json"])
        self.assertEqual(args1.scan_report, "cases/dummy.json")

        args2 = parser.parse_args(["--lift-type", "SQUAT"])
        self.assertEqual(args2.lift, "SQUAT")

        args3 = parser.parse_args(["--file", "cases/dummy.json", "--lift-type", "DEADLIFT", "--dry-run"])
        self.assertEqual(args3.scan_report, "cases/dummy.json")
        self.assertEqual(args3.lift, "DEADLIFT")
        self.assertTrue(args3.dry_run)

    def test_06_cli_execution_with_file_flag_dry_run(self):
        """Subprocess execution of CLI with --file and --dry-run."""
        sample_case_path = os.path.join(
            REPO_ROOT, "tests", "regression_catalog", "cases", "squat", "case_squat_01_competition_3rep.json"
        )
        self.assertTrue(os.path.exists(sample_case_path), f"Sample case path must exist: {sample_case_path}")

        cmd = [
            sys.executable,
            "-m", "tests.regression_catalog.ingest_failure",
            "--file", sample_case_path,
            "--dry-run"
        ]
        result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
        self.assertEqual(
            result.returncode, 0,
            f"CLI failed with returncode {result.returncode}. stderr: {result.stderr}, stdout: {result.stdout}"
        )
        self.assertIn("Dry-run: validated existing regression case", result.stdout)
        self.assertNotIn("unrecognized arguments", result.stderr)
        self.assertNotIn("RuntimeWarning", result.stderr)

    def test_07_cli_execution_with_lift_type_flag(self):
        """Subprocess execution of CLI with --lift-type SQUAT."""
        cmd = [
            sys.executable,
            "-m", "tests.regression_catalog.ingest_failure",
            "--lift-type", "SQUAT",
            "--dry-run"
        ]
        result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
        self.assertEqual(
            result.returncode, 0,
            f"CLI failed with returncode {result.returncode}. stderr: {result.stderr}, stdout: {result.stdout}"
        )
        self.assertIn("VBT Failure Ingestion Pipeline initialized successfully", result.stdout)
        self.assertNotIn("unrecognized arguments", result.stderr)
        self.assertNotIn("RuntimeWarning", result.stderr)

    def test_08_cli_execution_with_all_lift_types(self):
        """Subprocess execution across all allowed --lift-type choices."""
        allowed_lifts = ["SQUAT", "BENCH_PRESS", "DEADLIFT", "TOUCH_AND_GO_CYCLING"]
        for lt in allowed_lifts:
            cmd = [
                sys.executable,
                "-m", "tests.regression_catalog.ingest_failure",
                "--lift-type", lt
            ]
            result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertNotIn("unrecognized arguments", result.stderr)

    # =========================================================================
    # Objective 3: Windows Filename Safety
    # =========================================================================

    def test_09_generate_case_id_sanitizes_colons_slashes_special_chars(self):
        """Verify generate_case_id strips invalid filesystem characters."""
        adversarial_anomalies = [
            "DRIFT: +0.30m/s2 [Extreme]",
            "FSM/DEADLOCK: Phase 2 -> 3 ??",
            "SENSOR_NOISE: ~10% (std_dev = 0.50m/s^2) *FATAL*",
            'QUOTED: "Illegal <Name> | Pipe"',
            ":::+++///\\\\",
        ]
        for anom in adversarial_anomalies:
            cid = generate_case_id("squat", anom, {"param": 123})
            self.assertRegex(
                cid, r"^[A-Za-z0-9_\-]+$",
                f"Generated case ID '{cid}' from '{anom}' contains invalid characters!"
            )
            # Ensure none of the Windows forbidden characters exist
            for bad_char in [":", "/", "\\", "*", "?", '"', "<", ">", "|", "+"]:
                self.assertNotIn(bad_char, cid, f"Forbidden char '{bad_char}' found in cid '{cid}'")

    def test_10_ingest_trajectory_slice_with_extreme_anomaly_filename(self):
        """Pass anomaly description with colons and special characters to ingest_trajectory_slice."""
        extreme_anomaly_str = "DRIFT: +0.30m/s2 [Extreme]"
        slice_extreme = {
            "case_id": "fail_extreme_drift_test",
            "primary_anomaly": extreme_anomaly_str,
            "pre_buffer": [make_mock_sample(0.01 * i) for i in range(5)],
            "event_buffer": [make_mock_sample(0.05 + 0.01 * i) for i in range(5)],
            "post_buffer": [make_mock_sample(0.10 + 0.01 * i) for i in range(5)],
        }
        # This must write the file without OSError
        try:
            success, case_path, case_dict = ingest_trajectory_slice(
                slice_extreme, lift_type="SQUAT", output_dir=self.temp_dir
            )
        except OSError as e:
            self.fail(f"ingest_trajectory_slice raised OSError on anomaly '{extreme_anomaly_str}': {e}")

        self.assertTrue(success)
        self.assertTrue(os.path.exists(case_path))
        loaded = RegressionCase.from_file(case_path)
        self.assertEqual(loaded.metadata.case_id, "fail_extreme_drift_test")
        self.assertEqual(loaded.simulation_config.duration_s, 0.5)

    def test_11_ingest_trajectory_slice_auto_case_id_with_special_chars(self):
        """When case_id is omitted or generated from anomaly, verify no OSError."""
        special_anomaly = "DEADLOCK: state=CONCENTRIC -> LOCKOUT (delta_v < 0.02 m/s | stuck)"
        slice_no_id = {
            "primary_anomaly": special_anomaly,
            "pre_buffer": [make_mock_sample(0.01 * i) for i in range(10)],
            "event_buffer": [],
            "post_buffer": [],
        }
        try:
            success, case_path, _ = ingest_trajectory_slice(
                slice_no_id, lift_type="DEADLIFT", output_dir=self.temp_dir
            )
        except OSError as e:
            self.fail(f"ingest_trajectory_slice failed on auto-case-id with OSError: {e}")

        self.assertTrue(success)
        self.assertTrue(os.path.exists(case_path))
        loaded = RegressionCase.from_file(case_path)
        self.assertEqual(loaded.simulation_config.duration_s, 0.5)

    # =========================================================================
    # Objective 4: Programmatic API Export Verification
    # =========================================================================

    def test_12_package_level_and_module_level_exports(self):
        """Verify ingest_from_json is callable from both module and package levels."""
        from tests.regression_catalog.ingest_failure import ingest_from_json as fn1
        self.assertTrue(callable(fn1))

        from tests.regression_catalog import ingest_from_json as fn2
        self.assertTrue(callable(fn2))
        self.assertIs(fn1, fn2)


if __name__ == "__main__":
    unittest.main()
