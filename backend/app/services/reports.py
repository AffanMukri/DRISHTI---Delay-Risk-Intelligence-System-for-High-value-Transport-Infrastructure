from __future__ import annotations

import hashlib
import re
import statistics
from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID, uuid4

from app.auth.models import CurrentProfile
from app.errors import AuthorizationError
from app.reporting.builders import build_csv, build_pdf, build_xlsx
from app.repositories.reports import ReportRepository
from app.schemas.report import ReportFormat, ReportGenerateRequest, ReportType


REPORT_DEFINITIONS: dict[ReportType, dict[str, Any]] = {
    ReportType.MONTHLY_FLASH: {
        "label": "Monthly Flash Report",
        "description": "Portfolio KPIs, cost and schedule performance, risks and emerging warnings.",
        "formats": [ReportFormat.PDF, ReportFormat.XLSX],
    },
    ReportType.SECTOR: {
        "label": "Sector Report",
        "description": "Performance and risk review for a selected infrastructure sector.",
        "formats": [ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV],
        "requires": "sector",
    },
    ReportType.MINISTRY: {
        "label": "Ministry Report",
        "description": "Portfolio performance for projects owned by a selected ministry.",
        "formats": [ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV],
        "requires": "ministry",
    },
    ReportType.CRITICAL_PROJECTS: {
        "label": "Critical Project Report",
        "description": "High and Critical risk projects with warnings, drivers and required attention.",
        "formats": [ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV],
    },
    ReportType.PRAGATI_REVIEW_DOSSIER: {
        "label": "PRAGATI Review Dossier",
        "description": "Project-specific evidence, risks, warnings and intervention status for review.",
        "formats": [ReportFormat.PDF, ReportFormat.XLSX],
        "requires": "project",
        "intervention_access": True,
    },
    ReportType.INTERVENTION: {
        "label": "Intervention Report",
        "description": "Assigned, overdue, escalated and resolved intervention workflow records.",
        "formats": [ReportFormat.PDF, ReportFormat.XLSX, ReportFormat.CSV],
        "intervention_access": True,
    },
}

INTERVENTION_ROLES = {"administrator", "executive", "monitoring_officer"}


@dataclass(frozen=True)
class GeneratedReport:
    report_id: UUID
    content: bytes
    file_name: str
    media_type: str
    data_as_of: date
    checksum_sha256: str


def _next_month(value: date) -> date:
    return date(value.year + (1 if value.month == 12 else 0), 1 if value.month == 12 else value.month + 1, 1)


def _number(value: Any) -> float | None:
    return float(value) if value is not None else None


def _sum_available(rows: list[dict[str, Any]], key: str) -> float:
    return sum(float(row[key]) for row in rows if row.get(key) is not None)


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    return cleaned[:80] or "report"


class ReportService:
    def __init__(self, repository: ReportRepository) -> None:
        self.repository = repository

    async def options(self, profile: CurrentProfile) -> dict[str, Any]:
        lookups = await self.repository.options()
        definitions = []
        for value, definition in REPORT_DEFINITIONS.items():
            if definition.get("intervention_access") and profile.role not in INTERVENTION_ROLES:
                continue
            definitions.append({
                "value": value,
                "label": definition["label"],
                "description": definition["description"],
                "formats": definition["formats"],
                "requires": definition.get("requires"),
            })
        months = lookups["reporting_months"]
        if not months:
            today = date.today()
            months = [today.replace(day=1)]
        return {"report_types": definitions, **lookups, "reporting_months": months}

    async def generate(self, request: ReportGenerateRequest, profile: CurrentProfile) -> GeneratedReport:
        definition = REPORT_DEFINITIONS[request.report_type]
        if definition.get("intervention_access") and profile.role not in INTERVENTION_ROLES:
            raise AuthorizationError("Your role cannot generate reports containing intervention records.")

        end_month = _next_month(request.reporting_month)
        critical_only = request.report_type == ReportType.CRITICAL_PROJECTS
        sector = request.sector if request.report_type == ReportType.SECTOR else None
        ministry_id = request.ministry_id if request.report_type == ReportType.MINISTRY else None
        project_identifier = request.project_id if request.report_type == ReportType.PRAGATI_REVIEW_DOSSIER else None

        projects = await self.repository.project_snapshots(
            end_month=end_month,
            sector=sector,
            ministry_id=ministry_id,
            project_identifier=project_identifier,
            critical_only=critical_only,
        )
        warnings = await self.repository.warnings(
            reporting_month=request.reporting_month,
            end_month=end_month,
            sector=sector,
            ministry_id=ministry_id,
            project_identifier=project_identifier,
            critical_only=critical_only,
        )
        can_read_interventions = profile.role in INTERVENTION_ROLES
        interventions = []
        if can_read_interventions:
            interventions = await self.repository.interventions(
                end_month=end_month,
                sector=sector,
                ministry_id=ministry_id,
                project_identifier=project_identifier,
                critical_only=critical_only,
                include_resolved=request.include_resolved_interventions,
            )

        report_id = uuid4()
        report = self._assemble(
            report_id=report_id,
            request=request,
            title=definition["label"],
            projects=projects,
            warnings=warnings,
            interventions=interventions,
            intervention_data_available=can_read_interventions,
            data_as_of=end_month.fromordinal(end_month.toordinal() - 1),
        )
        builders = {
            ReportFormat.PDF: (build_pdf, "application/pdf"),
            ReportFormat.XLSX: (build_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            ReportFormat.CSV: (build_csv, "text/csv; charset=utf-8"),
        }
        builder, media_type = builders[request.output_format]
        content = builder(report)
        scope = request.sector or str(request.ministry_id or request.project_id or "portfolio")
        file_name = f"drishti-{_slug(request.report_type.value)}-{_slug(scope)}-{request.reporting_month:%Y-%m}.{request.output_format.value}"
        checksum = hashlib.sha256(content).hexdigest()
        await self.repository.record_export(
            export_id=report_id,
            report_type=request.report_type.value,
            output_format=request.output_format.value,
            reporting_month=request.reporting_month,
            filters={
                "sector": sector,
                "ministry_id": ministry_id,
                "project_id": project_identifier,
                "include_resolved_interventions": request.include_resolved_interventions,
            },
            generated_by=profile.id,
            file_name=file_name,
            mime_type=media_type,
            size_bytes=len(content),
            checksum_sha256=checksum,
            data_as_of=report["data_as_of"],
            project_count=len(projects),
        )
        return GeneratedReport(
            report_id=report_id,
            content=content,
            file_name=file_name,
            media_type=media_type,
            data_as_of=report["data_as_of"],
            checksum_sha256=checksum,
        )

    def _assemble(
        self,
        *,
        report_id: UUID,
        request: ReportGenerateRequest,
        title: str,
        projects: list[dict[str, Any]],
        warnings: list[dict[str, Any]],
        interventions: list[dict[str, Any]],
        intervention_data_available: bool,
        data_as_of: date,
    ) -> dict[str, Any]:
        normalized_projects: list[dict[str, Any]] = []
        risk_drivers: list[dict[str, Any]] = []
        for source in projects:
            row = dict(source)
            approved = _number(row.get("original_approved_cost"))
            revised = _number(row.get("latest_revised_cost"))
            escalation = revised - approved if approved is not None and revised is not None else None
            escalation_pct = escalation / approved * 100 if escalation is not None and approved and approved > 0 else None
            expenditure = _number(row.get("cumulative_expenditure"))
            progress = _number(row.get("physical_progress"))
            expenditure_pct = expenditure / revised * 100 if expenditure is not None and revised and revised > 0 else None
            row["absolute_cost_escalation"] = escalation
            row["cost_escalation_percentage"] = escalation_pct
            row["expenditure_percentage"] = expenditure_pct
            row["expenditure_progress_mismatch"] = expenditure_pct - progress if expenditure_pct is not None and progress is not None else None
            drivers = row.pop("risk_drivers", []) or []
            for driver in drivers:
                risk_drivers.append({
                    "project_id": row["project_id"],
                    "project_name": row["project_name"],
                    **driver,
                    "risk_assessed_at": row.get("risk_assessed_at"),
                    "model_version_id": row.get("model_version_id"),
                    "methodology": row.get("risk_methodology"),
                })
            normalized_projects.append(row)

        comparable_cost = [row for row in normalized_projects if row.get("original_approved_cost") is not None and row.get("latest_revised_cost") is not None]
        approved_total = _sum_available(comparable_cost, "original_approved_cost")
        revised_total = _sum_available(comparable_cost, "latest_revised_cost")
        escalation_total = revised_total - approved_total
        open_warnings = [row for row in warnings if not row.get("resolved_at") or row["resolved_at"].date() >= _next_month(request.reporting_month)]
        open_interventions = [row for row in interventions if row.get("status") != "resolved"]
        summary = {
            "total_projects": len(normalized_projects),
            "original_approved_cost": approved_total,
            "latest_revised_cost": revised_total,
            "cumulative_expenditure": _sum_available(normalized_projects, "cumulative_expenditure"),
            "absolute_cost_escalation": escalation_total,
            "cost_escalation_percentage": escalation_total / approved_total * 100 if approved_total > 0 else None,
            "cost_escalated_projects": sum(1 for row in normalized_projects if (row.get("absolute_cost_escalation") or 0) > 0),
            "delayed_projects": sum(1 for row in normalized_projects if (row.get("schedule_delay_days") or 0) > 0),
            "cost_and_schedule_overrun_projects": sum(1 for row in normalized_projects if (row.get("absolute_cost_escalation") or 0) > 0 and (row.get("schedule_delay_days") or 0) > 0),
            "high_risk_projects": sum(1 for row in normalized_projects if row.get("risk_level") == "high_risk"),
            "critical_projects": sum(1 for row in normalized_projects if row.get("risk_level") == "critical"),
            "open_warnings": len(open_warnings),
            "emerging_critical_warnings": sum(1 for row in warnings if row.get("is_emerging") and row.get("severity") == "critical"),
            "open_interventions": len(open_interventions),
            "overdue_interventions": sum(1 for row in interventions if row.get("status") == "overdue"),
            "intervention_data_available": intervention_data_available,
            "projects_with_monthly_data": sum(1 for row in normalized_projects if row.get("reporting_month") is not None),
            "projects_with_risk_assessment": sum(1 for row in normalized_projects if row.get("overall_risk_score") is not None),
        }
        executive_summary = (
            f"The report covers {summary['total_projects']} projects as of {data_as_of:%d %B %Y}. "
            f"Comparable records show an original approved cost of INR {approved_total:,.1f} crore and a latest revised cost of INR {revised_total:,.1f} crore"
            + (f", an escalation of {summary['cost_escalation_percentage']:.1f}%. " if summary["cost_escalation_percentage"] is not None else ". Cost escalation cannot be calculated where the approved cost is unavailable. ")
            + f"{summary['delayed_projects']} projects are delayed, {summary['critical_projects']} are Critical risk, and {summary['open_warnings']} warnings remain unresolved at the cut-off."
        )
        recommendations = self._recommendations(summary, normalized_projects)
        comparisons: list[dict[str, Any]] = []
        if len(normalized_projects) == 1:
            selected = normalized_projects[0]
            sector_rows = [row for row in normalized_projects if row.get("sector") == selected.get("sector")]
            delay_values = [float(row["schedule_delay_days"]) for row in sector_rows if row.get("schedule_delay_days") is not None]
            escalation_values = [float(row["cost_escalation_percentage"]) for row in sector_rows if row.get("cost_escalation_percentage") is not None]
            comparisons.append({
                "project_id": selected["project_id"],
                "comparison_group": f"Projects in {selected.get('sector')}",
                "sample_size": len(sector_rows),
                "project_cost_escalation_percentage": selected.get("cost_escalation_percentage"),
                "sector_median_cost_escalation_percentage": statistics.median(escalation_values) if escalation_values else None,
                "project_schedule_delay_days": selected.get("schedule_delay_days"),
                "sector_median_schedule_delay_days": statistics.median(delay_values) if delay_values else None,
            })
        return {
            "report_id": report_id,
            "report_type": request.report_type.value,
            "title": title,
            "reporting_month": request.reporting_month,
            "data_as_of": data_as_of,
            "summary": summary,
            "executive_summary": executive_summary,
            "projects": normalized_projects,
            "warnings": warnings,
            "interventions": interventions,
            "risk_drivers": risk_drivers,
            "comparisons": comparisons,
            "recommendations": recommendations,
        }

    @staticmethod
    def _recommendations(summary: dict[str, Any], projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
        recommendations: list[dict[str, Any]] = []
        if summary["critical_projects"]:
            recommendations.append({
                "title": "Review Critical-risk projects",
                "recommendation": "Convene an evidence-led review of the Critical-risk projects and confirm accountable actions and due dates.",
                "source_type": "analytical_rule",
                "source_label": "Analytical rule output",
                "evidence": f"{summary['critical_projects']} projects have a latest risk level of Critical.",
            })
        mismatch = [row for row in projects if (row.get("expenditure_progress_mismatch") or 0) >= 15]
        if mismatch:
            recommendations.append({
                "title": "Reconcile expenditure and physical progress",
                "recommendation": "Validate work completion and expenditure certification for projects where financial progress is materially ahead of physical progress.",
                "source_type": "analytical_rule",
                "source_label": "Analytical rule output",
                "evidence": f"{len(mismatch)} projects have an expenditure-to-physical-progress gap of at least 15 percentage points.",
            })
        if summary["overdue_interventions"]:
            recommendations.append({
                "title": "Escalate overdue interventions",
                "recommendation": "Review overdue intervention ownership and escalate unresolved actions through the established workflow.",
                "source_type": "workflow_rule",
                "source_label": "Workflow rule output",
                "evidence": f"{summary['overdue_interventions']} interventions are overdue at the reporting cut-off.",
            })
        return recommendations
