import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


class PredictionRepository(BaseRepository):
    async def schedule_training_rows(self) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select
              p.id as project_database_id,
              p.project_code as project_id,
              snapshot.reporting_month as snapshot_date,
              completion.actual_completion_date as label_date,
              completion.source as completion_label_source,
              original_date.value as original_completion_date,
              (completion.actual_completion_date - original_date.value)::double precision
                as target_completion_variance_days,
              original_cost.value::double precision as original_approved_cost,
              case when start_fact.start_date is not null and original_date.value > start_fact.start_date
                then original_date.value - start_fact.start_date end as planned_duration_days,
              case when start_fact.start_date is not null
                then greatest(0, snapshot.reporting_month - start_fact.start_date) end as elapsed_days,
              case when start_fact.start_date is not null and original_date.value > start_fact.start_date
                then greatest(0, snapshot.reporting_month - start_fact.start_date)::double precision
                  / nullif(original_date.value - start_fact.start_date, 0) * 100 end
                as elapsed_duration_pct,
              snapshot.physical_progress::double precision as physical_progress,
              snapshot.planned_progress::double precision as planned_progress,
              (snapshot.physical_progress - snapshot.planned_progress)::double precision as progress_variance,
              snapshot.previous_physical_progress::double precision as previous_physical_progress,
              snapshot.previous_planned_progress::double precision as previous_planned_progress,
              case when snapshot.physical_progress is not null
                     and snapshot.previous_physical_progress is not null
                     and snapshot.previous_reporting_month is not null
                then (snapshot.physical_progress - snapshot.previous_physical_progress)
                  / nullif(
                    (extract(year from snapshot.reporting_month)::integer * 12
                      + extract(month from snapshot.reporting_month)::integer)
                    - (extract(year from snapshot.previous_reporting_month)::integer * 12
                      + extract(month from snapshot.previous_reporting_month)::integer), 0
                  ) end::double precision as monthly_progress_velocity,
              case when original_cost.value > 0 and snapshot.expenditure is not null
                then snapshot.expenditure / original_cost.value * 100 end::double precision
                as expenditure_to_approved_pct,
              coalesce(snapshot.delay_days,
                coalesce(snapshot.revised_completion_date, snapshot.forecast_completion_date)
                  - original_date.value)::integer as reported_delay_days,
              case when snapshot.milestones_total > 0
                then snapshot.milestones_completed::double precision / snapshot.milestones_total * 100 end
                as milestone_completion_pct,
              case when snapshot.milestones_total > 0
                then (coalesce(snapshot.milestones_delayed, 0) + coalesce(snapshot.milestones_at_risk, 0))::double precision
                  / snapshot.milestones_total * 100 end as milestone_delay_pct,
              snapshot.land_acquisition_progress::double precision as land_acquisition_progress,
              case when clearances.total_count > 0
                then clearances.completed_count::double precision / clearances.total_count * 100 end
                as clearance_completion_pct,
              (clearances.total_count - clearances.completed_count)::integer as clearance_pending_count,
              cardinality(coalesce(snapshot.issues, '{}'::text[]))::integer as issue_count,
              extract(year from start_fact.start_date)::integer as start_year,
              extract(year from snapshot.reporting_month)::integer as snapshot_year,
              p.sector,
              p.project_type,
              ministry.name as ministry,
              coalesce(agency.name, 'Not reported') as implementing_agency,
              p.state_display as state,
              snapshot.contract_status,
              case when clearances.total_count = 0 then 'not_reported'
                   when clearances.completed_count = clearances.total_count then 'cleared'
                   else 'pending' end as clearance_risk_status,
              false as is_synthetic
            from public.projects p
            join public.ministries ministry on ministry.id = p.ministry_id
            left join public.agencies agency on agency.id = p.agency_id
            join lateral (
              select ranked.* from (
                select monthly.*,
                  lag(monthly.reporting_month) over chronology as previous_reporting_month,
                  lag(monthly.physical_progress) over chronology as previous_physical_progress,
                  lag(monthly.planned_progress) over chronology as previous_planned_progress
                from public.project_monthly_updates monthly
                where monthly.project_id = p.id
                  and coalesce(monthly.source_system, '') not ilike '%demo%'
                  and lower(coalesce(monthly.metadata->>'synthetic', 'false')) not in ('true', '1', 'yes')
                window chronology as (order by monthly.reporting_month, monthly.created_at)
              ) ranked
              where ranked.previous_reporting_month is not null
              order by ranked.reporting_month, ranked.created_at
              limit 1
            ) snapshot on true
            join lateral (
              select coalesce(
                case when coalesce(p.metadata->>'actual_completion_date', p.metadata->>'actual_cod')
                  ~ '^\\d{4}-\\d{2}-\\d{2}$'
                  then coalesce(p.metadata->>'actual_completion_date', p.metadata->>'actual_cod')::date end,
                fully_completed_milestones.value,
                full_progress.value
              ) as actual_completion_date,
              case
                when coalesce(p.metadata->>'actual_completion_date', p.metadata->>'actual_cod')
                  ~ '^\\d{4}-\\d{2}-\\d{2}$' then 'project_metadata'
                when fully_completed_milestones.value is not null then 'fully_completed_milestones'
                when full_progress.value is not null then 'first_100pct_monthly_progress'
              end as source
              from lateral (
                select (
                  select max(milestone.actual_date)
                  from public.milestones milestone
                  where milestone.project_id = p.id
                  having count(*) > 0 and count(*) filter (where milestone.actual_date is null) = 0
                ) as value
              ) fully_completed_milestones
              cross join lateral (
                select min(monthly.reporting_month) as value
                from public.project_monthly_updates monthly
                where monthly.project_id = p.id and monthly.physical_progress >= 100
                  and coalesce(monthly.source_system, '') not ilike '%demo%'
                  and lower(coalesce(monthly.metadata->>'synthetic', 'false')) not in ('true', '1', 'yes')
              ) full_progress
            ) completion on true
            join lateral (
              select coalesce(
                (select monthly.original_completion_date from public.project_monthly_updates monthly
                 where monthly.project_id = p.id and monthly.original_completion_date is not null
                 order by monthly.reporting_month, monthly.created_at limit 1),
                p.original_completion_date
              ) as value
            ) original_date on true
            left join lateral (
              select coalesce(
                (select monthly.approved_cost from public.project_monthly_updates monthly
                 where monthly.project_id = p.id and monthly.approved_cost is not null
                 order by monthly.reporting_month, monthly.created_at limit 1),
                nullif(p.approved_cost, 0)
              ) as value
            ) original_cost on true
            left join lateral (
              select coalesce(
                case when coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')
                  ~ '^\\d{4}-\\d{2}-\\d{2}$'
                  then coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')::date end,
                (select min(milestone.planned_date) from public.milestones milestone where milestone.project_id = p.id),
                (select min(monthly.reporting_month) from public.project_monthly_updates monthly where monthly.project_id = p.id)
              ) as start_date
            ) start_fact on true
            left join lateral (
              select
                count(*)::integer as total_count,
                count(*) filter (where lower(clearance.value) in (
                  'approved', 'completed', 'complete', 'obtained', 'cleared', 'clear', 'yes', 'true'
                ))::integer as completed_count
              from jsonb_each_text(coalesce(snapshot.clearance_status, '{}'::jsonb)) clearance
            ) clearances on true
            where p.status = 'completed'
              and lower(coalesce(p.metadata->>'synthetic', 'false')) not in ('true', '1', 'yes')
              and coalesce(p.source_system, '') not ilike '%demo%'
              and completion.actual_completion_date is not null
              and original_date.value is not null
              and completion.actual_completion_date > snapshot.reporting_month
            order by completion.actual_completion_date, p.project_code
        """))
        return self.rows(result)

    async def schedule_inference_features(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select
              p.id as project_database_id,
              p.project_code as project_id,
              p.name as project_name,
              snapshot.id as source_update_id,
              snapshot.reporting_month as snapshot_date,
              original_date.value as original_completion_date,
              original_cost.value::double precision as original_approved_cost,
              case when start_fact.start_date is not null and original_date.value > start_fact.start_date
                then original_date.value - start_fact.start_date end as planned_duration_days,
              case when start_fact.start_date is not null
                then greatest(0, snapshot.reporting_month - start_fact.start_date) end as elapsed_days,
              case when start_fact.start_date is not null and original_date.value > start_fact.start_date
                then greatest(0, snapshot.reporting_month - start_fact.start_date)::double precision
                  / nullif(original_date.value - start_fact.start_date, 0) * 100 end
                as elapsed_duration_pct,
              snapshot.physical_progress::double precision as physical_progress,
              snapshot.planned_progress::double precision as planned_progress,
              (snapshot.physical_progress - snapshot.planned_progress)::double precision as progress_variance,
              snapshot.previous_physical_progress::double precision as previous_physical_progress,
              snapshot.previous_planned_progress::double precision as previous_planned_progress,
              case when snapshot.physical_progress is not null
                     and snapshot.previous_physical_progress is not null
                     and snapshot.previous_reporting_month is not null
                then (snapshot.physical_progress - snapshot.previous_physical_progress)
                  / nullif(
                    (extract(year from snapshot.reporting_month)::integer * 12
                      + extract(month from snapshot.reporting_month)::integer)
                    - (extract(year from snapshot.previous_reporting_month)::integer * 12
                      + extract(month from snapshot.previous_reporting_month)::integer), 0
                  ) end::double precision as monthly_progress_velocity,
              case when original_cost.value > 0 and snapshot.expenditure is not null
                then snapshot.expenditure / original_cost.value * 100 end::double precision
                as expenditure_to_approved_pct,
              coalesce(snapshot.delay_days,
                coalesce(snapshot.revised_completion_date, snapshot.forecast_completion_date)
                  - original_date.value)::integer as reported_delay_days,
              case when snapshot.milestones_total > 0
                then snapshot.milestones_completed::double precision / snapshot.milestones_total * 100 end
                as milestone_completion_pct,
              case when snapshot.milestones_total > 0
                then (coalesce(snapshot.milestones_delayed, 0) + coalesce(snapshot.milestones_at_risk, 0))::double precision
                  / snapshot.milestones_total * 100 end as milestone_delay_pct,
              snapshot.land_acquisition_progress::double precision as land_acquisition_progress,
              case when clearances.total_count > 0
                then clearances.completed_count::double precision / clearances.total_count * 100 end
                as clearance_completion_pct,
              (clearances.total_count - clearances.completed_count)::integer as clearance_pending_count,
              cardinality(coalesce(snapshot.issues, '{}'::text[]))::integer as issue_count,
              extract(year from start_fact.start_date)::integer as start_year,
              extract(year from snapshot.reporting_month)::integer as snapshot_year,
              p.sector,
              p.project_type,
              ministry.name as ministry,
              coalesce(agency.name, 'Not reported') as implementing_agency,
              p.state_display as state,
              snapshot.contract_status,
              case when clearances.total_count = 0 then 'not_reported'
                   when clearances.completed_count = clearances.total_count then 'cleared'
                   else 'pending' end as clearance_risk_status,
              lower(coalesce(p.metadata->>'synthetic', 'false')) in ('true', '1', 'yes')
                or coalesce(p.source_system, '') ilike '%demo%'
                or coalesce(snapshot.source_system, '') ilike '%demo%'
                or lower(coalesce(snapshot.metadata->>'synthetic', 'false')) in ('true', '1', 'yes')
                as is_synthetic
            from public.projects p
            join public.ministries ministry on ministry.id = p.ministry_id
            left join public.agencies agency on agency.id = p.agency_id
            left join lateral (
              select ranked.* from (
                select monthly.*,
                  lag(monthly.reporting_month) over chronology as previous_reporting_month,
                  lag(monthly.physical_progress) over chronology as previous_physical_progress,
                  lag(monthly.planned_progress) over chronology as previous_planned_progress
                from public.project_monthly_updates monthly
                where monthly.project_id = p.id
                window chronology as (order by monthly.reporting_month, monthly.created_at)
              ) ranked
              order by ranked.reporting_month desc, ranked.created_at desc
              limit 1
            ) snapshot on true
            left join lateral (
              select coalesce(
                (select monthly.original_completion_date from public.project_monthly_updates monthly
                 where monthly.project_id = p.id and monthly.original_completion_date is not null
                 order by monthly.reporting_month, monthly.created_at limit 1),
                p.original_completion_date
              ) as value
            ) original_date on true
            left join lateral (
              select coalesce(
                (select monthly.approved_cost from public.project_monthly_updates monthly
                 where monthly.project_id = p.id and monthly.approved_cost is not null
                 order by monthly.reporting_month, monthly.created_at limit 1),
                nullif(p.approved_cost, 0)
              ) as value
            ) original_cost on true
            left join lateral (
              select coalesce(
                case when coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')
                  ~ '^\\d{4}-\\d{2}-\\d{2}$'
                  then coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')::date end,
                (select min(milestone.planned_date) from public.milestones milestone where milestone.project_id = p.id),
                (select min(monthly.reporting_month) from public.project_monthly_updates monthly where monthly.project_id = p.id)
              ) as start_date
            ) start_fact on true
            left join lateral (
              select
                count(*)::integer as total_count,
                count(*) filter (where lower(clearance.value) in (
                  'approved', 'completed', 'complete', 'obtained', 'cleared', 'clear', 'yes', 'true'
                ))::integer as completed_count
              from jsonb_each_text(coalesce(snapshot.clearance_status, '{}'::jsonb)) clearance
            ) clearances on true
            where p.project_code = :identifier or p.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def cost_training_rows(self) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select
              p.id as project_database_id,
              p.project_code as project_id,
              earliest.reporting_month as snapshot_date,
              final_cost.label_date,
              coalesce(earliest.approved_cost, nullif(p.approved_cost, 0))::double precision as approved_cost,
              final_cost.value::double precision as target_final_cost,
              case when start_fact.start_date is not null
                   and coalesce(earliest.original_completion_date, p.original_completion_date) > start_fact.start_date
                then coalesce(earliest.original_completion_date, p.original_completion_date) - start_fact.start_date end
                as planned_duration_days,
              case when start_fact.start_date is not null
                then greatest(0, earliest.reporting_month - start_fact.start_date) end as elapsed_days,
              earliest.physical_progress::double precision as physical_progress,
              earliest.planned_progress::double precision as planned_progress,
              (earliest.physical_progress - earliest.planned_progress)::double precision as progress_variance,
              case when coalesce(earliest.approved_cost, p.approved_cost) > 0 and earliest.expenditure is not null
                then earliest.expenditure / coalesce(earliest.approved_cost, p.approved_cost) * 100 end::double precision
                as expenditure_to_approved_pct,
              coalesce(earliest.delay_days,
                earliest.revised_completion_date - earliest.original_completion_date)::integer as schedule_slippage_days,
              case when earliest.milestones_total > 0
                then earliest.milestones_completed::double precision / earliest.milestones_total * 100 end
                as milestone_completion_pct,
              case when earliest.milestones_total > 0
                then (coalesce(earliest.milestones_delayed, 0) + coalesce(earliest.milestones_at_risk, 0))::double precision
                  / earliest.milestones_total * 100 end as milestone_slippage_pct,
              earliest.land_acquisition_progress::double precision as land_acquisition_progress,
              cardinality(earliest.issues)::integer as issue_count,
              extract(year from start_fact.start_date)::integer as start_year,
              extract(year from earliest.reporting_month)::integer as snapshot_year,
              p.sector,
              p.project_type,
              ministry.name as ministry,
              coalesce(agency.name, 'Not reported') as implementing_agency,
              p.state_display as state,
              earliest.contract_status,
              false as is_synthetic
            from public.projects p
            join public.ministries ministry on ministry.id = p.ministry_id
            left join public.agencies agency on agency.id = p.agency_id
            join lateral (
              select monthly.* from public.project_monthly_updates monthly
              where monthly.project_id = p.id
              order by monthly.reporting_month, monthly.created_at
              limit 1
            ) earliest on true
            left join lateral (
              select coalesce(
                case when coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')
                  ~ '^\\d{4}-\\d{2}-\\d{2}$'
                  then coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')::date end,
                (select min(milestone.planned_date) from public.milestones milestone where milestone.project_id = p.id),
                earliest.reporting_month
              ) as start_date
            ) start_fact on true
            join lateral (
              select
                coalesce(
                  (select coalesce(history.estimated_at_completion, history.revised_cost)
                   from public.project_cost_history history
                   where history.project_id = p.id
                     and coalesce(history.estimated_at_completion, history.revised_cost) is not null
                   order by history.effective_date desc, history.created_at desc limit 1),
                  (select monthly.revised_cost from public.project_monthly_updates monthly
                   where monthly.project_id = p.id and monthly.revised_cost is not null
                   order by monthly.reporting_month desc, monthly.created_at desc limit 1),
                  nullif(p.revised_cost, 0)
                ) as value,
                coalesce(
                  (select max(history.effective_date) from public.project_cost_history history where history.project_id = p.id),
                  (select max(monthly.reporting_month) from public.project_monthly_updates monthly where monthly.project_id = p.id),
                  p.updated_at::date
                ) as label_date
            ) final_cost on true
            where p.status = 'completed'
              and lower(coalesce(p.metadata->>'synthetic', 'false')) not in ('true', '1', 'yes')
              and coalesce(p.source_system, '') not ilike '%demo%'
              and coalesce(earliest.approved_cost, p.approved_cost) > 0
              and final_cost.value > 0
              and final_cost.label_date > earliest.reporting_month
            order by final_cost.label_date, p.project_code
        """))
        return self.rows(result)

    async def cost_inference_features(self, identifier: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select
              p.id as project_database_id,
              p.project_code as project_id,
              p.name as project_name,
              latest.id as source_update_id,
              coalesce(latest.reporting_month, p.last_reported_at::date) as snapshot_date,
              coalesce(original_cost.value, nullif(p.approved_cost, 0))::double precision as approved_cost,
              case when start_fact.start_date is not null
                   and coalesce(latest.original_completion_date, p.original_completion_date) > start_fact.start_date
                then coalesce(latest.original_completion_date, p.original_completion_date) - start_fact.start_date end
                as planned_duration_days,
              case when start_fact.start_date is not null and coalesce(latest.reporting_month, p.last_reported_at::date) is not null
                then greatest(0, coalesce(latest.reporting_month, p.last_reported_at::date) - start_fact.start_date) end
                as elapsed_days,
              coalesce(latest.physical_progress, p.physical_progress)::double precision as physical_progress,
              coalesce(latest.planned_progress, p.planned_progress)::double precision as planned_progress,
              (coalesce(latest.physical_progress, p.physical_progress)
                - coalesce(latest.planned_progress, p.planned_progress))::double precision as progress_variance,
              case when coalesce(original_cost.value, p.approved_cost) > 0
                and coalesce(latest.expenditure, p.expenditure) is not null
                then coalesce(latest.expenditure, p.expenditure) / coalesce(original_cost.value, p.approved_cost) * 100 end
                ::double precision as expenditure_to_approved_pct,
              coalesce(latest.delay_days,
                latest.revised_completion_date - latest.original_completion_date,
                p.delay_days)::integer as schedule_slippage_days,
              case when latest.milestones_total > 0
                then latest.milestones_completed::double precision / latest.milestones_total * 100 end
                as milestone_completion_pct,
              case when latest.milestones_total > 0
                then (coalesce(latest.milestones_delayed, 0) + coalesce(latest.milestones_at_risk, 0))::double precision
                  / latest.milestones_total * 100 end as milestone_slippage_pct,
              latest.land_acquisition_progress::double precision as land_acquisition_progress,
              cardinality(coalesce(latest.issues, '{}'::text[]))::integer as issue_count,
              extract(year from start_fact.start_date)::integer as start_year,
              extract(year from coalesce(latest.reporting_month, p.last_reported_at::date))::integer as snapshot_year,
              p.sector,
              p.project_type,
              ministry.name as ministry,
              coalesce(agency.name, 'Not reported') as implementing_agency,
              p.state_display as state,
              latest.contract_status,
              lower(coalesce(p.metadata->>'synthetic', 'false')) in ('true', '1', 'yes')
                or coalesce(p.source_system, '') ilike '%demo%' as is_synthetic
            from public.projects p
            join public.ministries ministry on ministry.id = p.ministry_id
            left join public.agencies agency on agency.id = p.agency_id
            left join lateral (
              select monthly.* from public.project_monthly_updates monthly
              where monthly.project_id = p.id
              order by monthly.reporting_month desc, monthly.created_at desc limit 1
            ) latest on true
            left join lateral (
              select monthly.approved_cost as value from public.project_monthly_updates monthly
              where monthly.project_id = p.id and monthly.approved_cost is not null
              order by monthly.reporting_month, monthly.created_at limit 1
            ) original_cost on true
            left join lateral (
              select coalesce(
                case when coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')
                  ~ '^\\d{4}-\\d{2}-\\d{2}$'
                  then coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')::date end,
                (select min(milestone.planned_date) from public.milestones milestone where milestone.project_id = p.id),
                (select min(monthly.reporting_month) from public.project_monthly_updates monthly where monthly.project_id = p.id)
              ) as start_date
            ) start_fact on true
            where p.project_code = :identifier or p.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return self.row(result)

    async def active_cost_model(self) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, name, version, artifact_uri, artifact_checksum,
                   evaluation_metrics, training_data_version, trained_at, deployed_at
            from public.model_versions
            where name = 'pragati_x_cost_overrun' and status = 'active'
            order by deployed_at desc nulls last, trained_at desc
            limit 1
        """))
        return self.row(result)

    async def cost_model_version_exists(self, version: str) -> bool:
        result = await self.session.execute(text("""
            select exists (
              select 1 from public.model_versions
              where name = 'pragati_x_cost_overrun' and version = :version
            )
        """), {"version": version})
        return bool(result.scalar_one())

    async def active_schedule_model(self) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, name, version, artifact_uri, artifact_checksum,
                   evaluation_metrics, training_data_version, trained_at, deployed_at
            from public.model_versions
            where name = 'pragati_x_schedule_overrun' and status = 'active'
            order by deployed_at desc nulls last, trained_at desc
            limit 1
        """))
        return self.row(result)

    async def schedule_model_version_exists(self, version: str) -> bool:
        result = await self.session.execute(text("""
            select exists (
              select 1 from public.model_versions
              where name = 'pragati_x_schedule_overrun' and version = :version
            )
        """), {"version": version})
        return bool(result.scalar_one())

    async def latest_cost_prediction(self, identifier: str) -> tuple[str | None, dict[str, Any] | None]:
        result = await self.session.execute(text("""
            select p.project_code, latest.output_payload
            from public.projects p
            left join lateral (
              select prediction.output_payload
              from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id
                and prediction.prediction_type = 'final_cost'
                and model.name = 'pragati_x_cost_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
              order by prediction.generated_at desc
              limit 1
            ) latest on true
            where p.project_code = :identifier or p.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        row = self.row(result)
        if row is None:
            return None, None
        return str(row["project_code"]), row.get("output_payload")

    async def latest_schedule_prediction(self, identifier: str) -> tuple[str | None, dict[str, Any] | None]:
        result = await self.session.execute(text("""
            select p.project_code, latest.output_payload
            from public.projects p
            left join lateral (
              select prediction.output_payload
              from public.predictions prediction
              join public.model_versions model on model.id = prediction.model_version_id
              where prediction.project_id = p.id
                and prediction.prediction_type = 'completion_date'
                and model.name = 'pragati_x_schedule_overrun'
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
              order by prediction.generated_at desc
              limit 1
            ) latest on true
            where p.project_code = :identifier or p.id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        row = self.row(result)
        if row is None:
            return None, None
        return str(row["project_code"]), row.get("output_payload")

    async def register_model(self, metadata: dict[str, Any]) -> UUID:
        await self.session.execute(text("""
            update public.model_versions
            set status = 'retired', updated_at = now()
            where name = :name and status = 'active' and version <> :version
        """), {"name": metadata["name"], "version": metadata["version"]})
        result = await self.session.execute(text("""
            insert into public.model_versions (
              name, version, model_type, algorithm, description, status,
              artifact_uri, artifact_checksum, feature_schema, parameters,
              evaluation_metrics, training_data_version, trained_at, deployed_at
            ) values (
              :name, :version, :model_type, :algorithm, :description, 'active',
              :artifact_uri, :artifact_checksum, cast(:feature_schema as jsonb),
              cast(:parameters as jsonb), cast(:evaluation_metrics as jsonb),
              :training_data_version, :trained_at, now()
            )
            returning id
        """), {
            **metadata,
            "feature_schema": json.dumps(metadata["feature_schema"], default=str),
            "parameters": json.dumps(metadata["parameters"], default=str),
            "evaluation_metrics": json.dumps(metadata["evaluation_metrics"], default=str),
        })
        return result.scalar_one()

    async def save_cost_prediction(
        self,
        *,
        project_id: UUID,
        model_version_id: UUID,
        source_update_id: UUID | None,
        features: dict[str, Any],
        output: dict[str, Any],
    ) -> None:
        common = {
            "project_id": project_id,
            "model_version_id": model_version_id,
            "source_update_id": source_update_id,
            "feature_snapshot": json.dumps(features, default=str),
            "output_payload": json.dumps(output, default=str),
            "lower_bound": output.get("predicted_final_cost_lower"),
            "upper_bound": output.get("predicted_final_cost_upper"),
        }
        await self.session.execute(text("""
            insert into public.predictions (
              project_id, model_version_id, source_update_id, prediction_type,
              predicted_value, lower_bound, upper_bound, output_payload,
              feature_snapshot, generated_at, metadata
            ) values (
              :project_id, :model_version_id, :source_update_id, 'final_cost',
              :predicted_final_cost, :lower_bound, :upper_bound,
              cast(:output_payload as jsonb), cast(:feature_snapshot as jsonb), now(),
              '{"pipeline":"cost_overrun_v1","synthetic":false}'::jsonb
            )
        """), {**common, "predicted_final_cost": output["predicted_final_cost"]})
        if output.get("significant_overrun_probability") is not None:
            probability = float(output["significant_overrun_probability"])
            await self.session.execute(text("""
                insert into public.predictions (
                  project_id, model_version_id, source_update_id, prediction_type,
                  predicted_value, predicted_class, output_payload,
                  feature_snapshot, generated_at, metadata
                ) values (
                  :project_id, :model_version_id, :source_update_id, 'significant_cost_overrun',
                  :probability_pct, :predicted_class,
                  cast(:output_payload as jsonb), cast(:feature_snapshot as jsonb), now(),
                  '{"pipeline":"cost_overrun_v1","synthetic":false}'::jsonb
                )
            """), {
                **common,
                "probability_pct": probability * 100,
                "predicted_class": output["predicted_class"],
            })

    async def save_schedule_prediction(
        self,
        *,
        project_id: UUID,
        model_version_id: UUID,
        source_update_id: UUID,
        features: dict[str, Any],
        output: dict[str, Any],
    ) -> None:
        common = {
            "project_id": project_id,
            "model_version_id": model_version_id,
            "source_update_id": source_update_id,
            "feature_snapshot": json.dumps(features, default=str),
            "output_payload": json.dumps(output, default=str),
        }
        await self.session.execute(text("""
            insert into public.predictions (
              project_id, model_version_id, source_update_id, prediction_type,
              target_date, predicted_value, lower_bound, upper_bound,
              output_payload, feature_snapshot, generated_at, metadata
            ) values (
              :project_id, :model_version_id, :source_update_id, 'completion_date',
              :predicted_completion_date, :expected_delay_days,
              :predicted_delay_days_lower, :predicted_delay_days_upper,
              cast(:output_payload as jsonb), cast(:feature_snapshot as jsonb), now(),
              '{"pipeline":"schedule_overrun_v1","synthetic":false}'::jsonb
            )
        """), {
            **common,
            "predicted_completion_date": output["predicted_completion_date"],
            "expected_delay_days": output["expected_delay_days"],
            "predicted_delay_days_lower": output["predicted_delay_days_lower"],
            "predicted_delay_days_upper": output["predicted_delay_days_upper"],
        })
        if output.get("schedule_overrun_probability") is not None:
            await self.session.execute(text("""
                insert into public.predictions (
                  project_id, model_version_id, source_update_id, prediction_type,
                  predicted_value, predicted_class, output_payload,
                  feature_snapshot, generated_at, metadata
                ) values (
                  :project_id, :model_version_id, :source_update_id, 'schedule_overrun_probability',
                  :probability_pct, :predicted_class,
                  cast(:output_payload as jsonb), cast(:feature_snapshot as jsonb), now(),
                  '{"pipeline":"schedule_overrun_v1","synthetic":false}'::jsonb
                )
            """), {
                **common,
                "probability_pct": float(output["schedule_overrun_probability"]) * 100,
                "predicted_class": output["predicted_class"],
            })

    async def for_project(self, identifier: str) -> tuple[str | None, list[dict[str, Any]]]:
        project_result = await self.session.execute(text("""
            select project_code from public.projects
            where project_code = :identifier or id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        project_code = project_result.scalar_one_or_none()
        if project_code is None:
            return None, []
        result = await self.session.execute(text("""
            select pr.id, p.project_code as project_id, p.name as project_name,
                   mv.name as model_name, mv.version as model_version,
                   pr.prediction_type, pr.horizon_months, pr.target_date,
                   pr.predicted_value::double precision as predicted_value,
                   pr.predicted_class, pr.confidence::double precision as confidence,
                   pr.lower_bound::double precision as lower_bound,
                   pr.upper_bound::double precision as upper_bound,
                   pr.output_payload, pr.generated_at, pr.valid_until
            from public.predictions pr
            join public.projects p on p.id = pr.project_id
            join public.model_versions mv on mv.id = pr.model_version_id
            where p.project_code = :project_code
            order by pr.generated_at desc
        """), {"project_code": project_code})
        return project_code, self.rows(result)
