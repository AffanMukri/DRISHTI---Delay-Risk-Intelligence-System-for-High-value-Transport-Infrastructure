from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel


class CUFValidationIssue(APIModel):
    field: str
    code: str
    message: str
    value: Any = None


class CUFTransformation(APIModel):
    field: str
    original: Any = None
    normalized: Any = None
    rule: str


class CUFPreviewRow(APIModel):
    row_number: int = Field(ge=2)
    project_code: str | None = None
    reporting_month: date | None = None
    validation_status: Literal["valid", "invalid", "imported", "conflict"]
    raw_data: dict[str, Any]
    normalized_data: dict[str, Any]
    transformations: list[CUFTransformation]
    validation_errors: list[CUFValidationIssue]
    validation_warnings: list[CUFValidationIssue]
    missing_value_count: int = Field(ge=0)
    is_duplicate: bool
    anomaly_count: int = Field(ge=0)


class CUFPreviewResponse(APIModel):
    batch_id: UUID
    file_name: str
    file_type: Literal["csv", "xlsx"]
    file_size_bytes: int = Field(gt=0)
    status: Literal["validated", "importing", "imported", "failed"]
    detected_columns: list[str]
    field_mapping: dict[str, str | None]
    total_rows: int = Field(ge=0)
    valid_rows: int = Field(ge=0)
    invalid_rows: int = Field(ge=0)
    missing_values: int = Field(ge=0)
    duplicate_rows: int = Field(ge=0)
    anomaly_rows: int = Field(ge=0)
    quality_score: float = Field(ge=0, le=100)
    validation_summary: dict[str, Any]
    uploaded_at: datetime
    preview_rows: list[CUFPreviewRow]
    preview_offset: int = Field(ge=0)
    preview_limit: int = Field(ge=1)
    preview_truncated: bool


class CUFImportResponse(APIModel):
    batch_id: UUID
    status: Literal["imported"]
    imported_rows: int = Field(ge=0)
    skipped_rows: int = Field(ge=0)
    invalid_rows: int = Field(ge=0)
    downstream_analysis_status: Literal["pending"]
    message: str
