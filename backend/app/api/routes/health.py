from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_health_service
from app.schemas.common import HealthResponse
from app.services.health import HealthService


router = APIRouter(tags=["System"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service and database health",
)
async def health(
    service: Annotated[HealthService, Depends(get_health_service)],
) -> dict[str, object]:
    return await service.status()

