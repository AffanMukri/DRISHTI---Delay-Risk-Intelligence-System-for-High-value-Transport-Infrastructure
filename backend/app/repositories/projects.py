from typing import Any

from sqlalchemy import text

from app.repositories.base import BaseRepository


PROJECT_COLUMNS = """
    p.project_code as id,
    p.id as database_id,
    p.name,
    m.name as ministry,
    a.name as implementing_agency,
    p.department,
    p.sector,
    p.project_type,
    p.state_display as state,
    p.states,
    p.description,
    p.status::text as status,
    btrim(p.currency) as currency,
    p.approved_cost::double precision as approved_cost,
    p.revised_cost::double precision as revised_cost,
    p.expenditure::double precision as expenditure,
    p.physical_progress::double precision as physical_progress,
    p.planned_progress::double precision as planned_progress,
    p.financial_progress::double precision as financial_progress,
    p.original_completion_date,
    p.revised_completion_date,
    p.delay_days,
    p.last_reported_at,
    p.cost_breakdown,
    p.latitude::double precision as latitude,
    p.longitude::double precision as longitude,
    case when r.id is null then null else jsonb_build_object(
      'overall_score', r.overall_score::double precision,
      'risk_level', r.risk_level::text
    ) end as risk
"""


class ProjectRepository(BaseRepository):
    async def list_public(
        self,
        *,
        search: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], int]:
        result = await self.session.execute(
            text(
                """
                select
                  p.project_code as id,
                  p.name,
                  p.ministry,
                  p.implementing_agency,
                  p.sector,
                  p.project_type,
                  p.state,
                  p.description,
                  p.status::text as status,
                  btrim(p.currency) as currency,
                  p.approved_cost::double precision as approved_cost,
                  p.revised_cost::double precision as revised_cost,
                  p.physical_progress::double precision as physical_progress,
                  p.original_completion_date,
                  p.revised_completion_date,
                  p.last_reported_at,
                  '[]'::jsonb as milestones,
                  count(*) over() as total_rows
                from public.public_project_catalog p
                where true
                  and (cast(:search as text) is null or
                       p.name ilike '%%' || :search || '%%' or
                       p.project_code ilike '%%' || :search || '%%' or
                       p.state ilike '%%' || :search || '%%' or
                       p.sector ilike '%%' || :search || '%%')
                order by p.name
                limit :limit offset :offset
                """
            ),
            {"search": search, "limit": limit, "offset": offset},
        )
        rows = self.rows(result)
        total = int(rows[0].pop("total_rows")) if rows else 0
        for row in rows[1:]:
            row.pop("total_rows", None)
        return rows, total

    async def get_public(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(
            text(
                """
                select
                  p.database_id,
                  p.project_code as id,
                  p.name,
                  p.ministry,
                  p.implementing_agency,
                  p.sector,
                  p.project_type,
                  p.state,
                  p.description,
                  p.status::text as status,
                  btrim(p.currency) as currency,
                  p.approved_cost::double precision as approved_cost,
                  p.revised_cost::double precision as revised_cost,
                  p.physical_progress::double precision as physical_progress,
                  p.original_completion_date,
                  p.revised_completion_date,
                  p.last_reported_at
                from public.public_project_catalog p
                where (p.project_code = :identifier or p.id::text = :identifier)
                limit 1
                """
            ),
            {"identifier": identifier},
        )
        return self.row(result)

    async def get_public_milestones(self, project_database_id: Any) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                select name, planned_date
                from public.public_project_milestones
                where project_id = :project_id
                order by sequence_no, planned_date
                """
            ),
            {"project_id": project_database_id},
        )
        return self.rows(result)

    async def list(
        self,
        *,
        search: str | None,
        ministry: str | None,
        sector: str | None,
        status: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], int]:
        result = await self.session.execute(
            text(
                f"""
                select {PROJECT_COLUMNS}, count(*) over() as total_rows
                from public.projects p
                join public.ministries m on m.id = p.ministry_id
                left join public.agencies a on a.id = p.agency_id
                left join lateral (
                  select id, overall_score, risk_level
                  from public.project_risks
                  where project_id = p.id and is_current
                  order by assessed_at desc
                  limit 1
                ) r on true
                where (cast(:search as text) is null or
                       p.name ilike '%%' || :search || '%%' or
                       p.project_code ilike '%%' || :search || '%%' or
                       m.name ilike '%%' || :search || '%%')
                  and (cast(:ministry as text) is null or m.name = :ministry)
                  and (cast(:sector as text) is null or p.sector = :sector)
                  and (cast(:status as text) is null or p.status::text = :status)
                order by p.project_code
                limit :limit offset :offset
                """
            ),
            {
                "search": search,
                "ministry": ministry,
                "sector": sector,
                "status": status,
                "limit": limit,
                "offset": offset,
            },
        )
        rows = self.rows(result)
        total = int(rows[0].pop("total_rows")) if rows else 0
        for row in rows[1:]:
            row.pop("total_rows", None)
        return rows, total

    async def get(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(
            text(
                f"""
                select {PROJECT_COLUMNS}
                from public.projects p
                join public.ministries m on m.id = p.ministry_id
                left join public.agencies a on a.id = p.agency_id
                left join lateral (
                  select id, overall_score, risk_level
                  from public.project_risks
                  where project_id = p.id and is_current
                  order by assessed_at desc
                  limit 1
                ) r on true
                where p.project_code = :identifier or p.id::text = :identifier
                limit 1
                """
            ),
            {"identifier": identifier},
        )
        return self.row(result)

    async def get_milestones(self, project_database_id: Any) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                select id, milestone_code as code, name, node_type, sequence_no, planned_date,
                       forecast_date, actual_date, status::text as status, delay_days,
                       weight::double precision as weight
                from public.milestones
                where project_id = :project_id
                order by sequence_no, planned_date
                """
            ),
            {"project_id": project_database_id},
        )
        return self.rows(result)

    async def data_confidence_facts(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select
              p.id as project_database_id,
              p.project_code as project_id,
              p.name as project_name,
              ministry.name as ministry,
              agency.name as implementing_agency,
              p.sector,
              p.state_display as state,
              p.status::text as project_status,
              p.approved_cost::double precision as master_approved_cost,
              p.original_completion_date as master_original_completion_date,
              current_date as as_of_date,
              latest.id as latest_update_id,
              latest.reporting_month,
              latest.approved_cost::double precision as approved_cost,
              latest.revised_cost::double precision as revised_cost,
              latest.expenditure::double precision as expenditure,
              latest.physical_progress::double precision as physical_progress,
              latest.planned_progress::double precision as planned_progress,
              latest.clearance_status,
              latest.land_acquisition_target::double precision as land_acquisition_target,
              latest.land_acquisition_completed::double precision as land_acquisition_completed,
              latest.land_acquisition_progress::double precision as land_acquisition_progress,
              latest.contract_status,
              latest.milestones_total,
              latest.data_quality_status::text as data_quality_status,
              latest.source_system,
              history.reporting_months,
              coalesce(history.monthly_update_count, 0)::integer as monthly_update_count,
              coalesce(milestones.detailed_milestone_count, 0)::integer as detailed_milestone_count,
              coalesce(latest.metadata ? 'validation_evidence_version', false) as validation_record_available,
              coalesce(nullif(latest.metadata->>'anomaly_count', '')::integer, 0) as anomaly_count,
              case when jsonb_typeof(latest.metadata->'validation_errors') = 'array'
                then jsonb_array_length(latest.metadata->'validation_errors') else 0 end as validation_error_count,
              case when jsonb_typeof(latest.metadata->'validation_warnings') = 'array'
                then jsonb_array_length(latest.metadata->'validation_warnings') else 0 end as validation_warning_count
            from public.projects p
            join public.ministries ministry on ministry.id = p.ministry_id
            left join public.agencies agency on agency.id = p.agency_id
            left join lateral (
              select monthly.*
              from public.project_monthly_updates monthly
              where monthly.project_id = p.id
              order by monthly.reporting_month desc, monthly.created_at desc
              limit 1
            ) latest on true
            left join lateral (
              select
                array_agg(distinct monthly.reporting_month order by monthly.reporting_month) as reporting_months,
                count(distinct monthly.reporting_month)::integer as monthly_update_count
              from public.project_monthly_updates monthly
              where monthly.project_id = p.id
            ) history on true
            left join lateral (
              select count(*)::integer as detailed_milestone_count
              from public.milestones milestone
              where milestone.project_id = p.id
            ) milestones on true
            where p.project_code = :identifier or p.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def get_history(self, project_database_id: Any) -> dict[str, list[dict[str, Any]]]:
        monthly = await self.session.execute(
            text(
                """
                select reporting_month,
                       approved_cost::double precision as approved_cost,
                       revised_cost::double precision as revised_cost,
                       expenditure::double precision as expenditure,
                       physical_progress::double precision as physical_progress,
                       planned_progress::double precision as planned_progress,
                       financial_progress::double precision as financial_progress,
                       original_completion_date, revised_completion_date,
                       forecast_completion_date, delay_days, milestones_total,
                       milestones_completed, milestones_delayed, milestones_at_risk,
                       land_acquisition_progress::double precision as land_acquisition_progress,
                       clearance_status, contract_status, issues, remarks
                from public.project_monthly_updates
                where project_id = :project_id
                order by reporting_month
                """
            ),
            {"project_id": project_database_id},
        )
        cost = await self.session.execute(
            text(
                """
                select effective_date,
                       approved_cost::double precision as approved_cost,
                       revised_cost::double precision as revised_cost,
                       expenditure::double precision as expenditure,
                       estimated_at_completion::double precision as estimated_at_completion,
                       change_amount::double precision as change_amount,
                       change_reason
                from public.project_cost_history
                where project_id = :project_id
                order by effective_date
                """
            ),
            {"project_id": project_database_id},
        )
        schedule = await self.session.execute(
            text(
                """
                select effective_date, original_completion_date, revised_completion_date,
                       forecast_completion_date, delay_days,
                       physical_progress::double precision as physical_progress,
                       planned_progress::double precision as planned_progress,
                       revision_reason
                from public.project_schedule_history
                where project_id = :project_id
                order by effective_date
                """
            ),
            {"project_id": project_database_id},
        )
        return {
            "monthly_updates": self.rows(monthly),
            "cost_history": self.rows(cost),
            "schedule_history": self.rows(schedule),
        }
