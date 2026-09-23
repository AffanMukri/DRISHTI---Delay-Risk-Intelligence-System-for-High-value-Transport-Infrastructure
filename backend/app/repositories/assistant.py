from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


class AssistantRepository(BaseRepository):
    async def project(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select p.id as project_database_id, p.project_code as project_id, p.name as project_name,
                   p.sector, p.state_display as state, p.states
            from public.projects p
            where p.project_code = :identifier or p.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def projects_for_matching(self) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select id as project_database_id, project_code as project_id, name as project_name,
                   sector, state_display as state, states
            from public.projects
            order by length(name) desc, project_code
        """))
        return self.rows(result)

    async def cost_schedule_projects(
        self,
        *,
        threshold_pct: float,
        major_delay_days: int,
        sector: str | None,
        state: str | None,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            with facts as (
              select p.project_code as project_id, p.name as project_name, p.sector,
                     p.state_display as state, ministry.name as ministry,
                     coalesce(first_approved.value, nullif(p.approved_cost, 0))::double precision as approved_cost,
                     coalesce(latest_revised.value, nullif(p.revised_cost, 0))::double precision as revised_cost,
                     coalesce(latest_expenditure.value, p.expenditure)::double precision as expenditure,
                     coalesce(latest_progress.value, p.physical_progress)::double precision as physical_progress,
                     coalesce(first_completion.value, p.original_completion_date) as original_completion_date,
                     coalesce(latest_completion.value, p.revised_completion_date) as revised_completion_date,
                     p.last_reported_at,
                     risk.overall_score::double precision as overall_risk_score,
                     risk.risk_level::text as risk_level
              from public.projects p
              join public.ministries ministry on ministry.id = p.ministry_id
              left join lateral (
                select approved_cost as value from public.project_monthly_updates
                where project_id = p.id and approved_cost is not null
                order by reporting_month, created_at limit 1
              ) first_approved on true
              left join lateral (
                select revised_cost as value from public.project_monthly_updates
                where project_id = p.id and revised_cost is not null
                order by reporting_month desc, created_at desc limit 1
              ) latest_revised on true
              left join lateral (
                select expenditure as value from public.project_monthly_updates
                where project_id = p.id and expenditure is not null
                order by reporting_month desc, created_at desc limit 1
              ) latest_expenditure on true
              left join lateral (
                select physical_progress as value from public.project_monthly_updates
                where project_id = p.id and physical_progress is not null
                order by reporting_month desc, created_at desc limit 1
              ) latest_progress on true
              left join lateral (
                select original_completion_date as value from public.project_monthly_updates
                where project_id = p.id and original_completion_date is not null
                order by reporting_month, created_at limit 1
              ) first_completion on true
              left join lateral (
                select revised_completion_date as value from public.project_monthly_updates
                where project_id = p.id and revised_completion_date is not null
                order by reporting_month desc, created_at desc limit 1
              ) latest_completion on true
              left join lateral (
                select overall_score, risk_level from public.project_risks
                where project_id = p.id and is_current order by assessed_at desc limit 1
              ) risk on true
              where (cast(:sector as text) is null or lower(p.sector) like '%' || lower(:sector) || '%')
                and (cast(:state as text) is null or :state = any(p.states) or p.state_display ilike '%' || :state || '%')
            )
            select *,
                   ((revised_cost - approved_cost) / nullif(approved_cost, 0) * 100)::double precision as cost_escalation_pct,
                   case when original_completion_date is not null and revised_completion_date is not null
                     then revised_completion_date - original_completion_date end as delay_days
            from facts
            where approved_cost > 0 and revised_cost is not null
              and ((revised_cost - approved_cost) / approved_cost * 100) > :threshold_pct
              and original_completion_date is not null and revised_completion_date is not null
              and revised_completion_date - original_completion_date >= :major_delay_days
            order by cost_escalation_pct desc, delay_days desc
            limit 25
        """), {
            "threshold_pct": threshold_pct,
            "major_delay_days": major_delay_days,
            "sector": sector,
            "state": state,
        })
        return self.rows(result)

    async def risk_explanation(self, project_id: UUID) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select p.project_code as project_id, p.name as project_name, p.last_reported_at,
                   risk.id as risk_id, risk.assessed_at, risk.assessment_period,
                   risk.overall_score::double precision as overall_score,
                   risk.risk_level::text as risk_level,
                   risk.cost_overrun_risk::double precision as cost_risk,
                   risk.schedule_delay_risk::double precision as schedule_risk,
                   risk.implementation_risk::double precision as implementation_risk,
                   risk.methodology, risk.explanation,
                   coalesce((select jsonb_agg(jsonb_build_object(
                     'code', driver.driver_code, 'name', driver.name, 'impact', driver.impact,
                     'value', driver.value, 'weighted_contribution', driver.weighted_contribution,
                     'rank', driver.rank, 'description', driver.description, 'evidence', driver.evidence
                   ) order by driver.rank nulls last, driver.name)
                   from public.risk_drivers driver where driver.risk_id = risk.id), '[]'::jsonb) as drivers
            from public.projects p
            left join lateral (
              select * from public.project_risks where project_id = p.id and is_current
              order by assessed_at desc limit 1
            ) risk on true
            where p.id = :project_id
        """), {"project_id": project_id})
        return self.row(result)

    async def unresolved_interventions(self, *, state: str | None) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select intervention.intervention_code as intervention_id,
                   project.project_code as project_id, project.name as project_name,
                   project.state_display as state, ministry.name as ministry,
                   intervention.issue, intervention.recommended_action,
                   intervention.priority::text as priority, intervention.status::text as status,
                   intervention.assigned_to_name, intervention.due_date,
                   intervention.updated_at, warning.warning_code as warning_id
            from public.interventions intervention
            join public.projects project on project.id = intervention.project_id
            join public.ministries ministry on ministry.id = project.ministry_id
            left join public.warnings warning on warning.id = intervention.warning_id
            where intervention.status <> 'resolved'
              and (cast(:state as text) is null or :state = any(project.states) or project.state_display ilike '%' || :state || '%')
            order by case intervention.status when 'overdue' then 0 when 'escalated' then 1 else 2 end,
                     intervention.due_date nulls last, intervention.updated_at desc
            limit 30
        """), {"state": state})
        return self.rows(result)

    async def attention_required(
        self,
        *,
        sector: str | None,
        state: str | None,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select project.project_code as project_id, project.name as project_name,
                   project.sector, project.state_display as state, ministry.name as ministry,
                   project.last_reported_at,
                   risk.overall_score::double precision as overall_risk_score,
                   risk.risk_level::text as risk_level,
                   risk.assessed_at as risk_assessed_at,
                   coalesce(warning_counts.critical_warnings, 0)::integer as critical_warnings,
                   coalesce(warning_counts.open_warnings, 0)::integer as open_warnings,
                   coalesce(intervention_counts.overdue_interventions, 0)::integer as overdue_interventions
            from public.projects project
            join public.ministries ministry on ministry.id = project.ministry_id
            left join lateral (
              select overall_score, risk_level, assessed_at from public.project_risks
              where project_id = project.id and is_current order by assessed_at desc limit 1
            ) risk on true
            left join lateral (
              select count(*) filter (where severity = 'critical' and status <> 'resolved') as critical_warnings,
                     count(*) filter (where status <> 'resolved') as open_warnings
              from public.warnings where project_id = project.id
            ) warning_counts on true
            left join lateral (
              select count(*) filter (where status = 'overdue' or (status <> 'resolved' and due_date < current_date)) as overdue_interventions
              from public.interventions where project_id = project.id
            ) intervention_counts on true
            where (risk.risk_level in ('high_risk', 'critical')
                   or warning_counts.critical_warnings > 0 or intervention_counts.overdue_interventions > 0)
              and (cast(:sector as text) is null or lower(project.sector) like '%' || lower(:sector) || '%')
              and (cast(:state as text) is null or :state = any(project.states) or project.state_display ilike '%' || :state || '%')
            order by (risk.risk_level = 'critical') desc, warning_counts.critical_warnings desc,
                     intervention_counts.overdue_interventions desc, risk.overall_score desc nulls last
            limit 25
        """), {"sector": sector, "state": state})
        return self.rows(result)

    async def project_overview(self, project_id: UUID) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select project.project_code as project_id, project.name as project_name,
                   ministry.name as ministry, coalesce(agency.name, 'Not reported') as implementing_agency,
                   project.sector, project.project_type, project.state_display as state,
                   project.status::text as status, project.approved_cost::double precision as approved_cost,
                   project.revised_cost::double precision as revised_cost,
                   project.expenditure::double precision as expenditure,
                   project.physical_progress::double precision as physical_progress,
                   project.planned_progress::double precision as planned_progress,
                   project.original_completion_date, project.revised_completion_date,
                   project.delay_days, project.last_reported_at
            from public.projects project
            join public.ministries ministry on ministry.id = project.ministry_id
            left join public.agencies agency on agency.id = project.agency_id
            where project.id = :project_id
        """), {"project_id": project_id})
        return self.row(result)

    async def duplicate_document(self, project_id: UUID, checksum: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, title from public.documents
            where project_id = :project_id and checksum_sha256 = :checksum
            limit 1
        """), {"project_id": project_id, "checksum": checksum})
        return self.row(result)

    async def insert_document(self, values: dict[str, Any]) -> dict[str, Any]:
        result = await self.session.execute(text("""
            insert into public.documents (
              id, project_id, document_type, title, storage_bucket, storage_path,
              original_file_name, mime_type, size_bytes, checksum_sha256,
              source_system, uploaded_by, metadata
            ) values (
              :id, :project_id, :document_type, :title, 'local-project-documents', :storage_path,
              :original_file_name, 'application/pdf', :size_bytes, :checksum_sha256,
              'PRAGATI-X_ASSISTANT', :uploaded_by, cast(:metadata as jsonb)
            )
            returning id, created_at
        """), {**values, "metadata": json.dumps(values["metadata"])})
        return dict(result.mappings().one())

    async def insert_chunks(self, chunks: list[dict[str, Any]]) -> None:
        statement = text("""
            insert into public.document_chunks (
              id, document_id, project_id, chunk_index, page_number, content,
              character_count, content_sha256, embedding, embedding_model, metadata, created_by
            ) values (
              :id, :document_id, :project_id, :chunk_index, :page_number, :content,
              :character_count, :content_sha256, cast(:embedding as extensions.vector),
              :embedding_model, cast(:metadata as jsonb), :created_by
            )
        """)
        await self.session.execute(statement, chunks)

    async def audit_document(self, *, actor_id: UUID, project_id: UUID, document_id: UUID, values: dict[str, Any]) -> None:
        await self.session.execute(text("""
            insert into public.audit_logs (
              actor_id, project_id, action, entity_type, entity_id, table_name, record_key, new_values
            ) values (
              :actor_id, :project_id, 'assistant.document_ingested', 'project_document',
              :document_id, 'documents', :document_id_text, cast(:new_values as jsonb)
            )
        """), {
            "actor_id": actor_id,
            "project_id": project_id,
            "document_id": document_id,
            "document_id_text": str(document_id),
            "new_values": json.dumps(values),
        })

    async def list_documents(self, project_id: UUID) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select document.id, project.project_code as project_id, document.title,
                   document.document_type, document.original_file_name,
                   coalesce((document.metadata->>'page_count')::integer, 0) as page_count,
                   count(chunk.id)::integer as chunk_count,
                   max(chunk.embedding_model) as embedding_model,
                   document.created_at
            from public.documents document
            join public.projects project on project.id = document.project_id
            left join public.document_chunks chunk on chunk.document_id = document.id
            where document.project_id = :project_id and document.source_system = 'PRAGATI-X_ASSISTANT'
            group by document.id, project.project_code
            order by document.created_at desc
        """), {"project_id": project_id})
        return self.rows(result)

    async def search_document_chunks(
        self,
        *,
        embedding: list[float],
        project_id: UUID | None,
        limit: int,
        min_relevance: float,
    ) -> list[dict[str, Any]]:
        vector = "[" + ",".join(f"{value:.10g}" for value in embedding) + "]"
        result = await self.session.execute(text("""
            with ranked as (
              select chunk.id, chunk.document_id, chunk.project_id as project_database_id,
                     project.project_code as project_id, project.name as project_name,
                     document.title, document.document_type, document.original_file_name,
                     chunk.page_number, chunk.content, chunk.created_at,
                     1 - (chunk.embedding OPERATOR(extensions.<=>) cast(:embedding as extensions.vector)) as relevance_score
              from public.document_chunks chunk
              join public.documents document on document.id = chunk.document_id
              join public.projects project on project.id = chunk.project_id
              where (cast(:project_id as uuid) is null or chunk.project_id = :project_id)
              order by chunk.embedding OPERATOR(extensions.<=>) cast(:embedding as extensions.vector)
              limit :limit
            )
            select * from ranked where relevance_score >= :min_relevance
            order by relevance_score desc
        """), {
            "embedding": vector,
            "project_id": project_id,
            "limit": limit,
            "min_relevance": min_relevance,
        })
        return self.rows(result)
