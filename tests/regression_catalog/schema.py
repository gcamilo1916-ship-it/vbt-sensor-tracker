"""
tests/regression_catalog/schema.py
Milestone 4 Declarative Regression Case Schema & Validator (R5).

100% Pure Python Standard Library (Zero third-party dependencies: no jsonschema, no pydantic).
Provides strict dataclasses, enumerations, range validations, cross-field integrity checks,
and full bidirectional serialization/deserialization for the Continual Learning Regression Catalog.

Conforms strictly with VBTRegressionCaseValidator (tests/vbt_test_fixtures.py):
  - Exposes canonical root keys: case_id, lift_type, ground_truth, tolerances.
"""

from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import List, Dict, Tuple, Optional, Any, Union


# ==============================================================================
# Enumerations
# ==============================================================================

class LiftCategory(str, Enum):
    SQUAT = "SQUAT"
    BENCH_PRESS = "BENCH_PRESS"
    DEADLIFT = "DEADLIFT"
    TOUCH_AND_GO_CYCLING = "TOUCH_AND_GO_CYCLING"
    ABORTED_DESCENT = "ABORTED_DESCENT"
    FAILED_CONCENTRIC = "FAILED_CONCENTRIC"
    FLOOR_DROP = "FLOOR_DROP"
    RACK_COLLISION = "RACK_COLLISION"


class MountOrientationEnum(str, Enum):
    Z_UP = "Z_UP"
    X_UP = "X_UP"
    Y_UP = "Y_UP"
    INVERTED = "INVERTED"
    TILT_45 = "TILT_45"
    RANDOM_SO3 = "RANDOM_SO3"


class FSMPhaseEnum(str, Enum):
    IDLE = "IDLE"
    ECCENTRIC = "ECCENTRIC"
    PAUSE = "PAUSE"
    CONCENTRIC = "CONCENTRIC"
    LOCKOUT = "LOCKOUT"


# ==============================================================================
# Validation Error Handling & Helpers
# ==============================================================================

class ValidationError(Exception):
    """Raised when JSON regression case data violates the schema specification."""
    def __init__(self, message: str, path: str = "$"):
        self.path = path
        self.message = message
        super().__init__(f"Schema Validation Error at '{path}': {message}")


def _check_type(val: Any, expected_types: Union[type, Tuple[type, ...]], path: str, allow_none: bool = False) -> Any:
    if val is None:
        if allow_none:
            return None
        raise ValidationError("Field cannot be null/None", path)
    if not isinstance(val, expected_types):
        type_names = (
            expected_types.__name__
            if isinstance(expected_types, type)
            else " or ".join(t.__name__ for t in expected_types)
        )
        raise ValidationError(f"Expected type {type_names}, got {type(val).__name__} ({val!r})", path)
    return val


def _check_range(
    val: Union[int, float],
    path: str,
    min_val: Optional[Union[int, float]] = None,
    max_val: Optional[Union[int, float]] = None,
    inclusive_min: bool = True,
    inclusive_max: bool = True,
) -> Union[int, float]:
    if min_val is not None:
        if inclusive_min and val < min_val:
            raise ValidationError(f"Value {val} must be >= {min_val}", path)
        elif not inclusive_min and val <= min_val:
            raise ValidationError(f"Value {val} must be > {min_val}", path)
    if max_val is not None:
        if inclusive_max and val > max_val:
            raise ValidationError(f"Value {val} must be <= {max_val}", path)
        elif not inclusive_max and val >= max_val:
            raise ValidationError(f"Value {val} must be < {max_val}", path)
    return val


def _check_enum(val: Any, enum_cls: type[Enum], path: str) -> str:
    valid_values = {e.value for e in enum_cls}
    if hasattr(val, "value"):
        val_str = str(val.value).upper()
    elif hasattr(val, "name"):
        val_str = str(val.name).upper()
    else:
        raw_str = str(val).strip() if val is not None else ""
        if "." in raw_str:
            raw_str = raw_str.split(".")[-1]
        val_str = raw_str.upper()

    if val_str not in valid_values:
        raise ValidationError(f"Invalid enum value '{val}'. Allowed: {sorted(list(valid_values))}", path)
    return val_str


def to_canonical_lift_type(lift_type: Union[LiftCategory, str]) -> str:
    """Maps internal lift category to canonical VBTRegressionCaseValidator lift type."""
    lt = str(lift_type.value if isinstance(lift_type, LiftCategory) else lift_type).upper()
    if "SQUAT" in lt:
        return "Squat"
    elif "BENCH" in lt:
        return "Bench"
    elif "DEADLIFT" in lt or "CYCLING" in lt:
        return "Deadlift"
    else:
        return "General"


# ==============================================================================
# Dataclass Models
# ==============================================================================

@dataclass
class CaseMetadata:
    """Metadata identifying and documenting the regression case."""
    case_id: str
    name: str
    lift_type: LiftCategory
    author: str = "Teamwork Agent"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    description: str = ""
    tags: List[str] = field(default_factory=list)
    version: str = "1.0.0"

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "metadata") -> CaseMetadata:
        _check_type(d, dict, path)
        case_id = _check_type(d.get("case_id"), str, f"{path}.case_id")
        if not re.match(r"^[A-Za-z0-9_\-]+$", case_id):
            raise ValidationError("case_id must match regex '^[A-Za-z0-9_\\-]+$'", f"{path}.case_id")

        name = _check_type(d.get("name", case_id), str, f"{path}.name")
        if len(name.strip()) == 0:
            name = case_id

        raw_lift = d.get("lift_type", "SQUAT")
        lift_str = _check_enum(raw_lift, LiftCategory, f"{path}.lift_type")
        lift_type = LiftCategory(lift_str)

        author = _check_type(d.get("author", "Teamwork Agent"), str, f"{path}.author")
        created_at = _check_type(
            d.get("created_at", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
            str,
            f"{path}.created_at"
        )
        try:
            datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except Exception as e:
            raise ValidationError(f"created_at must be valid ISO 8601 string: {e}", f"{path}.created_at")

        desc = _check_type(d.get("description", ""), str, f"{path}.description")

        raw_tags = _check_type(d.get("tags", []), list, f"{path}.tags")
        tags = [_check_type(t, str, f"{path}.tags[{i}]") for i, t in enumerate(raw_tags)]
        version = _check_type(d.get("version", "1.0.0"), str, f"{path}.version")

        return cls(
            case_id=case_id,
            name=name,
            lift_type=lift_type,
            author=author,
            created_at=created_at,
            description=desc,
            tags=tags,
            version=version
        )


@dataclass
class KinematicsProfile:
    """Analytical biomechanical parameters of the lift movement."""
    rep_count: int = 1
    stroke_m: float = 0.50
    eccentric_duration_s: float = 1.10
    concentric_duration_s: float = 1.00
    pause_duration_s: float = 0.00
    grind_velocity_mps: float = 0.00
    grind_duration_s: float = 0.00
    cadence_hz: float = 1.00
    is_touch_and_go: bool = False

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "simulation_config.kinematics") -> KinematicsProfile:
        _check_type(d, dict, path)
        rep_count = _check_range(_check_type(d.get("rep_count", 1), int, f"{path}.rep_count"), f"{path}.rep_count", min_val=0, max_val=50)
        stroke_m = _check_range(_check_type(d.get("stroke_m", 0.50), (int, float), f"{path}.stroke_m"), f"{path}.stroke_m", min_val=0.0, max_val=2.50)
        ecc_dur = _check_range(_check_type(d.get("eccentric_duration_s", 1.10), (int, float), f"{path}.eccentric_duration_s"), f"{path}.eccentric_duration_s", min_val=0.0, max_val=15.0)
        conc_dur = _check_range(_check_type(d.get("concentric_duration_s", 1.00), (int, float), f"{path}.concentric_duration_s"), f"{path}.concentric_duration_s", min_val=0.0, max_val=15.0)
        pause_dur = _check_range(_check_type(d.get("pause_duration_s", 0.00), (int, float), f"{path}.pause_duration_s"), f"{path}.pause_duration_s", min_val=0.0, max_val=10.0)
        grind_v = _check_range(_check_type(d.get("grind_velocity_mps", 0.00), (int, float), f"{path}.grind_velocity_mps"), f"{path}.grind_velocity_mps", min_val=0.0, max_val=2.0)
        grind_dur = _check_range(_check_type(d.get("grind_duration_s", 0.00), (int, float), f"{path}.grind_duration_s"), f"{path}.grind_duration_s", min_val=0.0, max_val=10.0)
        cadence = _check_range(_check_type(d.get("cadence_hz", 1.00), (int, float), f"{path}.cadence_hz"), f"{path}.cadence_hz", min_val=0.1, max_val=5.0)
        tag = _check_type(d.get("is_touch_and_go", False), bool, f"{path}.is_touch_and_go")

        return cls(
            rep_count=rep_count,
            stroke_m=float(stroke_m),
            eccentric_duration_s=float(ecc_dur),
            concentric_duration_s=float(conc_dur),
            pause_duration_s=float(pause_dur),
            grind_velocity_mps=float(grind_v),
            grind_duration_s=float(grind_dur),
            cadence_hz=float(cadence),
            is_touch_and_go=tag
        )


@dataclass
class BootFaultConfig:
    """Domain 1: Boot & Startup Faults."""
    boot_motion: bool = False
    boot_motion_duration_s: float = 2.0
    boot_motion_intensity: float = 2.0
    i2c_timeout_rate: float = 0.0
    i2c_burst_len_max: int = 5
    nan_injection_rate: float = 0.0
    reg_failure_rate: float = 0.0

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "simulation_config.chaos_faults.domain1_boot") -> BootFaultConfig:
        _check_type(d, dict, path)
        bm = _check_type(d.get("boot_motion", False), bool, f"{path}.boot_motion")
        bmd = _check_range(_check_type(d.get("boot_motion_duration_s", 2.0), (int, float), f"{path}.boot_motion_duration_s"), f"{path}.boot_motion_duration_s", min_val=0.0, max_val=30.0)
        bmi = _check_range(_check_type(d.get("boot_motion_intensity", 2.0), (int, float), f"{path}.boot_motion_intensity"), f"{path}.boot_motion_intensity", min_val=0.0, max_val=50.0)
        itr = _check_range(_check_type(d.get("i2c_timeout_rate", 0.0), (int, float), f"{path}.i2c_timeout_rate"), f"{path}.i2c_timeout_rate", min_val=0.0, max_val=1.0)
        ibl = _check_range(_check_type(d.get("i2c_burst_len_max", 5), int, f"{path}.i2c_burst_len_max"), f"{path}.i2c_burst_len_max", min_val=1, max_val=50)
        nir = _check_range(_check_type(d.get("nan_injection_rate", 0.0), (int, float), f"{path}.nan_injection_rate"), f"{path}.nan_injection_rate", min_val=0.0, max_val=1.0)
        rfr = _check_range(_check_type(d.get("reg_failure_rate", 0.0), (int, float), f"{path}.reg_failure_rate"), f"{path}.reg_failure_rate", min_val=0.0, max_val=1.0)
        return cls(
            boot_motion=bm,
            boot_motion_duration_s=float(bmd),
            boot_motion_intensity=float(bmi),
            i2c_timeout_rate=float(itr),
            i2c_burst_len_max=ibl,
            nan_injection_rate=float(nir),
            reg_failure_rate=float(rfr)
        )


@dataclass
class ThermalFaultConfig:
    """Domain 2: Thermal & Long-Uptime Drift Faults."""
    thermal_drift: bool = False
    delta_t_max_c: float = 25.0
    tau_thermal_s: float = 600.0
    accel_drift_coeff: float = 0.010
    gyro_drift_coeff: float = 0.002
    mounting_orientation: MountOrientationEnum = MountOrientationEnum.Z_UP
    custom_euler_deg: Optional[Tuple[float, float, float]] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "simulation_config.chaos_faults.domain2_thermal") -> ThermalFaultConfig:
        _check_type(d, dict, path)
        td = _check_type(d.get("thermal_drift", False), bool, f"{path}.thermal_drift")
        dt_max = _check_range(_check_type(d.get("delta_t_max_c", 25.0), (int, float), f"{path}.delta_t_max_c"), f"{path}.delta_t_max_c", min_val=0.0, max_val=100.0)
        tau = _check_range(_check_type(d.get("tau_thermal_s", 600.0), (int, float), f"{path}.tau_thermal_s"), f"{path}.tau_thermal_s", min_val=1.0, max_val=36000.0)
        adc = _check_range(_check_type(d.get("accel_drift_coeff", 0.010), (int, float), f"{path}.accel_drift_coeff"), f"{path}.accel_drift_coeff", min_val=0.0, max_val=0.10)
        gdc = _check_range(_check_type(d.get("gyro_drift_coeff", 0.002), (int, float), f"{path}.gyro_drift_coeff"), f"{path}.gyro_drift_coeff", min_val=0.0, max_val=0.05)

        orient_str = _check_enum(d.get("mounting_orientation", "Z_UP"), MountOrientationEnum, f"{path}.mounting_orientation")
        orient = MountOrientationEnum(orient_str)

        raw_euler = d.get("custom_euler_deg")
        euler = None
        if raw_euler is not None:
            _check_type(raw_euler, (list, tuple), f"{path}.custom_euler_deg")
            if len(raw_euler) != 3:
                raise ValidationError("custom_euler_deg must be [roll, pitch, yaw] triplet", f"{path}.custom_euler_deg")
            euler = (
                float(_check_type(raw_euler[0], (int, float), f"{path}.custom_euler_deg[0]")),
                float(_check_type(raw_euler[1], (int, float), f"{path}.custom_euler_deg[1]")),
                float(_check_type(raw_euler[2], (int, float), f"{path}.custom_euler_deg[2]")),
            )

        return cls(
            thermal_drift=td,
            delta_t_max_c=float(dt_max),
            tau_thermal_s=float(tau),
            accel_drift_coeff=float(adc),
            gyro_drift_coeff=float(gdc),
            mounting_orientation=orient,
            custom_euler_deg=euler
        )


@dataclass
class BiomechanicsFaultConfig:
    """Domain 3: Extreme Biomechanics & Dynamic Impacts."""
    pause_duration_s: float = 0.0
    grind_velocity: float = 0.0
    grind_duration_s: float = 0.0
    touch_and_go: bool = False
    cycling_reps: int = 1
    cycling_cadence_hz: float = 1.0
    floor_drop_impact: bool = False
    rack_collision: bool = False

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "simulation_config.chaos_faults.domain3_biomechanics") -> BiomechanicsFaultConfig:
        _check_type(d, dict, path)
        pd = _check_range(_check_type(d.get("pause_duration_s", 0.0), (int, float), f"{path}.pause_duration_s"), f"{path}.pause_duration_s", min_val=0.0, max_val=10.0)
        gv = _check_range(_check_type(d.get("grind_velocity", 0.0), (int, float), f"{path}.grind_velocity"), f"{path}.grind_velocity", min_val=0.0, max_val=1.0)
        gd = _check_range(_check_type(d.get("grind_duration_s", 0.0), (int, float), f"{path}.grind_duration_s"), f"{path}.grind_duration_s", min_val=0.0, max_val=10.0)
        tag = _check_type(d.get("touch_and_go", False), bool, f"{path}.touch_and_go")
        reps = _check_range(_check_type(d.get("cycling_reps", 1), int, f"{path}.cycling_reps"), f"{path}.cycling_reps", min_val=0, max_val=50)
        cad = _check_range(_check_type(d.get("cycling_cadence_hz", 1.0), (int, float), f"{path}.cycling_cadence_hz"), f"{path}.cycling_cadence_hz", min_val=0.1, max_val=5.0)
        fd = _check_type(d.get("floor_drop_impact", False), bool, f"{path}.floor_drop_impact")
        rc = _check_type(d.get("rack_collision", False), bool, f"{path}.rack_collision")

        return cls(
            pause_duration_s=float(pd),
            grind_velocity=float(gv),
            grind_duration_s=float(gd),
            touch_and_go=tag,
            cycling_reps=reps,
            cycling_cadence_hz=float(cad),
            floor_drop_impact=fd,
            rack_collision=rc
        )


@dataclass
class ConnectivityFaultConfig:
    """Domain 4: Connectivity & BLE Communications."""
    ble_disconnect_window: Optional[Tuple[float, float]] = None
    packet_drop_rate: float = 0.0
    buffer_capacity: int = 16

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "simulation_config.chaos_faults.domain4_connectivity") -> ConnectivityFaultConfig:
        _check_type(d, dict, path)
        raw_win = d.get("ble_disconnect_window")
        win = None
        if raw_win is not None:
            _check_type(raw_win, (list, tuple), f"{path}.ble_disconnect_window")
            if len(raw_win) != 2:
                raise ValidationError("ble_disconnect_window must be [t_start, t_end]", f"{path}.ble_disconnect_window")
            t1 = float(_check_type(raw_win[0], (int, float), f"{path}.ble_disconnect_window[0]"))
            t2 = float(_check_type(raw_win[1], (int, float), f"{path}.ble_disconnect_window[1]"))
            if t2 <= t1:
                raise ValidationError(f"t_end ({t2}) must be > t_start ({t1})", f"{path}.ble_disconnect_window")
            win = (t1, t2)

        pdr = _check_range(_check_type(d.get("packet_drop_rate", 0.0), (int, float), f"{path}.packet_drop_rate"), f"{path}.packet_drop_rate", min_val=0.0, max_val=1.0)
        cap = _check_range(_check_type(d.get("buffer_capacity", 16), int, f"{path}.buffer_capacity"), f"{path}.buffer_capacity", min_val=1, max_val=256)

        return cls(
            ble_disconnect_window=win,
            packet_drop_rate=float(pdr),
            buffer_capacity=cap
        )


@dataclass
class ChaosFaultProfile:
    """Consolidated 4-domain chaos fault profile."""
    domain1_boot: BootFaultConfig = field(default_factory=BootFaultConfig)
    domain2_thermal: ThermalFaultConfig = field(default_factory=ThermalFaultConfig)
    domain3_biomechanics: BiomechanicsFaultConfig = field(default_factory=BiomechanicsFaultConfig)
    domain4_connectivity: ConnectivityFaultConfig = field(default_factory=ConnectivityFaultConfig)

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "simulation_config.chaos_faults") -> ChaosFaultProfile:
        _check_type(d, dict, path)
        d1 = BootFaultConfig.from_dict(d.get("domain1_boot", {}), f"{path}.domain1_boot")
        d2 = ThermalFaultConfig.from_dict(d.get("domain2_thermal", {}), f"{path}.domain2_thermal")
        d3 = BiomechanicsFaultConfig.from_dict(d.get("domain3_biomechanics", {}), f"{path}.domain3_biomechanics")
        d4 = ConnectivityFaultConfig.from_dict(d.get("domain4_connectivity", {}), f"{path}.domain4_connectivity")
        return cls(
            domain1_boot=d1,
            domain2_thermal=d2,
            domain3_biomechanics=d3,
            domain4_connectivity=d4
        )


@dataclass
class SimulationConfig:
    """Simulation execution setup and environmental faults."""
    duration_s: float = 15.0
    sample_rate_hz: float = 100.0
    seed: Optional[int] = 42
    kinematics: KinematicsProfile = field(default_factory=KinematicsProfile)
    chaos_faults: ChaosFaultProfile = field(default_factory=ChaosFaultProfile)

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "simulation_config") -> SimulationConfig:
        _check_type(d, dict, path)
        dur = _check_range(_check_type(d.get("duration_s", 15.0), (int, float), f"{path}.duration_s"), f"{path}.duration_s", min_val=0.5, max_val=7200.0)
        sr = _check_range(_check_type(d.get("sample_rate_hz", 100.0), (int, float), f"{path}.sample_rate_hz"), f"{path}.sample_rate_hz", min_val=10.0, max_val=1000.0)
        seed_raw = d.get("seed", 42)
        seed = _check_type(seed_raw, int, f"{path}.seed", allow_none=True)

        kin = KinematicsProfile.from_dict(d.get("kinematics", {}), f"{path}.kinematics")
        chaos = ChaosFaultProfile.from_dict(d.get("chaos_faults", {}), f"{path}.chaos_faults")

        return cls(
            duration_s=float(dur),
            sample_rate_hz=float(sr),
            seed=seed,
            kinematics=kin,
            chaos_faults=chaos
        )


@dataclass
class GroundTruthExpectations:
    """Exact physical expectations generated by analytical kinematics."""
    expected_reps: int
    true_displacement_range_m: Tuple[float, float]
    true_peak_velocity_range_mps: Tuple[float, float]
    true_mean_velocity_range_mps: Tuple[float, float]
    expected_fsm_states: List[FSMPhaseEnum]
    min_concentric_duration_s: float = 0.20
    max_concentric_duration_s: float = 3.50

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "ground_truth_expectations") -> GroundTruthExpectations:
        _check_type(d, dict, path)
        exp_reps = _check_range(_check_type(d.get("expected_reps"), int, f"{path}.expected_reps"), f"{path}.expected_reps", min_val=0, max_val=50)

        def _parse_range(key: str) -> Tuple[float, float]:
            r_path = f"{path}.{key}"
            raw = _check_type(d.get(key), (list, tuple), r_path)
            if len(raw) != 2:
                raise ValidationError(f"{key} must be [min, max] 2-element list", r_path)
            min_v = float(_check_type(raw[0], (int, float), f"{r_path}[0]"))
            max_v = float(_check_type(raw[1], (int, float), f"{r_path}[1]"))
            if min_v > max_v:
                raise ValidationError(f"{key} min ({min_v}) cannot exceed max ({max_v})", r_path)
            return (min_v, max_v)

        disp_range = _parse_range("true_displacement_range_m")
        pv_range = _parse_range("true_peak_velocity_range_mps")
        mv_range = _parse_range("true_mean_velocity_range_mps")

        raw_fsm = _check_type(d.get("expected_fsm_states", []), list, f"{path}.expected_fsm_states")
        fsm_states = []
        for i, s in enumerate(raw_fsm):
            s_val = _check_enum(s, FSMPhaseEnum, f"{path}.expected_fsm_states[{i}]")
            fsm_states.append(FSMPhaseEnum(s_val))

        min_cd = _check_range(_check_type(d.get("min_concentric_duration_s", 0.20), (int, float), f"{path}.min_concentric_duration_s"), f"{path}.min_concentric_duration_s", min_val=0.0, max_val=10.0)
        max_cd = _check_range(_check_type(d.get("max_concentric_duration_s", 3.50), (int, float), f"{path}.max_concentric_duration_s"), f"{path}.max_concentric_duration_s", min_val=min_cd, max_val=20.0)

        return cls(
            expected_reps=exp_reps,
            true_displacement_range_m=disp_range,
            true_peak_velocity_range_mps=pv_range,
            true_mean_velocity_range_mps=mv_range,
            expected_fsm_states=fsm_states,
            min_concentric_duration_s=float(min_cd),
            max_concentric_duration_s=float(max_cd)
        )


@dataclass
class AcceptanceTolerances:
    """Strict pass/fail criteria for firmware & tracker validation."""
    max_false_reps: int = 0
    max_missed_reps: int = 0
    max_mean_velocity_error: float = 0.15       # Relative error (15%)
    max_peak_velocity_error_mps: float = 0.12   # Absolute m/s
    max_displacement_error_m: float = 0.08      # Absolute m
    max_residual_drift: float = 0.15            # Residual velocity + baseline drift
    min_objective_reward: float = 50.0          # Supervisor reward threshold
    forbidden_anomalies: List[str] = field(default_factory=lambda: [
        "RUNAWAY_VELOCITY",
        "QUATERNION_DEGENERACY",
        "ECCENTRIC_DEADLOCK",
        "CONCENTRIC_DEADLOCK",
        "IDLE_LOCKOUT_FREEZE",
        "ILLEGAL_STATE_TRANSITION",
        "NAN_INF_POISONING",
        "FALSE_POSITIVE_REP",
        "MISSED_REP"
    ])

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "acceptance_tolerances") -> AcceptanceTolerances:
        _check_type(d, dict, path)
        mfr = _check_range(_check_type(d.get("max_false_reps", 0), int, f"{path}.max_false_reps"), f"{path}.max_false_reps", min_val=0, max_val=0)
        mmr = _check_range(_check_type(d.get("max_missed_reps", 0), int, f"{path}.max_missed_reps"), f"{path}.max_missed_reps", min_val=0, max_val=0)
        mve = _check_range(_check_type(d.get("max_mean_velocity_error", 0.15), (int, float), f"{path}.max_mean_velocity_error"), f"{path}.max_mean_velocity_error", min_val=0.0, max_val=1.0)
        mpve = _check_range(_check_type(d.get("max_peak_velocity_error_mps", 0.12), (int, float), f"{path}.max_peak_velocity_error_mps"), f"{path}.max_peak_velocity_error_mps", min_val=0.0, max_val=2.0)
        mde = _check_range(_check_type(d.get("max_displacement_error_m", 0.08), (int, float), f"{path}.max_displacement_error_m"), f"{path}.max_displacement_error_m", min_val=0.0, max_val=1.0)
        mrd = _check_range(_check_type(d.get("max_residual_drift", 0.15), (int, float), f"{path}.max_residual_drift"), f"{path}.max_residual_drift", min_val=0.0, max_val=5.0)
        mor = _check_type(d.get("min_objective_reward", 50.0), (int, float), f"{path}.min_objective_reward")

        raw_fa = _check_type(d.get("forbidden_anomalies", []), list, f"{path}.forbidden_anomalies")
        fa = [_check_type(a, str, f"{path}.forbidden_anomalies[{i}]") for i, a in enumerate(raw_fa)]

        return cls(
            max_false_reps=mfr,
            max_missed_reps=mmr,
            max_mean_velocity_error=float(mve),
            max_peak_velocity_error_mps=float(mpve),
            max_displacement_error_m=float(mde),
            max_residual_drift=float(mrd),
            min_objective_reward=float(mor),
            forbidden_anomalies=fa
        )


@dataclass
class RegressionCase:
    """
    Complete declarative regression case.
    Dual-compatible:
      - Declarative schema (metadata, simulation_config, ground_truth_expectations, acceptance_tolerances)
      - VBTRegressionCaseValidator canonical schema (case_id, lift_type, ground_truth, tolerances)
    """
    metadata: CaseMetadata
    simulation_config: SimulationConfig
    ground_truth_expectations: GroundTruthExpectations
    acceptance_tolerances: AcceptanceTolerances
    # Optional canonical / backward compatibility fields
    case_id: Optional[str] = None
    lift_type: Optional[str] = None
    ground_truth: Optional[Dict[str, Any]] = None
    tolerances: Optional[Dict[str, Any]] = None
    fault_injections: Optional[List[Dict[str, Any]]] = None
    telemetry_samples: Optional[List[Any]] = None

    def __post_init__(self):
        if self.case_id is None:
            self.case_id = self.metadata.case_id
        if self.lift_type is None:
            self.lift_type = to_canonical_lift_type(self.metadata.lift_type)
        if self.ground_truth is None:
            reps = self.ground_truth_expectations.expected_reps
            disp = (self.ground_truth_expectations.true_displacement_range_m[0] + self.ground_truth_expectations.true_displacement_range_m[1]) / 2.0
            dur = self.simulation_config.duration_s
            peak_v = (self.ground_truth_expectations.true_peak_velocity_range_mps[0] + self.ground_truth_expectations.true_peak_velocity_range_mps[1]) / 2.0
            mcv = (self.ground_truth_expectations.true_mean_velocity_range_mps[0] + self.ground_truth_expectations.true_mean_velocity_range_mps[1]) / 2.0
            self.ground_truth = {
                "reps": reps,
                "displacement_m": round(disp, 4),
                "duration_s": round(dur, 2),
                "peak_velocity_mps": round(peak_v, 4),
                "mean_velocity_mps": round(mcv, 4)
            }
        if self.tolerances is None:
            self.tolerances = {
                "rep_count_error": self.acceptance_tolerances.max_false_reps + self.acceptance_tolerances.max_missed_reps,
                "max_velocity_error_mps": round(self.acceptance_tolerances.max_peak_velocity_error_mps, 4),
                "max_residual_drift_mps": round(self.acceptance_tolerances.max_residual_drift, 4)
            }
        if self.fault_injections is None:
            self.fault_injections = []

    @classmethod
    def from_dict(cls, d: Dict[str, Any], path: str = "$") -> RegressionCase:
        _check_type(d, dict, path)

        # Handle canonical format fallback from VBTRegressionCaseValidator
        if "metadata" not in d and "case_id" in d and "ground_truth" in d:
            cid = str(d["case_id"])
            lt_str = str(d.get("lift_type", "Squat"))
            gt_dict = d.get("ground_truth", {})
            reps = int(gt_dict.get("reps", 1))
            disp = float(gt_dict.get("displacement_m", 0.40))
            dur = float(gt_dict.get("duration_s", 1.0))
            pv = float(gt_dict.get("peak_velocity_mps", 0.60))
            mcv = float(gt_dict.get("mean_velocity_mps", 0.40))
            tols_dict = d.get("tolerances", {})

            meta_dict = {
                "case_id": cid,
                "name": f"Canonical Case {cid}",
                "lift_type": "SQUAT" if "squat" in lt_str.lower() else (
                    "BENCH_PRESS" if "bench" in lt_str.lower() else (
                        "DEADLIFT" if "deadlift" in lt_str.lower() else "SQUAT"
                    )
                ),
                "author": "VBTRegressionCaseValidator",
                "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "description": f"Canonical fixture case for {cid}",
                "tags": ["canonical", lt_str.lower()]
            }
            sim_dict = {
                "duration_s": max(dur, 2.0),
                "sample_rate_hz": 100.0,
                "seed": 42,
                "kinematics": {
                    "rep_count": reps,
                    "stroke_m": disp,
                    "eccentric_duration_s": dur * 0.5,
                    "concentric_duration_s": dur * 0.5,
                    "pause_duration_s": 0.0
                },
                "chaos_faults": {
                    "domain1_boot": {},
                    "domain2_thermal": {},
                    "domain3_biomechanics": {},
                    "domain4_connectivity": {}
                }
            }
            gt_exp_dict = {
                "expected_reps": reps,
                "true_displacement_range_m": [round(disp * 0.9, 4), round(disp * 1.1, 4)],
                "true_peak_velocity_range_mps": [round(pv * 0.85, 4), round(pv * 1.15, 4)],
                "true_mean_velocity_range_mps": [round(mcv * 0.85, 4), round(mcv * 1.15, 4)],
                "expected_fsm_states": ["IDLE", "ECCENTRIC", "CONCENTRIC", "IDLE"] if reps > 0 else ["IDLE"]
            }
            acc_tol_dict = {
                "max_false_reps": 0,
                "max_missed_reps": 0,
                "max_mean_velocity_error": 0.15,
                "max_peak_velocity_error_mps": float(tols_dict.get("max_velocity_error_mps", 0.05)),
                "max_displacement_error_m": 0.08,
                "max_residual_drift": float(tols_dict.get("max_residual_drift_mps", 0.03)),
                "min_objective_reward": 50.0
            }

            meta = CaseMetadata.from_dict(meta_dict, f"{path}.metadata")
            sim = SimulationConfig.from_dict(sim_dict, f"{path}.simulation_config")
            gt = GroundTruthExpectations.from_dict(gt_exp_dict, f"{path}.ground_truth_expectations")
            tol = AcceptanceTolerances.from_dict(acc_tol_dict, f"{path}.acceptance_tolerances")

            return cls(
                metadata=meta,
                simulation_config=sim,
                ground_truth_expectations=gt,
                acceptance_tolerances=tol,
                case_id=cid,
                lift_type=lt_str,
                ground_truth=gt_dict,
                tolerances=tols_dict,
                fault_injections=d.get("fault_injections", []),
                telemetry_samples=d.get("telemetry_samples")
            )

        # Standard declarative schema path
        if "metadata" not in d:
            raise ValidationError("Missing required top-level object 'metadata'", path)
        if "simulation_config" not in d:
            raise ValidationError("Missing required top-level object 'simulation_config'", path)
        if "ground_truth_expectations" not in d:
            raise ValidationError("Missing required top-level object 'ground_truth_expectations'", path)
        if "acceptance_tolerances" not in d:
            raise ValidationError("Missing required top-level object 'acceptance_tolerances'", path)

        meta = CaseMetadata.from_dict(d["metadata"], f"{path}.metadata")
        sim = SimulationConfig.from_dict(d["simulation_config"], f"{path}.simulation_config")
        gt = GroundTruthExpectations.from_dict(d["ground_truth_expectations"], f"{path}.ground_truth_expectations")
        tol = AcceptanceTolerances.from_dict(d["acceptance_tolerances"], f"{path}.acceptance_tolerances")

        # Cross-field validations
        if meta.lift_type in (
            LiftCategory.ABORTED_DESCENT,
            LiftCategory.FAILED_CONCENTRIC,
            LiftCategory.FLOOR_DROP,
            LiftCategory.RACK_COLLISION
        ):
            if gt.expected_reps != 0:
                raise ValidationError(
                    f"Lift type {meta.lift_type.value} is an edge case and must expect exactly 0 reps (got {gt.expected_reps})",
                    f"{path}.ground_truth_expectations.expected_reps"
                )

        if sim.kinematics.rep_count != gt.expected_reps and meta.lift_type not in (
            LiftCategory.ABORTED_DESCENT,
            LiftCategory.FAILED_CONCENTRIC,
            LiftCategory.FLOOR_DROP,
            LiftCategory.RACK_COLLISION
        ):
            raise ValidationError(
                f"kinematics.rep_count ({sim.kinematics.rep_count}) must match ground_truth_expectations.expected_reps ({gt.expected_reps})",
                f"{path}.simulation_config.kinematics.rep_count"
            )

        return cls(
            metadata=meta,
            simulation_config=sim,
            ground_truth_expectations=gt,
            acceptance_tolerances=tol,
            case_id=d.get("case_id", meta.case_id),
            lift_type=d.get("lift_type", to_canonical_lift_type(meta.lift_type)),
            ground_truth=d.get("ground_truth"),
            tolerances=d.get("tolerances"),
            fault_injections=d.get("fault_injections", []),
            telemetry_samples=d.get("telemetry_samples")
        )

    @classmethod
    def from_json(cls, json_str: str) -> RegressionCase:
        try:
            d = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValidationError(f"Invalid JSON syntax: {e}", "$")
        return cls.from_dict(d)

    @classmethod
    def from_file(cls, filepath: str) -> RegressionCase:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Regression case file not found: {filepath}")
        with open(filepath, "r", encoding="utf-8") as f:
            return cls.from_json(f.read())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary with dual canonical & rich schema compatibility."""
        def _serialize(obj: Any) -> Any:
            if isinstance(obj, Enum):
                return obj.value
            if isinstance(obj, (list, tuple)):
                return [_serialize(item) for item in obj]
            if isinstance(obj, dict):
                return {k: _serialize(v) for k, v in obj.items()}
            if hasattr(obj, "__dataclass_fields__"):
                return {k: _serialize(getattr(obj, k)) for k in obj.__dataclass_fields__}
            return obj

        res = {
            "case_id": self.case_id or self.metadata.case_id,
            "lift_type": self.lift_type or to_canonical_lift_type(self.metadata.lift_type),
            "ground_truth": self.ground_truth,
            "tolerances": self.tolerances,
            "fault_injections": self.fault_injections or [],
            "metadata": _serialize(self.metadata),
            "simulation_config": _serialize(self.simulation_config),
            "ground_truth_expectations": _serialize(self.ground_truth_expectations),
            "acceptance_tolerances": _serialize(self.acceptance_tolerances)
        }
        if self.telemetry_samples is not None:
            res["telemetry_samples"] = _serialize(self.telemetry_samples)
        return res

    def to_json(self, indent: int = 2) -> str:
        """Convert to formatted JSON string."""
        return json.dumps(self.to_dict(), indent=indent)

    def save(self, filepath: str) -> None:
        """Write regression case to JSON file."""
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(self.to_json(indent=2) + "\n")
