from datetime import date
from typing import Any


NUMERIC_FEATURES = [
    "original_approved_cost",
    "planned_duration_days",
    "elapsed_days",
    "elapsed_duration_pct",
    "physical_progress",
    "planned_progress",
    "progress_variance",
    "previous_physical_progress",
    "previous_planned_progress",
    "monthly_progress_velocity",
    "expenditure_to_approved_pct",
    "reported_delay_days",
    "milestone_completion_pct",
    "milestone_delay_pct",
    "land_acquisition_progress",
    "clearance_completion_pct",
    "clearance_pending_count",
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
    "clearance_risk_status",
]

FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
LEAKAGE_EXCLUSIONS = [
    "actual_completion_date",
    "target_completion_variance_days",
    "final_delay_days",
    "latest_project_snapshot",
    "final_milestone_actual_dates",
    "project_status_completed_at_prediction_time",
    "schedule_risk_score",
    "overall_risk_score",
]


def normalize_feature_row(row: dict[str, Any]) -> dict[str, Any]:
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


def target_completion_variance_days(row: dict[str, Any]) -> float:
    return float(row["target_completion_variance_days"])


def schedule_overrun_target(row: dict[str, Any], threshold_days: int) -> int:
    return int(target_completion_variance_days(row) > threshold_days)


def parse_label_date(row: dict[str, Any]) -> date:
    value = row["label_date"]
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))
