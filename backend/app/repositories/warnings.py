import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


WARNING_COLUMNS = """
    w.warning_code as id, w.id as database_id,
    p.project_code as project_id, p.name as project_name, m.name as ministry,
    p.sector, p.state_display as state,
    w.severity::text as severity, w.status::text as status, w.alert_type,
    w.title, w.description, w.trigger_rule, w.evidence, w.detected_at,
    w.acknowledged_at, w.resolved_at, w.assigned_to_name,
    w.source_type, w.source_reference, w.source_update_id,
    w.current_value, w.previous_value, w.recommended_action,
    w.first_detected_at, w.last_detected_at, w.occurrence_count, w.metadata
"""


class WarningRepository(BaseRepository):
    async def list(self, *, status: str | None, severity: str | None) -> list[dict[str, Any]]:
        result = await self.session.execute(text(f"""
            select {WARNING_COLUMNS}
            from public.warnings w
            join public.projects p on p.id = w.project_id
            join public.ministries m on m.id = p.ministry_id
            where (cast(:status as text) is null or w.status::text = :status)
              and (cast(:severity as text) is null or w.severity::text = :severity)
            order by w.detected_at desc, w.warning_code
        """), {"status": status, "severity": severity})
        return self.rows(result)

    async def acknowledge(self, identifier: str, user_id: UUID) -> dict[str, Any] | None:
        result = await self.session.execute(text(f"""
            with changed as (
              update public.warnings
              set status = case when status = 'new' then 'acknowledged' else status end,
                  acknowledged_at = coalesce(acknowledged_at, now()),
                  assigned_to = coalesce(assigned_to, :user_id)
              where warning_code = :identifier or id::text = :identifier
              returning *
            )
            select {WARNING_COLUMNS}
            from changed w
            join public.projects p on p.id = w.project_id
            join public.ministries m on m.id = p.ministry_id
        """), {"identifier": identifier, "user_id": user_id})
        return self.row(result)

    async def update_status(
        self,
        identifier: str,
        *,
        status: str,
        user_id: UUID,
        assigned_to_name: str | None,
    ) -> dict[str, Any] | None:
        result = await self.session.execute(text(f"""
            with changed as (
              update public.warnings
              set status = cast(:status as public.warning_status),
                  acknowledged_at = case
                    when :status in ('acknowledged', 'assigned', 'under_review')
                      then coalesce(acknowledged_at, now())
                    else acknowledged_at end,
                  assigned_to = case
                    when :status in ('acknowledged', 'assigned', 'under_review')
                      then coalesce(assigned_to, :user_id)
                    else assigned_to end,
                  assigned_to_name = coalesce(:assigned_to_name, assigned_to_name),
                  resolved_at = case when :status = 'resolved' then now() else null end,
                  updated_at = now()
              where warning_code = :identifier or id::text = :identifier
              returning *
            )
            select {WARNING_COLUMNS}
            from changed w
            join public.projects p on p.id = w.project_id
            join public.ministries m on m.id = p.ministry_id
        """), {
            "identifier": identifier,
            "status": status,
            "user_id": user_id,
            "assigned_to_name": assigned_to_name,
        })
        return self.row(result)

    async def automation_facts(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select
              p.id as project_database_id,
              p.project_code as project_id,
              p.name as project_name,
              latest.id as source_update_id,
              latest.reporting_month,
              jsonb_build_object(
                'approved_cost', latest.approved_cost,
                'revised_cost', latest.revised_cost,
                'expenditure', latest.expenditure,
                'physical_progress', latest.physical_progress,
                'planned_progress', latest.planned_progress,
                'financial_progress', latest.financial_progress,
                'original_completion_date', latest.original_completion_date,
                'revised_completion_date', latest.revised_completion_date,
                'forecast_completion_date', latest.forecast_completion_date
              ) as current,
              case when previous.id is null then null else jsonb_build_object(
                'approved_cost', previous.approved_cost,
                'revised_cost', previous.revised_cost,
                'expenditure', previous.expenditure,
                'physical_progress', previous.physical_progress,
                'planned_progress', previous.planned_progress,
                'financial_progress', previous.financial_progress,
                'original_completion_date', previous.original_completion_date,
                'revised_completion_date', previous.revised_completion_date,
                'forecast_completion_date', previous.forecast_completion_date
              ) end as previous,
              (case when milestones.total > 0 then milestones.current_overdue
                else coalesce(latest.milestones_delayed, 0) end)::integer as overdue_milestones,
              (case when milestones.total > 0 then milestones.previous_overdue
                else coalesce(previous.milestones_delayed, 0) end)::integer as previous_overdue_milestones,
              current_risk.id as current_risk_id,
              current_risk.overall_score::double precision as current_risk_score,
              previous_risk.overall_score::double precision as previous_risk_score,
              cost_prediction.output_payload as cost_prediction,
              previous_cost.output_payload->>'significant_overrun_probability' as previous_cost_probability,
              schedule_prediction.output_payload as schedule_prediction,
              previous_schedule.output_payload->>'schedule_overrun_probability' as previous_schedule_probability,
              coalesce(progress.values, '[]'::jsonb) as recent_physical_progress
            from public.projects p
            left join lateral (
              select monthly.* from public.project_monthly_updates monthly
              where monthly.project_id = p.id
              order by monthly.reporting_month desc, monthly.created_at desc limit 1
            ) latest on true
            left join lateral (
              select monthly.* from public.project_monthly_updates monthly
              where monthly.project_id = p.id
              order by monthly.reporting_month desc, monthly.created_at desc offset 1 limit 1
            ) previous on true
            left join lateral (
              select
                count(*)::integer as total,
                count(*) filter (
                  where latest.reporting_month is not null
                    and milestone.planned_date < latest.reporting_month
                    and (milestone.actual_date is null or milestone.actual_date > latest.reporting_month)
                )::integer as current_overdue,
                count(*) filter (
                  where previous.reporting_month is not null
                    and milestone.planned_date < previous.reporting_month
                    and (milestone.actual_date is null or milestone.actual_date > previous.reporting_month)
                )::integer as previous_overdue
              from public.milestones milestone where milestone.project_id = p.id
            ) milestones on true
            left join lateral (
              select risk.id, risk.overall_score from public.project_risks risk
              where risk.project_id = p.id order by risk.assessed_at desc, risk.created_at desc limit 1
            ) current_risk on true
            left join lateral (
              select risk.overall_score from public.project_risks risk
              where risk.project_id = p.id order by risk.assessed_at desc, risk.created_at desc offset 1 limit 1
            ) previous_risk on true
            left join lateral (
              select prediction.output_payload || jsonb_build_object(
                'model_name', model.name, 'model_version', model.version,
                'generated_at', prediction.generated_at, 'synthetic', false
              ) as output_payload
              from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id and prediction.prediction_type = 'final_cost'
                and model.name = 'pragati_x_cost_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
                and prediction.source_update_id = latest.id
              order by prediction.generated_at desc limit 1
            ) cost_prediction on true
            left join lateral (
              select prediction.output_payload from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id and prediction.prediction_type = 'final_cost'
                and model.name = 'pragati_x_cost_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
                and prediction.source_update_id = previous.id
              order by prediction.generated_at desc limit 1
            ) previous_cost on true
            left join lateral (
              select prediction.output_payload || jsonb_build_object(
                'model_name', model.name, 'model_version', model.version,
                'generated_at', prediction.generated_at, 'synthetic', false
              ) as output_payload
              from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id and prediction.prediction_type = 'completion_date'
                and model.name = 'pragati_x_schedule_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
                and prediction.source_update_id = latest.id
              order by prediction.generated_at desc limit 1
            ) schedule_prediction on true
            left join lateral (
              select prediction.output_payload from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id and prediction.prediction_type = 'completion_date'
                and model.name = 'pragati_x_schedule_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
                and prediction.source_update_id = previous.id
              order by prediction.generated_at desc limit 1
            ) previous_schedule on true
            left join lateral (
              select jsonb_agg(history.physical_progress order by history.reporting_month desc) as values
              from (
                select monthly.reporting_month, monthly.physical_progress
                from public.project_monthly_updates monthly
                where monthly.project_id = p.id and monthly.physical_progress is not null
                order by monthly.reporting_month desc limit 12
              ) history
            ) progress on true
            where p.project_code = :identifier or p.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def upsert_automated_conditions(
        self,
        facts: dict[str, Any],
        conditions: list[dict[str, Any]],
    ) -> dict[str, int]:
        created = 0
        updated = 0
        project_id = facts["project_database_id"]
        active_rule_codes = [condition["rule_code"] for condition in conditions]
        for condition in conditions:
            deduplication_key = f"{condition['engine_version']}:{project_id}:{condition['rule_code']}"
            metadata = {
                "engine_version": condition["engine_version"],
                "rule_code": condition["rule_code"],
                "reporting_month": facts.get("reporting_month"),
                "automated": True,
            }
            result = await self.session.execute(text("""
                insert into public.warnings (
                  warning_code, project_id, risk_id, source_update_id, severity, status,
                  alert_type, title, description, trigger_rule, source_type,
                  source_reference, deduplication_key, evidence, current_value,
                  previous_value, recommended_action, detected_at, first_detected_at,
                  last_detected_at, metadata
                ) values (
                  'EW-' || upper(substr(md5(gen_random_uuid()::text), 1, 16)),
                  :project_id, :risk_id, :source_update_id,
                  cast(:severity as public.warning_severity), 'new', :alert_type,
                  :title, :description, :trigger_rule, :source_type,
                  :source_reference, :deduplication_key, cast(:evidence as jsonb),
                  cast(:current_value as jsonb), cast(:previous_value as jsonb),
                  :recommended_action, now(), now(), now(), cast(:metadata as jsonb)
                )
                on conflict (deduplication_key)
                  where deduplication_key is not null and status <> 'resolved'
                do update set
                  risk_id = excluded.risk_id,
                  source_update_id = excluded.source_update_id,
                  severity = excluded.severity,
                  alert_type = excluded.alert_type,
                  title = excluded.title,
                  description = excluded.description,
                  trigger_rule = excluded.trigger_rule,
                  source_type = excluded.source_type,
                  source_reference = excluded.source_reference,
                  evidence = excluded.evidence,
                  current_value = excluded.current_value,
                  previous_value = excluded.previous_value,
                  recommended_action = excluded.recommended_action,
                  last_detected_at = now(),
                  occurrence_count = warnings.occurrence_count + 1,
                  metadata = excluded.metadata,
                  updated_at = now()
                returning (xmax = 0) as inserted
            """), {
                **condition,
                "project_id": project_id,
                "risk_id": facts.get("current_risk_id"),
                "source_update_id": facts.get("source_update_id"),
                "source_reference": str(facts.get("source_update_id") or ""),
                "deduplication_key": deduplication_key,
                "evidence": json.dumps(condition["evidence"], default=str),
                "current_value": (
                    json.dumps(condition["current_value"], default=str)
                    if condition.get("current_value") is not None else None
                ),
                "previous_value": (
                    json.dumps(condition["previous_value"], default=str)
                    if condition.get("previous_value") is not None else None
                ),
                "metadata": json.dumps(metadata, default=str),
            })
            if result.scalar_one():
                created += 1
            else:
                updated += 1

        resolved_result = await self.session.execute(text("""
            update public.warnings
            set status = 'resolved', resolved_at = now(), updated_at = now(),
                metadata = metadata || jsonb_build_object('auto_resolved', true, 'auto_resolved_at', now())
            where project_id = :project_id
              and status <> 'resolved'
              and metadata->>'engine_version' = 'automated-warning-v1'
              and not ((metadata->>'rule_code') = any(cast(:active_rule_codes as text[])))
        """), {"project_id": project_id, "active_rule_codes": active_rule_codes or ["__none__"]})
        return {"created": created, "updated": updated, "resolved": resolved_result.rowcount or 0}
