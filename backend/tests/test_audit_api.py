from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient

from app.api.dependencies import get_audit_service
from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.main import create_app


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
AUDIT_ID = UUID("20000000-0000-0000-0000-000000000001")


class FakeAuditService:
    async def list(self, **filters):
        return {
            "items": [{
                "id": AUDIT_ID,
                "actor": {
                    "id": USER_ID,
                    "email": "admin@example.gov.in",
                    "full_name": "Administrator",
                    "role": "administrator",
                },
                "project": None,
                "action": "prediction.executed",
                "entity_type": "prediction",
                "entity_id": AUDIT_ID,
                "table_name": "predictions",
                "record_key": str(AUDIT_ID),
                "old_values": None,
                "new_values": {"model_version": "1.0.0"},
                "source": "ml_inference",
                "request_reference": "request-1",
                "import_reference": None,
                "ip_address": None,
                "user_agent": None,
                "metadata": {},
                "event_version": 1,
                "occurred_at": datetime(2026, 9, 21, tzinfo=UTC),
            }],
            "total": 1,
            "limit": filters["limit"],
            "offset": filters["offset"],
        }

    async def filter_options(self):
        return {
            "actions": ["prediction.executed"],
            "entity_types": ["prediction"],
            "sources": ["ml_inference"],
            "actors": [{"id": USER_ID, "email": "admin@example.gov.in", "full_name": "Administrator"}],
        }

    async def record_security_event(self, action, metadata, profile):
        assert action in {"login_success", "logout_requested"}
        assert "password" not in metadata
        assert profile.id == USER_ID
        return {"audit_id": AUDIT_ID}


def profile(role: str) -> CurrentProfile:
    return CurrentProfile(
        id=USER_ID,
        email="admin@example.gov.in",
        full_name="Administrator",
        role=role,
        is_active=True,
    )


def app_for(role: str):
    app = create_app()
    app.dependency_overrides[get_audit_service] = lambda: FakeAuditService()
    app.dependency_overrides[get_current_profile] = lambda: profile(role)
    return app


def test_administrator_can_filter_audit_logs() -> None:
    with TestClient(app_for("administrator")) as client:
        response = client.get("/api/audit/logs?action=prediction.executed&limit=25")
    assert response.status_code == 200
    assert response.json()["items"][0]["source"] == "ml_inference"
    assert response.json()["items"][0]["newValues"]["model_version"] == "1.0.0"
    assert response.json()["limit"] == 25


def test_non_administrator_cannot_read_audit_logs() -> None:
    with TestClient(app_for("analyst")) as client:
        response = client.get("/api/audit/logs")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "insufficient_permissions"


def test_authenticated_user_can_record_allowlisted_security_event() -> None:
    with TestClient(app_for("executive")) as client:
        response = client.post("/api/audit/security-events", json={
            "action": "login_success",
            "metadata": {"client": "pragati-x-web"},
        })
    assert response.status_code == 200
    assert response.json()["auditId"] == str(AUDIT_ID)


def test_security_event_action_is_allowlisted_by_schema() -> None:
    with TestClient(app_for("administrator")) as client:
        response = client.post("/api/audit/security-events", json={
            "action": "arbitrary_admin_action",
            "metadata": {},
        })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_security_event_rejects_sensitive_or_unexpected_metadata() -> None:
    with TestClient(app_for("administrator")) as client:
        response = client.post("/api/audit/security-events", json={
            "action": "login_success",
            "metadata": {"client": "pragati-x-web", "password": "must-not-be-logged"},
        })
    assert response.status_code == 422
