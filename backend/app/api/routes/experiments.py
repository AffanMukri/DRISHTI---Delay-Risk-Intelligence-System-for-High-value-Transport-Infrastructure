from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, status

from app.api.dependencies import get_experiment_service
from app.auth.dependencies import require_roles
from app.auth.models import CurrentProfile
from app.schemas.experiments import (
    ExperimentRunRequest,
    ExternalFeatureCatalogResponse,
    ExternalObservationCreate,
    ExternalObservationResponse,
    ExternalObservationValidation,
    ModelComparisonExperiment,
    ModelComparisonListResponse,
)
from app.services.experiments import ExperimentService


prediction_viewer = require_roles("administrator", "executive", "analyst")
experiment_manager = require_roles("administrator", "analyst")

router = APIRouter(prefix="/experiments/cuf-plus", tags=["CUF+ Model Experiments"])


@router.get("/features", response_model=ExternalFeatureCatalogResponse)
async def feature_catalog(
    service: Annotated[ExperimentService, Depends(get_experiment_service)],
    _: Annotated[CurrentProfile, Depends(prediction_viewer)],
) -> dict[str, object]:
    return await service.feature_catalog()


@router.post(
    "/observations",
    response_model=ExternalObservationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a pending source-attributed external observation",
)
async def create_external_observation(
    request: ExternalObservationCreate,
    service: Annotated[ExperimentService, Depends(get_experiment_service)],
    profile: Annotated[CurrentProfile, Depends(experiment_manager)],
) -> dict[str, object]:
    return await service.create_observation(request, profile)


@router.patch(
    "/observations/{observation_id}/validation",
    response_model=ExternalObservationResponse,
    summary="Validate or reject an external observation before Model B can use it",
)
async def validate_external_observation(
    request: ExternalObservationValidation,
    observation_id: Annotated[UUID, Path()],
    service: Annotated[ExperimentService, Depends(get_experiment_service)],
    profile: Annotated[CurrentProfile, Depends(experiment_manager)],
) -> dict[str, object]:
    return await service.validate_observation(observation_id, request, profile)


@router.post(
    "/run",
    response_model=ModelComparisonExperiment,
    status_code=status.HTTP_201_CREATED,
    summary="Run an immutable CUF-only versus validated CUF+ comparison",
)
async def run_experiment(
    request: ExperimentRunRequest,
    service: Annotated[ExperimentService, Depends(get_experiment_service)],
    profile: Annotated[CurrentProfile, Depends(experiment_manager)],
) -> dict[str, object]:
    return await service.run(request.version, profile)


@router.get("/latest", response_model=ModelComparisonExperiment)
async def latest_experiment(
    service: Annotated[ExperimentService, Depends(get_experiment_service)],
    _: Annotated[CurrentProfile, Depends(prediction_viewer)],
) -> dict[str, object]:
    return await service.latest()


@router.get("", response_model=ModelComparisonListResponse)
async def list_experiments(
    service: Annotated[ExperimentService, Depends(get_experiment_service)],
    _: Annotated[CurrentProfile, Depends(prediction_viewer)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, object]:
    return await service.list(limit)
