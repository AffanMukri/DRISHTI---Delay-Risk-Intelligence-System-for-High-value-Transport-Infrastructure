from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel


class HistoricalFeatureComparison(APIModel):
    feature: str
    feature_label: str
    actual_value: Any
    reference_value: Any
    percentile: float | None = Field(default=None, ge=0, le=100)
    prevalence_pct: float | None = Field(default=None, ge=0, le=100)
    unit: str | None = None
    cohort: str
    cohort_size: int = Field(ge=1)
    explanation: str


class FeatureContribution(APIModel):
    feature: str
    feature_label: str
    actual_value: Any
    feature_unit: str | None = None
    contribution: float
    contribution_unit: str
    direction: Literal["risk_increasing", "protective", "neutral"]
    human_explanation: str
    historical_comparison: HistoricalFeatureComparison | None = None


class MLExplanation(APIModel):
    available: bool = False
    method: Literal["SHAP"] = "SHAP"
    reason: str | None = None
    explainer: str | None = None
    library_version: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    model_output: str | None = None
    target: str | None = None
    target_label: str | None = None
    output_unit: str | None = None
    base_value: float | None = None
    prediction_value: float | None = None
    additivity_residual: float | None = None
    positive_drivers: list[FeatureContribution] = Field(default_factory=list)
    protective_drivers: list[FeatureContribution] = Field(default_factory=list)
    contributions: list[FeatureContribution] = Field(default_factory=list)
    numerical_source: str | None = None
    background_definition: str | None = None


class RuleTrigger(APIModel):
    rule_id: str
    feature: str
    feature_label: str
    actual_value: Any
    unit: str | None = None
    explanation: str


class RuleExplanation(APIModel):
    method: str = "deterministic_thresholds"
    triggers: list[RuleTrigger] = Field(default_factory=list)


class HistoricalExplanation(APIModel):
    method: str = "training_cohort_comparison"
    available: bool = False
    reason: str | None = None
    cohort: str | None = None
    cohort_size: int | None = Field(default=None, ge=1)
    comparisons: list[HistoricalFeatureComparison] = Field(default_factory=list)


class PredictionExplanation(APIModel):
    version: str = "shap-v1"
    ml: MLExplanation = Field(default_factory=MLExplanation)
    rules: RuleExplanation = Field(default_factory=RuleExplanation)
    historical: HistoricalExplanation = Field(default_factory=HistoricalExplanation)


class PredictionResponse(APIModel):
    id: UUID
    project_id: str
    project_name: str
    model_name: str
    model_version: str
    prediction_type: str
    horizon_months: int | None = Field(default=None, ge=0)
    target_date: date | None = None
    predicted_value: float | None = None
    predicted_class: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=100)
    lower_bound: float | None = None
    upper_bound: float | None = None
    output_payload: dict[str, Any]
    generated_at: datetime
    valid_until: datetime | None = None


class PredictionListResponse(APIModel):
    project_id: str
    items: list[PredictionResponse]


class CostOverrunPredictionResponse(APIModel):
    project_id: str
    project_name: str
    as_of_date: date
    original_approved_cost: float = Field(ge=0)
    significant_overrun_probability: float | None = Field(default=None, ge=0, le=1)
    predicted_class: str | None = None
    significant_overrun_threshold_pct: float = Field(ge=0)
    predicted_final_cost: float = Field(ge=0)
    predicted_escalation_amount: float
    predicted_escalation_percentage: float
    predicted_final_cost_lower: float = Field(ge=0)
    predicted_final_cost_upper: float = Field(ge=0)
    uncertainty_method: str
    uncertainty_is_formally_calibrated: bool
    model_name: str
    model_version: str
    training_data_version: str
    regression_model: str
    classification_model: str | None = None
    feature_list: list[str]
    features: dict[str, Any]
    evaluation_metrics: dict[str, Any]
    explanation: PredictionExplanation = Field(default_factory=PredictionExplanation)
    generated_at: datetime
    synthetic: Literal[False]


class PredictedProgressPoint(APIModel):
    period: date
    predicted_progress: float = Field(ge=0, le=100)


class ScheduleOverrunPredictionResponse(APIModel):
    project_id: str
    project_name: str
    as_of_date: date
    original_completion_date: date
    current_physical_progress: float = Field(ge=0, le=100)
    schedule_overrun_probability: float | None = Field(default=None, ge=0, le=1)
    predicted_class: str | None = None
    schedule_overrun_threshold_days: int = Field(ge=0)
    predicted_completion_variance_days: int
    expected_delay_days: int = Field(ge=0)
    predicted_completion_date: date
    predicted_completion_date_lower: date
    predicted_completion_date_upper: date
    predicted_delay_days_lower: int = Field(ge=0)
    predicted_delay_days_upper: int = Field(ge=0)
    uncertainty_method: str
    uncertainty_is_formally_calibrated: bool
    predicted_progress_series: list[PredictedProgressPoint]
    progress_projection_method: str
    progress_projection_is_direct_model_output: bool
    model_name: str
    model_version: str
    training_data_version: str
    regression_model: str
    classification_model: str | None = None
    feature_list: list[str]
    features: dict[str, Any]
    evaluation_metrics: dict[str, Any]
    explanation: PredictionExplanation = Field(default_factory=PredictionExplanation)
    generated_at: datetime
    synthetic: Literal[False]
