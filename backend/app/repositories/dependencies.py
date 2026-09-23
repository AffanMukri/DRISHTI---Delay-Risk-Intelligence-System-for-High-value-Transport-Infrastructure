from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


class DependencyRepository(BaseRepository):
    async def project(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, project_code, name
            from public.projects
            where project_code = :identifier or id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def milestones(self, project_id: UUID) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select milestone.id, milestone.milestone_code as code, milestone.name, milestone.node_type,
                   milestone.sequence_no, milestone.planned_date, milestone.forecast_date,
                   milestone.actual_date, milestone.status::text as status,
                   milestone.delay_days,
                   coalesce(incoming.count, 0)::integer as incoming_dependencies,
                   coalesce(outgoing.count, 0)::integer as outgoing_dependencies
            from public.milestones milestone
            left join lateral (
              select count(*)::integer as count from public.milestone_dependencies dependency
              where dependency.downstream_milestone_id = milestone.id
            ) incoming on true
            left join lateral (
              select count(*)::integer as count from public.milestone_dependencies dependency
              where dependency.upstream_milestone_id = milestone.id
            ) outgoing on true
            where milestone.project_id = :project_id
            order by milestone.sequence_no, milestone.planned_date, milestone.milestone_code
        """), {"project_id": project_id})
        return self.rows(result)

    async def edges(self, project_id: UUID) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select id, upstream_milestone_id, downstream_milestone_id,
                   dependency_type, lag_days, source_system, source_reference,
                   metadata, created_by, created_at
            from public.milestone_dependencies
            where project_id = :project_id
            order by created_at, id
        """), {"project_id": project_id})
        return self.rows(result)

    async def resolve_milestone(self, project_id: UUID, reference: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, milestone_code as code, name
            from public.milestones
            where project_id = :project_id
              and (id::text = :reference or lower(milestone_code) = lower(:reference))
            limit 1
        """), {"project_id": project_id, "reference": reference})
        return self.row(result)

    async def insert_edge(
        self,
        *,
        project_id: UUID,
        upstream_id: UUID,
        downstream_id: UUID,
        dependency_type: str,
        lag_days: int,
        source_system: str,
        source_reference: str | None,
        actor_id: UUID,
    ) -> UUID:
        result = await self.session.execute(text("""
            insert into public.milestone_dependencies (
              project_id, upstream_milestone_id, downstream_milestone_id,
              dependency_type, lag_days, source_system, source_reference,
              metadata, created_by, updated_by
            ) values (
              :project_id, :upstream_id, :downstream_id, :dependency_type,
              :lag_days, :source_system, :source_reference,
              cast(:metadata as jsonb), :actor_id, :actor_id
            ) returning id
        """), {
            "project_id": project_id,
            "upstream_id": upstream_id,
            "downstream_id": downstream_id,
            "dependency_type": dependency_type,
            "lag_days": lag_days,
            "source_system": source_system,
            "source_reference": source_reference,
            "metadata": json.dumps({
                "definition_kind": "explicit",
                "causality_claimed": False,
            }),
            "actor_id": actor_id,
        })
        return result.scalar_one()

    async def delete_edge(self, project_id: UUID, dependency_id: UUID) -> bool:
        result = await self.session.execute(text("""
            delete from public.milestone_dependencies
            where id = :dependency_id and project_id = :project_id
            returning id
        """), {"dependency_id": dependency_id, "project_id": project_id})
        return result.scalar_one_or_none() is not None

    async def delete_all(self, project_id: UUID) -> None:
        await self.session.execute(text("""
            delete from public.milestone_dependencies where project_id = :project_id
        """), {"project_id": project_id})
