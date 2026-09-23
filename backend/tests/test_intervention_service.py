import asyncio
from datetime import date
from uuid import UUID

import pytest

from app.errors import ConflictError
from app.schemas.intervention import InterventionCreate, InterventionPatch
from app.services.interventions import InterventionService


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
PROJECT_ID = UUID("20000000-0000-0000-0000-000000000001")
WARNING_ID = UUID("30000000-0000-0000-0000-000000000001")
OFFICER_ID = UUID("40000000-0000-0000-0000-000000000001")


class FakeInterventionRepository:
    def __init__(self) -> None:
        self.created_values = None
        self.updated_values = None
        self.current = {
            "id": "INT-001",
            "database_id": UUID("50000000-0000-0000-0000-000000000001"),
            "project_id": "PX-001",
            "project_name": "Test Project",
            "ministry": "Test Ministry",
            "status": "open",
            "assigned_to": None,
            "assigned_to_name": None,
            "due_date": None,
            "priority": "high",
            "recommended_action": "Resolve blockage",
            "resolution_summary": None,
            "escalation_reason": None,
        }

    async def resolve_project(self, identifier: str):
        return {"id": PROJECT_ID, "project_code": identifier, "ministry_id": None}

    async def resolve_warning(self, identifier: str):
        return {"id": WARNING_ID, "project_id": PROJECT_ID, "warning_code": identifier}

    async def active_for_warning(self, warning_id: UUID):
        return None

    async def resolve_assignee(self, profile_id: UUID):
        return {"id": profile_id, "full_name": "Nodal Officer", "email": "officer@example.com"}

    async def create(self, values, user_id: UUID):
        self.created_values = values
        return {**self.current, **values, "id": "INT-NEW"}

    async def get(self, identifier: str):
        return self.current

    async def update(self, identifier: str, changes, user_id: UUID):
        self.updated_values = changes
        self.current = {**self.current, **changes}
        return self.current


def test_create_from_warning_assigns_registered_officer_and_links_warning() -> None:
    repository = FakeInterventionRepository()
    service = InterventionService(repository)  # type: ignore[arg-type]

    asyncio.run(service.create(InterventionCreate(
        project_id="PX-001",
        warning_id="WARN-001",
        issue="Critical warning condition",
        recommended_action="Assign corrective action",
        priority="high",
        assigned_to=OFFICER_ID,
        due_date=date(2026, 10, 15),
    ), USER_ID))

    assert repository.created_values["warning_database_id"] == WARNING_ID
    assert repository.created_values["assigned_to_name"] == "Nodal Officer"
    assert repository.created_values["status"] == "assigned"


def test_assignment_from_open_persists_assigned_transition() -> None:
    repository = FakeInterventionRepository()
    service = InterventionService(repository)  # type: ignore[arg-type]

    asyncio.run(service.update("INT-001", InterventionPatch(
        assigned_to=OFFICER_ID,
        due_date=date(2026, 10, 15),
    ), USER_ID))

    assert repository.updated_values["assigned_to_name"] == "Nodal Officer"
    assert repository.updated_values["status"] == "assigned"


def test_resolved_intervention_cannot_be_reopened() -> None:
    repository = FakeInterventionRepository()
    repository.current["status"] = "resolved"
    repository.current["resolution_summary"] = "Completed."
    service = InterventionService(repository)  # type: ignore[arg-type]

    with pytest.raises(ConflictError, match="Invalid intervention status transition"):
        asyncio.run(service.update("INT-001", InterventionPatch(status="open"), USER_ID))
