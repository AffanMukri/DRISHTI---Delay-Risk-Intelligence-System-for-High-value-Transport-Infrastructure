from uuid import UUID

from app.errors import NotFoundError
from app.repositories.warnings import WarningRepository
from app.schemas.warning import WarningSeverity, WarningStatus, WarningUpdateRequest


class WarningService:
    def __init__(self, repository: WarningRepository) -> None:
        self.repository = repository

    async def list(self, status: WarningStatus | None, severity: WarningSeverity | None) -> dict[str, object]:
        rows = await self.repository.list(status=status, severity=severity)
        return {"items": rows, "total": len(rows)}

    async def acknowledge(self, identifier: str, user_id: UUID) -> dict[str, object]:
        row = await self.repository.acknowledge(identifier, user_id)
        if row is None:
            raise NotFoundError("Warning", identifier)
        return row

    async def update(
        self,
        identifier: str,
        payload: WarningUpdateRequest,
        user_id: UUID,
    ) -> dict[str, object]:
        row = await self.repository.update_status(
            identifier,
            status=payload.status,
            user_id=user_id,
            assigned_to_name=payload.assigned_to_name,
        )
        if row is None:
            raise NotFoundError("Warning", identifier)
        return row
