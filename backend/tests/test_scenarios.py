from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from uuid import UUID

from app.config import Settings
from app.schemas.scenario import ScenarioRequest
from app.services.scenarios import ScenarioService


class PredictionFacts:
    async def cost_inference_features(self, identifier: str) -> dict[str, object]:
        return {
            "project_database_id": UUID("20000000-0000-0000-0000-000000000001"),
            "project_id": identifier,
            "project_name": "Test Project",
            "source_update_id": UUID("30000000-0000-0000-0000-000000000001"),
            "snapshot_date": date(2026, 9, 1),
            "approved_cost": 1000,
            "physical_progress": 50,
            "planned_progress": 65,
            "progress_variance": -15,
            "land_acquisition_progress": 40,
            "milestone_completion_pct": 50,
            "milestone_slippage_pct": 50,
            "issue_count": 4,
            "contract_status": "in_progress",
            "is_synthetic": False,
        }

    async def schedule_inference_features(self, identifier: str) -> dict[str, object]:
        return {
            "project_database_id": UUID("20000000-0000-0000-0000-000000000001"),
            "project_id": identifier,
            "project_name": "Test Project",
            "source_update_id": UUID("30000000-0000-0000-0000-000000000001"),
            "snapshot_date": date(2026, 9, 1),
            "original_completion_date": date(2027, 1, 1),
            "physical_progress": 50,
            "planned_progress": 65,
            "progress_variance": -15,
            "monthly_progress_velocity": 1,
            "land_acquisition_progress": 40,
            "milestone_completion_pct": 50,
            "milestone_delay_pct": 50,
            "issue_count": 4,
            "contract_status": "in_progress",
            "clearance_risk_status": "pending",
            "clearance_completion_pct": 50,
            "clearance_pending_count": 2,
            "is_synthetic": False,
        }

    async def active_cost_model(self) -> dict[str, object]:
        return {"artifact_uri": "cost.joblib", "artifact_checksum": "cost", "version": "1.0.0", "training_data_version": "cost-data"}

    async def active_schedule_model(self) -> dict[str, object]:
        return {"artifact_uri": "schedule.joblib", "artifact_checksum": "schedule", "version": "2.0.0", "training_data_version": "schedule-data"}


class RiskFacts:
    async def assessment_facts(self) -> list[dict[str, object]]:
        return [{
            "project_database_id": UUID("20000000-0000-0000-0000-000000000001"),
            "project_id": "PX-001",
            "project_name": "Test Project",
            "sector": "Transport",
            "project_type": "Road",
            "approved_cost": 1000,
            "revised_cost": 1200,
            "physical_progress": 50,
            "planned_progress": 65,
            "financial_progress": 60,
            "delay_days": 120,
            "milestones_total": 10,
            "milestones_delayed": 3,
            "milestones_at_risk": 2,
            "is_synthetic": False,
        }]


def explanation(feature: str, contribution: float) -> dict[str, object]:
    return {"ml": {"contributions": [{
        "feature": feature,
        "feature_label": "Land acquisition progress",
        "contribution": contribution,
        "contribution_unit": "model_output",
    }]}}


def test_simulator_runs_same_models_without_persisting(monkeypatch) -> None:
    cost_artifact = {"feature_names": [
        "physical_progress", "planned_progress", "progress_variance", "land_acquisition_progress",
        "milestone_completion_pct", "milestone_slippage_pct", "issue_count", "contract_status",
    ]}
    schedule_artifact = {"feature_names": [
        "physical_progress", "planned_progress", "progress_variance", "monthly_progress_velocity",
        "land_acquisition_progress", "milestone_completion_pct", "milestone_delay_pct", "issue_count",
        "contract_status", "clearance_risk_status", "clearance_completion_pct", "clearance_pending_count",
    ]}
    monkeypatch.setattr("app.services.scenarios.load_cost_model", lambda *_: cost_artifact)
    monkeypatch.setattr("app.services.scenarios.load_schedule_model", lambda *_: schedule_artifact)

    def cost_prediction(_artifact, features, *, training_data_version):
        land = float(features["land_acquisition_progress"])
        return {
            "predicted_final_cost": 1200 - land,
            "predicted_escalation_amount": 200 - land,
            "predicted_escalation_percentage": 20 - land / 10,
            "significant_overrun_probability": (100 - land) / 100,
            "model_name": "cost", "model_version": "1.0.0", "training_data_version": training_data_version,
            "generated_at": datetime.now(UTC), "synthetic": False,
            "explanation": explanation("land_acquisition_progress", (100 - land) / 5),
        }

    def schedule_prediction(_artifact, features, *, training_data_version):
        land = float(features["land_acquisition_progress"])
        delay = round(200 - land)
        return {
            "expected_delay_days": delay,
            "predicted_completion_date": date(2027, 1, 1),
            "schedule_overrun_probability": (100 - land) / 100,
            "model_name": "schedule", "model_version": "2.0.0", "training_data_version": training_data_version,
            "generated_at": datetime.now(UTC), "synthetic": False,
            "explanation": explanation("land_acquisition_progress", (100 - land) / 4),
        }

    monkeypatch.setattr("app.services.scenarios.predict_cost_overrun", cost_prediction)
    monkeypatch.setattr("app.services.scenarios.predict_schedule_overrun", schedule_prediction)

    service = ScenarioService(PredictionFacts(), RiskFacts(), Settings(app_env="test"))  # type: ignore[arg-type]
    response = asyncio.run(service.simulate("PX-001", ScenarioRequest(
        changes={"landAcquisitionProgress": 80}, assumptionNote="Accelerated acquisition"
    )))

    assert response["persists_changes"] is False
    assert response["before"]["schedule"]["expected_delay_days"] == 160
    assert response["scenario"]["schedule"]["expected_delay_days"] == 120
    assert response["scenario"]["cost"]["predicted_escalation_percentage"] < response["before"]["cost"]["predicted_escalation_percentage"]
    assert response["changed_variables"][0]["before_value"] == 40
    assert response["changed_variables"][0]["scenario_value"] == 80
    assert response["explanation"]["driver_changes"]
    assert response["disclaimer"] == "Scenario/model estimate - not a guaranteed project outcome."


def test_configuration_discloses_unsupported_resource_availability(monkeypatch) -> None:
    monkeypatch.setattr("app.services.scenarios.load_cost_model", lambda *_: {"feature_names": ["land_acquisition_progress"]})
    monkeypatch.setattr("app.services.scenarios.load_schedule_model", lambda *_: {"feature_names": ["land_acquisition_progress"]})
    service = ScenarioService(PredictionFacts(), RiskFacts(), Settings(app_env="test"))  # type: ignore[arg-type]
    response = asyncio.run(service.configuration("PX-001"))
    assert [item["code"] for item in response["supported_variables"]] == ["land_acquisition_progress"]
    assert response["unsupported_variables"][0]["code"] == "resource_availability"
