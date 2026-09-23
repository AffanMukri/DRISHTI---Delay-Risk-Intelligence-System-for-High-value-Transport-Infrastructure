from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_portfolio_service
from app.auth.dependencies import get_current_profile
from app.schemas.portfolio import PortfolioChangesResponse, PortfolioSummaryResponse
from app.services.portfolio import PortfolioService


router = APIRouter(
    prefix="/portfolio",
    tags=["Portfolio"],
    dependencies=[Depends(get_current_profile)],
)


@router.get("/summary", response_model=PortfolioSummaryResponse, summary="Portfolio KPI summary")
async def portfolio_summary(
    service: Annotated[PortfolioService, Depends(get_portfolio_service)],
) -> dict[str, object]:
    return await service.summary()


@router.get(
    "/changes",
    response_model=PortfolioChangesResponse,
    summary="Compare the latest portfolio reporting cycle with the previous cycle",
)
async def portfolio_changes(
    service: Annotated[PortfolioService, Depends(get_portfolio_service)],
) -> dict[str, object]:
    return await service.changes()
