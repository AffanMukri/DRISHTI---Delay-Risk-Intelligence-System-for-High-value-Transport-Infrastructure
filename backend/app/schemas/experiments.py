from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, HttpUrl, field_validator, model_validator

from app.schemas.common import APIModel


class ExternalFeatureDefinition(APIModel):
    code: str
    display_name: str
    category: str
    unit: str
    description: str
    minimum_value: float | None = None
    maximum_value: float | None = None
    is_active: bool
    validated_observation_count: int = Field(ge=0)
    validated_project_count: int = Field(ge=0)


class ExternalFeatureCatalogResponse(APIModel):
    items: list[ExternalFeatureDefinition]
    total: int = Field(ge=0)
    note: str


class ExternalObservationCreate(APIModel):
    project_id: str = Field(min_length=1, max_length=100)
    feature_code: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    numeric_value: float
    observation_date: date
    period_start: date | None = None
    period_end: date | None = None
    source_name: str = Field(min_length=2, max_length=250)
    source_uri: HttpUrl
    source_record_id: str = Field(min_length=1, max_length=250)
    publisher: str | None = Field(default=None, max_length=250)
    licence: str | None = Field(default=None, max_length=250)
    retrieved_at: datetime
    source_checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_period(self) -> "ExternalObservationCreate":
        if (self.period_start is None) != (self.period_end is None):
            raise ValueError("periodStart and periodEnd must be supplied together")
        if self.period_start and self.period_end and self.period_start > self.period_end:
            raise ValueError("periodStart must be on or before periodEnd")
        return self


class ExternalObservationValidation(APIModel):
    status: Literal["validated", "rejected"]
    notes: str = Field(min_length=3, max_length=2000)


class ExternalObservationResponse(APIModel):
    id: UUID
    project_id: UUID
    feature_code: str
    numeric_value: float
    observation_date: date
    period_start: date | None = None
    period_end: date | None = None
    source_name: str
    source_uri: str
    source_record_id: str
    publisher: str | None = None
    licence: str | None = None
    retrieved_at: datetime
    source_checksum_sha256: str | None = None
    validation_status: Literal["pending", "validated", "rejected"]
    validated_by: UUID | None = None
    validated_at: datetime | None = None
    validation_notes: str | None = None
    metadata: dict[str, Any]
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class ExperimentRunRequest(APIModel):
    version: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

    @field_validator("version")
    @classmethod
    def strip_version(cls, value: str) -> str:
        return value.strip()


class ModelComparisonExperiment(APIModel):
    id: UUID | None = None
    experiment_code: str
    version: str
    status: Literal["running", "completed", "insufficient_data", "failed"]
    requested_by: UUID | None = None
    started_at: datetime
    completed_at: datetime | None = None
    random_state: int
    methodology: dict[str, Any]
    feature_sets: dict[str, Any]
    feature_coverage: dict[str, Any]
    metrics: dict[str, Any]
    comparison: dict[str, Any]
    limitations: list[str]
    dataset_fingerprint_sha256: str | None = None
    artifact_uri: str | None = None
    artifact_checksum_sha256: str | None = None
    conclusion: str
    model_b_improvement_supported: bool


class ModelComparisonListResponse(APIModel):
    items: list[ModelComparisonExperiment]
    total: int = Field(ge=0)
