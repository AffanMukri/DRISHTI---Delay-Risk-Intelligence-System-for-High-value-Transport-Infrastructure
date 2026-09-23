"""Deterministic risk-trajectory analytics over persisted monthly snapshots."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal


TrendDirection = Literal["improving", "stable", "deteriorating", "rapidly_deteriorating"]


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _period(row: dict[str, Any]) -> date:
    value = row.get("assessment_period")
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    assessed_at = row.get("assessed_at")
    if isinstance(assessed_at, datetime):
        return assessed_at.date()
    return date.fromisoformat(str(assessed_at)[:10])


def _assessed_at(row: dict[str, Any]) -> datetime:
    value = row.get("assessed_at")
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def classify_direction(
    delta: float | None,
    *,
    stable_band: float,
    rapid_increase: float,
) -> TrendDirection:
    """Classify a month-to-month overall-score delta using public thresholds."""
    if delta is None or abs(delta) <= stable_band:
        return "stable"
    if delta >= rapid_increase:
        return "rapidly_deteriorating"
    if delta > stable_band:
        return "deteriorating"
    return "improving"


def _driver_changes(previous: dict[str, Any], current: dict[str, Any]) -> list[dict[str, Any]]:
    previous_drivers = {str(item.get("code")): item for item in previous.get("drivers", [])}
    current_drivers = {str(item.get("code")): item for item in current.get("drivers", [])}
    changes: list[dict[str, Any]] = []
    for code in previous_drivers.keys() | current_drivers.keys():
        before = previous_drivers.get(code)
        after = current_drivers.get(code)
        previous_value = _number(before.get("value")) if before else None
        current_value = _number(after.get("value")) if after else None
        previous_contribution = _number(before.get("weighted_contribution")) if before else None
        current_contribution = _number(after.get("weighted_contribution")) if after else None
        value_delta = round((current_value or 0) - (previous_value or 0), 2)
        contribution_delta = round((current_contribution or 0) - (previous_contribution or 0), 2)
        if before is None:
            change_type = "added"
        elif after is None:
            change_type = "removed"
        elif value_delta > 0.1 or contribution_delta > 0.1:
            change_type = "increased"
        elif value_delta < -0.1 or contribution_delta < -0.1:
            change_type = "decreased"
        else:
            continue
        source = after or before or {}
        changes.append({
            "code": code,
            "name": source.get("name") or code.replace("_", " ").title(),
            "change_type": change_type,
            "previous_value": previous_value,
            "current_value": current_value,
            "value_delta": value_delta,
            "weighted_contribution_delta": contribution_delta,
            "description": source.get("description"),
        })
    return sorted(
        changes,
        key=lambda item: abs(item["weighted_contribution_delta"] or item["value_delta"]),
        reverse=True,
    )


def build_risk_trajectory(
    project_id: str,
    rows: list[dict[str, Any]],
    *,
    stable_band: float,
    meaningful_increase: float,
    rapid_increase: float,
) -> dict[str, Any]:
    """Return one authoritative stored snapshot per reporting month, oldest first."""
    latest_by_period: dict[date, dict[str, Any]] = {}
    for row in rows:
        period = _period(row)
        existing = latest_by_period.get(period)
        if existing is None or _assessed_at(row) > _assessed_at(existing):
            latest_by_period[period] = row

    monthly_rows = [latest_by_period[period] for period in sorted(latest_by_period)]
    points: list[dict[str, Any]] = []
    changes: list[dict[str, Any]] = []
    previous: dict[str, Any] | None = None
    for row in monthly_rows:
        overall_score = _number(row.get("overall_score")) or 0.0
        delta = None if previous is None else round(overall_score - (_number(previous.get("overall_score")) or 0), 2)
        direction = classify_direction(delta, stable_band=stable_band, rapid_increase=rapid_increase)
        meaningful = delta is not None and delta >= meaningful_increase
        point = {
            "snapshot_id": row["id"],
            "reporting_month": _period(row),
            "assessed_at": row["assessed_at"],
            "overall_risk": overall_score,
            "cost_risk": _number(row.get("cost_overrun_risk")),
            "schedule_risk": _number(row.get("schedule_delay_risk")),
            "implementation_risk": _number(row.get("implementation_risk")),
            "risk_level": row["risk_level"],
            "overall_change": delta,
            "trend_direction": direction,
            "meaningful_increase": meaningful,
        }
        points.append(point)
        if previous is not None:
            changes.append({
                "from_month": _period(previous),
                "to_month": _period(row),
                "overall_change": delta or 0.0,
                "cost_risk_change": _difference(row, previous, "cost_overrun_risk"),
                "schedule_risk_change": _difference(row, previous, "schedule_delay_risk"),
                "implementation_risk_change": _difference(row, previous, "implementation_risk"),
                "trend_direction": direction,
                "meaningful_increase": meaningful,
                "driver_changes": _driver_changes(previous, row),
            })
        previous = row

    return {
        "project_id": project_id,
        "trend_direction": points[-1]["trend_direction"] if len(points) > 1 else "stable",
        "points": points,
        "changes": changes,
        "total_months": len(points),
        "thresholds": {
            "stable_band_points": stable_band,
            "meaningful_increase_points": meaningful_increase,
            "rapid_increase_points": rapid_increase,
        },
    }


def _difference(current: dict[str, Any], previous: dict[str, Any], field: str) -> float | None:
    current_value = _number(current.get(field))
    previous_value = _number(previous.get(field))
    if current_value is None or previous_value is None:
        return None
    return round(current_value - previous_value, 2)
