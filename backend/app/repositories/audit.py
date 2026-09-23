from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


class AuditRepository(BaseRepository):
    async def list(
        self,
        *,
        action: str | None,
        entity_type: str | None,
        source: str | None,
        actor_id: UUID | None,
        project_id: UUID | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        search: str | None,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        predicates = ["true"]
        parameters: dict[str, Any] = {"limit": limit, "offset": offset}
        for column, value in (
            ("audit.action", action),
            ("audit.entity_type", entity_type),
            ("audit.source", source),
            ("audit.actor_id", actor_id),
            ("audit.project_id", project_id),
        ):
            if value is not None:
                key = column.split(".")[-1]
                predicates.append(f"{column} = :{key}")
                parameters[key] = value
        if occurred_from is not None:
            predicates.append("audit.occurred_at >= :occurred_from")
            parameters["occurred_from"] = occurred_from
        if occurred_to is not None:
            predicates.append("audit.occurred_at <= :occurred_to")
            parameters["occurred_to"] = occurred_to
        if search:
            predicates.append("""(
              audit.action ilike :search or audit.entity_type ilike :search
              or coalesce(audit.record_key, '') ilike :search
              or coalesce(audit.request_reference, '') ilike :search
              or coalesce(audit.import_reference, '') ilike :search
              or coalesce(audit.actor_email, profile.email, '') ilike :search
              or coalesce(project.project_code, '') ilike :search
              or coalesce(project.name, '') ilike :search
            )""")
            parameters["search"] = f"%{search}%"
        where = " and ".join(predicates)
        count_result = await self.session.execute(text(f"""
            select count(*)::integer
            from public.audit_logs audit
            left join public.profiles profile on profile.id = audit.actor_id
            left join public.projects project on project.id = audit.project_id
            where {where}
        """), parameters)
        total = count_result.scalar_one()
        result = await self.session.execute(text(f"""
            select audit.id, audit.action, audit.entity_type, audit.entity_id,
                   audit.table_name, audit.record_key, audit.old_values, audit.new_values,
                   audit.source, audit.request_reference, audit.import_reference,
                   audit.ip_address::text as ip_address, audit.user_agent,
                   audit.metadata, audit.event_version, audit.occurred_at,
                   jsonb_build_object(
                     'id', audit.actor_id,
                     'email', coalesce(audit.actor_email, profile.email),
                     'full_name', profile.full_name,
                     'role', coalesce(audit.actor_role, profile.role::text)
                   ) as actor,
                   case when project.id is null then null else jsonb_build_object(
                     'id', project.id, 'project_code', project.project_code, 'name', project.name
                   ) end as project
            from public.audit_logs audit
            left join public.profiles profile on profile.id = audit.actor_id
            left join public.projects project on project.id = audit.project_id
            where {where}
            order by audit.occurred_at desc, audit.id desc
            limit :limit offset :offset
        """), parameters)
        rows = self.rows(result)
        return {"items": rows, "total": total, "limit": limit, "offset": offset}

    async def filter_options(self) -> dict[str, Any]:
        values = await self.session.execute(text("""
            select
              coalesce((select jsonb_agg(value order by value) from (
                select distinct action as value from public.audit_logs
              ) actions), '[]'::jsonb) as actions,
              coalesce((select jsonb_agg(value order by value) from (
                select distinct entity_type as value from public.audit_logs
              ) entities), '[]'::jsonb) as entity_types,
              coalesce((select jsonb_agg(value order by value) from (
                select distinct source as value from public.audit_logs
              ) sources), '[]'::jsonb) as sources,
              coalesce((select jsonb_agg(jsonb_build_object(
                'id', actor.id, 'email', actor.email, 'full_name', actor.full_name
              ) order by actor.email) from (
                select distinct on (profile.id) profile.id, profile.email, profile.full_name
                from public.audit_logs audit
                join public.profiles profile on profile.id = audit.actor_id
                order by profile.id
              ) actor), '[]'::jsonb) as actors
        """))
        return self.row(values) or {"actions": [], "entity_types": [], "sources": [], "actors": []}

    async def record_security_event(
        self,
        *,
        action: str,
        metadata: dict[str, Any],
    ) -> UUID:
        result = await self.session.execute(text("""
            select public.record_security_audit_event(:action, cast(:metadata as jsonb))
        """), {"action": action, "metadata": json.dumps(metadata, default=str)})
        return result.scalar_one()
