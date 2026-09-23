from datetime import date
from typing import Any


NUMERIC_FEATURES = [
    "approved_cost",
    "planned_duration_days",
    "elapsed_days",
    "physical_progress",
    "planned_progress",
    "progress_variance",
    "expenditure_to_approved_pct",
    "schedule_slippage_days",
    "milestone_completion_pct",
    "milestone_slippage_pct",
    "land_acquisition_progress",
    "issue_count",
    "start_year",
    "snapshot_year",
]

CATEGORICAL_FEATURES = [
    "sector",
    "project_type",
    "ministry",
    "implementing_agency",
    "state",
    "contract_status",
]

FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
LEAKAGE_EXCLUSIONS = [
    "revised_cost",
    "final_cost",
    "cost_overrun_percentage",
    "financial_progress",
    "cost_risk_score",
    "overall_risk_score",
    "latest_project_snapshot",
]


def normalize_feature_row(row: dict[str, Any]) -> dict[str, Any]:
    """Return only model-approved features with stable primitive types."""
    normalized: dict[str, Any] = {}
    for name in NUMERIC_FEATURES:
        value = row.get(name)
        normalized[name] = float(value) if value is not None else None
    for name in CATEGORICAL_FEATURES:
        value = row.get(name)
        normalized[name] = str(value).strip() if value not in (None, "") else "Not reported"
    return normalized


def feature_matrix(rows: list[dict[str, Any]]) -> list[list[Any]]:
    return [[normalize_feature_row(row)[name] for name in FEATURE_NAMES] for row in rows]


def target_final_cost(row: dict[str, Any]) -> float:
    return float(row["target_final_cost"])


def target_cost_ratio(row: dict[str, Any]) -> float:
    approved = float(row["approved_cost"])
    if approved <= 0:
        raise ValueError("Approved cost must be positive for a cost target.")
    return target_final_cost(row) / approved


def significant_overrun_target(row: dict[str, Any], threshold_pct: float) -> int:
    return int((target_cost_ratio(row) - 1) * 100 >= threshold_pct)


def parse_label_date(row: dict[str, Any]) -> date:
    value = row["label_date"]
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))
