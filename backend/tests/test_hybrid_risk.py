from __future__ import annotations

from copy import deepcopy
from uuid import UUID

import pytest

from app.analytics.hybrid_risk import RiskConfiguration, assess_project, rule_component
from app.config import Settings


def config(**values: object) -> RiskConfiguration:
    return RiskConfiguration.from_settings(Settings(app_env="test", **values))


def fact(project_number: int = 1, **changes: object) -> dict[str, object]:
    value: dict[str, object] = {
        "project_database_id": UUID(f"20000000-0000-0000-0000-{project_number:012d}"),
        "project_id": f"PX-{project_number:03d}",
        "sector": "Transport",
        "project_type": "Road",
        "approved_cost": 100,
        "revised_cost": 125,
        "physical_progress": 50,
        "planned_progress": 65,
        "financial_progress": 65,
        "delay_days": 182.5,
        "milestones_total": 4,
        "milestones_delayed": 1,
        "milestones_at_risk": 1,
        "is_synthetic": False,
        "cost_prediction": None,
        "schedule_prediction": None,
    }
    value.update(changes)
    return value


def test_rule_component_exactly_preserves_legacy_formula() -> None:
    component = rule_component(fact(), config())
    assert component["factors"] == {
        "progress": 50,
        "cost": 50,
        "schedule": 50,
        "milestone": 50,
        "expenditure": 50,
    }
    assert component["overallScore"] == 50
    assert component["costRisk"] == 50
    assert component["scheduleRisk"] == 50
    assert component["implementationRisk"] == 50


def test_missing_components_are_excluded_instead_of_scored_as_zero() -> None:
    row = fact(is_synthetic=True)
    result = assess_project(row, [row], config())
    assert result["overall_score"] == 50
    assert result["input_snapshot"]["components"]["statistical"]["available"] is False
    assert result["input_snapshot"]["components"]["ml"]["available"] is False
    assert result["input_snapshot"]["ensemble"]["effectiveWeights"]["overall"] == {"rule": 1.0}


def test_historical_and_genuine_ml_components_are_distinguishable() -> None:
    peers = [fact(index, revised_cost=100 + index * 5, delay_days=index * 30) for index in range(1, 7)]
    target = deepcopy(peers[-1])
    target["cost_prediction"] = {
        "synthetic": False,
        "significant_overrun_probability": 0.8,
        "model_name": "pragati_x_cost_overrun",
        "model_version": "1.0.0",
    }
    target["schedule_prediction"] = {
        "synthetic": False,
        "schedule_overrun_probability": 0.6,
        "model_name": "pragati_x_schedule_overrun",
        "model_version": "1.0.0",
    }
    peers[-1] = target
    result = assess_project(target, peers, config())
    components = result["input_snapshot"]["components"]
    assert components["rule"]["provenance"]["version"] == "deterministic-risk-v1"
    assert components["statistical"]["available"] is True
    assert components["statistical"]["provenance"]["peerCount"] == 6
    assert components["ml"]["overallScore"] == 70
    assert {model["modelName"] for model in components["ml"]["provenance"]["models"]} == {
        "pragati_x_cost_overrun", "pragati_x_schedule_overrun"
    }
    assert set(result["input_snapshot"]["ensemble"]["effectiveWeights"]["overall"]) == {"rule", "statistical", "ml"}


def test_invalid_hidden_weight_configuration_is_rejected() -> None:
    with pytest.raises(ValueError, match="must sum to 1.0"):
        Settings(app_env="test", risk_ensemble_rule_weight=0.9)
