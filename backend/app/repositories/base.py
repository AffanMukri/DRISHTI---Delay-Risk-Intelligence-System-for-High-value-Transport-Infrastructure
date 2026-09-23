from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


class BaseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def rows(result: Any) -> list[dict[str, Any]]:
        return [dict(row) for row in result.mappings().all()]

    @staticmethod
    def row(result: Any) -> dict[str, Any] | None:
        value = result.mappings().one_or_none()
        return dict(value) if value else None

