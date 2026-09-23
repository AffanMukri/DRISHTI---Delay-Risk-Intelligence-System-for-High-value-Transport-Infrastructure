from typing import Any

from app.analytics.hybrid_risk import RiskConfiguration, assess_project
from app.analytics.risk_trajectory import build_risk_trajectory
from app.config import Settings
from app.errors import NotFoundError
from app.repositories.risks import RiskRepository
from app.schemas.project import RiskLevel


class RiskService:
    def __init__(self, repository: RiskRepository, settings: Settings) -> None:
        self.repository = repository
        self.config = RiskConfiguration.from_settings(settings)
        self.settings = settings

    async def list(self, risk_level: RiskLevel | None, current_only: bool) -> dict[str, object]:
        rows = await self.repository.list(risk_level=risk_level, current_only=current_only)
        return {"items": rows, "total": len(rows)}

    async def get_for_project(self, project_id: str) -> dict[str, object]:
        row = await self.repository.get_for_project(project_id)
        if row is None:
            raise NotFoundError("Current project risk", project_id)
        return row

    def configuration(self) -> dict[str, Any]:
        return self.config.public_document()

    async def history_for_project(self, project_id: str) -> dict[str, object]:
        project_code, rows = await self.repository.history_for_project(project_id)
        if project_code is None:
            raise NotFoundError("Project", project_id)
        return {"project_id": project_code, "items": rows, "total": len(rows)}

    async def trajectory_for_project(self, project_id: str) -> dict[str, object]:
        project_code, rows = await self.repository.trajectory_for_project(project_id)
        if project_code is None:
            raise NotFoundError("Project", project_id)
        return build_risk_trajectory(
            project_code,
            rows,
            stable_band=self.settings.risk_trajectory_stable_band_points,
            meaningful_increase=self.settings.risk_trajectory_meaningful_increase_points,
            rapid_increase=self.settings.risk_trajectory_rapid_increase_points,
        )

    async def assess_project(self, project_id: str) -> dict[str, object]:
        facts = await self.repository.assessment_facts()
        row = next((value for value in facts if value["project_id"] == project_id or str(value["project_database_id"]) == project_id), None)
        if row is None:
            raise NotFoundError("Project", project_id)
        assessment = assess_project(row, facts, self.config)
        await self.repository.save_assessment(assessment)
        result = await self.repository.get_for_project(project_id)
        if result is None:
            raise NotFoundError("Project risk", project_id)
        return result

    async def assess_portfolio(self) -> dict[str, object]:
        facts = await self.repository.assessment_facts()
        for row in facts:
            await self.repository.save_assessment(assess_project(row, facts, self.config))
        rows = await self.repository.list(risk_level=None, current_only=True)
        return {"items": rows, "total": len(rows)}
