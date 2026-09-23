from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from app.analytics.risk_trajectory import build_risk_trajectory, classify_direction


def snapshot(
    number: int,
    period: date,
    score: float,
    *,
    assessed_hour: int = 10,
    cost: float | None = None,
    schedule: float | None = None,
    implementation: float | None = None,
    driver_value: float = 20,
) -> dict[str, object]:
    return {
        "id": UUID(f"30000000-0000-0000-0000-{number:012d}"),
        "assessment_period": period,
        "assessed_at": datetime(2026, period.month, 15, assessed_hour, tzinfo=UTC),
        "overall_score": score,
        "cost_overrun_risk": cost,
        "schedule_delay_risk": schedule,
        "implementation_risk": implementation,
        "risk_level": "high_risk" if score >= 60 else "watch",
        "drivers": [{
            "code": "PROGRESS_GAP",
            "name": "Progress gap",
            "value": driver_value,
            "weighted_contribution": driver_value / 4,
            "description": "Actual progress trails plan.",
        }],
    }


def test_direction_thresholds_are_deterministic() -> None:
    assert classify_direction(None, stable_band=2, rapid_increase=10) == "stable"
    assert classify_direction(-3, stable_band=2, rapid_increase=10) == "improving"
    assert classify_direction(2, stable_band=2, rapid_increase=10) == "stable"
    assert classify_direction(6, stable_band=2, rapid_increase=10) == "deteriorating"
    assert classify_direction(10, stable_band=2, rapid_increase=10) == "rapidly_deteriorating"


def test_trajectory_uses_latest_stored_snapshot_per_month_and_explains_change() -> None:
    rows = [
        snapshot(1, date(2026, 7, 1), 50, cost=45, schedule=55, implementation=50),
        snapshot(2, date(2026, 8, 1), 54, cost=47, schedule=59, implementation=53, assessed_hour=9),
        # A later recalculation in August supersedes the earlier August snapshot.
        snapshot(3, date(2026, 8, 1), 57, cost=50, schedule=64, implementation=55, assessed_hour=14, driver_value=32),
        snapshot(4, date(2026, 9, 1), 69, cost=61, schedule=78, implementation=66, driver_value=55),
    ]

    trajectory = build_risk_trajectory(
        "PX-001",
        rows,
        stable_band=2,
        meaningful_increase=5,
        rapid_increase=10,
    )

    assert trajectory["total_months"] == 3
    assert [point["overall_risk"] for point in trajectory["points"]] == [50, 57, 69]
    assert trajectory["trend_direction"] == "rapidly_deteriorating"
    latest = trajectory["changes"][-1]
    assert latest["meaningful_increase"] is True
    assert latest["overall_change"] == 12
    assert latest["schedule_risk_change"] == 14
    assert latest["driver_changes"][0]["change_type"] == "increased"


def test_missing_domain_scores_remain_unavailable_instead_of_being_fabricated() -> None:
    trajectory = build_risk_trajectory(
        "PX-001",
        [snapshot(1, date(2026, 9, 1), 42)],
        stable_band=2,
        meaningful_increase=5,
        rapid_increase=10,
    )
    point = trajectory["points"][0]
    assert point["cost_risk"] is None
    assert point["schedule_risk"] is None
    assert point["implementation_risk"] is None
