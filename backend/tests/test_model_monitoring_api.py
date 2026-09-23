from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from app.api.dependencies import get_model_monitoring_service
from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.main import create_app


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
MODEL_ID = UUID("20000000-0000-0000-0000-000000000001")


class FakeService:
    async def inventory(self):
        return {
            "items": [{
                "id": MODEL_ID,
                "name": "pragati_x_cost_overrun",
                "version": "1.0.0",
                "model_type": "cost_overrun_multitask",
                "algorithm": "ridge_regression+logistic_regression",
                "description": "Cost overrun model",
                "status": "active",
                "active": True,
                "training_date": None,
                "training_period": None,
                "training_rows": 120,
                "feature_list": ["approved_cost", "physical_progress"],
                "evaluation_metrics": {"regression": {"test": {"mae": 20}}},
                "deployed_at": None,
                "last_inference": None,
                "inference_count": 0,
                "latest_monitoring_run_id": None,
                "latest_monitoring_status": None,
                "latest_monitored_at": None,
                "latest_monitoring_summary": None,
                "monitoring_supported": True,
                "monitoring_unavailable_reason": None,
            }],
            "total": 1,
            "active_models": 1,
            "models_with_inference": 0,
            "models_requiring_attention": 0,
            "automatic_retraining_enabled": False,
        }


def profile(role: str) -> CurrentProfile:
    return CurrentProfile(
        id=USER_ID,
        email="user@example.gov.in",
        full_name="User",
        role=role,
        is_active=True,
    )


def test_administrator_can_view_model_inventory() -> None:
    app = create_app()
    app.dependency_overrides[get_model_monitoring_service] = lambda: FakeService()
    app.dependency_overrides[get_current_profile] = lambda: profile("administrator")
    with TestClient(app) as client:
        response = client.get("/api/model-monitoring")
    assert response.status_code == 200
    assert response.json()["items"][0]["trainingRows"] == 120
    assert response.json()["automaticRetrainingEnabled"] is False


def test_non_administrator_cannot_view_model_monitoring() -> None:
    app = create_app()
    app.dependency_overrides[get_model_monitoring_service] = lambda: FakeService()
    app.dependency_overrides[get_current_profile] = lambda: profile("analyst")
    with TestClient(app) as client:
        response = client.get("/api/model-monitoring")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "insufficient_permissions"
