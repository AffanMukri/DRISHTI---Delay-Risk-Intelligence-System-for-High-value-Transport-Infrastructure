from __future__ import annotations

from typing import Any
from uuid import UUID

from app.errors import AppError, ConflictError, NotFoundError
from app.repositories.interventions import InterventionRepository
from app.schemas.intervention import InterventionCreate, InterventionPatch


ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "open": {"assigned", "in_progress", "escalated", "resolved", "overdue"},
    "assigned": {"open", "in_progress", "escalated", "resolved", "overdue"},
    "in_progress": {"assigned", "escalated", "resolved", "overdue"},
    "escalated": {"in_progress", "resolved", "overdue"},
    "overdue": {"assigned", "in_progress", "escalated", "resolved"},
    "resolved": set(),
}


class InterventionService:
    def __init__(self, repository: InterventionRepository) -> None:
        self.repository = repository

    async def list(self, status: str | None, priority: str | None) -> dict[str, object]:
        rows = await self.repository.list(status=status, priority=priority)
        return {"items": rows, "total": len(rows)}

    async def officers(self) -> dict[str, object]:
        rows = await self.repository.list_officers()
        return {"items": rows, "total": len(rows)}

    async def history(self, identifier: str) -> dict[str, object]:
        intervention_id, rows = await self.repository.history(identifier)
        if intervention_id is None:
            raise NotFoundError("Intervention", identifier)
        return {"intervention_id": intervention_id, "items": rows, "total": len(rows)}

    async def create(self, payload: InterventionCreate, user_id: UUID) -> dict[str, object]:
        project = await self.repository.resolve_project(payload.project_id)
        if project is None:
            raise NotFoundError("Project", payload.project_id)

        warning_database_id = None
        if payload.warning_id:
            warning = await self.repository.resolve_warning(payload.warning_id)
            if warning is None:
                raise NotFoundError("Warning", payload.warning_id)
            if warning["project_id"] != project["id"]:
                raise ConflictError("The selected warning belongs to a different project.")
            existing = await self.repository.active_for_warning(warning["id"])
            if existing:
                raise ConflictError(
                    f"Warning {payload.warning_id} already has active intervention {existing['intervention_code']}."
                )
            warning_database_id = warning["id"]

        values = payload.model_dump(exclude={"project_id", "warning_id"})
        if payload.assigned_to:
            officer = await self.repository.resolve_assignee(payload.assigned_to)
            if officer is None:
                raise AppError("The assigned officer profile is missing or inactive.", code="invalid_assignee", status_code=422)
            values["assigned_to_name"] = officer["full_name"] or officer["email"]

        has_assignee = bool(values.get("assigned_to") or str(values.get("assigned_to_name") or "").strip())
        values["status"] = "assigned" if has_assignee else "open"
        values.update({
            "project_database_id": project["id"],
            "ministry_id": project["ministry_id"],
            "warning_database_id": warning_database_id,
        })
        row = await self.repository.create(values, user_id)
        if row is None:
            raise NotFoundError("Project", payload.project_id)
        return row

    async def update(self, identifier: str, payload: InterventionPatch, user_id: UUID) -> dict[str, object]:
        current = await self.repository.get(identifier)
        if current is None:
            raise NotFoundError("Intervention", identifier)

        changes = payload.model_dump(exclude_unset=True)
        if payload.assigned_to is not None:
            officer = await self.repository.resolve_assignee(payload.assigned_to)
            if officer is None:
                raise AppError("The assigned officer profile is missing or inactive.", code="invalid_assignee", status_code=422)
            changes["assigned_to_name"] = officer["full_name"] or officer["email"]

        assignment_changed = "assigned_to" in changes or "assigned_to_name" in changes
        if assignment_changed and "status" not in changes and current["status"] == "open":
            has_assignee = bool(changes.get("assigned_to") or str(changes.get("assigned_to_name") or "").strip())
            if has_assignee:
                changes["status"] = "assigned"

        target_status = str(changes.get("status") or current["status"])
        if target_status != current["status"] and target_status not in ALLOWED_TRANSITIONS[current["status"]]:
            raise ConflictError(f"Invalid intervention status transition: {current['status']} -> {target_status}.")

        effective: dict[str, Any] = {**current, **changes}
        has_assignee = bool(effective.get("assigned_to") or str(effective.get("assigned_to_name") or "").strip())
        if target_status in {"assigned", "in_progress", "escalated"} and not has_assignee:
            raise AppError("Assign a responsible officer before selecting this status.", code="assignee_required", status_code=422)
        if target_status in {"in_progress", "escalated"} and not effective.get("due_date"):
            raise AppError("Set a deadline before starting or escalating the intervention.", code="due_date_required", status_code=422)
        if target_status == "escalated" and not str(effective.get("escalation_reason") or "").strip():
            raise AppError("Provide an escalation reason.", code="escalation_reason_required", status_code=422)
        if target_status == "resolved" and not str(effective.get("resolution_summary") or "").strip():
            raise AppError("Provide resolution notes.", code="resolution_notes_required", status_code=422)

        row = await self.repository.update(identifier, changes, user_id)
        if row is None:
            raise NotFoundError("Intervention", identifier)
        return row
