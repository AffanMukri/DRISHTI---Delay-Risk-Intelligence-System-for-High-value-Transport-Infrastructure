from datetime import date
from uuid import UUID

import pytest

from app.analytics.benchmarking import build_peer_benchmark, cost_band
from app.errors import AppError


def fact(
    code: str,
    database_id: str,
    *,
    sector: str = "Transport",
    project_type: str = "Rail Infrastructure",
    states: list[str] | None = None,
    agency: str = "National Rail Agency",
    start_year: int = 2024,
    status: str = "active",
    original_cost: float = 20_000,
    overrun: float = 10,
    delay: int = 120,
    velocity: float = 2,
) -> dict[str, object]:
    return {
        "project_database_id": UUID(database_id),
        "project_id": code,
        "project_name": f"Project {code}",
        "ministry": "Ministry of Infrastructure",
        "implementing_agency": agency,
        "sector": sector,
        "project_type": project_type,
        "state": " / ".join(states or ["Maharashtra"]),
        "states": states or ["Maharashtra"],
        "status": status,
        "original_cost": original_cost,
        "revised_cost": original_cost * (1 + overrun / 100),
        "expenditure": original_cost * 0.5,
        "physical_progress": 55,
        "original_completion_date": date(start_year + 5, 1, 1),
        "current_completion_date": date(start_year + 5, 5, 1),
        "start_date": date(start_year, 1, 1),
        "start_date_source": "project_metadata",
        "as_of_date": date(2026, 9, 1),
        "total_milestones": 10,
        "completed_milestones": 6,
        "slipped_milestones": 2,
        "monthly_progress_velocity": velocity,
        "overall_risk_score": 50,
        "cost_risk_score": 45,
        "schedule_risk_score": 60,
        "implementation_risk_score": 40,
        "cost_overrun_percentage": overrun,
        "schedule_delay_days": delay,
        "planned_duration_days": 1826,
        "start_year": start_year,
        "expenditure_efficiency": 100,
        "milestone_slippage_percentage": 20,
        "milestone_completion_percentage": 60,
    }


@pytest.fixture
def facts() -> list[dict[str, object]]:
    return [
        fact("PX-001", "10000000-0000-0000-0000-000000000001"),
        fact(
            "PX-002",
            "10000000-0000-0000-0000-000000000002",
            start_year=2022,
            status="completed",
            overrun=20,
            delay=240,
            velocity=3,
        ),
        fact(
            "PX-003",
            "10000000-0000-0000-0000-000000000003",
            states=["Gujarat"],
            agency="Alternate Rail Agency",
            original_cost=30_000,
            overrun=0,
            delay=0,
            velocity=1,
        ),
        fact(
            "PX-004",
            "10000000-0000-0000-0000-000000000004",
            sector="Energy",
            project_type="Solar Power",
            states=["Rajasthan"],
            agency="Solar Corporation",
            original_cost=5_000,
        ),
    ]


def test_cost_band_boundaries_are_deterministic() -> None:
    assert cost_band(999) == "Below ₹1,000 Cr"
    assert cost_band(1_000) == "₹1,000-5,000 Cr"
    assert cost_band(100_000) == "₹100,000 Cr and above"
    assert cost_band(None) is None


def test_peer_engine_selects_and_explains_comparable_projects(facts: list[dict[str, object]]) -> None:
    result = build_peer_benchmark(
        facts,
        project_id="PX-001",
        comparison_project_id=None,
        max_peers=8,
    )
    assert [peer["project_id"] for peer in result["peers"]] == ["PX-002", "PX-003"]
    top_peer = result["peers"][0]
    assert top_peer["match_score"] == 100
    assert "Same sector: Transport" in top_peer["match_reasons"]
    assert "Same project type: Rail Infrastructure" in top_peer["match_reasons"]
    assert "Shared geography: Maharashtra" in top_peer["match_reasons"]
    assert top_peer["is_historical"] is True
    assert result["peer_group"]["historical_peer_count"] == 1


def test_engine_calculates_sector_peer_and_historical_medians(facts: list[dict[str, object]]) -> None:
    result = build_peer_benchmark(facts, project_id="PX-001", comparison_project_id="PX-003")
    cost_metric = next(metric for metric in result["metric_comparisons"] if metric["key"] == "cost_overrun_percentage")
    assert cost_metric["selected_value"] == 10
    assert cost_metric["sector_median"] == 10
    assert cost_metric["peer_median"] == 10
    assert cost_metric["historical_median"] == 20
    assert result["comparison_peer"]["project_id"] == "PX-003"


def test_engine_rejects_comparison_outside_peer_group(facts: list[dict[str, object]]) -> None:
    with pytest.raises(AppError) as error:
        build_peer_benchmark(facts, project_id="PX-001", comparison_project_id="PX-004")
    assert error.value.code == "invalid_peer_comparison"
