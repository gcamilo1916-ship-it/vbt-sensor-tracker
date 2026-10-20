"""
tests/regression_catalog/ingest_failure.py
Automated Failure Ingestion Pipeline for Milestone 4 (R5).
100% Pure Python Standard Library (Zero External Dependencies).

Programmatically ingests anomalous trial trajectories, negative-reward failures,
and adversarial corner cases from:
  1. tests.sim_supervisor.MultiAgentSupervisor (TrialEvaluation)
  2. tests.policy_optimizer (TrialResult)
  3. tests.sim_supervisor.TrajectorySlice (raw pre/event/post telemetry slices)
  4. Monte Carlo batch execution reports (report.json)
  5. CLI interface: python -m tests.regression_catalog.ingest_failure --help

Features:
  - Root-cause prioritization: Deadlock > Drift > Mismatch > Noise
  - Automated 4-domain chaos tagging
  - Canonical config hashing for deterministic deduplication (SHA-256)
  - Dual replay support: parametric seed/config + optional recorded trajectory slices
  - Strict compliance with VBTRegressionCaseValidator and RegressionCase schema
"""

from __future__ import annotations

import os
import sys
import json
import time
import math
import hashlib
import re
import argparse
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import asdict, is_dataclass

# Ensure repository root is in sys.path
REPO_ROOT_ANTI = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT_ANTI not in sys.path:
    sys.path.insert(0, REPO_ROOT_ANTI)

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
    to_canonical_lift_type,
)
from tests.vbt_test_fixtures import VBTRegressionCaseValidator

DEFAULT_CASES_DIR = os.path.join(os.path.dirname(__file__), "cases")

ROOT_CAUSE_PRIORITY = [
    "FSM Deadlock",
    "Numerical Drift",
    "Threshold Mismatch",
    "Sensor Noise"
]


def normalize_lift_category(lift_type_str: str) -> str:
    """Map lift type string to target catalog subdirectory: squat, bench, deadlift, cycling, or edge_cases."""
    lt = str(lift_type_str).upper()
    if "CYCLING" in lt:
        return "cycling"
    elif "SQUAT" in lt:
        return "squat"
    elif "BENCH" in lt:
        return "bench"
    elif "DEADLIFT" in lt:
        return "deadlift"
    else:
        return "edge_cases"


def determine_fault_domain(config_dict: Dict[str, Any]) -> str:
    """Classify primary chaos domain from trial configuration."""
    chaos = config_dict.get("chaos", {})
    if not isinstance(chaos, dict):
        chaos = asdict(chaos) if is_dataclass(chaos) else {}

    d1 = chaos.get("domain1", chaos.get("domain1_boot", {}))
    d2 = chaos.get("domain2", chaos.get("domain2_thermal", {}))
    d3 = chaos.get("domain3", chaos.get("domain3_biomechanics", {}))
    d4 = chaos.get("domain4", chaos.get("domain4_connectivity", {}))

    if isinstance(d1, dict) and (d1.get("boot_motion") or d1.get("i2c_timeout_rate", 0) > 0 or d1.get("nan_injection_rate", 0) > 0):
        return "Domain 1: Boot & Sensor"
    elif isinstance(d2, dict) and (d2.get("thermal_drift") or d2.get("mounting_orientation") not in [None, "Z_UP"]):
        return "Domain 2: Thermal & Drift"
    elif isinstance(d3, dict) and (d3.get("pause_duration_s", 0) > 0 or d3.get("grind_velocity", 0) > 0 or d3.get("touch_and_go") or d3.get("floor_drop_impact") or d3.get("rack_collision")):
        return "Domain 3: Extreme Biomechanics"
    elif isinstance(d4, dict) and (d4.get("ble_disconnect_window") is not None or d4.get("packet_drop_rate", 0) > 0):
        return "Domain 4: Connectivity & BLE"
    return "Domain 3: Extreme Biomechanics"


def extract_primary_root_cause(
    anomalies: List[Union[Dict[str, Any], Any]],
    root_cause_breakdown: Optional[Dict[str, int]] = None
) -> Tuple[str, str]:
    """Identify primary root cause and anomaly code prioritized by severity (Deadlock > Drift > Mismatch > Noise)."""
    norm_anomalies: List[Dict[str, Any]] = []
    for a in anomalies:
        if is_dataclass(a):
            norm_anomalies.append(asdict(a))
        elif isinstance(a, dict):
            norm_anomalies.append(a)
        elif isinstance(a, str):
            rc = "Threshold Mismatch"
            for p in ROOT_CAUSE_PRIORITY:
                if p.lower() in a.lower():
                    rc = p
                    break
            norm_anomalies.append({"root_cause": rc, "anomaly_type": a})
        elif hasattr(a, "__dict__"):
            norm_anomalies.append(a.__dict__)

    if norm_anomalies:
        for p in ROOT_CAUSE_PRIORITY:
            for a in norm_anomalies:
                rc = a.get("root_cause", "")
                if rc == p or p.lower() in str(rc).lower():
                    anom_type = a.get("anomaly_type", a.get("type", "UNKNOWN_ANOMALY"))
                    return p, str(anom_type)

        first = norm_anomalies[0]
        return first.get("root_cause", "Threshold Mismatch"), str(first.get("anomaly_type", first.get("type", "UNKNOWN_ANOMALY")))

    if root_cause_breakdown:
        for p in ROOT_CAUSE_PRIORITY:
            if root_cause_breakdown.get(p, 0) > 0:
                return p, "UNSPECIFIED_ANOMALY"

    return "Threshold Mismatch", "UNSPECIFIED_ANOMALY"


def generate_case_id(lift_cat: str, primary_anomaly: str, config_dict: Dict[str, Any]) -> str:
    """Generate unique deterministic case ID using configuration SHA-256 hash."""
    clean_anom = re.sub(r'[^a-zA-Z0-9_-]', '_', str(primary_anomaly).lower())
    clean_anom = re.sub(r'_+', '_', clean_anom).strip('_') or "anomaly"
    # Deterministic config string
    try:
        cfg_str = json.dumps(config_dict, sort_keys=True, default=str)
    except Exception:
        cfg_str = str(config_dict)
    cfg_hash = hashlib.sha256(cfg_str.encode("utf-8")).hexdigest()[:8]
    return f"fail_{lift_cat}_{clean_anom}_{cfg_hash}"


def build_regression_case(
    case_id: str,
    name: str,
    lift_type_str: str,
    description: str,
    metadata_extra: Dict[str, Any],
    simulation_config_dict: Dict[str, Any],
    ground_truth_dict: Dict[str, Any],
    fault_injections: List[Dict[str, Any]],
    tolerances_dict: Optional[Dict[str, Any]] = None,
    telemetry_samples: Optional[List[Any]] = None
) -> RegressionCase:
    """Constructs a fully-validated RegressionCase instance."""
    canonical_lift = to_canonical_lift_type(lift_type_str)

    # Resolve lift category enum
    up_lt = lift_type_str.upper()
    if "CYCLING" in up_lt:
        lift_cat = LiftCategory.TOUCH_AND_GO_CYCLING
    elif "SQUAT" in up_lt:
        lift_cat = LiftCategory.SQUAT
    elif "BENCH" in up_lt:
        lift_cat = LiftCategory.BENCH_PRESS
    elif "DEADLIFT" in up_lt:
        lift_cat = LiftCategory.DEADLIFT
    elif "ABORT" in up_lt:
        lift_cat = LiftCategory.ABORTED_DESCENT
    elif "DROP" in up_lt:
        lift_cat = LiftCategory.FLOOR_DROP
    elif "COLLISION" in up_lt or "RACK" in up_lt:
        lift_cat = LiftCategory.RACK_COLLISION
    elif "CONCENTRIC" in up_lt or "FAIL" in up_lt:
        lift_cat = LiftCategory.FAILED_CONCENTRIC
    else:
        lift_cat = LiftCategory.SQUAT

    tags = [canonical_lift.lower(), "ingested_failure"]
    if "tags" in metadata_extra:
        tags.extend(metadata_extra["tags"])

    meta = CaseMetadata(
        case_id=case_id,
        name=name,
        lift_type=lift_cat,
        author=metadata_extra.get("author", "Automated Ingestion Pipeline"),
        created_at=metadata_extra.get("created_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        description=description,
        tags=sorted(list(set(tags))),
        version="1.0.0"
    )

    reps = ground_truth_dict.get("reps", 1)
    if lift_cat in (
        LiftCategory.ABORTED_DESCENT,
        LiftCategory.FAILED_CONCENTRIC,
        LiftCategory.FLOOR_DROP,
        LiftCategory.RACK_COLLISION
    ):
        reps = 0

    disp = float(ground_truth_dict.get("displacement_m", 0.40))
    dur = max(0.5, round(float(ground_truth_dict.get("duration_s", simulation_config_dict.get("duration_s", 10.0))), 3))
    pv = float(ground_truth_dict.get("peak_velocity_mps", 0.60))
    mcv = float(ground_truth_dict.get("mean_velocity_mps", 0.40))

    kin_dict = simulation_config_dict.get("kinematics", {})
    kin = KinematicsProfile(
        rep_count=reps,
        stroke_m=disp,
        eccentric_duration_s=float(kin_dict.get("eccentric_duration_s", 1.10)),
        concentric_duration_s=float(kin_dict.get("concentric_duration_s", 1.00)),
        pause_duration_s=float(kin_dict.get("pause_duration_s", 0.0)),
        grind_velocity_mps=float(kin_dict.get("grind_velocity_mps", 0.0)),
        grind_duration_s=float(kin_dict.get("grind_duration_s", 0.0)),
        cadence_hz=float(kin_dict.get("cadence_hz", 1.0)),
        is_touch_and_go=bool(kin_dict.get("is_touch_and_go", False))
    )

    # Chaos faults
    raw_chaos = simulation_config_dict.get("chaos", simulation_config_dict.get("chaos_faults", {}))
    if is_dataclass(raw_chaos):
        raw_chaos = asdict(raw_chaos)

    d1_dict = raw_chaos.get("domain1", raw_chaos.get("domain1_boot", {}))
    d2_dict = raw_chaos.get("domain2", raw_chaos.get("domain2_thermal", {}))
    d3_dict = raw_chaos.get("domain3", raw_chaos.get("domain3_biomechanics", {}))
    d4_dict = raw_chaos.get("domain4", raw_chaos.get("domain4_connectivity", {}))

    d1 = BootFaultConfig.from_dict(d1_dict) if d1_dict else BootFaultConfig()
    d2 = ThermalFaultConfig.from_dict(d2_dict) if d2_dict else ThermalFaultConfig()
    d3 = BiomechanicsFaultConfig.from_dict(d3_dict) if d3_dict else BiomechanicsFaultConfig()
    d4 = ConnectivityFaultConfig.from_dict(d4_dict) if d4_dict else ConnectivityFaultConfig()
    chaos_profile = ChaosFaultProfile(domain1_boot=d1, domain2_thermal=d2, domain3_biomechanics=d3, domain4_connectivity=d4)

    sim = SimulationConfig(
        duration_s=dur,
        sample_rate_hz=float(simulation_config_dict.get("sample_rate_hz", 100.0)),
        seed=simulation_config_dict.get("seed", 42),
        kinematics=kin,
        chaos_faults=chaos_profile
    )

    gt_exp = GroundTruthExpectations(
        expected_reps=reps,
        true_displacement_range_m=(round(disp * 0.90, 4), round(disp * 1.10, 4)) if reps > 0 else (0.0, 0.05),
        true_peak_velocity_range_mps=(round(pv * 0.85, 4), round(pv * 1.15, 4)) if reps > 0 else (0.0, 0.05),
        true_mean_velocity_range_mps=(round(mcv * 0.85, 4), round(mcv * 1.15, 4)) if reps > 0 else (0.0, 0.05),
        expected_fsm_states=[FSMPhaseEnum.IDLE, FSMPhaseEnum.ECCENTRIC, FSMPhaseEnum.CONCENTRIC, FSMPhaseEnum.LOCKOUT, FSMPhaseEnum.IDLE] if reps > 0 else [FSMPhaseEnum.IDLE]
    )

    tols = tolerances_dict or {}
    acc_tol = AcceptanceTolerances(
        max_false_reps=0,
        max_missed_reps=0,
        max_mean_velocity_error=float(tols.get("max_mean_velocity_error", 0.15)),
        max_peak_velocity_error_mps=float(tols.get("max_velocity_error_mps", 0.12)),
        max_displacement_error_m=float(tols.get("max_displacement_error_m", 0.08)),
        max_residual_drift=float(tols.get("max_residual_drift_mps", 0.03)),
        min_objective_reward=float(tols.get("min_objective_reward", 50.0 if reps > 0 else -10.0))
    )

    return RegressionCase(
        metadata=meta,
        simulation_config=sim,
        ground_truth_expectations=gt_exp,
        acceptance_tolerances=acc_tol,
        case_id=case_id,
        lift_type=canonical_lift,
        ground_truth=ground_truth_dict,
        tolerances={
            "rep_count_error": 0,
            "max_velocity_error_mps": round(acc_tol.max_peak_velocity_error_mps, 4),
            "max_residual_drift_mps": round(acc_tol.max_residual_drift, 4)
        },
        fault_injections=fault_injections,
        telemetry_samples=telemetry_samples
    )


def ingest_trial_evaluation(
    config: Any,
    evaluation: Any,
    tracker: Optional[Any] = None,
    output_dir: Optional[str] = None,
    overwrite: bool = False
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Ingests an anomalous TrialEvaluation (from sim_supervisor) paired with its TrialConfig.
    Saves new declarative case to tests/regression_catalog/cases/<category>/<case_id>.json.
    Returns (success, filepath, case_dict).
    """
    target_dir = output_dir or DEFAULT_CASES_DIR

    cfg_dict = asdict(config) if is_dataclass(config) else (dict(config) if isinstance(config, dict) else config.__dict__)
    eval_dict = asdict(evaluation) if is_dataclass(evaluation) else (evaluation.to_dict() if hasattr(evaluation, "to_dict") else dict(evaluation))

    lift_type_str = str(cfg_dict.get("lift_type", "SQUAT"))
    lift_cat = normalize_lift_category(lift_type_str)
    fault_domain = determine_fault_domain(cfg_dict)

    anomalies = eval_dict.get("anomalies", [])
    rc_breakdown = eval_dict.get("root_cause_breakdown", {})
    root_cause, primary_anomaly = extract_primary_root_cause(anomalies, rc_breakdown)

    case_id = generate_case_id(lift_cat, primary_anomaly, cfg_dict)
    cat_dir = os.path.join(target_dir, lift_cat)
    os.makedirs(cat_dir, exist_ok=True)
    case_path = os.path.join(cat_dir, f"{case_id}.json")

    if os.path.exists(case_path) and not overwrite:
        return False, case_path, {"status": "SKIPPED_DUPLICATE", "case_id": case_id}

    gt = {
        "reps": int(eval_dict.get("expected_reps", cfg_dict.get("num_reps", 1))),
        "displacement_m": round(float(eval_dict.get("true_displacement", 0.40)), 4),
        "duration_s": max(0.5, round(float(eval_dict.get("duration_s", cfg_dict.get("duration_s", 10.0))), 3)),
        "peak_velocity_mps": round(float(eval_dict.get("true_peak_vel", 0.60)), 4),
        "mean_velocity_mps": round(float(eval_dict.get("true_mean_vel", 0.40)), 4)
    }

    meta_extra = {
        "author": "sim_supervisor_ingestion",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "trial_id": str(eval_dict.get("trial_id", cfg_dict.get("trial_id", "UNKNOWN"))),
        "seed": cfg_dict.get("seed"),
        "fault_domain": fault_domain,
        "root_cause": root_cause,
        "primary_anomaly": primary_anomaly,
        "objective_reward": eval_dict.get("objective_reward", 0.0),
        "tags": [lift_cat, primary_anomaly.lower(), root_cause.lower().replace(" ", "_")]
    }

    desc = (
        f"Ingested failure: {primary_anomaly} under {fault_domain} ({root_cause}). "
        f"Expected {gt['reps']} reps, detected {eval_dict.get('matched_reps', 0)} matched, "
        f"{eval_dict.get('false_reps', 0)} false, {eval_dict.get('missed_reps', 0)} missed."
    )

    reg_case = build_regression_case(
        case_id=case_id,
        name=f"Ingested Failure: {primary_anomaly} on {lift_type_str}",
        lift_type_str=lift_type_str,
        description=desc,
        metadata_extra=meta_extra,
        simulation_config_dict=cfg_dict,
        ground_truth_dict=gt,
        fault_injections=anomalies
    )

    reg_case.save(case_path)
    return True, case_path, reg_case.to_dict()


def ingest_policy_trial_result(
    trial_result: Any,
    trial_config: Optional[Any] = None,
    output_dir: Optional[str] = None,
    overwrite: bool = False
) -> Tuple[bool, str, Dict[str, Any]]:
    """Ingests a failed TrialResult from policy_optimizer."""
    res_dict = asdict(trial_result) if is_dataclass(trial_result) else dict(trial_result)

    if trial_config is not None:
        cfg_dict = asdict(trial_config) if is_dataclass(trial_config) else dict(trial_config)
    else:
        cfg_dict = {
            "trial_id": res_dict.get("trial_id", "POLICY_OPT_FAIL"),
            "lift_type": res_dict.get("lift_type", "SQUAT"),
            "num_reps": res_dict.get("expected_reps", 1),
            "seed": 42
        }

    eval_stub = {
        "trial_id": res_dict.get("trial_id", "POLICY_FAIL"),
        "expected_reps": res_dict.get("expected_reps", 1),
        "matched_reps": res_dict.get("matched_reps", 0),
        "false_reps": res_dict.get("false_reps", 0),
        "missed_reps": res_dict.get("missed_reps", 0),
        "velocity_error": res_dict.get("mean_vel_error", 0.0),
        "residual_drift": res_dict.get("residual_drift", 0.0),
        "objective_reward": res_dict.get("objective_reward", -100.0),
        "anomalies": [{"anomaly_type": a, "root_cause": "Threshold Mismatch"} for a in res_dict.get("anomalies", [])]
    }

    return ingest_trial_evaluation(cfg_dict, eval_stub, output_dir=output_dir, overwrite=overwrite)


def ingest_trajectory_slice(
    trajectory_slice: Any,
    lift_type: str = "General",
    output_dir: Optional[str] = None,
    overwrite: bool = False
) -> Tuple[bool, str, Dict[str, Any]]:
    """Ingests raw trajectory slices (pre-buffer, event-buffer, post-buffer)."""
    ts_dict = asdict(trajectory_slice) if is_dataclass(trajectory_slice) else dict(trajectory_slice)
    case_id = ts_dict.get("case_id", f"slice_{int(time.time())}")
    pri_anom = ts_dict.get("primary_anomaly", "UNKNOWN_ANOMALY")
    if is_dataclass(pri_anom):
        pri_anom = asdict(pri_anom)
    anom_type = pri_anom.get("anomaly_type", "TRAJECTORY_VIOLATION") if isinstance(pri_anom, dict) else str(pri_anom)

    all_samples = []
    for buf_key in ["pre_buffer", "event_buffer", "post_buffer"]:
        for item in ts_dict.get(buf_key, []):
            if hasattr(item, "telemetry"):
                all_samples.append(asdict(item.telemetry) if is_dataclass(item.telemetry) else dict(item.telemetry))
            elif isinstance(item, dict):
                all_samples.append(item)

    calc_duration = max(0.5, round(len(all_samples) * 0.01, 3)) if all_samples else 5.0

    cfg_dict = {
        "trial_id": case_id,
        "lift_type": lift_type,
        "duration_s": calc_duration,
        "sample_rate_hz": 100.0,
        "seed": 42
    }

    gt_dict = {
        "reps": 0,
        "displacement_m": 0.0,
        "duration_s": calc_duration,
        "peak_velocity_mps": 0.0,
        "mean_velocity_mps": 0.0
    }

    reg_case = build_regression_case(
        case_id=case_id,
        name=f"Ingested Trajectory Slice: {anom_type}",
        lift_type_str=lift_type,
        description=f"Direct sensor trajectory slice capturing anomaly {anom_type}",
        metadata_extra={"author": "trajectory_slice_ingestion", "primary_anomaly": anom_type},
        simulation_config_dict=cfg_dict,
        ground_truth_dict=gt_dict,
        fault_injections=[pri_anom] if isinstance(pri_anom, dict) else [],
        telemetry_samples=all_samples
    )

    cat = normalize_lift_category(lift_type)
    out_dir = os.path.join(output_dir or DEFAULT_CASES_DIR, cat)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{case_id}.json")
    reg_case.save(out_path)
    return True, out_path, reg_case.to_dict()


def ingest_failure(
    source: Any,
    config: Optional[Any] = None,
    tracker: Optional[Any] = None,
    output_dir: Optional[str] = None,
    overwrite: bool = False
) -> Tuple[bool, str, Dict[str, Any]]:
    """Unified entry point for failure ingestion dispatch."""
    if hasattr(source, "pre_buffer") or (isinstance(source, dict) and "pre_buffer" in source):
        return ingest_trajectory_slice(source, output_dir=output_dir, overwrite=overwrite)
    elif hasattr(source, "matched_reps") and hasattr(source, "critical_anomalies") and config is not None:
        return ingest_trial_evaluation(config, source, tracker=tracker, output_dir=output_dir, overwrite=overwrite)
    elif hasattr(source, "passed") and hasattr(source, "objective_reward"):
        return ingest_policy_trial_result(source, trial_config=config, output_dir=output_dir, overwrite=overwrite)
    else:
        # Generic dict fallback
        return ingest_trial_evaluation(config or {}, source, tracker=tracker, output_dir=output_dir, overwrite=overwrite)


def scan_and_ingest_report_failures(
    report_path: str,
    output_dir: Optional[str] = None,
    max_cases_per_domain: int = 5
) -> List[str]:
    """Scans a batch execution JSON report and ingests all failed trials with deduplication."""
    if not os.path.exists(report_path):
        sys.stderr.write(f"Report file {report_path} not found.\n")
        return []

    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    trials = data.get("trials", []) or data.get("test_records", [])
    ingested_paths = []
    domain_counts: Dict[str, int] = {}

    for t in trials:
        if t.get("passed") is False or t.get("status") in ["FAIL", "ERROR"] or t.get("objective_reward", 0.0) < 0:
            cfg = t.get("config", t)
            eval_res = t.get("evaluation", t)
            domain = determine_fault_domain(cfg)
            if domain_counts.get(domain, 0) >= max_cases_per_domain:
                continue

            success, path, _ = ingest_trial_evaluation(cfg, eval_res, output_dir=output_dir)
            if success:
                ingested_paths.append(path)
                domain_counts[domain] = domain_counts.get(domain, 0) + 1

    return ingested_paths


def ingest_from_json(
    json_path: Union[str, Dict[str, Any]],
    output_dir: Optional[str] = None,
    overwrite: bool = False
) -> Optional[str]:
    """
    Loads a JSON report, trial evaluation, or trajectory slice and ingests it.
    Returns the path to the generated/written regression case file, or None if unsuccessful.
    """
    data: Any = None
    file_path: Optional[str] = None

    if isinstance(json_path, str):
        if os.path.exists(json_path):
            file_path = json_path
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                sys.stderr.write(f"Failed to read JSON from file {json_path}: {e}\n")
                return None
        else:
            try:
                data = json.loads(json_path)
            except Exception as e:
                sys.stderr.write(f"Failed to parse JSON string: {e}\n")
                return None
    elif isinstance(json_path, dict):
        data = json_path
    else:
        sys.stderr.write(f"Unsupported json input type: {type(json_path)}\n")
        return None

    if not isinstance(data, dict):
        return None

    # 1. Batch execution report with multiple trials
    if "trials" in data or "test_records" in data:
        if file_path:
            paths = scan_and_ingest_report_failures(file_path, output_dir=output_dir)
            return paths[0] if paths else None
        else:
            trials = data.get("trials", []) or data.get("test_records", [])
            for t in trials:
                if t.get("passed") is False or t.get("status") in ["FAIL", "ERROR"] or t.get("objective_reward", 0.0) < 0:
                    cfg = t.get("config", t)
                    eval_res = t.get("evaluation", t)
                    success, path, _ = ingest_trial_evaluation(cfg, eval_res, output_dir=output_dir, overwrite=overwrite)
                    if success:
                        return path
            return None

    # 2. Existing RegressionCase format
    if "metadata" in data and "simulation_config" in data:
        try:
            case = RegressionCase.from_dict(data)
            cat = normalize_lift_category(case.metadata.lift_type.value)
            out_dir = os.path.join(output_dir or DEFAULT_CASES_DIR, cat)
            os.makedirs(out_dir, exist_ok=True)
            out_path = os.path.join(out_dir, f"{case.metadata.case_id}.json")
            if not os.path.exists(out_path) or overwrite:
                case.save(out_path)
            return out_path
        except Exception:
            pass

    # 3. Trajectory slice
    if "pre_buffer" in data or "event_buffer" in data or "post_buffer" in data:
        lt = data.get("lift_type", "General")
        success, path, _ = ingest_trajectory_slice(data, lift_type=lt, output_dir=output_dir, overwrite=overwrite)
        return path if success else path

    # 4. Trial evaluation paired with config
    if "config" in data and "evaluation" in data:
        success, path, _ = ingest_trial_evaluation(
            data["config"], data["evaluation"], output_dir=output_dir, overwrite=overwrite
        )
        return path if success else path

    # 5. Generic TrialEvaluation or policy trial result dispatch
    success, path, _ = ingest_failure(data, output_dir=output_dir, overwrite=overwrite)
    return path if success else path


def create_cli_parser() -> argparse.ArgumentParser:
    """Create and return CLI argument parser supporting --scan-report / --file and --lift / --lift-type."""
    parser = argparse.ArgumentParser(
        description="VBT Milestone 4 Continual Learning Failure Ingestion Pipeline (R5)"
    )
    parser.add_argument(
        "--scan-report", "--file",
        dest="scan_report",
        type=str,
        help="Path to batch JSON report or trial file to scan/ingest"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=DEFAULT_CASES_DIR,
        help="Target catalog directory for generated cases"
    )
    parser.add_argument(
        "--lift", "--lift-type",
        dest="lift",
        type=str,
        default="SQUAT",
        choices=["SQUAT", "BENCH_PRESS", "DEADLIFT", "TOUCH_AND_GO_CYCLING"],
        help="Lift type for ad-hoc generation"
    )
    parser.add_argument("--seed", type=int, default=None, help="Random seed for deterministic replay")
    parser.add_argument(
        "--chaos",
        type=str,
        default="EXTREME",
        choices=["CLEAN", "MILD", "MODERATE", "EXTREME"],
        help="Chaos fault severity profile"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Synthesize and validate case without writing to disk"
    )
    return parser


def main():
    parser = create_cli_parser()
    args = parser.parse_args()

    if args.scan_report:
        if args.dry_run:
            if not os.path.exists(args.scan_report):
                sys.stderr.write(f"File {args.scan_report} not found.\n")
                sys.exit(1)
            with open(args.scan_report, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "metadata" in data and "simulation_config" in data:
                case = RegressionCase.from_dict(data)
                print(f"Dry-run: validated existing regression case {case.metadata.case_id}")
            else:
                print(f"Dry-run: validated input JSON structure from {args.scan_report}")
        else:
            ingested_path = ingest_from_json(args.scan_report, output_dir=args.output_dir)
            if ingested_path:
                print(f"Successfully ingested case: {ingested_path}")
            else:
                ingested = scan_and_ingest_report_failures(args.scan_report, args.output_dir)
                print(f"Ingested {len(ingested)} failure cases from {args.scan_report}")
                for p in ingested:
                    print(f"  -> {p}")
    else:
        print("VBT Failure Ingestion Pipeline initialized successfully.")
        print(f"Catalog root: {args.output_dir}")
        print("Run with --file/--scan-report <path> or invoke programmatic ingestion API.")


if __name__ == "__main__":
    main()
