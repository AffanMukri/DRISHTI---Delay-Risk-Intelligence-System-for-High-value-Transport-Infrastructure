from datetime import datetime
from typing import Any
from uuid import UUID

from app.auth.models import CurrentProfile
from app.repositories.audit import AuditRepository


class AuditService:
    def __init__(self, repository: AuditRepository) -> None:
        self.repository = repository

    async def list(
        self,
        *,
        action: str | None,
        entity_type: str | None,
        source: str | None,
        actor_id: UUID | None,
        project_id: UUID | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        search: str | None,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        return await self.repository.list(
            action=action,
            entity_type=entity_type,
            source=source,
            actor_id=actor_id,
            project_id=project_id,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            search=search,
            limit=limit,
            offset=offset,
        )

    async def filter_options(self) -> dict[str, Any]:
        return await self.repository.filter_options()

    async def record_security_event(
        self,
        action: str,
        metadata: dict[str, Any],
        _: CurrentProfile,
    ) -> dict[str, UUID]:
        audit_id = await self.repository.record_security_event(action=action, metadata=metadata)
        return {"audit_id": audit_id}

