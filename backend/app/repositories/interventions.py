from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text

from app.repositories.base import BaseRepository


INTERVENTION_COLUMNS = """
    i.intervention_code as id, i.id as database_id,
    p.project_code as project_id, p.name as project_name, m.name as ministry,
    w.warning_code as warning_id, w.title as warning_title,
    w.severity::text as warning_severity,
    i.issue, i.recommended_action,
    i.priority::text as priority, i.status::text as status, i.assigned_to,
    i.assigned_to_name, i.due_date, i.opened_at, i.resolved_at,
    i.resolution_summary, i.escalated_at, i.escalation_reason,
    i.escalated_by, i.notes, i.created_at, i.updated_at
"""


class InterventionRepository(BaseRepository):
    async def refresh_overdue(self) -> int:
        result = await self.session.execute(text("select public.refresh_overdue_interventions()"))
        return int(result.scalar_one() or 0)

    async def list(self, *, status: str | None, priority: str | None) -> list[dict[str, Any]]:
        await self.refresh_overdue()
        result = await self.session.execute(text(f"""
            select {INTERVENTION_COLUMNS}
            from public.interventions i
            join public.projects p on p.id = i.project_id
            join public.ministries m on m.id = p.ministry_id
            left join public.warnings w on w.id = i.warning_id
            where (cast(:status as text) is null or i.status::text = :status)
              and (cast(:priority as text) is null or i.priority::text = :priority)
            order by
              case i.status when 'overdue' then 0 when 'escalated' then 1 else 2 end,
              i.due_date nulls last, i.created_at desc, i.intervention_code
        """), {"status": status, "priority": priority})
        return self.rows(result)

    async def resolve_project(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, project_code, ministry_id
            from public.projects
            where project_code = :identifier or id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def resolve_warning(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, project_id, warning_code, title, description,
                   recommended_action, severity::text as severity
            from public.warnings
            where warning_code = :identifier or id::text = :identifier
            limit 1
            for update
        """), {"identifier": identifier})
        return self.row(result)

    async def active_for_warning(self, warning_id: UUID) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select intervention_code, status::text as status
            from public.interventions
            where warning_id = :warning_id and status <> 'resolved'
            limit 1
        """), {"warning_id": warning_id})
        return self.row(result)

    async def resolve_assignee(self, profile_id: UUID) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select officer.id, officer.full_name, officer.email,
                   officer.designation, officer.role
            from public.list_intervention_officers() officer
            where officer.id = :profile_id
        """), {"profile_id": profile_id})
        return self.row(result)

    async def list_officers(self) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select id, full_name, email, designation, role
            from public.list_intervention_officers()
        """))
        return self.rows(result)

    async def create(self, values: dict[str, Any], user_id: UUID) -> dict[str, Any] | None:
        code = f"INT-{datetime.now(UTC):%Y%m%d}-{uuid4().hex[:8].upper()}"
        await self.session.execute(
            text("select set_config('app.intervention_event_source', 'api_create', true)"),
        )
        await self.session.execute(
            text("select set_config('app.intervention_event_note', :note, true)"),
            {"note": values.get("notes") or "Intervention created through DRISHTI."},
        )
        result = await self.session.execute(text(f"""
            with inserted as (
              insert into public.interventions (
                intervention_code, project_id, warning_id, ministry_id, issue,
                recommended_action, priority, status, assigned_to,
                assigned_to_name, due_date, notes, created_by
              ) values (
                :code, :project_database_id, :warning_database_id, :ministry_id,
                :issue, :recommended_action, cast(:priority as public.intervention_priority),
                cast(:status as public.intervention_status), :assigned_to,
                :assigned_to_name, :due_date, :notes, :created_by
              ) returning *
            )
            select {INTERVENTION_COLUMNS}
            from inserted i
            join public.projects p on p.id = i.project_id
            join public.ministries m on m.id = p.ministry_id
            left join public.warnings w on w.id = i.warning_id
        """), {"code": code, "created_by": user_id, **values})
        return self.row(result)

    async def get(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text(f"""
            select {INTERVENTION_COLUMNS}
            from public.interventions i
            join public.projects p on p.id = i.project_id
            join public.ministries m on m.id = p.ministry_id
            left join public.warnings w on w.id = i.warning_id
            where i.intervention_code = :identifier or i.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def history(self, identifier: str) -> tuple[str | None, list[dict[str, Any]]]:
        intervention = await self.get(identifier)
        if intervention is None:
            return None, []
        result = await self.session.execute(text("""
            select update_row.id, intervention.intervention_code as intervention_id,
                   update_row.update_type, update_row.status::text as status,
                   update_row.note, update_row.previous_values, update_row.new_values,
                   update_row.metadata, update_row.created_by,
                   coalesce(profile.full_name, profile.email) as created_by_name,
                   update_row.occurred_at
            from public.intervention_updates update_row
            join public.interventions intervention on intervention.id = update_row.intervention_id
            left join public.list_intervention_officers() profile on profile.id = update_row.created_by
            where update_row.intervention_id = :intervention_id
            order by update_row.occurred_at desc, update_row.created_at desc
        """), {"intervention_id": intervention["database_id"]})
        return str(intervention["id"]), self.rows(result)

    async def update(self, identifier: str, changes: dict[str, Any], user_id: UUID) -> dict[str, Any] | None:
        allowed = {
            "status", "priority", "assigned_to", "assigned_to_name", "due_date",
            "resolution_summary", "escalation_reason", "recommended_action", "notes",
        }
        remark = changes.pop("remark", None)
        assignments: list[str] = []
        parameters: dict[str, Any] = {"identifier": identifier}
        for field, value in changes.items():
            if field not in allowed:
                continue
            if field == "status":
                assignments.append("status = cast(:status as public.intervention_status)")
            elif field == "priority":
                assignments.append("priority = cast(:priority as public.intervention_priority)")
            else:
                assignments.append(f"{field} = :{field}")
            parameters[field] = value

        if remark:
            assignments.append("notes = concat_ws(E'\\n', nullif(notes, ''), :remark)")
            parameters["remark"] = remark

        if changes.get("status") == "resolved":
            assignments.append("resolved_at = now()")
        elif "status" in changes:
            assignments.append("resolved_at = null")

        if not assignments:
            return await self.get(identifier)

        event_note = (
            remark
            or changes.get("resolution_summary")
            or changes.get("escalation_reason")
            or "Intervention updated through DRISHTI."
        )
        await self.session.execute(
            text("select set_config('app.intervention_event_source', 'api_patch', true)"),
        )
        await self.session.execute(
            text("select set_config('app.intervention_event_note', :note, true)"),
            {"note": event_note},
        )
        result = await self.session.execute(text(f"""
            update public.interventions
            set {', '.join(assignments)}
            where intervention_code = :identifier or id::text = :identifier
            returning id
        """), parameters)
        if result.scalar_one_or_none() is None:
            return None
        return await self.get(identifier)
