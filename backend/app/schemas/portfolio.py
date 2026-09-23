from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel


class PortfolioSummaryResponse(APIModel):
    total_projects: int = Field(ge=0)
    portfolio_value: float = Field(ge=0)
    total_expenditure: float = Field(ge=0)
    cost_overrun_exposure: float = Field(ge=0)
    delayed_projects: int = Field(ge=0)
    active_warnings: int = Field(ge=0)
    open_interventions: int = Field(ge=0)
    healthy: int = Field(ge=0)
    watch: int = Field(ge=0)
    high_risk: int = Field(ge=0)
    critical: int = Field(ge=0)


RiskLevelValue = Literal["healthy", "watch", "high_risk", "critical"]


class ComparisonProjectResponse(APIModel):
    project_id: str
    project_name: str
    ministry: str
    sector: str
    state: str
    previous_risk_level: RiskLevelValue
    current_risk_level: RiskLevelValue
    previous_overall_risk: float | None = Field(default=None, ge=0, le=100)
    current_overall_risk: float | None = Field(default=None, ge=0, le=100)
    previous_cost_risk: float | None = Field(default=None, ge=0, le=100)
    current_cost_risk: float | None = Field(default=None, ge=0, le=100)
    previous_schedule_risk: float | None = Field(default=None, ge=0, le=100)
    current_schedule_risk: float | None = Field(default=None, ge=0, le=100)
    previous_revised_cost: float | None = Field(default=None, ge=0)
    current_revised_cost: float | None = Field(default=None, ge=0)
    change_value: float | None = None
    detail: str | None = None


class ProjectChangeMetricResponse(APIModel):
    count: int = Field(ge=0)
    projects: list[ComparisonProjectResponse]


class MilestoneProjectResponse(APIModel):
    project_id: str
    project_name: str
    ministry: str
    sector: str
    state: str
    newly_overdue_count: int = Field(ge=1)


class MilestoneChangeResponse(APIModel):
    milestone_id: UUID
    milestone_code: str
    milestone_name: str
    planned_date: date
    project_id: str
    project_name: str
    ministry: str
    sector: str
    state: str


class MilestoneChangeMetricResponse(APIModel):
    count: int = Field(ge=0)
    project_count: int = Field(ge=0)
    projects: list[MilestoneProjectResponse]
    milestones: list[MilestoneChangeResponse]


class WarningChangeResponse(APIModel):
    warning_id: str
    title: str
    alert_type: str
    severity: str
    status: str
    first_detected_at: datetime
    resolved_at: datetime | None = None
    project_id: str
    project_name: str
    ministry: str
    sector: str
    state: str


class WarningChangeMetricResponse(APIModel):
    count: int = Field(ge=0)
    warnings: list[WarningChangeResponse]


class CapitalExposureChangeResponse(APIModel):
    previous: float = Field(ge=0)
    current: float = Field(ge=0)
    change: float
    change_percentage: float | None = None
    projects: list[ComparisonProjectResponse]


class EmergingRiskDriverResponse(APIModel):
    code: str
    name: str
    project_count: int = Field(ge=1)
    average_increase: float = Field(ge=0)
    maximum_increase: float = Field(ge=0)
    projects: list[ComparisonProjectResponse]


class DimensionChangeResponse(APIModel):
    name: str
    previous_high_critical_projects: int = Field(ge=0)
    current_high_critical_projects: int = Field(ge=0)
    project_count_change: int
    previous_capital_exposed: float = Field(ge=0)
    current_capital_exposed: float = Field(ge=0)
    capital_exposure_change: float
    projects: list[ComparisonProjectResponse]


class DimensionChangesResponse(APIModel):
    sectors: list[DimensionChangeResponse]
    ministries: list[DimensionChangeResponse]
    states: list[DimensionChangeResponse]


class ComparisonDataAvailabilityResponse(APIModel):
    latest_snapshot_projects: int = Field(ge=0)
    previous_snapshot_projects: int = Field(ge=0)
    comparable_projects: int = Field(ge=0)
    capital_comparable_projects: int = Field(ge=0)
    excluded_projects: int = Field(ge=0)


class ComparisonThresholdsResponse(APIModel):
    significant_risk_increase_points: float = Field(ge=0, le=100)
    emerging_driver_increase_points: float = Field(ge=0, le=100)


class PortfolioChangesResponse(APIModel):
    comparison_available: bool
    latest_period: date | None = None
    previous_period: date | None = None
    headline: str
    summary_points: list[str]
    newly_high_risk: ProjectChangeMetricResponse
    newly_critical: ProjectChangeMetricResponse
    recovered: ProjectChangeMetricResponse
    significant_cost_risk_increase: ProjectChangeMetricResponse
    significant_schedule_risk_increase: ProjectChangeMetricResponse
    newly_overdue_milestones: MilestoneChangeMetricResponse
    new_critical_warnings: WarningChangeMetricResponse
    resolved_warnings: WarningChangeMetricResponse
    capital_exposure: CapitalExposureChangeResponse
    emerging_risk_drivers: list[EmergingRiskDriverResponse]
    dimensions: DimensionChangesResponse
    data_availability: ComparisonDataAvailabilityResponse
    thresholds: ComparisonThresholdsResponse
