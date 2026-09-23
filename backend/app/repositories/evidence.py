from typing import Any

from sqlalchemy import text

from app.repositories.base import BaseRepository


SOURCE_SNAPSHOT = """
jsonb_build_object(
  'id', update_row.id,
  'reporting_month', update_row.reporting_month,
  'approved_cost', update_row.approved_cost,
  'revised_cost', update_row.revised_cost,
  'expenditure', update_row.expenditure,
  'physical_progress', update_row.physical_progress,
  'planned_progress', update_row.planned_progress,
  'financial_progress', update_row.financial_progress,
  'delay_days', update_row.delay_days,
  'milestones_total', update_row.milestones_total,
  'milestones_completed', update_row.milestones_completed,
  'milestones_delayed', update_row.milestones_delayed,
  'milestones_at_risk', update_row.milestones_at_risk,
  'land_acquisition_progress', update_row.land_acquisition_progress,
  'clearance_status', update_row.clearance_status,
  'contract_status', update_row.contract_status,
  'issues', update_row.issues,
  'source_system', update_row.source_system,
  'source_record_id', update_row.source_record_id,
  'ingestion_batch_id', update_row.ingestion_batch_id,
  'data_quality_status', update_row.data_quality_status,
  'schema_version', update_row.schema_version,
  'submitted_at', update_row.submitted_at,
  'created_at', update_row.created_at
)
"""


class EvidenceRepository(BaseRepository):
    async def project(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id as project_database_id, project_code as project_id, name as project_name
            from public.projects
            where project_code = :identifier or id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def current_risk(self, project_id: Any) -> dict[str, Any] | None:
        result = await self.session.execute(text(f"""
            select risk.id, risk.source_update_id, risk.assessed_at, risk.assessment_period,
                   risk.overall_score::double precision as overall_score,
                   risk.risk_level::text as risk_level,
                   risk.cost_overrun_risk::double precision as cost_risk,
                   risk.schedule_delay_risk::double precision as schedule_risk,
                   risk.implementation_risk::double precision as implementation_risk,
                   risk.methodology, risk.explanation, risk.input_snapshot,
                   case when update_row.id is null then null else {SOURCE_SNAPSHOT} end as source_snapshot,
                   coalesce((select jsonb_agg(jsonb_build_object(
                     'id', driver.id, 'code', driver.driver_code, 'name', driver.name,
                     'impact', driver.impact, 'value', driver.value,
                     'weighted_contribution', driver.weighted_contribution,
                     'rank', driver.rank, 'description', driver.description,
                     'evidence', driver.evidence, 'metadata', driver.metadata,
                     'created_at', driver.created_at
                   ) order by driver.rank nulls last, driver.name)
                   from public.risk_drivers driver where driver.risk_id = risk.id), '[]'::jsonb) as drivers
            from public.project_risks risk
            left join public.project_monthly_updates update_row on update_row.id = risk.source_update_id
            where risk.project_id = :project_id and risk.is_current
            order by risk.assessed_at desc limit 1
        """), {"project_id": project_id})
        return self.row(result)

    async def predictions(self, project_id: Any) -> list[dict[str, Any]]:
        result = await self.session.execute(text(f"""
            select distinct on (prediction.prediction_type)
              prediction.id, prediction.source_update_id, prediction.prediction_type,
              prediction.predicted_value::double precision as predicted_value,
              prediction.predicted_class, prediction.lower_bound::double precision as lower_bound,
              prediction.upper_bound::double precision as upper_bound,
              prediction.output_payload, prediction.feature_snapshot, prediction.generated_at,
              prediction.metadata, model.name as model_name, model.version as model_version,
              model.algorithm, model.training_data_version, model.trained_at, model.deployed_at,
              case when update_row.id is null then null else {SOURCE_SNAPSHOT} end as source_snapshot
            from public.predictions prediction
            join public.model_versions model on model.id = prediction.model_version_id
            left join public.project_monthly_updates update_row on update_row.id = prediction.source_update_id
            where prediction.project_id = :project_id
              and prediction.prediction_type in ('final_cost', 'completion_date')
              and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
            order by prediction.prediction_type, prediction.generated_at desc
        """), {"project_id": project_id})
        return self.rows(result)

    async def major_warnings(self, project_id: Any) -> list[dict[str, Any]]:
        result = await self.session.execute(text(f"""
            select warning.id, warning.warning_code, warning.risk_id, warning.source_update_id,
                   warning.severity::text as severity, warning.status::text as status,
                   warning.alert_type, warning.title, warning.description, warning.trigger_rule,
                   warning.source_type, warning.source_reference, warning.evidence,
                   warning.current_value, warning.previous_value, warning.recommended_action,
                   warning.detected_at, warning.first_detected_at, warning.last_detected_at,
                   warning.occurrence_count, warning.metadata,
                   case when update_row.id is null then null else {SOURCE_SNAPSHOT} end as source_snapshot
            from public.warnings warning
            left join public.project_monthly_updates update_row on update_row.id = warning.source_update_id
            where warning.project_id = :project_id and warning.severity in ('high', 'critical')
            order by (warning.status <> 'resolved') desc, warning.last_detected_at desc
            limit 25
        """), {"project_id": project_id})
        return self.rows(result)

    async def interventions(self, project_id: Any) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select intervention.id, intervention.intervention_code, warning.warning_code,
                   intervention.issue, intervention.recommended_action,
                   intervention.priority::text as priority, intervention.status::text as status,
                   intervention.assigned_to_name, intervention.due_date, intervention.opened_at,
                   intervention.resolved_at, intervention.resolution_summary,
                   intervention.created_at, intervention.updated_at
            from public.interventions intervention
            left join public.warnings warning on warning.id = intervention.warning_id
            where intervention.project_id = :project_id
            order by intervention.created_at desc
        """), {"project_id": project_id})
        return self.rows(result)

    async def milestones(self, project_id: Any) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select id, milestone_code, name, planned_date, forecast_date, actual_date,
                   status::text as status, delay_days, updated_at
            from public.milestones
            where project_id = :project_id
            order by sequence_no, planned_date
        """), {"project_id": project_id})
        return self.rows(result)
