"""Portfolio reporting-cycle comparison over persisted operational records."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any


SEVERE_LEVELS = {"high_risk", "critical"}
RECOVERED_LEVELS = {"watch", "healthy"}


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _delta(current: Any, previous: Any) -> float | None:
    current_number = _number(current)
    previous_number = _number(previous)
    if current_number is None or previous_number is None:
        return None
    return round(current_number - previous_number, 2)


def _project(previous: dict[str, Any], current: dict[str, Any], *, change_value: float | None = None, detail: str | None = None) -> dict[str, Any]:
    return {
        "project_id": current["project_id"],
        "project_name": current["project_name"],
        "ministry": current["ministry"],
        "sector": current["sector"],
        "state": current["state"],
        "previous_risk_level": previous["risk_level"],
        "current_risk_level": current["risk_level"],
        "previous_overall_risk": _number(previous.get("overall_risk")),
        "current_overall_risk": _number(current.get("overall_risk")),
        "previous_cost_risk": _number(previous.get("cost_risk")),
        "current_cost_risk": _number(current.get("cost_risk")),
        "previous_schedule_risk": _number(previous.get("schedule_risk")),
        "current_schedule_risk": _number(current.get("schedule_risk")),
        "previous_revised_cost": _number(previous.get("revised_cost")),
        "current_revised_cost": _number(current.get("revised_cost")),
        "change_value": change_value,
        "detail": detail,
    }


def _metric(projects: list[dict[str, Any]]) -> dict[str, Any]:
    return {"count": len(projects), "projects": projects}


def _warning_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "warning_id": row["warning_id"],
        "title": row["title"],
        "alert_type": row["alert_type"],
        "severity": row["severity"],
        "status": row["status"],
        "first_detected_at": row.get("first_detected_at"),
        "resolved_at": row.get("resolved_at"),
        "project_id": row["project_id"],
        "project_name": row["project_name"],
        "ministry": row["ministry"],
        "sector": row["sector"],
        "state": row["state"],
    }


def _dimension_changes(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    field: str,
) -> list[dict[str, Any]]:
    grouped: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for previous, current in pairs:
        grouped[str(current.get(field) or "Unspecified")].append((previous, current))

    changes: list[dict[str, Any]] = []
    for name, rows in grouped.items():
        previous_at_risk = [pair for pair in rows if pair[0]["risk_level"] in SEVERE_LEVELS]
        current_at_risk = [pair for pair in rows if pair[1]["risk_level"] in SEVERE_LEVELS]
        previous_capital = round(sum(_number(pair[0].get("revised_cost")) or 0 for pair in previous_at_risk), 2)
        current_capital = round(sum(_number(pair[1].get("revised_cost")) or 0 for pair in current_at_risk), 2)
        affected = [
            _project(previous, current, change_value=round(
                ((_number(current.get("revised_cost")) or 0) if current["risk_level"] in SEVERE_LEVELS else 0)
                - ((_number(previous.get("revised_cost")) or 0) if previous["risk_level"] in SEVERE_LEVELS else 0),
                2,
            ))
            for previous, current in rows
            if previous["risk_level"] in SEVERE_LEVELS or current["risk_level"] in SEVERE_LEVELS
        ]
        risk_count_change = len(current_at_risk) - len(previous_at_risk)
        capital_change = round(current_capital - previous_capital, 2)
        if risk_count_change == 0 and capital_change == 0:
            continue
        changes.append({
            "name": name,
            "previous_high_critical_projects": len(previous_at_risk),
            "current_high_critical_projects": len(current_at_risk),
            "project_count_change": risk_count_change,
            "previous_capital_exposed": previous_capital,
            "current_capital_exposed": current_capital,
            "capital_exposure_change": capital_change,
            "projects": sorted(affected, key=lambda item: abs(item["change_value"] or 0), reverse=True),
        })
    return sorted(
        changes,
        key=lambda item: (abs(item["project_count_change"]), abs(item["capital_exposure_change"])),
        reverse=True,
    )


def build_cycle_comparison(
    facts: dict[str, Any],
    *,
    significant_increase: float,
    emerging_driver_increase: float,
) -> dict[str, Any]:
    periods: list[date] = facts.get("periods", [])
    empty_metric = {"count": 0, "projects": []}
    if len(periods) < 2:
        return {
            "comparison_available": False,
            "latest_period": periods[0] if periods else None,
            "previous_period": None,
            "headline": "A second stored reporting cycle is required before month-on-month changes can be calculated.",
            "summary_points": [],
            "newly_high_risk": empty_metric,
            "newly_critical": empty_metric,
            "recovered": empty_metric,
            "significant_cost_risk_increase": empty_metric,
            "significant_schedule_risk_increase": empty_metric,
            "newly_overdue_milestones": {"count": 0, "project_count": 0, "projects": [], "milestones": []},
            "new_critical_warnings": {"count": 0, "warnings": []},
            "resolved_warnings": {"count": 0, "warnings": []},
            "capital_exposure": {"previous": 0, "current": 0, "change": 0, "change_percentage": None, "projects": []},
            "emerging_risk_drivers": [],
            "dimensions": {"sectors": [], "ministries": [], "states": []},
            "data_availability": {
                "latest_snapshot_projects": 0,
                "previous_snapshot_projects": 0,
                "comparable_projects": 0,
                "capital_comparable_projects": 0,
                "excluded_projects": 0,
            },
            "thresholds": {"significant_risk_increase_points": significant_increase, "emerging_driver_increase_points": emerging_driver_increase},
        }

    latest_period, previous_period = periods
    snapshots = facts.get("snapshots", [])
    latest = {row["project_id"]: row for row in snapshots if row["assessment_period"] == latest_period}
    previous = {row["project_id"]: row for row in snapshots if row["assessment_period"] == previous_period}
    comparable_ids = sorted(latest.keys() & previous.keys())
    pairs = [(previous[project_id], latest[project_id]) for project_id in comparable_ids]

    newly_high = [_project(old, new, change_value=_delta(new["overall_risk"], old["overall_risk"])) for old, new in pairs if new["risk_level"] == "high_risk" and old["risk_level"] in RECOVERED_LEVELS]
    newly_critical = [_project(old, new, change_value=_delta(new["overall_risk"], old["overall_risk"])) for old, new in pairs if new["risk_level"] == "critical" and old["risk_level"] != "critical"]
    recovered = [_project(old, new, change_value=_delta(new["overall_risk"], old["overall_risk"])) for old, new in pairs if old["risk_level"] in SEVERE_LEVELS and new["risk_level"] in RECOVERED_LEVELS]
    cost_increases = [
        _project(old, new, change_value=delta, detail="Cost risk increase")
        for old, new in pairs
        if (delta := _delta(new.get("cost_risk"), old.get("cost_risk"))) is not None and delta >= significant_increase
    ]
    schedule_increases = [
        _project(old, new, change_value=delta, detail="Schedule risk increase")
        for old, new in pairs
        if (delta := _delta(new.get("schedule_risk"), old.get("schedule_risk"))) is not None and delta >= significant_increase
    ]

    capital_projects: list[dict[str, Any]] = []
    capital_comparable_projects = 0
    previous_capital = 0.0
    current_capital = 0.0
    for old, new in pairs:
        if _number(old.get("revised_cost")) is None or _number(new.get("revised_cost")) is None:
            continue
        capital_comparable_projects += 1
        old_exposure = (_number(old.get("revised_cost")) or 0) if old["risk_level"] in SEVERE_LEVELS else 0
        new_exposure = (_number(new.get("revised_cost")) or 0) if new["risk_level"] in SEVERE_LEVELS else 0
        previous_capital += old_exposure
        current_capital += new_exposure
        if old_exposure or new_exposure:
            capital_projects.append(_project(old, new, change_value=round(new_exposure - old_exposure, 2)))
    previous_capital = round(previous_capital, 2)
    current_capital = round(current_capital, 2)
    capital_change = round(current_capital - previous_capital, 2)

    driver_groups: dict[tuple[str, str], list[tuple[dict[str, Any], float]]] = defaultdict(list)
    for old, new in pairs:
        old_drivers = {str(item.get("code")): item for item in old.get("drivers", [])}
        for driver in new.get("drivers", []):
            code = str(driver.get("code"))
            increase = round((_number(driver.get("value")) or 0) - (_number(old_drivers.get(code, {}).get("value")) or 0), 2)
            if increase >= emerging_driver_increase:
                driver_groups[(code, str(driver.get("name") or code))].append((_project(old, new, change_value=increase, detail="Driver score increase"), increase))
    emerging_drivers = [{
        "code": code,
        "name": name,
        "project_count": len(values),
        "average_increase": round(sum(item[1] for item in values) / len(values), 2),
        "maximum_increase": max(item[1] for item in values),
        "projects": sorted((item[0] for item in values), key=lambda project: project["change_value"] or 0, reverse=True),
    } for (code, name), values in driver_groups.items()]
    emerging_drivers.sort(key=lambda item: (item["project_count"], item["average_increase"]), reverse=True)

    milestone_rows = facts.get("milestones", [])
    milestone_project_counts: dict[str, int] = defaultdict(int)
    for item in milestone_rows:
        milestone_project_counts[item["project_id"]] += 1
    milestone_projects = [{
        "project_id": row["project_id"],
        "project_name": row["project_name"],
        "ministry": row["ministry"],
        "sector": row["sector"],
        "state": row["state"],
        "newly_overdue_count": milestone_project_counts[row["project_id"]],
    } for row in {item["project_id"]: item for item in milestone_rows}.values()]

    new_warnings = [_warning_event(row) for row in facts.get("new_critical_warnings", [])]
    resolved_warnings = [_warning_event(row) for row in facts.get("resolved_warnings", [])]
    severe_entries = len(newly_high) + len(newly_critical)
    summary_points = [
        f"{severe_entries} project{'s' if severe_entries != 1 else ''} newly entered High Risk or Critical.",
        f"{len(recovered)} project{'s' if len(recovered) != 1 else ''} recovered to Watch or Healthy.",
        f"Capital exposed to High/Critical risk changed by {capital_change:+,.2f} crore.",
        f"{len(new_warnings)} new critical warning{'s' if len(new_warnings) != 1 else ''} and {len(resolved_warnings)} resolved warning{'s' if len(resolved_warnings) != 1 else ''} were recorded.",
    ]
    return {
        "comparison_available": True,
        "latest_period": latest_period,
        "previous_period": previous_period,
        "headline": f"Portfolio movement from {previous_period:%B %Y} to {latest_period:%B %Y}",
        "summary_points": summary_points,
        "newly_high_risk": _metric(newly_high),
        "newly_critical": _metric(newly_critical),
        "recovered": _metric(recovered),
        "significant_cost_risk_increase": _metric(cost_increases),
        "significant_schedule_risk_increase": _metric(schedule_increases),
        "newly_overdue_milestones": {
            "count": len(milestone_rows),
            "project_count": len(milestone_projects),
            "projects": milestone_projects,
            "milestones": milestone_rows,
        },
        "new_critical_warnings": {"count": len(new_warnings), "warnings": new_warnings},
        "resolved_warnings": {"count": len(resolved_warnings), "warnings": resolved_warnings},
        "capital_exposure": {
            "previous": previous_capital,
            "current": current_capital,
            "change": capital_change,
            "change_percentage": round(capital_change / previous_capital * 100, 2) if previous_capital else None,
            "projects": sorted(capital_projects, key=lambda item: abs(item["change_value"] or 0), reverse=True),
        },
        "emerging_risk_drivers": emerging_drivers[:10],
        "dimensions": {
            "sectors": _dimension_changes(pairs, "sector"),
            "ministries": _dimension_changes(pairs, "ministry"),
            "states": _dimension_changes(pairs, "state"),
        },
        "data_availability": {
            "latest_snapshot_projects": len(latest),
            "previous_snapshot_projects": len(previous),
            "comparable_projects": len(pairs),
            "capital_comparable_projects": capital_comparable_projects,
            "excluded_projects": len((latest.keys() | previous.keys()) - (latest.keys() & previous.keys())),
        },
        "thresholds": {"significant_risk_increase_points": significant_increase, "emerging_driver_increase_points": emerging_driver_increase},
    }
