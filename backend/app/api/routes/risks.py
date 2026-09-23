from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.api.dependencies import get_risk_service
from app.auth.dependencies import get_current_profile, require_roles
from app.schemas.project import RiskLevel
from app.schemas.risk import RiskConfigurationResponse, RiskHistoryResponse, RiskListResponse, RiskResponse, RiskTrajectoryResponse
from app.services.risks import RiskService


router = APIRouter(
    prefix="/risks",
    tags=["Risks"],
    dependencies=[Depends(get_current_profile)],
)


@router.get("", response_model=RiskListResponse, summary="List project risk assessments")
async def list_risks(
    service: Annotated[RiskService, Depends(get_risk_service)],
    risk_level: RiskLevel | None = None,
    current_only: Annotated[bool, Query()] = True,
) -> dict[str, object]:
    return await service.list(risk_level, current_only)


@router.get("/configuration", response_model=RiskConfigurationResponse, summary="Get the documented hybrid risk configuration")
async def get_risk_configuration(
    service: Annotated[RiskService, Depends(get_risk_service)],
) -> dict[str, object]:
    return service.configuration()


@router.post(
    "/assess-portfolio",
    response_model=RiskListResponse,
    dependencies=[Depends(require_roles("administrator", "analyst"))],
    summary="Create a historical hybrid-risk snapshot for every project",
)
async def assess_portfolio(
    service: Annotated[RiskService, Depends(get_risk_service)],
) -> dict[str, object]:
    return await service.assess_portfolio()


@router.get("/{project_id}/history", response_model=RiskHistoryResponse, summary="Get historical risk evolution")
async def get_project_risk_history(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[RiskService, Depends(get_risk_service)],
) -> dict[str, object]:
    return await service.history_for_project(project_id)


@router.get(
    "/{project_id}/trajectory",
    response_model=RiskTrajectoryResponse,
    summary="Get the monthly risk trajectory and explain month-to-month changes",
)
async def get_project_risk_trajectory(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[RiskService, Depends(get_risk_service)],
) -> dict[str, object]:
    return await service.trajectory_for_project(project_id)


@router.post(
    "/{project_id}/assess",
    response_model=RiskResponse,
    dependencies=[Depends(require_roles("administrator", "analyst"))],
    summary="Create a new hybrid-risk snapshot for one project",
)
async def assess_project_risk(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[RiskService, Depends(get_risk_service)],
) -> dict[str, object]:
    return await service.assess_project(project_id)


@router.get("/{project_id}", response_model=RiskResponse, summary="Get current project risk")
async def get_project_risk(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[RiskService, Depends(get_risk_service)],
) -> dict[str, object]:
    return await service.get_for_project(project_id)
