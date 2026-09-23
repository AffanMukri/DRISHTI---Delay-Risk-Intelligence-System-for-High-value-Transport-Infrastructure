from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


PROJECT_SNAPSHOT_QUERY = """
select
  p.id as project_database_id,
  p.project_code as project_id,
  p.name as project_name,
  p.ministry_id,
  ministry.name as ministry,
  agency.name as implementing_agency,
  p.sector,
  p.project_type,
  p.state_display as state,
  p.status::text as project_status,
  btrim(p.currency) as currency,
  coalesce(first_approved.approved_cost, latest_update.approved_cost, p.approved_cost)::double precision as original_approved_cost,
  coalesce(latest_update.revised_cost, latest_update.approved_cost, p.revised_cost, p.approved_cost)::double precision as latest_revised_cost,
  coalesce(latest_update.expenditure, p.expenditure)::double precision as cumulative_expenditure,
  coalesce(latest_update.physical_progress, p.physical_progress)::double precision as physical_progress,
  coalesce(latest_update.planned_progress, p.planned_progress)::double precision as planned_progress,
  coalesce(latest_update.financial_progress, p.financial_progress)::double precision as financial_progress,
  coalesce(first_dates.original_completion_date, latest_update.original_completion_date, p.original_completion_date) as original_completion_date,
  coalesce(latest_update.revised_completion_date, latest_update.forecast_completion_date, p.revised_completion_date) as current_completion_date,
  coalesce(
    latest_update.delay_days,
    case when coalesce(latest_update.revised_completion_date, latest_update.forecast_completion_date, p.revised_completion_date) is not null
          and coalesce(first_dates.original_completion_date, latest_update.original_completion_date, p.original_completion_date) is not null
      then coalesce(latest_update.revised_completion_date, latest_update.forecast_completion_date, p.revised_completion_date)
           - coalesce(first_dates.original_completion_date, latest_update.original_completion_date, p.original_completion_date)
    end,
    p.delay_days
  )::integer as schedule_delay_days,
  latest_update.reporting_month,
  latest_update.milestones_total,
  latest_update.milestones_completed,
  latest_update.milestones_delayed,
  latest_update.milestones_at_risk,
  latest_update.land_acquisition_progress::double precision as land_acquisition_progress,
  latest_update.clearance_status,
  latest_update.contract_status,
  latest_update.issues,
  latest_update.remarks,
  latest_update.data_quality_status::text as data_quality_status,
  latest_risk.id as risk_id,
  latest_risk.overall_score::double precision as overall_risk_score,
  latest_risk.risk_level::text as risk_level,
  latest_risk.cost_overrun_risk::double precision as cost_risk,
  latest_risk.schedule_delay_risk::double precision as schedule_risk,
  latest_risk.implementation_risk::double precision as implementation_risk,
  latest_risk.methodology as risk_methodology,
  latest_risk.assessed_at as risk_assessed_at,
  latest_risk.model_version_id,
  coalesce(driver_summary.drivers, '[]'::jsonb) as risk_drivers
from public.projects p
join public.ministries ministry on ministry.id = p.ministry_id
left join public.agencies agency on agency.id = p.agency_id
left join lateral (
  select update.*
  from public.project_monthly_updates update
  where update.project_id = p.id and update.reporting_month < :end_month
  order by update.reporting_month desc, update.created_at desc
  limit 1
) latest_update on true
left join lateral (
  select update.approved_cost
  from public.project_monthly_updates update
  where update.project_id = p.id
    and update.reporting_month < :end_month
    and update.approved_cost is not null
  order by update.reporting_month, update.created_at
  limit 1
) first_approved on true
left join lateral (
  select update.original_completion_date
  from public.project_monthly_updates update
  where update.project_id = p.id
    and update.reporting_month < :end_month
    and update.original_completion_date is not null
  order by update.reporting_month, update.created_at
  limit 1
) first_dates on true
left join lateral (
  select risk.*
  from public.project_risks risk
  where risk.project_id = p.id
    and coalesce(risk.assessment_period, risk.assessed_at::date) < :end_month
  order by coalesce(risk.assessment_period, risk.assessed_at::date) desc, risk.assessed_at desc
  limit 1
) latest_risk on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'code', driver.driver_code,
    'name', driver.name,
    'impact', driver.impact::text,
    'value', driver.value::double precision,
    'weighted_contribution', driver.weighted_contribution::double precision,
    'rank', driver.rank,
    'description', driver.description,
    'evidence', driver.evidence
  ) order by driver.rank nulls last, driver.name) as drivers
  from public.risk_drivers driver
  where driver.risk_id = latest_risk.id
) driver_summary on true
where (cast(:sector as text) is null or p.sector = :sector)
  and (cast(:ministry_id as uuid) is null or p.ministry_id = cast(:ministry_id as uuid))
  and (cast(:project_identifier as text) is null or p.project_code = :project_identifier or p.id::text = :project_identifier)
  and (not :critical_only or latest_risk.risk_level in ('high_risk', 'critical'))
order by latest_risk.overall_score desc nulls last, p.project_code
"""


class ReportRepository(BaseRepository):
    async def options(self) -> dict[str, list[dict[str, Any]] | list[date] | list[str]]:
        months = await self.session.execute(text("""
            select distinct reporting_month
            from (
              select reporting_month from public.project_monthly_updates
              union all
              select assessment_period from public.project_risks where assessment_period is not null
            ) periods
            where reporting_month is not null
            order by reporting_month desc
            limit 36
        """))
        sectors = await self.session.execute(text("""
            select distinct sector from public.projects order by sector
        """))
        ministries = await self.session.execute(text("""
            select id::text as value, name as label
            from public.ministries where is_active order by name
        """))
        projects = await self.session.execute(text("""
            select p.project_code as value,
                   p.project_code || ' - ' || p.name as label,
                   p.sector, p.ministry_id
            from public.projects p
            order by p.project_code
        """))
        return {
            "reporting_months": [row[0] for row in months.all()],
            "sectors": [row[0] for row in sectors.all()],
            "ministries": self.rows(ministries),
            "projects": self.rows(projects),
        }

    async def project_snapshots(
        self,
        *,
        end_month: date,
        sector: str | None,
        ministry_id: UUID | None,
        project_identifier: str | None,
        critical_only: bool,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(text(PROJECT_SNAPSHOT_QUERY), {
            "end_month": end_month,
            "sector": sector,
            "ministry_id": str(ministry_id) if ministry_id else None,
            "project_identifier": project_identifier,
            "critical_only": critical_only,
        })
        return self.rows(result)

    async def warnings(
        self,
        *,
        reporting_month: date,
        end_month: date,
        sector: str | None,
        ministry_id: UUID | None,
        project_identifier: str | None,
        critical_only: bool,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select warning.warning_code, warning.title, warning.description,
                   warning.severity::text as severity,
                   case when warning.resolved_at is not null and warning.resolved_at < :end_month
                     then 'resolved' else warning.status::text end as status,
                   warning.alert_type, warning.trigger_rule, warning.source_type,
                   warning.evidence, warning.current_value, warning.previous_value,
                   warning.recommended_action, warning.detected_at,
                   warning.first_detected_at, warning.last_detected_at,
                   warning.resolved_at, warning.occurrence_count,
                   p.project_code as project_id, p.name as project_name,
                   ministry.name as ministry, p.sector,
                   (warning.first_detected_at >= :reporting_month
                    and warning.first_detected_at < :end_month) as is_emerging
            from public.warnings warning
            join public.projects p on p.id = warning.project_id
            join public.ministries ministry on ministry.id = p.ministry_id
            left join lateral (
              select risk.risk_level
              from public.project_risks risk
              where risk.project_id = p.id
                and coalesce(risk.assessment_period, risk.assessed_at::date) < :end_month
              order by coalesce(risk.assessment_period, risk.assessed_at::date) desc, risk.assessed_at desc
              limit 1
            ) latest_risk on true
            where warning.detected_at < :end_month
              and (cast(:sector as text) is null or p.sector = :sector)
              and (cast(:ministry_id as uuid) is null or p.ministry_id = cast(:ministry_id as uuid))
              and (cast(:project_identifier as text) is null or p.project_code = :project_identifier or p.id::text = :project_identifier)
              and (not :critical_only or latest_risk.risk_level in ('high_risk', 'critical'))
            order by
              case warning.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
              warning.detected_at desc
        """), {
            "reporting_month": reporting_month,
            "end_month": end_month,
            "sector": sector,
            "ministry_id": str(ministry_id) if ministry_id else None,
            "project_identifier": project_identifier,
            "critical_only": critical_only,
        })
        return self.rows(result)

    async def interventions(
        self,
        *,
        end_month: date,
        sector: str | None,
        ministry_id: UUID | None,
        project_identifier: str | None,
        critical_only: bool,
        include_resolved: bool,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select intervention.intervention_code, intervention.issue,
                   intervention.recommended_action, intervention.priority::text as priority,
                   case
                     when intervention.resolved_at is not null and intervention.resolved_at < :end_month then 'resolved'
                     when intervention.due_date < (:end_month - interval '1 day')::date
                       and intervention.status <> 'resolved' then 'overdue'
                     else intervention.status::text
                   end as status,
                   intervention.assigned_to_name, intervention.due_date,
                   intervention.opened_at, intervention.resolved_at,
                   intervention.resolution_summary, intervention.escalated_at,
                   intervention.escalation_reason, intervention.notes,
                   warning.warning_code as warning_id, warning.title as warning_title,
                   p.project_code as project_id, p.name as project_name,
                   ministry.name as ministry, p.sector
            from public.interventions intervention
            join public.projects p on p.id = intervention.project_id
            join public.ministries ministry on ministry.id = p.ministry_id
            left join public.warnings warning on warning.id = intervention.warning_id
            left join lateral (
              select risk.risk_level
              from public.project_risks risk
              where risk.project_id = p.id
                and coalesce(risk.assessment_period, risk.assessed_at::date) < :end_month
              order by coalesce(risk.assessment_period, risk.assessed_at::date) desc, risk.assessed_at desc
              limit 1
            ) latest_risk on true
            where intervention.opened_at < :end_month
              and (:include_resolved or intervention.resolved_at is null or intervention.resolved_at >= :end_month)
              and (cast(:sector as text) is null or p.sector = :sector)
              and (cast(:ministry_id as uuid) is null or p.ministry_id = cast(:ministry_id as uuid))
              and (cast(:project_identifier as text) is null or p.project_code = :project_identifier or p.id::text = :project_identifier)
              and (not :critical_only or latest_risk.risk_level in ('high_risk', 'critical'))
            order by
              case intervention.priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
              intervention.due_date nulls last, intervention.intervention_code
        """), {
            "end_month": end_month,
            "sector": sector,
            "ministry_id": str(ministry_id) if ministry_id else None,
            "project_identifier": project_identifier,
            "critical_only": critical_only,
            "include_resolved": include_resolved,
        })
        return self.rows(result)

    async def record_export(
        self,
        *,
        export_id: UUID,
        report_type: str,
        output_format: str,
        reporting_month: date,
        filters: dict[str, Any],
        generated_by: UUID,
        file_name: str,
        mime_type: str,
        size_bytes: int,
        checksum_sha256: str,
        data_as_of: date,
        project_count: int,
    ) -> None:
        await self.session.execute(text("""
            insert into public.report_exports (
              id, report_type, output_format, reporting_month, filters,
              generated_by, file_name, mime_type, size_bytes, checksum_sha256,
              data_as_of, project_count, status, completed_at
            ) values (
              :id, :report_type, :output_format, :reporting_month,
              cast(:filters as jsonb), :generated_by, :file_name, :mime_type,
              :size_bytes, :checksum_sha256, :data_as_of, :project_count,
              'completed', now()
            )
        """), {
            "id": export_id,
            "report_type": report_type,
            "output_format": output_format,
            "reporting_month": reporting_month,
            "filters": __import__("json").dumps(filters, default=str),
            "generated_by": generated_by,
            "file_name": file_name,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "checksum_sha256": checksum_sha256,
            "data_as_of": data_as_of,
            "project_count": project_count,
        })

