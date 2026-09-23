import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


RISK_QUERY = """
    select r.id, p.project_code as project_id, p.name as project_name,
           r.assessed_at, r.assessment_period,
           r.overall_score::double precision as overall_score,
           r.risk_level::text as risk_level,
           r.cost_overrun_risk::double precision as cost_overrun_risk,
           r.schedule_delay_risk::double precision as schedule_delay_risk,
           r.implementation_risk::double precision as implementation_risk,
           r.progress_factor::double precision as progress_factor,
           r.cost_factor::double precision as cost_factor,
           r.schedule_factor::double precision as schedule_factor,
           r.milestone_factor::double precision as milestone_factor,
           r.expenditure_factor::double precision as expenditure_factor,
           r.methodology, r.explanation,
           coalesce(r.input_snapshot->'components', '{}'::jsonb) as components,
           coalesce(r.input_snapshot->'ensemble', '{}'::jsonb) as ensemble,
           coalesce(r.input_snapshot->'provenance', '{}'::jsonb) as provenance,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'code', d.driver_code,
               'name', d.name,
               'impact', d.impact::text,
               'value', d.value::double precision,
               'weighted_contribution', d.weighted_contribution::double precision,
               'rank', d.rank,
               'description', d.description,
               'evidence', d.evidence,
               'metadata', d.metadata
             ) order by d.rank nulls last, d.name)
             from public.risk_drivers d where d.risk_id = r.id
           ), '[]'::jsonb) as drivers
    from public.project_risks r
    join public.projects p on p.id = r.project_id
"""


class RiskRepository(BaseRepository):
    async def list(self, *, risk_level: str | None, current_only: bool) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(RISK_QUERY + """
                where (cast(:risk_level as text) is null or r.risk_level::text = :risk_level)
                  and (not :current_only or r.is_current)
                order by r.overall_score desc, p.project_code
            """),
            {"risk_level": risk_level, "current_only": current_only},
        )
        return self.rows(result)

    async def get_for_project(self, project_identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(
            text(RISK_QUERY + """
                where (p.project_code = :identifier or p.id::text = :identifier)
                  and r.is_current
                order by r.assessed_at desc
                limit 1
            """),
            {"identifier": project_identifier},
        )
        return self.row(result)

    async def history_for_project(self, project_identifier: str) -> tuple[str | None, list[dict[str, Any]]]:
        project_result = await self.session.execute(
            text("select project_code from public.projects where project_code = :identifier or id::text = :identifier limit 1"),
            {"identifier": project_identifier},
        )
        project_code = project_result.scalar_one_or_none()
        if project_code is None:
            return None, []
        result = await self.session.execute(
            text(RISK_QUERY + " where p.project_code = :project_code order by r.assessed_at desc"),
            {"project_code": project_code},
        )
        return str(project_code), self.rows(result)

    async def trajectory_for_project(self, project_identifier: str) -> tuple[str | None, list[dict[str, Any]]]:
        project_result = await self.session.execute(
            text("select project_code from public.projects where project_code = :identifier or id::text = :identifier limit 1"),
            {"identifier": project_identifier},
        )
        project_code = project_result.scalar_one_or_none()
        if project_code is None:
            return None, []
        # DISTINCT ON selects the newest persisted calculation for each report
        # month without deleting recalculation/audit history.
        query = RISK_QUERY.replace(
            "select r.id,",
            "select distinct on (coalesce(r.assessment_period, r.assessed_at::date)) r.id,",
            1,
        )
        result = await self.session.execute(
            text(query + """
                where p.project_code = :project_code
                order by coalesce(r.assessment_period, r.assessed_at::date), r.assessed_at desc
            """),
            {"project_code": project_code},
        )
        return str(project_code), self.rows(result)

    async def assessment_facts(self, project_identifier: str | None = None) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select
              p.id as project_database_id,
              p.project_code as project_id,
              p.name as project_name,
              p.sector,
              p.project_type,
              latest.id as source_update_id,
              coalesce(latest.reporting_month, p.last_reported_at::date, current_date) as assessment_period,
              coalesce(latest.approved_cost, nullif(p.approved_cost, 0), 0)::double precision as approved_cost,
              coalesce(latest.revised_cost, nullif(p.revised_cost, 0), latest.approved_cost, p.approved_cost, 0)::double precision as revised_cost,
              coalesce(latest.physical_progress, p.physical_progress, 0)::double precision as physical_progress,
              coalesce(latest.planned_progress, p.planned_progress, 0)::double precision as planned_progress,
              coalesce(
                latest.financial_progress,
                case when coalesce(latest.revised_cost, p.revised_cost) > 0
                  then coalesce(latest.expenditure, p.expenditure, 0) / coalesce(latest.revised_cost, p.revised_cost) * 100 end,
                p.financial_progress, 0
              )::double precision as financial_progress,
              greatest(0, coalesce(latest.delay_days,
                coalesce(latest.revised_completion_date, p.revised_completion_date)
                  - coalesce(latest.original_completion_date, p.original_completion_date), 0))::integer as delay_days,
              coalesce(nullif(milestones.total, 0), latest.milestones_total, 0)::integer as milestones_total,
              coalesce(case when milestones.total > 0 then milestones.delayed end, latest.milestones_delayed, 0)::integer as milestones_delayed,
              coalesce(case when milestones.total > 0 then milestones.at_risk end, latest.milestones_at_risk, 0)::integer as milestones_at_risk,
              lower(coalesce(p.metadata->>'synthetic', 'false')) in ('true', '1', 'yes')
                or coalesce(p.source_system, '') ilike '%demo%'
                or lower(coalesce(latest.metadata->>'synthetic', 'false')) in ('true', '1', 'yes') as is_synthetic,
              cost_prediction.output_payload as cost_prediction,
              schedule_prediction.output_payload as schedule_prediction
            from public.projects p
            left join lateral (
              select monthly.* from public.project_monthly_updates monthly
              where monthly.project_id = p.id
              order by monthly.reporting_month desc, monthly.created_at desc limit 1
            ) latest on true
            left join lateral (
              select count(*)::integer as total,
                count(*) filter (where status = 'delayed')::integer as delayed,
                count(*) filter (where status = 'at_risk')::integer as at_risk
              from public.milestones where project_id = p.id
            ) milestones on true
            left join lateral (
              select prediction.output_payload || jsonb_build_object(
                'model_name', model.name, 'model_version', model.version,
                'generated_at', prediction.generated_at,
                'training_data_version', model.training_data_version,
                'synthetic', false
              ) as output_payload
              from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id and prediction.prediction_type = 'final_cost'
                and model.name = 'pragati_x_cost_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
              order by prediction.generated_at desc limit 1
            ) cost_prediction on true
            left join lateral (
              select prediction.output_payload || jsonb_build_object(
                'model_name', model.name, 'model_version', model.version,
                'generated_at', prediction.generated_at,
                'training_data_version', model.training_data_version,
                'synthetic', false
              ) as output_payload
              from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id and prediction.prediction_type = 'completion_date'
                and model.name = 'pragati_x_schedule_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
              order by prediction.generated_at desc limit 1
            ) schedule_prediction on true
            where (cast(:identifier as text) is null or p.project_code = :identifier or p.id::text = :identifier)
            order by p.project_code
        """), {"identifier": project_identifier})
        return self.rows(result)

    async def save_assessment(self, assessment: dict[str, Any]) -> UUID:
        project_id = assessment["project_database_id"]
        # Serialize snapshot creation per project so the partial unique index on
        # is_current remains valid under concurrent analyst requests.
        await self.session.execute(
            text("select id from public.projects where id = :project_id for update"),
            {"project_id": project_id},
        )
        await self.session.execute(
            text("update public.project_risks set is_current = false, updated_at = now() where project_id = :project_id and is_current"),
            {"project_id": project_id},
        )
        result = await self.session.execute(text("""
            insert into public.project_risks (
              project_id, source_update_id, assessment_period, overall_score, risk_level,
              cost_overrun_risk, schedule_delay_risk, implementation_risk,
              progress_factor, cost_factor, schedule_factor, milestone_factor, expenditure_factor,
              methodology, explanation, input_snapshot, is_current
            ) values (
              :project_id, :source_update_id, :assessment_period, :overall_score, cast(:risk_level as public.risk_level),
              :cost_overrun_risk, :schedule_delay_risk, :implementation_risk,
              :progress_factor, :cost_factor, :schedule_factor, :milestone_factor, :expenditure_factor,
              :methodology, :explanation, cast(:input_snapshot as jsonb), true
            ) returning id
        """), {
            **assessment,
            "project_id": project_id,
            "input_snapshot": json.dumps(assessment["input_snapshot"], default=str),
        })
        risk_id = result.scalar_one()
        for driver in assessment["drivers"]:
            await self.session.execute(text("""
                insert into public.risk_drivers (
                  risk_id, driver_code, name, impact, value, weighted_contribution,
                  rank, description, evidence, metadata
                ) values (
                  :risk_id, :code, :name, cast(:impact as public.risk_impact), :value,
                  :weighted_contribution, :rank, :description,
                  cast(:evidence as jsonb), cast(:metadata as jsonb)
                )
            """), {
                **driver,
                "risk_id": risk_id,
                "evidence": json.dumps(driver.get("evidence", []), default=str),
                "metadata": json.dumps(driver.get("metadata", {}), default=str),
            })
        return risk_id
