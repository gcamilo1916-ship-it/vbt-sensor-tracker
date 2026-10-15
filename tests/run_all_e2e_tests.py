"""
Unified E2E Test Suite Runner for Eros VBT — Apple visionOS Spatial Glass Overhaul
Supports filtering by Tier (1, 2, 3, 4, browser, all) and Milestone (M1..M6, all).
Generates detailed terminal reports and structured JSON summaries.
"""

import sys
import os
import time
import json
import argparse
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

MILESTONE_FEATURE_MAP = {
    "M1": ["f01", "f02", "f03", "b01", "b02", "b03", "p13", "r1"],
    "M2": ["f04", "f05", "f06", "f07", "b04", "b05", "b06", "b07", "p05", "p14", "r2"],
    "M3": ["f08", "f09", "b08", "b09", "p02", "p06", "p15", "r3"],
    "M4": ["f10", "f11", "b10", "b11", "p01", "p04", "p09", "r4"],
    "M5": ["f12", "f13", "f14", "b12", "b13", "b14", "p03", "p07", "p08", "p10", "p11", "p12", "p16", "w01", "w02", "w03", "w04", "w05", "w06", "w07", "w08", "r5"],
    "M6": ["f16", "b16", "chrome"],
    "E2E": ["f15", "b15", "overhaul", "s01", "s02", "s03", "s04", "s05"]
}

def load_test_suites(tier_filter="all", milestone_filter="all"):
    """Discover and filter test cases based on tier and milestone."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    modules_to_load = []
    if tier_filter in ["1", "all"]:
        from tests import test_tier1_features
        modules_to_load.append(("Tier 1", test_tier1_features))
    if tier_filter in ["2", "all"]:
        from tests import test_tier2_boundaries
        modules_to_load.append(("Tier 2", test_tier2_boundaries))
    if tier_filter in ["3", "all"]:
        from tests import test_tier3_pairwise
        modules_to_load.append(("Tier 3", test_tier3_pairwise))
    if tier_filter in ["4", "all"]:
        from tests import test_tier4_workload
        modules_to_load.append(("Tier 4", test_tier4_workload))
    if tier_filter in ["browser", "all"]:
        from tests import test_browser_headless
        modules_to_load.append(("Browser", test_browser_headless))
    if tier_filter in ["overhaul", "all"]:
        from tests import test_overhaul_e2e
        modules_to_load.append(("Overhaul", test_overhaul_e2e))

    milestone_keys = MILESTONE_FEATURE_MAP.get(milestone_filter.upper())

    tier_suites = {}
    for tier_name, mod in modules_to_load:
        mod_suite = loader.loadTestsFromModule(mod)
        filtered_tests = []
        for test in _flatten_suite(mod_suite):
            if milestone_keys is not None:
                method_name = test._testMethodName.lower()
                if method_name.startswith("test_r"):
                    req_key = method_name.split("_")[1]  # "r1", "r2", etc.
                    if req_key not in milestone_keys:
                        continue
                elif method_name.startswith("test_s0"):
                    if not any(k in ["e2e", "tier4", "s01", "s02", "s03", "s04", "s05"] for k in milestone_keys):
                        continue
                else:
                    if not any(k in method_name for k in milestone_keys):
                        continue
            filtered_tests.append(test)

        sub_suite = unittest.TestSuite(filtered_tests)
        tier_suites[tier_name] = sub_suite
        suite.addTest(sub_suite)

    return suite, tier_suites

def _flatten_suite(suite):
    """Recursively flatten test suite into individual TestCase instances."""
    tests = []
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            tests.extend(_flatten_suite(item))
        else:
            tests.append(item)
    return tests

class CustomTestResult(unittest.TestResult):
    def __init__(self, verbosity=1):
        super().__init__()
        self.verbosity = verbosity
        self.test_records = []
        self._start_time = None

    def startTest(self, test):
        super().startTest(test)
        self._start_time = time.time()
        if self.verbosity >= 2:
            sys.stdout.write(f"  {test.id()} ... ")
            sys.stdout.flush()

    def addSuccess(self, test):
        super().addSuccess(test)
        elapsed = time.time() - self._start_time
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "PASS",
            "duration": round(elapsed, 4),
            "doc": test.shortDescription()
        })
        if self.verbosity >= 2:
            sys.stdout.write(f"[PASS] ({elapsed:.3f}s)\n")

    def addFailure(self, test, err):
        super().addFailure(test, err)
        elapsed = time.time() - self._start_time
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "FAIL",
            "duration": round(elapsed, 4),
            "doc": test.shortDescription(),
            "error": self._exc_info_to_string(err, test)
        })
        if self.verbosity >= 2:
            sys.stdout.write(f"[FAIL] ({elapsed:.3f}s)\n")

    def addError(self, test, err):
        super().addError(test, err)
        elapsed = time.time() - self._start_time
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "ERROR",
            "duration": round(elapsed, 4),
            "doc": test.shortDescription(),
            "error": self._exc_info_to_string(err, test)
        })
        if self.verbosity >= 2:
            sys.stdout.write(f"[ERROR] ({elapsed:.3f}s)\n")

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        elapsed = time.time() - self._start_time
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "SKIP",
            "duration": round(elapsed, 4),
            "doc": test.shortDescription(),
            "reason": reason
        })
        if self.verbosity >= 2:
            sys.stdout.write(f"[SKIP] {reason}\n")

def run_tests(tier="all", milestone="all", verbosity=1, json_report_path=None):
    print("=" * 78)
    print("  EROS VBT — AUTOMATED E2E TEST SUITE (Apple visionOS Spatial Glass)")
    print(f"  Configuration: Tier={tier.upper()} | Milestone={milestone.upper()}")
    print("=" * 78)

    start_clock = time.time()
    suite, tier_suites = load_test_suites(tier_filter=tier, milestone_filter=milestone)
    total_loaded = suite.countTestCases()
    print(f"  Discovered {total_loaded} test cases across requested test tiers.\n")

    # Capture test IDs prior to suite.run() because Python 3.12+ clears test instances to None
    tier_test_map = {}
    for t_name, t_suite in tier_suites.items():
        tier_test_map[t_name] = [t.id() for t in _flatten_suite(t_suite)]

    result = CustomTestResult(verbosity=verbosity)
    suite.run(result)
    total_time = time.time() - start_clock

    # Compute breakdown per tier
    tier_summary = {}
    for t_name, t_ids in tier_test_map.items():
        t_count = len(t_ids)
        t_ids_set = set(t_ids)
        t_passes = sum(1 for r in result.test_records if r["id"] in t_ids_set and r["status"] == "PASS")
        t_fails = sum(1 for r in result.test_records if r["id"] in t_ids_set and r["status"] in ["FAIL", "ERROR"])
        t_skips = sum(1 for r in result.test_records if r["id"] in t_ids_set and r["status"] == "SKIP")
        tier_summary[t_name] = {
            "total": t_count,
            "passed": t_passes,
            "failed": t_fails,
            "skipped": t_skips,
            "status": "PASS" if t_fails == 0 and t_count > 0 else ("FAIL" if t_fails > 0 else "N/A")
        }

    # Print Tier Breakdown Table
    print("-" * 78)
    print("  TIER BREAKDOWN REPORT")
    print("-" * 78)
    print(f"  {'Tier':<16} | {'Total':<8} | {'Passed':<8} | {'Failed':<8} | {'Status':<8}")
    print(f"  {'-'*16}-+-{'-'*8}-+-{'-'*8}-+-{'-'*8}-+-{'-'*8}")
    for t_name, data in tier_summary.items():
        status_color = "[PASS]" if data["status"] == "PASS" else ("[FAIL]" if data["status"] == "FAIL" else "[N/A]")
        print(f"  {t_name:<16} | {data['total']:<8} | {data['passed']:<8} | {data['failed']:<8} | {status_color:<8}")

    # Print Failures if any
    if result.failures or result.errors:
        print("\n" + "=" * 78)
        print("  FAILURES & ESCALATED IMPLEMENTATION DEFECTS")
        print("=" * 78)
        for idx, (test, err) in enumerate(result.failures + result.errors, start=1):
            doc = test.shortDescription() or test.id()
            print(f"\n[{idx}] {test.id()}")
            print(f"    Description: {doc}")
            first_err_line = err.strip().splitlines()[-1] if err.strip() else "Assertion failed"
            print(f"    Defect Trace: {first_err_line}")

    # Final Summary Dashboard
    total_passed = len(result.test_records) - len(result.failures) - len(result.errors) - len(result.skipped)
    pass_pct = (total_passed / total_loaded * 100) if total_loaded > 0 else 0.0

    print("\n" + "=" * 78)
    print("  FINAL SUITE SUMMARY")
    print("=" * 78)
    print(f"  Total Executed : {total_loaded}")
    print(f"  Passed         : {total_passed} ({pass_pct:.1f}%)")
    print(f"  Failed         : {len(result.failures)}")
    print(f"  Errors         : {len(result.errors)}")
    print(f"  Skipped        : {len(result.skipped)}")
    print(f"  Execution Time : {total_time:.3f}s")
    print(f"  Suite Status   : {'[PASSED 100%]' if (len(result.failures) == 0 and len(result.errors) == 0) else '[FAILURES DETECTED — ESCALATING TO WORKERS]'}")
    print("=" * 78 + "\n")

    # Write JSON report if requested
    if json_report_path:
        report_data = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "tier_filter": tier,
            "milestone_filter": milestone,
            "total": total_loaded,
            "passed": total_passed,
            "failed": len(result.failures),
            "errors": len(result.errors),
            "skipped": len(result.skipped),
            "duration": round(total_time, 4),
            "tier_summary": tier_summary,
            "test_records": result.test_records
        }
        with open(json_report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)
        print(f"  JSON execution report written to: {json_report_path}\n")

    return (len(result.failures) == 0 and len(result.errors) == 0)

def main():
    parser = argparse.ArgumentParser(description="Eros VBT E2E Test Suite Runner")
    parser.add_argument("--tier", choices=["1", "2", "3", "4", "browser", "overhaul", "all"], default="all",
                        help="Filter execution to specific test tier (default: all)")
    parser.add_argument("--milestone", choices=["M1", "M2", "M3", "M4", "M5", "M6", "E2E", "all"], default="all",
                        help="Filter execution to specific milestone (default: all)")
    parser.add_argument("-v", "--verbose", action="count", default=1,
                        help="Verbosity level (-v for details, -vv for per-test output)")
    parser.add_argument("--json-report", type=str, default=None,
                        help="Optional file path to output structured JSON execution report")

    args = parser.parse_args()
    success = run_tests(
        tier=args.tier,
        milestone=args.milestone,
        verbosity=args.verbose,
        json_report_path=args.json_report
    )
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
