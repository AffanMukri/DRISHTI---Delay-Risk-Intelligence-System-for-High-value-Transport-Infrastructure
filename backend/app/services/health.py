from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import get_engine


class HealthService:
    async def status(self) -> dict[str, object]:
        settings = get_settings()
        database_status = "not_configured"
        if settings.database_url:
            try:
                async with get_engine().connect() as connection:
                    await connection.execute(text("select 1"))
                database_status = "connected"
            except (SQLAlchemyError, OSError):
                database_status = "unavailable"

        return {
            "status": "ok" if database_status in {"connected", "not_configured"} else "degraded",
            "service": settings.app_name,
            "version": "1.0.0",
            "environment": settings.app_env,
            "database": database_status,
            "timestamp": datetime.now(UTC),
        }

