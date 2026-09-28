from typing import Any, Literal

from sqlalchemy import text

from app.repositories.base import BaseRepository


COST_FACTS_CTE = """
with cost_facts as (
  select
    p.id as project_database_id,
    p.project_code as project_id,
    p.name as project_name,
    ministry.name as ministry,
    p.sector,
    coalesce(monthly_approved.value, nullif(p.approved_cost, 0))::double precision as original_approved_cost,
    coalesce(monthly_revised.value, nullif(p.revised_cost, 0))::double precision as latest_revised_cost,
    coalesce(monthly_expenditure.value,
      case when p.last_reported_at is not null or p.expenditure <> 0 then p.expenditure end
    )::double precision as cumulative_expenditure,
    coalesce(monthly_physical.value,
      case when p.last_reported_at is not null or p.physical_progress <> 0 then p.physical_progress end
    )::double precision as physical_progress,
    case when monthly_approved.value is not null then 'monthly_history'
         when p.approved_cost <> 0 then 'project_snapshot' end as approved_cost_source,
    case when monthly_revised.value is not null then 'monthly_history'
         when p.revised_cost <> 0 then 'project_snapshot' end as revised_cost_source,
    case when monthly_expenditure.value is not null then 'monthly_history'
         when p.last_reported_at is not null or p.expenditure <> 0 then 'project_snapshot' end as expenditure_source,
    exists (
      select 1 from public.project_monthly_updates history where history.project_id = p.id
    ) as has_monthly_history
  from public.projects p
  join public.ministries ministry on ministry.id = p.ministry_id
  left join lateral (
    select update.approved_cost as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.approved_cost is not null
    order by update.reporting_month asc, update.created_at asc
    limit 1
  ) monthly_approved on true
  left join lateral (
    select update.revised_cost as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.revised_cost is not null
    order by update.reporting_month desc, update.created_at desc
    limit 1
  ) monthly_revised on true
  left join lateral (
    select update.expenditure as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.expenditure is not null
    order by update.reporting_month desc, update.created_at desc
    limit 1
  ) monthly_expenditure on true
  left join lateral (
    select update.physical_progress as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.physical_progress is not null
    order by update.reporting_month desc, update.created_at desc
    limit 1
  ) monthly_physical on true
), filtered_cost_facts as (
  select *,
    case when original_approved_cost is not null and latest_revised_cost is not null
      then latest_revised_cost - original_approved_cost end as cost_escalation,
    case when original_approved_cost > 0 and latest_revised_cost is not null
      then ((latest_revised_cost - original_approved_cost) / original_approved_cost) * 100 end as cost_escalation_percentage,
    case when latest_revised_cost > 0 and cumulative_expenditure is not null
      then (cumulative_expenditure / latest_revised_cost) * 100 end as expenditure_percentage,
    case when latest_revised_cost > 0 and cumulative_expenditure is not null and physical_progress is not null
      then (cumulative_expenditure / latest_revised_cost) * 100 - physical_progress end as progress_mismatch
  from cost_facts
  where (cast(:sector as text) is null or sector = :sector)
    and (
      not :escalated_only
      or (original_approved_cost is not null and latest_revised_cost > original_approved_cost)
    )
)
"""


SCHEDULE_FACTS_CTE = """
with schedule_base as (
  select
    p.id as project_database_id,
    p.project_code as project_id,
    p.name as project_name,
    ministry.name as ministry,
    coalesce(agency.name, 'Not reported') as implementing_agency,
    p.sector,
    coalesce(latest_original.value, p.original_completion_date) as original_completion_date,
    coalesce(latest_revised.value, p.revised_completion_date,
             latest_original.value, p.original_completion_date) as current_completion_date,
    coalesce(latest_actual.value,
      case when p.last_reported_at is not null or p.physical_progress <> 0 then p.physical_progress end
    )::double precision as actual_physical_progress,
    coalesce(latest_planned.value,
      case when p.last_reported_at is not null or p.planned_progress <> 0 then p.planned_progress end
    )::double precision as planned_physical_progress,
    first_update.reporting_month as monitoring_start_date,
    coalesce(latest_update.reporting_month, p.last_reported_at::date, current_date) as as_of_date,
    latest_update.milestones_total as snapshot_milestones_total,
    latest_update.milestones_completed as snapshot_milestones_completed,
    latest_update.milestones_delayed as snapshot_milestones_delayed,
    latest_update.milestones_at_risk as snapshot_milestones_at_risk,
    coalesce(milestone_details.total_milestones, 0)::integer as detailed_milestones_total,
    coalesce(milestone_details.completed_milestones, 0)::integer as detailed_milestones_completed,
    coalesce(milestone_details.on_track_milestones, 0)::integer as detailed_milestones_on_track,
    coalesce(milestone_details.at_risk_milestones, 0)::integer as detailed_milestones_at_risk,
    coalesce(milestone_details.delayed_milestones, 0)::integer as detailed_milestones_delayed,
    coalesce(milestone_details.overdue_milestones, 0)::integer as overdue_milestones,
    latest_velocity.monthly_progress_velocity,
    exists (
      select 1 from public.project_monthly_updates history where history.project_id = p.id
    ) as has_monthly_history
  from public.projects p
  join public.ministries ministry on ministry.id = p.ministry_id
  left join public.agencies agency on agency.id = p.agency_id
  left join lateral (
    select update.*
    from public.project_monthly_updates update
    where update.project_id = p.id
    order by update.reporting_month desc, update.created_at desc
    limit 1
  ) latest_update on true
  left join lateral (
    select update.reporting_month
    from public.project_monthly_updates update
    where update.project_id = p.id
    order by update.reporting_month, update.created_at
    limit 1
  ) first_update on true
  left join lateral (
    select update.original_completion_date as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.original_completion_date is not null
    order by update.reporting_month, update.created_at
    limit 1
  ) latest_original on true
  left join lateral (
    select update.revised_completion_date as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.revised_completion_date is not null
    order by update.reporting_month desc, update.created_at desc
    limit 1
  ) latest_revised on true
  left join lateral (
    select update.physical_progress as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.physical_progress is not null
    order by update.reporting_month desc, update.created_at desc
    limit 1
  ) latest_actual on true
  left join lateral (
    select update.planned_progress as value
    from public.project_monthly_updates update
    where update.project_id = p.id and update.planned_progress is not null
    order by update.reporting_month desc, update.created_at desc
    limit 1
  ) latest_planned on true
  left join lateral (
    select
      count(*)::integer as total_milestones,
      count(*) filter (where milestone.actual_date is not null or milestone.status = 'completed')::integer as completed_milestones,
      count(*) filter (
        where milestone.actual_date is null and milestone.status = 'on_track'
          and milestone.planned_date >= coalesce(latest_update.reporting_month, p.last_reported_at::date, current_date)
      )::integer as on_track_milestones,
      count(*) filter (where milestone.actual_date is null and milestone.status = 'at_risk')::integer as at_risk_milestones,
      count(*) filter (where milestone.actual_date is null and milestone.status = 'delayed')::integer as delayed_milestones,
      count(*) filter (
        where milestone.actual_date is null
          and milestone.status <> 'completed'
          and milestone.planned_date < coalesce(latest_update.reporting_month, p.last_reported_at::date, current_date)
      )::integer as overdue_milestones
    from public.milestones milestone
    where milestone.project_id = p.id
  ) milestone_details on true
  left join lateral (
    select velocity.monthly_progress_velocity
    from (
      select
        history.reporting_month,
        case when lag(history.physical_progress) over chronology is not null then
          (history.physical_progress - lag(history.physical_progress) over chronology)
          / nullif(
              (extract(year from history.reporting_month)::integer * 12 + extract(month from history.reporting_month)::integer)
              - (extract(year from lag(history.reporting_month) over chronology)::integer * 12
                 + extract(month from lag(history.reporting_month) over chronology)::integer),
              0
            )
        end::double precision as monthly_progress_velocity
      from public.project_monthly_updates history
      where history.project_id = p.id and history.physical_progress is not null
      window chronology as (order by history.reporting_month, history.created_at)
    ) velocity
    where velocity.monthly_progress_velocity is not null
    order by velocity.reporting_month desc
    limit 1
  ) latest_velocity on true
), schedule_facts as (
  select *,
    case when original_completion_date is not null and current_completion_date is not null
      then current_completion_date - original_completion_date end as schedule_slippage_days,
    case when actual_physical_progress is not null and planned_physical_progress is not null
      then actual_physical_progress - planned_physical_progress end as progress_variance,
    case when monitoring_start_date is not null and current_completion_date > monitoring_start_date then
      greatest(0,
        ((as_of_date - monitoring_start_date)::double precision
          / nullif((current_completion_date - monitoring_start_date)::double precision, 0)) * 100
      )
    end as elapsed_duration_percentage,
    case when detailed_milestones_total > 0 then detailed_milestones_total
      else coalesce(snapshot_milestones_total, 0) end::integer as total_milestones,
    case when detailed_milestones_total > 0 then detailed_milestones_completed
      else coalesce(snapshot_milestones_completed, 0) end::integer as completed_milestones,
    case when detailed_milestones_total > 0 then detailed_milestones_on_track
      else greatest(coalesce(snapshot_milestones_total, 0)
        - coalesce(snapshot_milestones_completed, 0)
        - coalesce(snapshot_milestones_delayed, 0)
        - coalesce(snapshot_milestones_at_risk, 0), 0) end::integer as on_track_milestones,
    case when detailed_milestones_total > 0 then detailed_milestones_at_risk
      else coalesce(snapshot_milestones_at_risk, 0) end::integer as at_risk_milestones,
    case when detailed_milestones_total > 0 then detailed_milestones_delayed
      else coalesce(snapshot_milestones_delayed, 0) end::integer as delayed_milestones
  from schedule_base
), filtered_schedule_facts as (
  select *
  from schedule_facts
  where (cast(:sector as text) is null or sector = :sector)
    and (cast(:search as text) is null
      or project_id ilike '%' || cast(:search as text) || '%'
      or project_name ilike '%' || cast(:search as text) || '%'
      or ministry ilike '%' || cast(:search as text) || '%')
    and (
      cast(:delay_filter as text) = 'all'
      or (cast(:delay_filter as text) = 'delayed' and schedule_slippage_days > 0)
      or (cast(:delay_filter as text) = 'severe' and schedule_slippage_days >= 730)
      or (cast(:delay_filter as text) = 'on_time' and schedule_slippage_days <= 0)
    )
)
"""


class AnalyticsRepository(BaseRepository):
    async def cost(
        self,
        *,
        sector: str | None = None,
        escalated_only: bool = False,
        mismatch_threshold: float = 15,
    ) -> dict[str, Any]:
        parameters = {
            "sector": sector,
            "escalated_only": escalated_only,
            "mismatch_threshold": mismatch_threshold,
        }
        summary_result = await self.session.execute(text(COST_FACTS_CTE + """
            select
              count(*)::integer as total_projects,
              coalesce(sum(original_approved_cost), 0)::double precision as original_approved_cost,
              coalesce(sum(latest_revised_cost), 0)::double precision as latest_revised_cost,
              coalesce(sum(cumulative_expenditure), 0)::double precision as cumulative_expenditure,
              coalesce(sum(cost_escalation) filter (
                where original_approved_cost is not null and latest_revised_cost is not null
              ), 0)::double precision as absolute_cost_escalation,
              coalesce(
                sum(cost_escalation) filter (where original_approved_cost is not null and latest_revised_cost is not null)
                / nullif(sum(original_approved_cost) filter (
                  where original_approved_cost is not null and latest_revised_cost is not null
                ), 0) * 100,
                0
              )::double precision as cost_escalation_percentage,
              coalesce(
                sum(cumulative_expenditure) filter (where latest_revised_cost is not null)
                / nullif(sum(latest_revised_cost) filter (where cumulative_expenditure is not null), 0) * 100,
                0
              )::double precision as expenditure_percentage,
              count(*) filter (where cost_escalation > 0)::integer as escalated_projects
            from filtered_cost_facts
        """), parameters)
        availability_result = await self.session.execute(text(COST_FACTS_CTE + """
            select
              count(*)::integer as total_projects,
              count(original_approved_cost)::integer as approved_cost_projects,
              count(latest_revised_cost)::integer as revised_cost_projects,
              count(cumulative_expenditure)::integer as expenditure_projects,
              count(physical_progress)::integer as physical_progress_projects,
              count(*) filter (
                where original_approved_cost is not null and latest_revised_cost is not null
              )::integer as comparable_cost_projects,
              count(*) filter (where has_monthly_history)::integer as monthly_history_projects,
              count(*) filter (
                where original_approved_cost is null or latest_revised_cost is null
              )::integer as incomplete_cost_projects,
              (
                select max(history.reporting_month)
                from public.project_monthly_updates history
                where exists (
                  select 1 from filtered_cost_facts project
                  where project.project_database_id = history.project_id
                )
              ) as latest_reporting_month
            from filtered_cost_facts
        """), parameters)
        series_result = await self.session.execute(text("""
            select
              update.reporting_month as period,
              count(distinct update.project_id)::integer as reporting_projects,
              count(update.approved_cost)::integer as approved_cost_projects,
              count(update.revised_cost)::integer as revised_cost_projects,
              count(update.expenditure)::integer as expenditure_projects,
              sum(update.approved_cost)::double precision as original_approved_cost,
              sum(update.revised_cost)::double precision as latest_revised_cost,
              sum(update.expenditure)::double precision as cumulative_expenditure,
              sum(update.revised_cost - update.approved_cost) filter (
                where update.approved_cost is not null and update.revised_cost is not null
              )::double precision as absolute_cost_escalation,
              (
                sum(update.revised_cost - update.approved_cost) filter (
                  where update.approved_cost is not null and update.revised_cost is not null
                ) / nullif(sum(update.approved_cost) filter (
                  where update.approved_cost is not null and update.revised_cost is not null
                ), 0) * 100
              )::double precision as cost_escalation_percentage
            from public.project_monthly_updates update
            join public.projects project on project.id = update.project_id
            where (cast(:sector as text) is null or project.sector = :sector)
              and (
                not :escalated_only
                or (update.approved_cost is not null and update.revised_cost > update.approved_cost)
              )
            group by update.reporting_month
            order by update.reporting_month
        """), parameters)

        aggregate_sql = """
            select
              {dimension} as {alias},
              count(*)::integer as project_count,
              count(*) filter (
                where original_approved_cost is not null and latest_revised_cost is not null
              )::integer as comparable_projects,
              coalesce(sum(original_approved_cost), 0)::double precision as original_approved_cost,
              coalesce(sum(latest_revised_cost), 0)::double precision as latest_revised_cost,
              coalesce(sum(cumulative_expenditure), 0)::double precision as cumulative_expenditure,
              coalesce(sum(cost_escalation) filter (
                where original_approved_cost is not null and latest_revised_cost is not null
              ), 0)::double precision as absolute_cost_escalation,
              coalesce(
                sum(cost_escalation) filter (where original_approved_cost is not null and latest_revised_cost is not null)
                / nullif(sum(original_approved_cost) filter (
                  where original_approved_cost is not null and latest_revised_cost is not null
                ), 0) * 100,
                0
              )::double precision as cost_escalation_percentage
            from filtered_cost_facts
            group by {dimension}
            order by absolute_cost_escalation desc, {dimension}
        """
        sector_result = await self.session.execute(
            text(COST_FACTS_CTE + aggregate_sql.format(dimension="sector", alias="sector")),
            parameters,
        )
        ministry_result = await self.session.execute(
            text(COST_FACTS_CTE + aggregate_sql.format(dimension="ministry", alias="ministry")),
            parameters,
        )
        project_result = await self.session.execute(text(COST_FACTS_CTE + """
            select project_id, project_name, ministry, sector,
                   original_approved_cost, latest_revised_cost, cumulative_expenditure,
                   cost_escalation as absolute_cost_escalation,
                   cost_escalation_percentage, expenditure_percentage,
                   physical_progress, progress_mismatch,
                   approved_cost_source, revised_cost_source, expenditure_source,
                   has_monthly_history
            from filtered_cost_facts
            order by cost_escalation desc nulls last, project_id
        """), parameters)
        highest_result = await self.session.execute(text(COST_FACTS_CTE + """
            select project_id, project_name, ministry, sector,
                   original_approved_cost, latest_revised_cost, cumulative_expenditure,
                   cost_escalation as absolute_cost_escalation,
                   cost_escalation_percentage, expenditure_percentage,
                   physical_progress, progress_mismatch,
                   approved_cost_source, revised_cost_source, expenditure_source,
                   has_monthly_history
            from filtered_cost_facts
            where cost_escalation > 0
            order by cost_escalation desc, project_id
            limit 10
        """), parameters)
        mismatch_result = await self.session.execute(text(COST_FACTS_CTE + """
            select project_id, project_name, ministry, sector,
                   latest_revised_cost, cumulative_expenditure, expenditure_percentage,
                   physical_progress, progress_mismatch
            from filtered_cost_facts
            where progress_mismatch >= :mismatch_threshold
            order by progress_mismatch desc, project_id
            limit 25
        """), parameters)
        return {
            "summary": self.row(summary_result) or {},
            "data_availability": self.row(availability_result) or {},
            "series": self.rows(series_result),
            "sector_breakdown": self.rows(sector_result),
            "ministry_breakdown": self.rows(ministry_result),
            "project_breakdown": self.rows(project_result),
            "breakdown": self.rows(highest_result),
            "progress_mismatches": self.rows(mismatch_result),
        }

    async def schedule(
        self,
        *,
        sector: str | None = None,
        delay_filter: Literal["all", "delayed", "severe", "on_time"] = "all",
        search: str | None = None,
    ) -> dict[str, Any]:
        parameters = {"sector": sector, "delay_filter": delay_filter, "search": search}
        summary_result = await self.session.execute(text(SCHEDULE_FACTS_CTE + """
            select
              count(*)::integer as total_projects,
              count(*) filter (where schedule_slippage_days > 0)::integer as delayed_projects,
              count(*) filter (where schedule_slippage_days <= 0)::integer as on_time_projects,
              count(*) filter (where schedule_slippage_days >= 730)::integer as severe_delayed_projects,
              count(*) filter (where schedule_slippage_days >= 1825)::integer as chronic_delayed_projects,
              coalesce(avg(schedule_slippage_days) filter (where schedule_slippage_days > 0), 0)::double precision as average_slippage_days,
              coalesce(max(schedule_slippage_days), 0)::integer as maximum_slippage_days,
              coalesce(avg(planned_physical_progress), 0)::double precision as average_planned_progress,
              coalesce(avg(actual_physical_progress), 0)::double precision as average_actual_progress,
              coalesce(avg(progress_variance), 0)::double precision as average_progress_variance,
              coalesce(avg(elapsed_duration_percentage), 0)::double precision as average_elapsed_duration_percentage,
              coalesce(avg(monthly_progress_velocity), 0)::double precision as average_monthly_progress_velocity,
              coalesce(sum(total_milestones), 0)::integer as total_milestones,
              coalesce(sum(completed_milestones), 0)::integer as completed_milestones,
              coalesce(sum(on_track_milestones), 0)::integer as on_track_milestones,
              coalesce(sum(at_risk_milestones), 0)::integer as at_risk_milestones,
              coalesce(sum(delayed_milestones), 0)::integer as delayed_milestones,
              coalesce(sum(overdue_milestones), 0)::integer as overdue_milestones,
              coalesce(sum(completed_milestones)::double precision / nullif(sum(total_milestones), 0) * 100, 0)::double precision
                as milestone_completion_percentage
            from filtered_schedule_facts
        """), parameters)
        availability_result = await self.session.execute(text(SCHEDULE_FACTS_CTE + """
            select
              count(*)::integer as total_projects,
              count(original_completion_date)::integer as original_date_projects,
              count(current_completion_date)::integer as current_date_projects,
              count(*) filter (
                where original_completion_date is not null and current_completion_date is not null
              )::integer as comparable_date_projects,
              count(planned_physical_progress)::integer as planned_progress_projects,
              count(actual_physical_progress)::integer as actual_progress_projects,
              count(*) filter (
                where planned_physical_progress is not null and actual_physical_progress is not null
              )::integer as comparable_progress_projects,
              count(*) filter (where elapsed_duration_percentage is not null)::integer as elapsed_duration_projects,
              count(monthly_progress_velocity)::integer as velocity_projects,
              count(*) filter (where has_monthly_history)::integer as monthly_history_projects,
              count(*) filter (where detailed_milestones_total > 0)::integer as milestone_detail_projects,
              count(*) filter (where total_milestones > 0)::integer as milestone_reporting_projects,
              max(as_of_date) as latest_as_of_date,
              (
                select max(history.reporting_month)
                from public.project_monthly_updates history
                where exists (
                  select 1 from filtered_schedule_facts project
                  where project.project_database_id = history.project_id
                )
              ) as latest_reporting_month
            from filtered_schedule_facts
        """), parameters)
        bracket_result = await self.session.execute(text(SCHEDULE_FACTS_CTE + """
            select bracket, count(*)::integer as project_count, sort_order
            from (
              select case
                when schedule_slippage_days <= 0 then 'On Schedule (0d)'
                when schedule_slippage_days <= 365 then '1-12 Months'
                when schedule_slippage_days <= 730 then '13-24 Months'
                when schedule_slippage_days <= 1825 then '25-60 Months'
                else '> 5 Years'
              end as bracket,
              case
                when schedule_slippage_days <= 0 then 1
                when schedule_slippage_days <= 365 then 2
                when schedule_slippage_days <= 730 then 3
                when schedule_slippage_days <= 1825 then 4
                else 5
              end as sort_order
              from filtered_schedule_facts
              where schedule_slippage_days is not null
            ) brackets
            group by bracket, sort_order
            order by sort_order
        """), parameters)
        aggregate_sql = """
            select
              {dimension} as {alias},
              count(*)::integer as project_count,
              count(schedule_slippage_days)::integer as comparable_projects,
              count(*) filter (where schedule_slippage_days > 0)::integer as delayed_projects,
              coalesce(avg(schedule_slippage_days) filter (where schedule_slippage_days > 0), 0)::double precision
                as average_delay_days,
              coalesce(max(schedule_slippage_days), 0)::integer as maximum_delay_days,
              coalesce(avg(progress_variance), 0)::double precision as average_progress_variance,
              coalesce(avg(monthly_progress_velocity), 0)::double precision as average_monthly_progress_velocity
            from filtered_schedule_facts
            group by {dimension}
            order by average_delay_days desc, {dimension}
        """
        sector_result = await self.session.execute(
            text(SCHEDULE_FACTS_CTE + aggregate_sql.format(dimension="sector", alias="sector")), parameters
        )
        ministry_result = await self.session.execute(
            text(SCHEDULE_FACTS_CTE + aggregate_sql.format(dimension="ministry", alias="ministry")), parameters
        )
        project_select = """
            select
              project_id, project_name, ministry, implementing_agency, sector,
              original_completion_date, current_completion_date, schedule_slippage_days,
              planned_physical_progress, actual_physical_progress, progress_variance,
              monitoring_start_date, as_of_date, elapsed_duration_percentage,
              total_milestones, completed_milestones, on_track_milestones,
              at_risk_milestones, delayed_milestones, overdue_milestones,
              case when total_milestones > 0
                then completed_milestones::double precision / total_milestones * 100 end
                as milestone_completion_percentage,
              monthly_progress_velocity, has_monthly_history,
              case when schedule_slippage_days > 0 then
                dense_rank() over (order by schedule_slippage_days desc)
              end::integer as delay_rank
            from filtered_schedule_facts
        """
        projects_result = await self.session.execute(text(
            SCHEDULE_FACTS_CTE + project_select +
            " order by schedule_slippage_days desc nulls last, project_id"
        ), parameters)
        delayed_result = await self.session.execute(text(
            SCHEDULE_FACTS_CTE + project_select +
            " where schedule_slippage_days > 0 order by schedule_slippage_days desc, project_id limit 25"
        ), parameters)
        series_result = await self.session.execute(text(SCHEDULE_FACTS_CTE + """
            , monthly_progress as (
              select
                update.project_id,
                update.reporting_month,
                update.planned_progress::double precision as planned_progress,
                update.physical_progress::double precision as actual_progress,
                update.original_completion_date,
                coalesce(update.revised_completion_date, update.forecast_completion_date) as current_completion_date,
                lag(update.physical_progress) over project_chronology as previous_actual_progress,
                lag(update.reporting_month) over project_chronology as previous_reporting_month
              from public.project_monthly_updates update
              join filtered_schedule_facts project on project.project_database_id = update.project_id
              window project_chronology as (
                partition by update.project_id order by update.reporting_month, update.created_at
              )
            )
            select
              reporting_month as period,
              count(distinct project_id)::integer as reporting_projects,
              count(planned_progress)::integer as planned_progress_projects,
              count(actual_progress)::integer as actual_progress_projects,
              avg(planned_progress)::double precision as planned_progress,
              avg(actual_progress)::double precision as actual_progress,
              avg(actual_progress - planned_progress) filter (
                where actual_progress is not null and planned_progress is not null
              )::double precision as progress_variance,
              avg(
                (actual_progress - previous_actual_progress)
                / nullif(
                    (extract(year from reporting_month)::integer * 12 + extract(month from reporting_month)::integer)
                    - (extract(year from previous_reporting_month)::integer * 12
                       + extract(month from previous_reporting_month)::integer),
                    0
                  )
              ) filter (where actual_progress is not null and previous_actual_progress is not null)::double precision
                as monthly_progress_velocity,
              avg(current_completion_date - original_completion_date) filter (
                where current_completion_date is not null and original_completion_date is not null
              )::double precision as average_slippage_days
            from monthly_progress
            group by reporting_month
            order by reporting_month
        """), parameters)
        return {
            "summary": self.row(summary_result) or {},
            "data_availability": self.row(availability_result) or {},
            "series": self.rows(series_result),
            "delay_brackets": self.rows(bracket_result),
            "sector_breakdown": self.rows(sector_result),
            "ministry_breakdown": self.rows(ministry_result),
            "project_breakdown": self.rows(projects_result),
            "breakdown": self.rows(delayed_result),
        }

    async def benchmark_facts(self) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            with benchmark_base as (
              select
                p.id as project_database_id,
                p.project_code as project_id,
                p.name as project_name,
                ministry.name as ministry,
                coalesce(agency.name, 'Not reported') as implementing_agency,
                p.sector,
                coalesce(p.project_type, 'Not reported') as project_type,
                p.state_display as state,
                p.states,
                p.status::text as status,
                coalesce(original_cost.value, nullif(p.approved_cost, 0))::double precision as original_cost,
                coalesce(revised_cost.value, nullif(p.revised_cost, 0))::double precision as revised_cost,
                coalesce(expenditure.value,
                  case when p.last_reported_at is not null or p.expenditure <> 0 then p.expenditure end
                )::double precision as expenditure,
                coalesce(actual_progress.value,
                  case when p.last_reported_at is not null or p.physical_progress <> 0 then p.physical_progress end
                )::double precision as physical_progress,
                coalesce(original_date.value, p.original_completion_date) as original_completion_date,
                coalesce(revised_date.value, p.revised_completion_date,
                         original_date.value, p.original_completion_date) as current_completion_date,
                coalesce(metadata_start.value, earliest_milestone.planned_date, first_update.reporting_month) as start_date,
                case when metadata_start.value is not null then 'project_metadata'
                     when earliest_milestone.planned_date is not null then 'earliest_milestone'
                     when first_update.reporting_month is not null then 'first_monthly_report'
                end as start_date_source,
                coalesce(latest_update.reporting_month, p.last_reported_at::date, current_date) as as_of_date,
                coalesce(milestone_detail.total_milestones, latest_update.milestones_total, 0)::integer as total_milestones,
                coalesce(milestone_detail.completed_milestones, latest_update.milestones_completed, 0)::integer as completed_milestones,
                coalesce(milestone_detail.slipped_milestones,
                         latest_update.milestones_delayed, 0)::integer as slipped_milestones,
                velocity.monthly_progress_velocity,
                risk.overall_risk_score,
                risk.cost_risk_score,
                risk.schedule_risk_score,
                risk.implementation_risk_score
              from public.projects p
              join public.ministries ministry on ministry.id = p.ministry_id
              left join public.agencies agency on agency.id = p.agency_id
              left join lateral (
                select case
                  when coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')
                    ~ '^\\d{4}-\\d{2}-\\d{2}$'
                  then coalesce(p.metadata->>'start_date', p.metadata->>'project_start_date')::date
                end as value
              ) metadata_start on true
              left join lateral (
                select update.* from public.project_monthly_updates update
                where update.project_id = p.id
                order by update.reporting_month desc, update.created_at desc limit 1
              ) latest_update on true
              left join lateral (
                select update.reporting_month from public.project_monthly_updates update
                where update.project_id = p.id
                order by update.reporting_month, update.created_at limit 1
              ) first_update on true
              left join lateral (
                select min(milestone.planned_date) as planned_date
                from public.milestones milestone where milestone.project_id = p.id
              ) earliest_milestone on true
              left join lateral (
                select update.approved_cost as value from public.project_monthly_updates update
                where update.project_id = p.id and update.approved_cost is not null
                order by update.reporting_month, update.created_at limit 1
              ) original_cost on true
              left join lateral (
                select update.revised_cost as value from public.project_monthly_updates update
                where update.project_id = p.id and update.revised_cost is not null
                order by update.reporting_month desc, update.created_at desc limit 1
              ) revised_cost on true
              left join lateral (
                select update.expenditure as value from public.project_monthly_updates update
                where update.project_id = p.id and update.expenditure is not null
                order by update.reporting_month desc, update.created_at desc limit 1
              ) expenditure on true
              left join lateral (
                select update.physical_progress as value from public.project_monthly_updates update
                where update.project_id = p.id and update.physical_progress is not null
                order by update.reporting_month desc, update.created_at desc limit 1
              ) actual_progress on true
              left join lateral (
                select update.original_completion_date as value from public.project_monthly_updates update
                where update.project_id = p.id and update.original_completion_date is not null
                order by update.reporting_month, update.created_at limit 1
              ) original_date on true
              left join lateral (
                select update.revised_completion_date as value from public.project_monthly_updates update
                where update.project_id = p.id and update.revised_completion_date is not null
                order by update.reporting_month desc, update.created_at desc limit 1
              ) revised_date on true
              left join lateral (
                select
                  count(*)::integer as total_milestones,
                  count(*) filter (
                    where milestone.actual_date is not null or milestone.status = 'completed'
                  )::integer as completed_milestones,
                  count(*) filter (
                    where milestone.actual_date is null and milestone.status <> 'completed'
                      and (milestone.status = 'delayed'
                        or milestone.planned_date < coalesce(latest_update.reporting_month, p.last_reported_at::date, current_date))
                  )::integer as slipped_milestones
                from public.milestones milestone where milestone.project_id = p.id
                having count(*) > 0
              ) milestone_detail on true
              left join lateral (
                select point.monthly_progress_velocity
                from (
                  select history.reporting_month,
                    case when lag(history.physical_progress) over chronology is not null then
                      (history.physical_progress - lag(history.physical_progress) over chronology)
                      / nullif(
                          (extract(year from history.reporting_month)::integer * 12 + extract(month from history.reporting_month)::integer)
                          - (extract(year from lag(history.reporting_month) over chronology)::integer * 12
                             + extract(month from lag(history.reporting_month) over chronology)::integer), 0
                        )
                    end::double precision as monthly_progress_velocity
                  from public.project_monthly_updates history
                  where history.project_id = p.id and history.physical_progress is not null
                  window chronology as (order by history.reporting_month, history.created_at)
                ) point
                where point.monthly_progress_velocity is not null
                order by point.reporting_month desc limit 1
              ) velocity on true
              left join lateral (
                select
                  current_risk.overall_score::double precision as overall_risk_score,
                  current_risk.cost_overrun_risk::double precision as cost_risk_score,
                  current_risk.schedule_delay_risk::double precision as schedule_risk_score,
                  current_risk.implementation_risk::double precision as implementation_risk_score
                from public.project_risks current_risk
                where current_risk.project_id = p.id and current_risk.is_current
                order by current_risk.assessed_at desc limit 1
              ) risk on true
            )
            select *,
              case when original_cost > 0 and revised_cost is not null
                then (revised_cost - original_cost) / original_cost * 100 end::double precision as cost_overrun_percentage,
              case when original_completion_date is not null and current_completion_date is not null
                then current_completion_date - original_completion_date end as schedule_delay_days,
              case when start_date is not null and original_completion_date > start_date
                then original_completion_date - start_date end as planned_duration_days,
              extract(year from start_date)::integer as start_year,
              case when revised_cost > 0 and expenditure > 0 and physical_progress is not null
                then physical_progress / (expenditure / revised_cost * 100) * 100 end::double precision
                as expenditure_efficiency,
              case when total_milestones > 0
                then slipped_milestones::double precision / total_milestones * 100 end::double precision
                as milestone_slippage_percentage,
              case when total_milestones > 0
                then completed_milestones::double precision / total_milestones * 100 end::double precision
                as milestone_completion_percentage
            from benchmark_base
            order by project_id
        """))
        return self.rows(result)

    async def benchmark(self) -> dict[str, Any]:
        rows = await self.benchmark_facts()
        return {"summary": {"projects": len(rows)}, "series": [], "breakdown": rows}

    async def get(self, kind: Literal["cost", "schedule", "benchmark"]) -> dict[str, Any]:
        if kind == "cost":
            return await self.cost()
        return await getattr(self, kind)()
