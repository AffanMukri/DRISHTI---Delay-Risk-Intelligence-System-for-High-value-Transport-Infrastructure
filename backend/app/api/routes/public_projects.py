from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.api.dependencies import get_public_project_service
from app.schemas.project import PublicProjectListResponse, PublicProjectResponse
from app.services.projects import ProjectService


router = APIRouter(prefix="/public/projects", tags=["Public Project Enquiry"])


@router.get("", response_model=PublicProjectListResponse, summary="Search publicly visible projects")
async def list_public_projects(
    service: Annotated[ProjectService, Depends(get_public_project_service)],
    search: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, object]:
    return await service.list_public(search=search, limit=limit, offset=offset)


@router.get("/{project_id}", response_model=PublicProjectResponse, summary="Get public project facts")
async def get_public_project(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[ProjectService, Depends(get_public_project_service)],
) -> dict[str, object]:
    return await service.get_public(project_id)
