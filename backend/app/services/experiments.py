import math
from datetime import date
from typing import Any
from uuid import UUID

from app.auth.models import CurrentProfile
from app.config import Settings
from app.errors import AppError, ConflictError, NotFoundError
from app.ml.comparison import ExperimentDataError, run_comparison
from app.repositories.experiments import ExperimentRepository
from app.repositories.predictions import PredictionRepository
from app.schemas.experiments import ExternalObservationCreate, ExternalObservationValidation


class ExperimentService:
    def __init__(
        self,
        repository: ExperimentRepository,
        prediction_repository: PredictionRepository,
        settings: Settings,
    ) -> None:
        self.repository = repository
        self.predictions = prediction_repository
        self.settings = settings

    async def feature_catalog(self) -> dict[str, Any]:
        items = await self.repository.feature_definitions()
        return {
            "items": items,
            "total": len(items),
            "note": "Definitions are not data. Model B uses only validated, source-attributed observations available on or before each feature snapshot.",
        }

    async def create_observation(
        self, request: ExternalObservationCreate, profile: CurrentProfile
    ) -> dict[str, Any]:
        definition = await self.repository.definition(request.feature_code)
        if not definition or not definition["is_active"]:
            raise NotFoundError("External feature definition", request.feature_code)
        if not math.isfinite(request.numeric_value):
            raise AppError("External feature values must be finite.", code="invalid_external_value")
        minimum = definition.get("minimum_value")
        maximum = definition.get("maximum_value")
        if minimum is not None and request.numeric_value < float(minimum):
            raise AppError(
                f"Value is below the configured minimum of {minimum} {definition['unit']}.",
                code="external_value_out_of_range",
            )
        if maximum is not None and request.numeric_value > float(maximum):
            raise AppError(
                f"Value is above the configured maximum of {maximum} {definition['unit']}.",
                code="external_value_out_of_range",
            )
        project_id = await self.repository.project_database_id(request.project_id)
        if project_id is None:
            raise NotFoundError("Project", request.project_id)
        values = request.model_dump(mode="python", exclude={"project_id"})
        values["source_uri"] = str(request.source_uri)
        return await self.repository.create_observation(
            project_id=project_id, values=values, created_by=profile.id
        )

    async def validate_observation(
        self,
        observation_id: UUID,
        request: ExternalObservationValidation,
        profile: CurrentProfile,
    ) -> dict[str, Any]:
        item = await self.repository.validate_observation(
            observation_id,
            status=request.status,
            notes=request.notes.strip(),
            validated_by=profile.id,
        )
        if item is None:
            raise NotFoundError("External feature observation", str(observation_id))
        return item

    @staticmethod
    def _date(value: Any) -> date:
        return value if isinstance(value, date) else date.fromisoformat(str(value))

    @classmethod
    def _attach_external(
        cls,
        rows: list[dict[str, Any]],
        observations: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        by_project: dict[str, list[dict[str, Any]]] = {}
        for observation in observations:
            by_project.setdefault(str(observation["project_id"]), []).append(observation)
        attached: list[dict[str, Any]] = []
        for original in rows:
            row = dict(original)
            snapshot = cls._date(row["snapshot_date"])
            selected: dict[str, dict[str, Any]] = {}
            for observation in by_project.get(str(row["project_database_id"]), []):
                observed = cls._date(observation["observation_date"])
                if observed > snapshot:
                    continue
                period_start = observation.get("period_start")
                period_end = observation.get("period_end")
                if period_start is not None and not (
                    cls._date(period_start) <= snapshot <= cls._date(period_end)
                ):
                    continue
                code = str(observation["feature_code"])
                current = selected.get(code)
                if current is None or cls._date(current["observation_date"]) < observed:
                    selected[code] = observation
            row["external_features"] = {
                code: float(observation["numeric_value"])
                for code, observation in selected.items()
            }
            row["external_provenance"] = {
                code: [{
                    "observation_id": str(observation["id"]),
                    "source_name": observation["source_name"],
                    "source_uri": observation["source_uri"],
                    "source_record_id": observation["source_record_id"],
                    "source_checksum_sha256": observation.get("source_checksum_sha256"),
                    "observation_date": cls._date(observation["observation_date"]).isoformat(),
                    "validated_at": observation["validated_at"].isoformat()
                    if observation.get("validated_at") else None,
                }]
                for code, observation in selected.items()
            }
            attached.append(row)
        return attached

    async def run(self, version: str, profile: CurrentProfile) -> dict[str, Any]:
        if await self.repository.experiment_version_exists(version):
            raise ConflictError(f"Experiment version '{version}' already exists and is immutable.")
        definitions, cost_rows, schedule_rows = await self._load_datasets()
        project_ids = sorted({
            UUID(str(row["project_database_id"])) for row in cost_rows + schedule_rows
        }, key=str)
        observations = await self.repository.validated_observations(project_ids)
        cost_rows = self._attach_external(cost_rows, observations)
        schedule_rows = self._attach_external(schedule_rows, observations)
        try:
            artifact, artifact_path, checksum = run_comparison(
                cost_rows,
                schedule_rows,
                definitions,
                version=version,
                artifact_dir=self.settings.experiment_artifact_dir,
                minimum_rows=self.settings.experiment_min_training_rows,
                minimum_class_rows=self.settings.experiment_min_class_rows,
                minimum_external_coverage=self.settings.experiment_external_min_feature_coverage,
                cost_overrun_threshold_pct=self.settings.ml_significant_overrun_threshold_pct,
                schedule_overrun_threshold_days=self.settings.ml_schedule_overrun_threshold_days,
                random_state=self.settings.experiment_random_state,
            )
        except ExperimentDataError as exc:
            raise AppError(str(exc), code="invalid_experiment_data", status_code=422) from exc
        row = await self.repository.save_experiment(
            artifact=artifact,
            requested_by=profile.id,
            artifact_uri=str(artifact_path),
            artifact_checksum=checksum,
        )
        return self._response(row)

    async def _load_datasets(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        definitions = await self.repository.feature_definitions()
        cost_rows = await self.predictions.cost_training_rows()
        schedule_rows = await self.predictions.schedule_training_rows()
        return definitions, cost_rows, schedule_rows

    @staticmethod
    def _response(row: dict[str, Any]) -> dict[str, Any]:
        comparison = dict(row.get("comparison") or {})
        conclusion = comparison.pop(
            "conclusion", "No consistent measured CUF+ improvement is established by this experiment."
        )
        supported = bool(comparison.pop("model_b_improvement_supported", False))
        return {
            **row,
            "comparison": comparison,
            "conclusion": conclusion,
            "model_b_improvement_supported": supported,
        }

    async def latest(self) -> dict[str, Any]:
        row = await self.repository.latest_experiment()
        if row is None:
            raise NotFoundError("Model comparison experiment", "latest")
        return self._response(row)

    async def list(self, limit: int) -> dict[str, Any]:
        rows = await self.repository.list_experiments(limit)
        return {"items": [self._response(row) for row in rows], "total": len(rows)}
