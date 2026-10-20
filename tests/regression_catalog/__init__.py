"""
tests/regression_catalog/__init__.py
Continual Learning Regression Catalog (R5) package.

Exports:
  - RegressionCase: Dataclass data model for declarative regression cases
  - ValidationError: Exception raised on schema validation failure
  - load_case: Convenience function to load and validate a single .json case
  - discover_cases: Function to recursively discover and load all cases in catalog
  - __version__: Version metadata
"""

from __future__ import annotations

import os
from typing import List, Tuple, Optional
from tests.regression_catalog.schema import (
    RegressionCase,
    ValidationError,
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
)

__version__ = "1.0.0"

DEFAULT_CASES_DIR = os.path.join(os.path.dirname(__file__), "cases")


def load_case(filepath: str) -> RegressionCase:
    """Load and validate a single declarative regression case from JSON file."""
    return RegressionCase.from_file(filepath)


def discover_cases(cases_dir: Optional[str] = None) -> List[Tuple[str, RegressionCase]]:
    """
    Recursively discover and parse all .json regression cases in the specified directory.
    Returns list of (filepath, RegressionCase) tuples sorted by case_id.
    """
    target_dir = cases_dir or DEFAULT_CASES_DIR
    cases = []
    if not os.path.exists(target_dir):
        return cases

    for root, _, files in os.walk(target_dir):
        for f in files:
            if f.endswith(".json") and not f.endswith(".tmp"):
                file_path = os.path.join(root, f)
                try:
                    case = load_case(file_path)
                    cases.append((file_path, case))
                except Exception as exc:
                    # Reraise or handle per caller requirement
                    raise ValidationError(f"Failed to load case {file_path}: {exc}") from exc

    return sorted(cases, key=lambda x: x[1].metadata.case_id)


def __getattr__(name: str):
    """Lazy import for failure ingestion pipeline functions to avoid runpy circular warnings."""
    if name in (
        "ingest_from_json",
        "ingest_failure",
        "ingest_trial_evaluation",
        "ingest_trajectory_slice",
        "generate_case_id",
    ):
        import tests.regression_catalog.ingest_failure as _ingest_mod
        return getattr(_ingest_mod, name)
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = [
    "RegressionCase",
    "ValidationError",
    "CaseMetadata",
    "SimulationConfig",
    "KinematicsProfile",
    "ChaosFaultProfile",
    "BootFaultConfig",
    "ThermalFaultConfig",
    "BiomechanicsFaultConfig",
    "ConnectivityFaultConfig",
    "GroundTruthExpectations",
    "AcceptanceTolerances",
    "LiftCategory",
    "MountOrientationEnum",
    "FSMPhaseEnum",
    "load_case",
    "discover_cases",
    "ingest_from_json",
    "ingest_failure",
    "ingest_trial_evaluation",
    "ingest_trajectory_slice",
    "generate_case_id",
    "__version__",
]
