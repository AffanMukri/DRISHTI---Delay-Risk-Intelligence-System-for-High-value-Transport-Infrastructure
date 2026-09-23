from datetime import date
from typing import Any

from pydantic import Field

from app.schemas.common import APIModel


class AnalyticsResponse(APIModel):
    summary: dict[str, Any]
    series: list[dict[str, Any]]
    breakdown: list[dict[str, Any]]


class CostSummary(APIModel):
    total_projects: int = Field(ge=0)
    original_approved_cost: float = Field(ge=0)
    latest_revised_cost: float = Field(ge=0)
    cumulative_expenditure: float = Field(ge=0)
    absolute_cost_escalation: float
    cost_escalation_percentage: float
    expenditure_percentage: float
    escalated_projects: int = Field(ge=0)


class CostDataAvailability(APIModel):
    total_projects: int = Field(ge=0)
    approved_cost_projects: int = Field(ge=0)
    revised_cost_projects: int = Field(ge=0)
    expenditure_projects: int = Field(ge=0)
    physical_progress_projects: int = Field(ge=0)
    comparable_cost_projects: int = Field(ge=0)
    monthly_history_projects: int = Field(ge=0)
    incomplete_cost_projects: int = Field(ge=0)
    latest_reporting_month: date | None = None


class CostTrendPoint(APIModel):
    period: date
    reporting_projects: int = Field(ge=0)
    approved_cost_projects: int = Field(ge=0)
    revised_cost_projects: int = Field(ge=0)
    expenditure_projects: int = Field(ge=0)
    original_approved_cost: float | None = None
    latest_revised_cost: float | None = None
    cumulative_expenditure: float | None = None
    absolute_cost_escalation: float | None = None
    cost_escalation_percentage: float | None = None


class CostAggregateBreakdown(APIModel):
    project_count: int = Field(ge=0)
    comparable_projects: int = Field(ge=0)
    original_approved_cost: float = Field(ge=0)
    latest_revised_cost: float = Field(ge=0)
    cumulative_expenditure: float = Field(ge=0)
    absolute_cost_escalation: float
    cost_escalation_percentage: float


class SectorCostBreakdown(CostAggregateBreakdown):
    sector: str


class MinistryCostBreakdown(CostAggregateBreakdown):
    ministry: str


class ProjectCostBreakdown(APIModel):
    project_id: str
    project_name: str
    ministry: str
    sector: str
    original_approved_cost: float | None = None
    latest_revised_cost: float | None = None
    cumulative_expenditure: float | None = None
    absolute_cost_escalation: float | None = None
    cost_escalation_percentage: float | None = None
    expenditure_percentage: float | None = None
    physical_progress: float | None = Field(default=None, ge=0, le=100)
    progress_mismatch: float | None = None
    approved_cost_source: str | None = None
    revised_cost_source: str | None = None
    expenditure_source: str | None = None
    has_monthly_history: bool


class CostProgressMismatch(APIModel):
    project_id: str
    project_name: str
    ministry: str
    sector: str
    latest_revised_cost: float = Field(gt=0)
    cumulative_expenditure: float = Field(ge=0)
    expenditure_percentage: float
    physical_progress: float = Field(ge=0, le=100)
    progress_mismatch: float


class CostAnalyticsResponse(APIModel):
    summary: CostSummary
    data_availability: CostDataAvailability
    series: list[CostTrendPoint]
    sector_breakdown: list[SectorCostBreakdown]
    ministry_breakdown: list[MinistryCostBreakdown]
    project_breakdown: list[ProjectCostBreakdown]
    breakdown: list[ProjectCostBreakdown]
    progress_mismatches: list[CostProgressMismatch]


class ScheduleSummary(APIModel):
    total_projects: int = Field(ge=0)
    delayed_projects: int = Field(ge=0)
    on_time_projects: int = Field(ge=0)
    severe_delayed_projects: int = Field(ge=0)
    chronic_delayed_projects: int = Field(ge=0)
    average_slippage_days: float
    maximum_slippage_days: int
    average_planned_progress: float
    average_actual_progress: float
    average_progress_variance: float
    average_elapsed_duration_percentage: float
    average_monthly_progress_velocity: float
    total_milestones: int = Field(ge=0)
    completed_milestones: int = Field(ge=0)
    on_track_milestones: int = Field(ge=0)
    at_risk_milestones: int = Field(ge=0)
    delayed_milestones: int = Field(ge=0)
    overdue_milestones: int = Field(ge=0)
    milestone_completion_percentage: float


class ScheduleDataAvailability(APIModel):
    total_projects: int = Field(ge=0)
    original_date_projects: int = Field(ge=0)
    current_date_projects: int = Field(ge=0)
    comparable_date_projects: int = Field(ge=0)
    planned_progress_projects: int = Field(ge=0)
    actual_progress_projects: int = Field(ge=0)
    comparable_progress_projects: int = Field(ge=0)
    elapsed_duration_projects: int = Field(ge=0)
    velocity_projects: int = Field(ge=0)
    monthly_history_projects: int = Field(ge=0)
    milestone_detail_projects: int = Field(ge=0)
    milestone_reporting_projects: int = Field(ge=0)
    latest_as_of_date: date | None = None
    latest_reporting_month: date | None = None


class ScheduleTrendPoint(APIModel):
    period: date
    reporting_projects: int = Field(ge=0)
    planned_progress_projects: int = Field(ge=0)
    actual_progress_projects: int = Field(ge=0)
    planned_progress: float | None = None
    actual_progress: float | None = None
    progress_variance: float | None = None
    monthly_progress_velocity: float | None = None
    average_slippage_days: float | None = None


class DelayBracket(APIModel):
    bracket: str
    project_count: int = Field(ge=0)
    sort_order: int = Field(ge=1)


class ScheduleAggregateBreakdown(APIModel):
    project_count: int = Field(ge=0)
    comparable_projects: int = Field(ge=0)
    delayed_projects: int = Field(ge=0)
    average_delay_days: float
    maximum_delay_days: int
    average_progress_variance: float
    average_monthly_progress_velocity: float


class SectorScheduleBreakdown(ScheduleAggregateBreakdown):
    sector: str


class MinistryScheduleBreakdown(ScheduleAggregateBreakdown):
    ministry: str


class ProjectScheduleBreakdown(APIModel):
    project_id: str
    project_name: str
    ministry: str
    implementing_agency: str
    sector: str
    original_completion_date: date | None = None
    current_completion_date: date | None = None
    schedule_slippage_days: int | None = None
    planned_physical_progress: float | None = Field(default=None, ge=0, le=100)
    actual_physical_progress: float | None = Field(default=None, ge=0, le=100)
    progress_variance: float | None = None
    monitoring_start_date: date | None = None
    as_of_date: date
    elapsed_duration_percentage: float | None = Field(default=None, ge=0)
    total_milestones: int = Field(ge=0)
    completed_milestones: int = Field(ge=0)
    on_track_milestones: int = Field(ge=0)
    at_risk_milestones: int = Field(ge=0)
    delayed_milestones: int = Field(ge=0)
    overdue_milestones: int = Field(ge=0)
    milestone_completion_percentage: float | None = None
    monthly_progress_velocity: float | None = None
    has_monthly_history: bool
    delay_rank: int | None = Field(default=None, ge=1)


class ScheduleAnalyticsResponse(APIModel):
    summary: ScheduleSummary
    data_availability: ScheduleDataAvailability
    series: list[ScheduleTrendPoint]
    delay_brackets: list[DelayBracket]
    sector_breakdown: list[SectorScheduleBreakdown]
    ministry_breakdown: list[MinistryScheduleBreakdown]
    project_breakdown: list[ProjectScheduleBreakdown]
    breakdown: list[ProjectScheduleBreakdown]


class BenchmarkProject(APIModel):
    project_id: str
    project_name: str
    ministry: str
    implementing_agency: str
    sector: str
    project_type: str
    state: str
    states: list[str]
    status: str
    original_cost: float | None = Field(default=None, ge=0)
    revised_cost: float | None = Field(default=None, ge=0)
    start_date: date | None = None
    start_date_source: str | None = None
    start_year: int | None = None
    planned_duration_days: int | None = Field(default=None, ge=1)
    cost_band: str | None = None
    cost_overrun_percentage: float | None = None
    schedule_delay_days: int | None = None
    monthly_progress_velocity: float | None = None
    expenditure_efficiency: float | None = Field(default=None, ge=0)
    milestone_slippage_percentage: float | None = Field(default=None, ge=0, le=100)
    milestone_completion_percentage: float | None = Field(default=None, ge=0, le=100)
    overall_risk_score: float | None = Field(default=None, ge=0, le=100)
    cost_risk_score: float | None = Field(default=None, ge=0, le=100)
    schedule_risk_score: float | None = Field(default=None, ge=0, le=100)
    implementation_risk_score: float | None = Field(default=None, ge=0, le=100)


class PeerMatch(BenchmarkProject):
    match_score: int = Field(ge=0, le=100)
    match_reasons: list[str]
    is_historical: bool


class PeerGroupSummary(APIModel):
    selection_method: str
    minimum_match_score: int = Field(ge=0, le=100)
    candidate_projects_evaluated: int = Field(ge=0)
    peer_count: int = Field(ge=0)
    historical_peer_count: int = Field(ge=0)
    maximum_peers: int = Field(ge=1)


class BenchmarkMetricComparison(APIModel):
    key: str
    label: str
    unit: str
    lower_is_better: bool
    selected_value: float | None = None
    comparison_value: float | None = None
    sector_median: float | None = None
    peer_median: float | None = None
    historical_median: float | None = None
    sector_sample_size: int = Field(ge=0)
    peer_sample_size: int = Field(ge=0)
    historical_sample_size: int = Field(ge=0)


class BenchmarkRadarPoint(APIModel):
    subject: str
    selected_score: float | None = Field(default=None, ge=0, le=100)
    comparison_score: float | None = Field(default=None, ge=0, le=100)
    peer_median_score: float | None = Field(default=None, ge=0, le=100)


class AgencyBenchmark(APIModel):
    rank: int = Field(ge=1)
    agency: str
    project_count: int = Field(ge=0)
    total_outlay: float = Field(ge=0)
    average_delay_days: float | None = None
    average_cost_overrun_percentage: float | None = None
    milestone_hit_rate: float | None = Field(default=None, ge=0, le=100)
    average_risk_score: float | None = Field(default=None, ge=0, le=100)
    delivery_efficiency_index: float | None = Field(default=None, ge=0, le=100)


class BenchmarkDataAvailability(APIModel):
    portfolio_projects: int = Field(ge=0)
    sector_projects: int = Field(ge=0)
    projects_with_start_date: int = Field(ge=0)
    projects_with_velocity: int = Field(ge=0)
    projects_with_milestones: int = Field(ge=0)
    projects_with_risk: int = Field(ge=0)


class BenchmarkAnalyticsResponse(APIModel):
    selected_project: BenchmarkProject
    comparison_peer: PeerMatch | None = None
    peer_group: PeerGroupSummary
    peers: list[PeerMatch]
    historical_peers: list[PeerMatch]
    metric_comparisons: list[BenchmarkMetricComparison]
    radar: list[BenchmarkRadarPoint]
    agency_leaderboard: list[AgencyBenchmark]
    data_availability: BenchmarkDataAvailability
