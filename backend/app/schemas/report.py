from __future__ import annotations

from datetime import date
from enum import StrEnum
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.common import APIModel


class ReportType(StrEnum):
    MONTHLY_FLASH = "monthly_flash"
    SECTOR = "sector"
    MINISTRY = "ministry"
    CRITICAL_PROJECTS = "critical_projects"
    PRAGATI_REVIEW_DOSSIER = "pragati_review_dossier"
    INTERVENTION = "intervention"


class ReportFormat(StrEnum):
    PDF = "pdf"
    XLSX = "xlsx"
    CSV = "csv"


class ReportGenerateRequest(APIModel):
    report_type: ReportType
    output_format: ReportFormat
    reporting_month: date
    sector: str | None = Field(default=None, min_length=1, max_length=200)
    ministry_id: UUID | None = None
    project_id: str | None = Field(default=None, min_length=1, max_length=200)
    include_resolved_interventions: bool = False

    @model_validator(mode="after")
    def validate_scope_and_format(self) -> "ReportGenerateRequest":
        if self.reporting_month.day != 1:
            raise ValueError("reporting_month must be the first day of a month")
        if self.report_type == ReportType.SECTOR and not self.sector:
            raise ValueError("sector is required for a sector report")
        if self.report_type == ReportType.MINISTRY and not self.ministry_id:
            raise ValueError("ministry_id is required for a ministry report")
        if self.report_type == ReportType.PRAGATI_REVIEW_DOSSIER and not self.project_id:
            raise ValueError("project_id is required for a PRAGATI review dossier")
        allowed = {
            ReportType.MONTHLY_FLASH: {ReportFormat.PDF, ReportFormat.XLSX},
            ReportType.SECTOR: {ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV},
            ReportType.MINISTRY: {ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV},
            ReportType.CRITICAL_PROJECTS: {ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV},
            ReportType.PRAGATI_REVIEW_DOSSIER: {ReportFormat.PDF, ReportFormat.XLSX},
            ReportType.INTERVENTION: {ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV},
        }
        if self.output_format not in allowed[self.report_type]:
            raise ValueError(
                f"{self.output_format.value.upper()} is not available for {self.report_type.value}"
            )
        return self


class ReportTypeOption(APIModel):
    value: ReportType
    label: str
    description: str
    formats: list[ReportFormat]
    requires: str | None = None


class ReportLookupOption(APIModel):
    value: str
    label: str


class ReportProjectOption(APIModel):
    value: str
    label: str
    sector: str
    ministry_id: UUID


class ReportOptionsResponse(APIModel):
    report_types: list[ReportTypeOption]
    reporting_months: list[date]
    sectors: list[str]
    ministries: list[ReportLookupOption]
    projects: list[ReportProjectOption]

