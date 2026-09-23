from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.dependencies import get_prediction_service, get_scenario_service
from app.auth.dependencies import require_roles
from app.schemas.prediction import (
    CostOverrunPredictionResponse,
    PredictionListResponse,
    ScheduleOverrunPredictionResponse,
)
from app.schemas.scenario import (
    ScenarioConfigurationResponse,
    ScenarioRequest,
    ScenarioSimulationResponse,
)
from app.services.predictions import PredictionService
from app.services.scenarios import ScenarioService


router = APIRouter(
    prefix="/predictions",
    tags=["Predictions"],
    dependencies=[Depends(require_roles("administrator", "executive", "analyst"))],
)


@router.get(
    "/what-if/{project_id}",
    response_model=ScenarioConfigurationResponse,
    summary="Get model-supported what-if variables and current values",
)
async def get_what_if_configuration(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[ScenarioService, Depends(get_scenario_service)],
) -> dict[str, object]:
    return await service.configuration(project_id)


@router.post(
    "/what-if/{project_id}",
    response_model=ScenarioSimulationResponse,
    summary="Run a non-persistent before-versus-scenario model estimate",
)
async def run_what_if_scenario(
    request: ScenarioRequest,
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[ScenarioService, Depends(get_scenario_service)],
) -> dict[str, object]:
    return await service.simulate(project_id, request)


@router.get(
    "/cost-overrun/{project_id}",
    response_model=CostOverrunPredictionResponse,
    summary="Get the latest genuine cost-overrun model result",
)
async def get_latest_cost_overrun_prediction(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[PredictionService, Depends(get_prediction_service)],
) -> dict[str, object]:
    return await service.latest_cost_overrun(project_id)


@router.post(
    "/cost-overrun/{project_id}",
    response_model=CostOverrunPredictionResponse,
    dependencies=[Depends(require_roles("administrator", "analyst"))],
    summary="Generate a cost-overrun prediction from the active trained model",
)
async def generate_cost_overrun_prediction(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[PredictionService, Depends(get_prediction_service)],
) -> dict[str, object]:
    return await service.predict_cost_overrun(project_id)


@router.get(
    "/schedule-overrun/{project_id}",
    response_model=ScheduleOverrunPredictionResponse,
    summary="Get the latest genuine schedule-overrun model result",
)
async def get_latest_schedule_overrun_prediction(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[PredictionService, Depends(get_prediction_service)],
) -> dict[str, object]:
    return await service.latest_schedule_overrun(project_id)


@router.post(
    "/schedule-overrun/{project_id}",
    response_model=ScheduleOverrunPredictionResponse,
    dependencies=[Depends(require_roles("administrator", "analyst"))],
    summary="Generate a schedule-overrun prediction from the active trained model",
)
async def generate_schedule_overrun_prediction(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[PredictionService, Depends(get_prediction_service)],
) -> dict[str, object]:
    return await service.predict_schedule_overrun(project_id)


@router.get("/{project_id}", response_model=PredictionListResponse, summary="Get stored project predictions")
async def get_predictions(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[PredictionService, Depends(get_prediction_service)],
) -> dict[str, object]:
    return await service.for_project(project_id)
