from datetime import UTC, date, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_dependency_service
from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.errors import ConflictError
from app.main import create_app
from app.schemas.dependencies import DependencyCreateRequest
from app.services.dependencies import DependencyService


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
PROJECT_ID = UUID("20000000-0000-0000-0000-000000000001")
M1 = UUID("30000000-0000-0000-0000-000000000001")
M2 = UUID("30000000-0000-0000-0000-000000000002")
M3 = UUID("30000000-0000-0000-0000-000000000003")
M4 = UUID("30000000-0000-0000-0000-000000000004")
E1 = UUID("40000000-0000-0000-0000-000000000001")
E2 = UUID("40000000-0000-0000-0000-000000000002")
E3 = UUID("40000000-0000-0000-0000-000000000003")


def profile(role: str = "administrator") -> CurrentProfile:
    return CurrentProfile(
        id=USER_ID,
        email="user@example.gov.in",
        full_name="Test User",
        role=role,
        is_active=True,
    )


def graph_payload():
    milestones = [
        {"id": M1, "code": "M1", "name": "Land Acquisition", "node_type": "milestone", "sequence_no": 1, "planned_date": date(2026, 1, 1), "forecast_date": None, "actual_date": None, "status": "delayed", "delay_days": 30, "incoming_dependencies": 0, "outgoing_dependencies": 1},
        {"id": M2, "code": "P1", "name": "Civil Package", "node_type": "package", "sequence_no": 2, "planned_date": date(2026, 2, 1), "forecast_date": None, "actual_date": None, "status": "on_track", "delay_days": None, "incoming_dependencies": 1, "outgoing_dependencies": 1},
        {"id": M3, "code": "M3", "name": "Commissioning", "node_type": "milestone", "sequence_no": 3, "planned_date": date(2026, 3, 1), "forecast_date": None, "actual_date": None, "status": "at_risk", "delay_days": None, "incoming_dependencies": 1, "outgoing_dependencies": 1},
        {"id": M4, "code": "M4", "name": "Closed Activity", "node_type": "milestone", "sequence_no": 4, "planned_date": date(2025, 12, 1), "forecast_date": None, "actual_date": date(2025, 12, 1), "status": "completed", "delay_days": None, "incoming_dependencies": 1, "outgoing_dependencies": 0},
    ]
    base = {"dependency_type": "finish_to_start", "lag_days": 0, "source_system": "MANUAL", "source_reference": "CPM-1", "metadata": {"definition_kind": "explicit"}, "created_by": USER_ID, "created_at": datetime(2026, 9, 21, tzinfo=UTC)}
    edges = [
        {"id": E1, "upstream_milestone_id": M1, "downstream_milestone_id": M2, **base},
        {"id": E2, "upstream_milestone_id": M2, "downstream_milestone_id": M3, **base},
        {"id": E3, "upstream_milestone_id": M3, "downstream_milestone_id": M4, **base},
    ]
    return milestones, edges


class FakeRepository:
    def __init__(self):
        self.milestone_rows, self.edge_rows = graph_payload()

    async def project(self, identifier):
        return {"id": PROJECT_ID, "project_code": "PRJ-001", "name": "Test Project"}

    async def milestones(self, project_id):
        return self.milestone_rows

    async def edges(self, project_id):
        return self.edge_rows

    async def resolve_milestone(self, project_id, reference):
        return next(({"id": item["id"], "code": item["code"], "name": item["name"]} for item in self.milestone_rows if reference in {str(item["id"]), item["code"]}), None)

    async def insert_edge(self, **values):
        return UUID("40000000-0000-0000-0000-000000000099")


@pytest.mark.asyncio
async def test_dependency_analysis_uses_only_explicit_edges_and_reports_depth() -> None:
    result = await DependencyService(FakeRepository()).graph("PRJ-001")
    nodes = {node["id"]: node for node in result["nodes"]}
    assert nodes[M1]["is_delayed_trigger"] is True
    assert nodes[M2]["potentially_affected"] is True
    assert nodes[M2]["dependency_depth"] == 1
    assert nodes[M3]["potentially_affected"] is True
    assert nodes[M3]["dependency_depth"] == 2
    assert nodes[M4]["potentially_affected"] is False
    assert result["summary"]["causality_claimed"] is False
    assert "not a claim" in result["summary"]["statement"]
    assert result["propagation_paths"][1]["milestone_codes"] == ["M1", "P1", "M3"]


@pytest.mark.asyncio
async def test_dependency_service_rejects_cycle_before_database_write() -> None:
    repository = FakeRepository()
    repository.edge_rows = [repository.edge_rows[0]]
    service = DependencyService(repository)
    with pytest.raises(ConflictError, match="cycle"):
        await service.create("PRJ-001", DependencyCreateRequest(
            upstream_milestone="P1",
            downstream_milestone="M1",
        ), profile())


class FakeApiService:
    async def graph(self, identifier):
        milestones, edges = graph_payload()
        return DependencyService._analyse(
            {"id": PROJECT_ID, "project_code": "PRJ-001", "name": "Test Project"},
            milestones,
            edges,
        )

    async def create(self, identifier, payload, current_profile):
        return await self.graph(identifier)

    async def import_edges(self, identifier, payload, current_profile):
        assert payload.source_reference == "CUF-DEPENDENCY-2026-09"
        return await self.graph(identifier)


def api_app(role: str):
    app = create_app()
    app.dependency_overrides[get_dependency_service] = lambda: FakeApiService()
    app.dependency_overrides[get_current_profile] = lambda: profile(role)
    return app


def test_executive_can_view_dependency_analysis_but_cannot_edit() -> None:
    with TestClient(api_app("executive")) as client:
        read_response = client.get("/api/projects/PRJ-001/dependencies")
        write_response = client.post("/api/projects/PRJ-001/dependencies", json={
            "upstreamMilestone": str(M1),
            "downstreamMilestone": str(M2),
            "dependencyType": "finish_to_start",
            "lagDays": 0,
        })
    assert read_response.status_code == 200
    assert read_response.json()["summary"]["causalityClaimed"] is False
    assert write_response.status_code == 403


def test_analyst_can_define_explicit_dependency() -> None:
    with TestClient(api_app("analyst")) as client:
        response = client.post("/api/projects/PRJ-001/dependencies", json={
            "upstreamMilestone": str(M1),
            "downstreamMilestone": str(M2),
            "dependencyType": "finish_to_start",
            "lagDays": 2,
            "sourceReference": "Approved CPM revision 4",
        })
    assert response.status_code == 201
    assert response.json()["summary"]["explicitDependencyCount"] == 3


def test_monitoring_officer_can_import_explicit_edges() -> None:
    with TestClient(api_app("monitoring_officer")) as client:
        response = client.post("/api/projects/PRJ-001/dependencies/import", json={
            "edges": [{
                "upstreamMilestone": "M1",
                "downstreamMilestone": "P1",
                "dependencyType": "finish_to_start",
                "lagDays": 0,
            }],
            "sourceSystem": "CUF",
            "sourceReference": "CUF-DEPENDENCY-2026-09",
            "replaceExisting": False,
        })
    assert response.status_code == 200
    assert response.json()["projectId"] == "PRJ-001"
