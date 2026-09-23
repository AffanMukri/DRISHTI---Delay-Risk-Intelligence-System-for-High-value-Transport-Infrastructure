from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from app.analytics.cycle_comparison import build_cycle_comparison


LATEST = date(2026, 4, 1)
PREVIOUS = date(2026, 3, 1)


def snapshot(project_id: str, period: date, level: str, overall: float, cost: float, schedule: float, revised: float, *, driver: float) -> dict[str, object]:
    return {
        "project_id": project_id,
        "project_name": f"Project {project_id}",
        "ministry": "Ministry A" if project_id != "P3" else "Ministry B",
        "sector": "Transport" if project_id != "P3" else "Energy",
        "state": "Delhi" if project_id != "P3" else "Gujarat",
        "assessment_period": period,
        "risk_level": level,
        "overall_risk": overall,
        "cost_risk": cost,
        "schedule_risk": schedule,
        "implementation_risk": overall,
        "revised_cost": revised,
        "drivers": [{"code": "LAND", "name": "Land clearance", "value": driver}],
    }


def facts() -> dict[str, object]:
    snapshots = [
        snapshot("P1", PREVIOUS, "watch", 45, 35, 50, 100, driver=20),
        snapshot("P1", LATEST, "high_risk", 65, 50, 55, 120, driver=32),
        snapshot("P2", PREVIOUS, "critical", 82, 80, 84, 200, driver=70),
        snapshot("P2", LATEST, "healthy", 30, 28, 32, 210, driver=25),
        snapshot("P3", PREVIOUS, "high_risk", 70, 65, 72, 300, driver=40),
        snapshot("P3", LATEST, "critical", 84, 70, 88, 330, driver=50),
    ]
    project = snapshots[1]
    warning = {
        "warning_id": "WARN-1",
        "title": "Critical schedule warning",
        "alert_type": "schedule",
        "severity": "critical",
        "status": "new",
        "first_detected_at": datetime(2026, 4, 12, tzinfo=UTC),
        "resolved_at": None,
        **{key: project[key] for key in ("project_id", "project_name", "ministry", "sector", "state")},
    }
    resolved = {**warning, "warning_id": "WARN-2", "status": "resolved", "resolved_at": datetime(2026, 4, 20, tzinfo=UTC)}
    milestone = {
        "milestone_id": UUID("30000000-0000-0000-0000-000000000001"),
        "milestone_code": "M1",
        "milestone_name": "Land handover",
        "planned_date": date(2026, 3, 15),
        **{key: project[key] for key in ("project_id", "project_name", "ministry", "sector", "state")},
    }
    return {
        "periods": [LATEST, PREVIOUS],
        "snapshots": snapshots,
        "milestones": [milestone],
        "new_critical_warnings": [warning],
        "resolved_warnings": [resolved],
    }


def test_cycle_comparison_calculates_transitions_exposure_and_drilldowns() -> None:
    result = build_cycle_comparison(facts(), significant_increase=10, emerging_driver_increase=2)

    assert result["comparison_available"] is True
    assert result["newly_high_risk"]["count"] == 1
    assert result["newly_high_risk"]["projects"][0]["project_id"] == "P1"
    assert result["newly_critical"]["count"] == 1
    assert result["recovered"]["count"] == 1
    assert result["significant_cost_risk_increase"]["projects"][0]["change_value"] == 15
    assert result["significant_schedule_risk_increase"]["projects"][0]["project_id"] == "P3"
    assert result["capital_exposure"] == {
        "previous": 500.0,
        "current": 450.0,
        "change": -50.0,
        "change_percentage": -10.0,
        "projects": result["capital_exposure"]["projects"],
    }
    assert result["newly_overdue_milestones"]["count"] == 1
    assert result["new_critical_warnings"]["count"] == 1
    assert result["resolved_warnings"]["count"] == 1
    assert result["emerging_risk_drivers"][0]["name"] == "Land clearance"
    assert result["emerging_risk_drivers"][0]["project_count"] == 2
    assert result["dimensions"]["sectors"]
    assert result["data_availability"]["comparable_projects"] == 3
    assert result["data_availability"]["capital_comparable_projects"] == 3


def test_cycle_comparison_refuses_to_invent_a_previous_cycle() -> None:
    result = build_cycle_comparison(
        {"periods": [LATEST]},
        significant_increase=10,
        emerging_driver_increase=2,
    )
    assert result["comparison_available"] is False
    assert result["previous_period"] is None
    assert result["newly_critical"]["projects"] == []
