from app.analytics.data_confidence import DataConfidenceConfiguration, calculate_data_confidence
from app.config import Settings
from app.errors import NotFoundError
from app.repositories.projects import ProjectRepository
from app.schemas.project import ProjectStatus


class ProjectService:
    def __init__(self, repository: ProjectRepository, settings: Settings) -> None:
        self.repository = repository
        self.data_confidence_config = DataConfidenceConfiguration.from_settings(settings)

    async def list_public(
        self,
        *,
        search: str | None,
        limit: int,
        offset: int,
    ) -> dict[str, object]:
        rows, total = await self.repository.list_public(search=search, limit=limit, offset=offset)
        return {"items": rows, "total": total, "limit": limit, "offset": offset}

    async def get_public(self, identifier: str) -> dict[str, object]:
        project = await self.repository.get_public(identifier)
        if project is None:
            raise NotFoundError("Public project", identifier)
        database_id = project.pop("database_id")
        project["milestones"] = await self.repository.get_public_milestones(database_id)
        return project

    async def list(
        self,
        *,
        search: str | None,
        ministry: str | None,
        sector: str | None,
        status: ProjectStatus | None,
        limit: int,
        offset: int,
    ) -> dict[str, object]:
        rows, total = await self.repository.list(
            search=search,
            ministry=ministry,
            sector=sector,
            status=status,
            limit=limit,
            offset=offset,
        )
        return {"items": rows, "total": total, "limit": limit, "offset": offset}

    async def get(self, identifier: str) -> dict[str, object]:
        project = await self.repository.get(identifier)
        if project is None:
            raise NotFoundError("Project", identifier)
        project["milestones"] = await self.repository.get_milestones(project["database_id"])
        return project

    async def history(self, identifier: str) -> dict[str, object]:
        project = await self.repository.get(identifier)
        if project is None:
            raise NotFoundError("Project", identifier)
        history = await self.repository.get_history(project["database_id"])
        return {"project_id": project["id"], **history}

    async def data_confidence(self, identifier: str) -> dict[str, object]:
        facts = await self.repository.data_confidence_facts(identifier)
        if facts is None:
            raise NotFoundError("Project", identifier)
        return calculate_data_confidence(facts, self.data_confidence_config)
