from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient

from app.api.dependencies import get_experiment_service
from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.main import create_app


USER_ID = UUID("10000000-0000-0000-0000-000000000001")


def result() -> dict[str, object]:
    now = datetime(2026, 9, 21, 12, 0, tzinfo=UTC)
    return {
        "id": UUID("20000000-0000-0000-0000-000000000001"),
        "experiment_code": "cuf_vs_cuf_plus",
        "version": "test-1",
        "status": "insufficient_data",
        "requested_by": USER_ID,
        "started_at": now,
        "completed_at": now,
        "random_state": 42,
        "methodology": {"split": "chronological"},
        "feature_sets": {"model_a": {}, "model_b_external": {}},
        "feature_coverage": {"cost": [], "schedule": [], "risk": []},
        "metrics": {},
        "comparison": {},
        "limitations": ["No validated external observations."],
        "dataset_fingerprint_sha256": "a" * 64,
        "artifact_uri": "artifacts/experiments/test.json",
        "artifact_checksum_sha256": "b" * 64,
        "conclusion": "No consistent measured CUF+ improvement is established by this experiment.",
        "model_b_improvement_supported": False,
    }


class FakeExperimentService:
    async def run(self, version: str, _profile: CurrentProfile) -> dict[str, object]:
        return {**result(), "version": version}

    async def latest(self) -> dict[str, object]:
        return result()


def profile(role: str) -> CurrentProfile:
    return CurrentProfile(
        id=USER_ID,
        email="analyst@example.gov.in",
        full_name="Experiment Analyst",
        role=role,
        is_active=True,
    )


def test_analyst_can_run_and_response_is_camel_case() -> None:
    app = create_app()
    app.dependency_overrides[get_experiment_service] = lambda: FakeExperimentService()
    app.dependency_overrides[get_current_profile] = lambda: profile("analyst")
    with TestClient(app) as client:
        response = client.post("/api/experiments/cuf-plus/run", json={"version": "trial-1"})
    assert response.status_code == 201
    assert response.json()["experimentCode"] == "cuf_vs_cuf_plus"
    assert response.json()["modelBImprovementSupported"] is False


def test_executive_cannot_run_experiment() -> None:
    app = create_app()
    app.dependency_overrides[get_experiment_service] = lambda: FakeExperimentService()
    app.dependency_overrides[get_current_profile] = lambda: profile("executive")
    with TestClient(app) as client:
        response = client.post("/api/experiments/cuf-plus/run", json={"version": "trial-1"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "insufficient_permissions"
