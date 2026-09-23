from datetime import date

from app.analytics.warning_engine import evaluate_warning_conditions
from app.config import Settings


def test_warning_engine_evaluates_deterministic_hybrid_and_ml_conditions() -> None:
    settings = Settings(_env_file=None)
    facts = {
        "reporting_month": date(2026, 9, 1),
        "current": {
            "approved_cost": 100,
            "revised_cost": 145,
            "expenditure": 100,
            "physical_progress": 40,
            "planned_progress": 70,
            "financial_progress": 72,
            "revised_completion_date": "2028-01-01",
        },
        "previous": {
            "approved_cost": 100,
            "revised_cost": 115,
            "expenditure": 55,
            "physical_progress": 40,
            "planned_progress": 55,
            "financial_progress": 48,
            "revised_completion_date": "2026-12-31",
        },
        "overdue_milestones": 5,
        "previous_overdue_milestones": 2,
        "current_risk_id": "risk-2",
        "current_risk_score": 88,
        "previous_risk_score": 55,
        "schedule_prediction": {
            "schedule_overrun_probability": 0.94,
            "model_name": "pragati_x_schedule_overrun",
            "model_version": "1.0.0",
            "synthetic": False,
        },
        "previous_schedule_probability": 0.61,
        "cost_prediction": {
            "significant_overrun_probability": 0.92,
            "model_name": "pragati_x_cost_overrun",
            "model_version": "1.0.0",
            "synthetic": False,
        },
        "previous_cost_probability": 0.58,
        "recent_physical_progress": [40, 40.2, 40.1, 40.0, 40.1, 39.9],
    }

    conditions = evaluate_warning_conditions(facts, settings)
    by_code = {condition["rule_code"]: condition for condition in conditions}

    assert set(by_code) == {
        "PROGRESS_VARIANCE",
        "COST_ESCALATION",
        "MILESTONE_OVERDUE",
        "EXPENDITURE_AHEAD_OF_PROGRESS",
        "COMPLETION_DATE_REVISION",
        "RISK_SCORE_INCREASE",
        "PREDICTED_DELAY_PROBABILITY",
        "PREDICTED_COST_OVERRUN",
        "REPEATED_STAGNATION",
    }
    assert by_code["PROGRESS_VARIANCE"]["severity"] == "critical"
    assert by_code["PREDICTED_DELAY_PROBABILITY"]["source_type"] == "ml"
    assert by_code["RISK_SCORE_INCREASE"]["source_type"] == "hybrid_risk"
    assert by_code["COMPLETION_DATE_REVISION"]["current_value"] == "2028-01-01"
    assert all(condition["recommended_action"] for condition in conditions)
    assert all(condition["evidence"] for condition in conditions)


def test_warning_engine_does_not_invent_ml_or_missing_value_conditions() -> None:
    settings = Settings(_env_file=None)
    conditions = evaluate_warning_conditions({
        "reporting_month": date(2026, 9, 1),
        "current": {"physical_progress": 62, "planned_progress": 65},
        "previous": {"physical_progress": 55, "planned_progress": 58},
        "recent_physical_progress": [62, 55, 48],
    }, settings)

    assert conditions == []
