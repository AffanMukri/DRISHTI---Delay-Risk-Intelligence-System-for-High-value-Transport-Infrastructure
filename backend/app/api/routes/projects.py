from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.api.dependencies import get_project_service
from app.auth.dependencies import get_current_profile
from app.schemas.project import (
    DataConfidenceResponse,
    ProjectDetailResponse,
    ProjectHistoryResponse,
    ProjectListResponse,
    ProjectStatus,
)
from app.services.projects import ProjectService


router = APIRouter(
    prefix="/projects",
    tags=["Projects"],
    dependencies=[Depends(get_current_profile)],
)


@router.get("", response_model=ProjectListResponse, summary="List monitored projects")
async def list_projects(
    service: Annotated[ProjectService, Depends(get_project_service)],
    search: Annotated[str | None, Query(min_length=2, max_length=200)] = None,
    ministry: Annotated[str | None, Query(max_length=300)] = None,
    sector: Annotated[str | None, Query(max_length=200)] = None,
    status: ProjectStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, object]:
    return await service.list(
        search=search,
        ministry=ministry,
        sector=sector,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get("/{project_id}/history", response_model=ProjectHistoryResponse, summary="Get project monitoring history")
async def get_project_history(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> dict[str, object]:
    return await service.history(project_id)


@router.get(
    "/{project_id}/data-confidence",
    response_model=DataConfidenceResponse,
    summary="Get the deterministic input-data confidence score for a project",
)
async def get_project_data_confidence(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> dict[str, object]:
    return await service.data_confidence(project_id)


@router.get("/{project_id}", response_model=ProjectDetailResponse, summary="Get one project")
async def get_project(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> dict[str, object]:
    return await service.get(project_id)
