from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field, model_validator

from app.schemas.common import APIModel
from app.schemas.project import RiskLevel


ContractScenarioStatus = Literal[
    "not_reported",
    "pre_award",
    "active",
    "in_progress",
    "completed",
    "terminated",
]
ClearanceScenarioStatus = Literal["not_reported", "pending", "cleared"]


class ScenarioChangesRequest(APIModel):
    physical_progress: float | None = Field(default=None, ge=0, le=100)
    planned_progress: float | None = Field(default=None, ge=0, le=100)
    monthly_progress_velocity: float | None = Field(default=None, ge=0, le=100)
    land_acquisition_progress: float | None = Field(default=None, ge=0, le=100)
    milestone_completion_pct: float | None = Field(default=None, ge=0, le=100)
    milestone_delay_pct: float | None = Field(default=None, ge=0, le=100)
    issue_count: int | None = Field(default=None, ge=0, le=10000)
    contract_status: ContractScenarioStatus | None = None
    clearance_status: ClearanceScenarioStatus | None = None

    @model_validator(mode="after")
    def require_change(self) -> "ScenarioChangesRequest":
        if not self.model_dump(exclude_none=True):
            raise ValueError("At least one supported scenario variable is required.")
        return self


class ScenarioRequest(APIModel):
    changes: ScenarioChangesRequest
    assumption_note: str | None = Field(default=None, max_length=1000)


class ScenarioVariableResponse(APIModel):
    code: str
    label: str
    description: str
    input_type: Literal["number", "integer", "select"]
    current_value: Any = None
    minimum: float | None = None
    maximum: float | None = None
    options: list[str] = Field(default_factory=list)
    models: list[Literal["cost", "schedule"]]
    affected_features: list[str]


class UnsupportedScenarioVariableResponse(APIModel):
    code: str
    label: str
    reason: str


class ScenarioConfigurationResponse(APIModel):
    project_id: str
    project_name: str
    as_of_date: date
    supported_variables: list[ScenarioVariableResponse]
    unsupported_variables: list[UnsupportedScenarioVariableResponse]
    model_versions: dict[str, str]
    persists_changes: Literal[False] = False
    disclaimer: str


class ScenarioChangedVariableResponse(APIModel):
    code: str
    label: str
    before_value: Any = None
    scenario_value: Any = None
    affected_models: list[Literal["cost", "schedule"]]
    affected_features: list[str]


class ScenarioRiskResult(APIModel):
    overall_score: float = Field(ge=0, le=100)
    risk_level: RiskLevel
    cost_risk: float | None = Field(default=None, ge=0, le=100)
    schedule_risk: float | None = Field(default=None, ge=0, le=100)
    implementation_risk: float | None = Field(default=None, ge=0, le=100)


class ScenarioCostResult(APIModel):
    significant_overrun_probability: float | None = Field(default=None, ge=0, le=1)
    predicted_final_cost: float = Field(ge=0)
    predicted_escalation_amount: float
    predicted_escalation_percentage: float
    model_version: str


class ScenarioScheduleResult(APIModel):
    schedule_overrun_probability: float | None = Field(default=None, ge=0, le=1)
    expected_delay_days: int = Field(ge=0)
    predicted_completion_date: date
    model_version: str


class ScenarioOutcomeResponse(APIModel):
    risk: ScenarioRiskResult
    cost: ScenarioCostResult
    schedule: ScenarioScheduleResult


class ScenarioDriverChangeResponse(APIModel):
    model: Literal["cost", "schedule"]
    feature: str
    feature_label: str
    before_contribution: float
    scenario_contribution: float
    contribution_change: float
    contribution_unit: str
    explanation: str


class ScenarioExplanationResponse(APIModel):
    summaries: list[str]
    driver_changes: list[ScenarioDriverChangeResponse]
    numerical_source: str


class ScenarioSimulationResponse(APIModel):
    project_id: str
    project_name: str
    as_of_date: date
    generated_at: datetime
    before: ScenarioOutcomeResponse
    scenario: ScenarioOutcomeResponse
    changed_variables: list[ScenarioChangedVariableResponse]
    explanation: ScenarioExplanationResponse
    assumption_note: str | None = None
    persists_changes: Literal[False] = False
    disclaimer: str
