from typing import Any

from app.analytics.warning_engine import evaluate_warning_conditions
from app.config import Settings
from app.errors import NotFoundError
from app.repositories.warnings import WarningRepository


class WarningAutomationService:
    """Evaluate transparent warning rules and persist one active row per condition."""

    def __init__(self, repository: WarningRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings

    async def evaluate_project(self, project_id: str) -> dict[str, Any]:
        facts = await self.repository.automation_facts(project_id)
        if facts is None or facts.get("source_update_id") is None:
            raise NotFoundError("Monthly project update", project_id)
        conditions = evaluate_warning_conditions(facts, self.settings)
        result = await self.repository.upsert_automated_conditions(facts, conditions)
        return {
            "project_id": facts["project_id"],
            "reporting_month": facts["reporting_month"],
            "active_conditions": len(conditions),
            **result,
        }
