from typing import Any

from sqlalchemy import text

from app.repositories.base import BaseRepository


class PortfolioRepository(BaseRepository):
    async def summary(self) -> dict[str, Any]:
        result = await self.session.execute(
            text(
                """
                select
                  (select count(*) from public.projects)::integer as total_projects,
                  coalesce((select sum(revised_cost) from public.projects), 0)::double precision as portfolio_value,
                  coalesce((select sum(expenditure) from public.projects), 0)::double precision as total_expenditure,
                  coalesce((select sum(greatest(revised_cost - approved_cost, 0)) from public.projects), 0)::double precision as cost_overrun_exposure,
                  (select count(*) from public.projects where delay_days > 0)::integer as delayed_projects,
                  (select count(*) from public.warnings where status <> 'resolved')::integer as active_warnings,
                  (select count(*) from public.interventions where status <> 'resolved')::integer as open_interventions,
                  (select count(*) from public.project_risks where is_current and risk_level = 'healthy')::integer as healthy,
                  (select count(*) from public.project_risks where is_current and risk_level = 'watch')::integer as watch,
                  (select count(*) from public.project_risks where is_current and risk_level = 'high_risk')::integer as high_risk,
                  (select count(*) from public.project_risks where is_current and risk_level = 'critical')::integer as critical
                """
            )
        )
        return self.row(result) or {}

    async def comparison_facts(self) -> dict[str, Any]:
        period_result = await self.session.execute(text("""
            select distinct assessment_period
            from public.project_risks
            where assessment_period is not null
            order by assessment_period desc
            limit 2
        """))
        periods = [row[0] for row in period_result.all()]
        if len(periods) < 2:
            return {
                "periods": periods,
                "snapshots": [],
                "milestones": [],
                "new_critical_warnings": [],
                "resolved_warnings": [],
            }

        latest_period, previous_period = periods
        snapshot_result = await self.session.execute(text("""
            with ranked as (
              select r.*,
                     row_number() over (
                       partition by r.project_id, r.assessment_period
                       order by r.assessed_at desc, r.created_at desc
                     ) as snapshot_rank
              from public.project_risks r
              where r.assessment_period in (:latest_period, :previous_period)
            )
            select
              r.id as snapshot_id,
              r.assessment_period,
              p.id as project_database_id,
              p.project_code as project_id,
              p.name as project_name,
              ministry.name as ministry,
              p.sector,
              p.state_display as state,
              r.risk_level::text as risk_level,
              r.overall_score::double precision as overall_risk,
              r.cost_overrun_risk::double precision as cost_risk,
              r.schedule_delay_risk::double precision as schedule_risk,
              r.implementation_risk::double precision as implementation_risk,
              coalesce(
                source_update.revised_cost,
                case when jsonb_typeof(r.input_snapshot->'revisedCost') = 'number'
                  then (r.input_snapshot->>'revisedCost')::double precision end,
                case when jsonb_typeof(r.input_snapshot->'revised_cost') = 'number'
                  then (r.input_snapshot->>'revised_cost')::double precision end,
                case when r.is_current then p.revised_cost::double precision end
              ) as revised_cost,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'code', driver.driver_code,
                  'name', driver.name,
                  'value', driver.value::double precision,
                  'weighted_contribution', driver.weighted_contribution::double precision
                ) order by driver.rank nulls last, driver.name)
                from public.risk_drivers driver where driver.risk_id = r.id
              ), '[]'::jsonb) as drivers
            from ranked r
            join public.projects p on p.id = r.project_id
            join public.ministries ministry on ministry.id = p.ministry_id
            left join public.project_monthly_updates source_update on source_update.id = r.source_update_id
            where r.snapshot_rank = 1
            order by p.project_code, r.assessment_period
        """), {"latest_period": latest_period, "previous_period": previous_period})

        milestone_result = await self.session.execute(text("""
            select
              milestone.id as milestone_id,
              milestone.milestone_code,
              milestone.name as milestone_name,
              milestone.planned_date,
              p.project_code as project_id,
              p.name as project_name,
              ministry.name as ministry,
              p.sector,
              p.state_display as state
            from public.milestones milestone
            join public.projects p on p.id = milestone.project_id
            join public.ministries ministry on ministry.id = p.ministry_id
            where milestone.planned_date < :latest_period
              and (milestone.actual_date is null or milestone.actual_date > :latest_period)
              and not (
                milestone.planned_date < :previous_period
                and (milestone.actual_date is null or milestone.actual_date > :previous_period)
              )
            order by milestone.planned_date, p.project_code, milestone.sequence_no
        """), {"latest_period": latest_period, "previous_period": previous_period})

        warning_columns = """
            w.warning_code as warning_id, w.title, w.alert_type,
            w.severity::text as severity, w.status::text as status,
            w.first_detected_at, w.resolved_at,
            p.project_code as project_id, p.name as project_name,
            ministry.name as ministry, p.sector, p.state_display as state
        """
        warning_params = {"latest_period": latest_period}
        new_warning_result = await self.session.execute(text(f"""
            select {warning_columns}
            from public.warnings w
            join public.projects p on p.id = w.project_id
            join public.ministries ministry on ministry.id = p.ministry_id
            where w.severity = 'critical'
              and w.first_detected_at >= :latest_period
              and w.first_detected_at < :latest_period + interval '1 month'
            order by w.first_detected_at desc, w.warning_code
        """), warning_params)
        resolved_warning_result = await self.session.execute(text(f"""
            select {warning_columns}
            from public.warnings w
            join public.projects p on p.id = w.project_id
            join public.ministries ministry on ministry.id = p.ministry_id
            where w.resolved_at >= :latest_period
              and w.resolved_at < :latest_period + interval '1 month'
            order by w.resolved_at desc, w.warning_code
        """), warning_params)
        return {
            "periods": [latest_period, previous_period],
            "snapshots": self.rows(snapshot_result),
            "milestones": self.rows(milestone_result),
            "new_critical_warnings": self.rows(new_warning_result),
            "resolved_warnings": self.rows(resolved_warning_result),
        }
