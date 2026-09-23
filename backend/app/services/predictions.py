from pathlib import Path
from uuid import UUID

from app.config import get_settings
from app.errors import AppError, NotFoundError
from app.ml.cost_inference import load_cost_model, predict_cost_overrun
from app.ml.interface import ModelUnavailableError
from app.ml.schedule_inference import load_schedule_model, predict_schedule_overrun
from app.repositories.predictions import PredictionRepository


class PredictionService:
    def __init__(self, repository: PredictionRepository) -> None:
        self.repository = repository

    async def for_project(self, identifier: str) -> dict[str, object]:
        project_code, rows = await self.repository.for_project(identifier)
        if project_code is None:
            raise NotFoundError("Project", identifier)
        return {"project_id": project_code, "items": rows}

    async def predict_cost_overrun(self, identifier: str) -> dict[str, object]:
        features = await self.repository.cost_inference_features(identifier)
        if features is None:
            raise NotFoundError("Project", identifier)
        if features.get("is_synthetic"):
            raise AppError(
                "Cost-overrun ML predictions are disabled for synthetic demonstration projects.",
                code="synthetic_prediction_blocked",
                status_code=422,
            )
        if float(features.get("approved_cost") or 0) <= 0 or features.get("snapshot_date") is None:
            raise AppError(
                "A positive original approved cost and a dated monitoring snapshot are required.",
                code="insufficient_prediction_data",
                status_code=422,
            )

        model = await self.repository.active_cost_model()
        if model is None:
            raise AppError(
                "No trained production cost-overrun model is active.",
                code="model_unavailable",
                status_code=503,
            )

        settings = get_settings()
        try:
            artifact = load_cost_model(
                str(model["artifact_uri"]),
                str(model["artifact_checksum"]),
                str(Path(settings.ml_artifact_dir).resolve()),
            )
            output = predict_cost_overrun(
                artifact,
                features,
                training_data_version=str(model["training_data_version"]),
            )
        except ModelUnavailableError as exc:
            raise AppError(str(exc), code="model_unavailable", status_code=503) from exc

        await self.repository.save_cost_prediction(
            project_id=UUID(str(features["project_database_id"])),
            model_version_id=UUID(str(model["id"])),
            source_update_id=(
                UUID(str(features["source_update_id"])) if features.get("source_update_id") else None
            ),
            features=output["features"],
            output=output,
        )
        return output

    async def latest_cost_overrun(self, identifier: str) -> dict[str, object]:
        project_code, output = await self.repository.latest_cost_prediction(identifier)
        if project_code is None:
            raise NotFoundError("Project", identifier)
        if output is None:
            raise NotFoundError("Cost overrun prediction", project_code)
        return output

    async def latest_schedule_overrun(self, identifier: str) -> dict[str, object]:
        project_code, output = await self.repository.latest_schedule_prediction(identifier)
        if project_code is None:
            raise NotFoundError("Project", identifier)
        if output is None:
            raise NotFoundError("Schedule overrun prediction", project_code)
        return output

    async def predict_schedule_overrun(self, identifier: str) -> dict[str, object]:
        features = await self.repository.schedule_inference_features(identifier)
        if features is None:
            raise NotFoundError("Project", identifier)
        if features.get("is_synthetic"):
            raise AppError(
                "Schedule-overrun ML predictions are disabled for synthetic demonstration projects.",
                code="synthetic_prediction_blocked",
                status_code=422,
            )
        if not features.get("source_update_id") or not features.get("snapshot_date"):
            raise AppError(
                "At least one dated monthly monitoring snapshot is required for schedule prediction.",
                code="insufficient_prediction_data",
                status_code=422,
            )
        if not features.get("original_completion_date"):
            raise AppError(
                "An original completion date is required for schedule prediction.",
                code="insufficient_prediction_data",
                status_code=422,
            )
        model = await self.repository.active_schedule_model()
        if model is None:
            raise AppError(
                "No trained production schedule-overrun model is active.",
                code="model_unavailable",
                status_code=503,
            )
        settings = get_settings()
        try:
            artifact = load_schedule_model(
                str(model["artifact_uri"]),
                str(model["artifact_checksum"]),
                str(Path(settings.ml_artifact_dir).resolve()),
            )
            output = predict_schedule_overrun(
                artifact,
                features,
                training_data_version=str(model["training_data_version"]),
            )
        except ModelUnavailableError as exc:
            raise AppError(str(exc), code="model_unavailable", status_code=503) from exc
        await self.repository.save_schedule_prediction(
            project_id=UUID(str(features["project_database_id"])),
            model_version_id=UUID(str(model["id"])),
            source_update_id=UUID(str(features["source_update_id"])),
            features=output["features"],
            output=output,
        )
        return output
