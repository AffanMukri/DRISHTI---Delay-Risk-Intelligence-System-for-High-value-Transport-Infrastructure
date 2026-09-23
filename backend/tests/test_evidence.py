from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from uuid import UUID

from app.auth.models import CurrentProfile
from app.services.evidence import EvidenceService


PROJECT_ID = UUID("20000000-0000-0000-0000-000000000001")
UPDATE_ID = UUID("30000000-0000-0000-0000-000000000001")
RISK_ID = UUID("40000000-0000-0000-0000-000000000001")
PREDICTION_ID = UUID("50000000-0000-0000-0000-000000000001")
WARNING_ID = UUID("60000000-0000-0000-0000-000000000001")
INTERVENTION_ID = UUID("70000000-0000-0000-0000-000000000001")
NOW = datetime(2026, 9, 20, 12, tzinfo=UTC)


def snapshot() -> dict[str, object]:
    return {
        "id": UPDATE_ID, "reporting_month": "2026-09-01", "approved_cost": 1000,
        "revised_cost": 1200, "expenditure": 700, "physical_progress": 50,
        "planned_progress": 67, "financial_progress": 64, "delay_days": 120,
        "milestones_total": 3, "milestones_delayed": 1, "milestones_at_risk": 1,
        "land_acquisition_progress": 55, "contract_status": "in_progress",
        "source_system": "CUF", "data_quality_status": "validated", "schema_version": 1,
    }


class Repository:
    async def project(self, identifier):
        return {"project_database_id": PROJECT_ID, "project_id": identifier, "project_name": "Test Project"}

    async def current_risk(self, project_id):
        return {
            "id": RISK_ID, "source_update_id": UPDATE_ID, "assessed_at": NOW,
            "assessment_period": date(2026, 9, 1), "overall_score": 78,
            "risk_level": "high_risk", "cost_risk": 70, "schedule_risk": 84,
            "implementation_risk": 72, "methodology": "hybrid-risk-v1",
            "explanation": "Stored hybrid score.",
            "input_snapshot": {"provenance": {"ensembleVersion": "hybrid-risk-v1", "ruleVersion": "deterministic-risk-v1"}},
            "source_snapshot": snapshot(),
            "drivers": [{"id": UUID("41000000-0000-0000-0000-000000000001"), "code": "RULE_PROGRESS", "name": "Progress Variance", "value": 57, "description": "Planned progress exceeds actual.", "created_at": NOW}],
        }

    async def predictions(self, project_id):
        return [{
            "id": PREDICTION_ID, "source_update_id": UPDATE_ID, "prediction_type": "completion_date",
            "generated_at": NOW, "model_name": "pragati_x_schedule_overrun", "model_version": "1.0.0",
            "training_data_version": "schedule-data-sha256", "feature_snapshot": {"progress_variance": -17},
            "source_snapshot": snapshot(), "metadata": {"synthetic": False},
            "output_payload": {
                "schedule_overrun_probability": 0.82, "expected_delay_days": 164,
                "predicted_completion_date": "2027-06-14",
                "explanation": {"ml": {"positive_drivers": [{
                    "feature": "progress_variance", "feature_label": "Physical progress variance",
                    "contribution": 16, "contribution_unit": "risk_points",
                }], "protective_drivers": []}, "rules": {"triggers": []}},
            },
        }]

    async def major_warnings(self, project_id):
        return [{
            "id": WARNING_ID, "warning_code": "EW-001", "risk_id": RISK_ID,
            "source_update_id": UPDATE_ID, "severity": "critical", "status": "new",
            "title": "Critical schedule warning", "description": "Model threshold exceeded.",
            "trigger_rule": "schedule_overrun_probability >= 0.75", "source_type": "ml",
            "evidence": [{"indicator": "schedule_overrun_probability", "current": 0.82,
                          "modelName": "pragati_x_schedule_overrun", "modelVersion": "1.0.0"}],
            "current_value": 0.82, "recommended_action": "Open a schedule recovery intervention.",
            "detected_at": NOW, "metadata": {"engine_version": "automated-warning-v1"},
            "source_snapshot": snapshot(),
        }]

    async def interventions(self, project_id):
        return [{
            "id": INTERVENTION_ID, "intervention_code": "INT-001", "warning_code": "EW-001",
            "recommended_action": "Approve the recovery baseline.", "created_at": NOW,
        }]

    async def milestones(self, project_id):
        return [{
            "id": UUID("80000000-0000-0000-0000-000000000001"), "milestone_code": "M13",
            "name": "Commissioning", "planned_date": date(2026, 6, 29), "actual_date": None,
        }]


def profile(role: str = "administrator") -> CurrentProfile:
    return CurrentProfile(
        id=UUID("10000000-0000-0000-0000-000000000001"),
        email="user@example.com", full_name="Evidence User", role=role, is_active=True,
    )


def test_evidence_chain_is_traceable_and_uses_persisted_values() -> None:
    result = asyncio.run(EvidenceService(Repository()).for_project("PX-001", profile()))  # type: ignore[arg-type]
    assert {chain["subject_type"] for chain in result["chains"]} == {"risk", "prediction", "warning"}
    assert all([node["stage"] for node in chain["nodes"]] == [
        "source_data", "derived_signal", "prediction", "explanation", "warning", "intervention"
    ] for chain in result["chains"])

    prediction = next(chain for chain in result["chains"] if chain["subject_type"] == "prediction")
    prediction_values = prediction["nodes"][2]["values"]
    assert next(value for value in prediction_values if value["field"] == "schedule_overrun_probability")["value"] == 0.82
    explanation_values = prediction["nodes"][3]["values"]
    assert explanation_values[0]["value"] == 16
    assert explanation_values[0]["formula"] == "SHAP model contribution"
    derived_values = prediction["nodes"][1]["values"]
    assert next(value for value in derived_values if value["field"] == "progress_variance")["value"] == -17
    assert any(value["label"] == "Milestone M13 overdue" for value in derived_values)
    assert prediction["nodes"][5]["values"][1]["label"] == "Created intervention INT-001"


def test_analyst_chain_reports_intervention_visibility_omission() -> None:
    class AnalystRepository(Repository):
        async def interventions(self, project_id):
            return []

    result = asyncio.run(EvidenceService(AnalystRepository()).for_project("PX-001", profile("analyst")))  # type: ignore[arg-type]
    assert any("not visible" in omission for omission in result["omissions"])
