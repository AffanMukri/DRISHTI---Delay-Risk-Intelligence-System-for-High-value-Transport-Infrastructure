from __future__ import annotations

from datetime import date

import pytest

from app.analytics.data_confidence import DataConfidenceConfiguration, calculate_data_confidence
from app.config import Settings


def config(**values: object) -> DataConfidenceConfiguration:
    return DataConfidenceConfiguration.from_settings(Settings(app_env="test", **values))


def complete_facts(**changes: object) -> dict[str, object]:
    value: dict[str, object] = {
        "project_id": "PX-001",
        "project_name": "National Corridor",
        "ministry": "Ministry of Infrastructure",
        "implementing_agency": "National Projects Agency",
        "sector": "Transport",
        "state": "Delhi",
        "project_status": "active",
        "master_approved_cost": 1000,
        "master_original_completion_date": date(2027, 12, 31),
        "as_of_date": date(2026, 9, 20),
        "latest_update_id": "update-1",
        "reporting_month": date(2026, 9, 1),
        "approved_cost": 1000,
        "revised_cost": 1100,
        "expenditure": 500,
        "physical_progress": 55,
        "planned_progress": 60,
        "clearance_status": {"environment": "approved"},
        "land_acquisition_target": 100,
        "land_acquisition_completed": 90,
        "land_acquisition_progress": 90,
        "contract_status": "active",
        "milestones_total": 5,
        "data_quality_status": "validated",
        "source_system": "CUF",
        "reporting_months": [date(2025, month, 1) for month in range(10, 13)] + [date(2026, month, 1) for month in range(1, 10)],
        "monthly_update_count": 12,
        "detailed_milestone_count": 5,
        "validation_record_available": True,
        "anomaly_count": 0,
        "validation_error_count": 0,
        "validation_warning_count": 0,
    }
    value.update(changes)
    return value


def test_complete_fresh_validated_data_scores_full_confidence() -> None:
    result = calculate_data_confidence(complete_facts(), config())
    assert result["overall_score"] == 100
    assert result["rating"] == "high"
    assert result["score_type"] == "data_quality"
    assert result["is_prediction_probability"] is False
    assert result["missing_fields"] == []
    assert result["stale_fields"] == []


def test_missing_data_is_penalized_and_never_defaulted_to_reliable() -> None:
    facts = complete_facts(
        master_approved_cost=0,
        master_original_completion_date=None,
        latest_update_id=None,
        reporting_month=None,
        approved_cost=None,
        revised_cost=None,
        expenditure=None,
        physical_progress=None,
        planned_progress=None,
        clearance_status={},
        land_acquisition_target=None,
        land_acquisition_completed=None,
        land_acquisition_progress=None,
        implementing_agency=None,
        contract_status=None,
        milestones_total=None,
        reporting_months=[],
        detailed_milestone_count=0,
        data_quality_status=None,
        validation_record_available=False,
    )
    result = calculate_data_confidence(facts, config())
    assert result["overall_score"] < 20
    assert result["rating"] == "very_low"
    assert "latest_monthly_update" in result["missing_fields"]
    assert "physical_progress" in result["missing_fields"]
    assert result["reasons_lowering_confidence"]


def test_anomalies_and_unresolved_validation_issues_reduce_only_validation_component() -> None:
    result = calculate_data_confidence(
        complete_facts(anomaly_count=1, validation_warning_count=2),
        config(),
    )
    validation = next(component for component in result["components"] if component["code"] == "validation_quality")
    assert validation["score"] == 60
    assert result["overall_score"] == 98


def test_invalid_confidence_weights_are_rejected() -> None:
    with pytest.raises(ValueError, match="must sum to 1.0"):
        Settings(app_env="test", data_confidence_required_fields_weight=0.50)
