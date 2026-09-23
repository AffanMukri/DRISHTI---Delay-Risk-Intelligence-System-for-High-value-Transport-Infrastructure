from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.auth.models import CurrentProfile
from app.config import Settings
from app.errors import NotFoundError
from app.ml.cost_inference import load_cost_model
from app.ml.interface import ModelUnavailableError
from app.ml.monitoring import (
    categorical_drift,
    classification_performance,
    missingness_change,
    numeric_drift,
    regression_performance,
)
from app.ml.schedule_inference import load_schedule_model
from app.repositories.model_monitoring import ModelMonitoringRepository


MODEL_CONTRACTS = {
    "pragati_x_cost_overrun": {
        "primary_type": "final_cost",
        "classification_type": "significant_cost_overrun",
        "positive_class": "significant_overrun",
    },
    "pragati_x_schedule_overrun": {
        "primary_type": "completion_date",
        "classification_type": "schedule_overrun_probability",
        "positive_class": "schedule_overrun",
    },
}


class ModelMonitoringService:
    def __init__(self, repository: ModelMonitoringRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings

    def _artifact(self, model: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
        contract = MODEL_CONTRACTS.get(str(model["name"]))
        if contract is None:
            return None, "This model family does not expose a compatible statistical monitoring artifact."
        uri = model.get("artifact_uri")
        checksum = model.get("artifact_checksum")
        if not uri or not checksum:
            return None, "The registered model has no checksum-verified artifact."
        try:
            if model["name"] == "pragati_x_cost_overrun":
                return load_cost_model(str(uri), str(checksum), str(self.settings.ml_artifact_dir)), None
            return load_schedule_model(str(uri), str(checksum), str(self.settings.ml_artifact_dir)), None
        except ModelUnavailableError as exc:
            return None, str(exc)

    @staticmethod
    def _features_from_registry(model: dict[str, Any]) -> list[str]:
        schema = model.get("feature_schema") or {}
        features = schema.get("features") if isinstance(schema, dict) else None
        return [str(item) for item in features] if isinstance(features, list) else []

    def _inventory_item(self, model: dict[str, Any]) -> dict[str, Any]:
        artifact, unavailable = self._artifact(model)
        parameters = model.get("parameters") or {}
        metadata = artifact.get("training_metadata", {}) if artifact else {}
        training_period = metadata.get("training_period") or parameters.get("training_period")
        training_rows = metadata.get("row_count") or parameters.get("training_rows")
        features = artifact.get("feature_names", []) if artifact else self._features_from_registry(model)
        latest_summary = model.get("latest_monitoring_summary") or None
        return {
            "id": model["id"],
            "name": model["name"],
            "version": model["version"],
            "model_type": model["model_type"],
            "algorithm": model.get("algorithm"),
            "description": model.get("description"),
            "status": model["status"],
            "active": model["status"] == "active",
            "training_date": model.get("trained_at"),
            "training_period": training_period,
            "training_rows": int(training_rows) if training_rows is not None else None,
            "feature_list": list(features),
            "evaluation_metrics": model.get("evaluation_metrics") or {},
            "deployed_at": model.get("deployed_at"),
            "last_inference": model.get("last_inference_at"),
            "inference_count": int(model.get("inference_count") or 0),
            "latest_monitoring_run_id": model.get("latest_monitoring_run_id"),
            "latest_monitoring_status": model.get("latest_monitoring_status"),
            "latest_monitored_at": model.get("latest_monitored_at"),
            "latest_monitoring_summary": latest_summary,
            "monitoring_supported": artifact is not None,
            "monitoring_unavailable_reason": unavailable,
        }

    async def inventory(self) -> dict[str, Any]:
        items = [self._inventory_item(model) for model in await self.repository.models()]
        attention = sum(
            item["latest_monitoring_status"] in {"partial", "failed"}
            or bool((item.get("latest_monitoring_summary") or {}).get("attention_required"))
            for item in items
        )
        return {
            "items": items,
            "total": len(items),
            "active_models": sum(item["active"] for item in items),
            "models_with_inference": sum(item["last_inference"] is not None for item in items),
            "models_requiring_attention": attention,
            "automatic_retraining_enabled": False,
        }

    def _numeric_test(self, reference: list[Any], current: list[Any]) -> dict[str, Any]:
        return numeric_drift(
            reference,
            current,
            minimum_samples=self.settings.model_monitoring_min_samples,
            psi_warning=self.settings.model_monitoring_psi_warning,
            psi_critical=self.settings.model_monitoring_psi_critical,
            significance_level=self.settings.model_monitoring_significance_level,
        )

    async def run(
        self,
        model_version_id: UUID,
        profile: CurrentProfile,
        window_days: int | None,
    ) -> dict[str, Any]:
        model = await self.repository.model(model_version_id)
        if model is None:
            raise NotFoundError("Model version", str(model_version_id))
        days = window_days or self.settings.model_monitoring_default_window_days
        ended = datetime.now(UTC)
        started = ended - timedelta(days=days)
        comparison_end = started
        comparison_start = comparison_end - timedelta(days=days)
        artifact, unavailable = self._artifact(model)
        contract = MODEL_CONTRACTS.get(str(model["name"]))
        current: list[dict[str, Any]] = []
        previous: list[dict[str, Any]] = []
        feature_drift: dict[str, Any] = {}
        missingness: dict[str, Any] = {}
        prediction_shift: dict[str, Any] = {}
        performance: dict[str, Any] = {}
        limitations: list[str] = []
        reference_count = 0

        if artifact is None or contract is None:
            limitations.append(unavailable or "A compatible monitoring contract is unavailable.")
        else:
            current = await self.repository.prediction_samples(
                model_version_id, contract["primary_type"], started, ended
            )
            previous = await self.repository.prediction_samples(
                model_version_id, contract["primary_type"], comparison_start, comparison_end
            )
            historical = artifact.get("explanation_metadata", {}).get("historicalReference", {}).get("global", {})
            reference_count = int(historical.get("count") or 0)
            references = historical.get("features") or {}
            snapshots = [row.get("feature_snapshot") or {} for row in current]
            numeric_features = list(artifact.get("numeric_features") or [])
            categorical_features = list(artifact.get("categorical_features") or [])
            for feature in numeric_features:
                reference = references.get(feature) or {}
                values = [snapshot.get(feature) for snapshot in snapshots]
                feature_drift[feature] = self._numeric_test(reference.get("values") or [], values)
                missingness[feature] = missingness_change(
                    reference_total=reference_count,
                    reference_present=int(reference.get("count") or 0),
                    current_values=values,
                    categorical=False,
                    minimum_samples=self.settings.model_monitoring_min_samples,
                    significance_level=self.settings.model_monitoring_significance_level,
                )
            for feature in categorical_features:
                reference = references.get(feature) or {}
                values = [snapshot.get(feature) for snapshot in snapshots]
                counts = reference.get("counts") or {}
                feature_drift[feature] = categorical_drift(
                    counts,
                    values,
                    minimum_samples=self.settings.model_monitoring_min_samples,
                    significance_level=self.settings.model_monitoring_significance_level,
                )
                present = int(reference.get("count") or 0) - int(counts.get("Not reported") or 0)
                missingness[feature] = missingness_change(
                    reference_total=reference_count,
                    reference_present=present,
                    current_values=values,
                    categorical=True,
                    minimum_samples=self.settings.model_monitoring_min_samples,
                    significance_level=self.settings.model_monitoring_significance_level,
                )

            prediction_shift["regression_output"] = self._numeric_test(
                [row.get("predicted_value") for row in previous],
                [row.get("predicted_value") for row in current],
            )
            current_class = await self.repository.prediction_samples(
                model_version_id, contract["classification_type"], started, ended
            )
            previous_class = await self.repository.prediction_samples(
                model_version_id, contract["classification_type"], comparison_start, comparison_end
            )
            prediction_shift["classification_probability"] = self._numeric_test(
                [row.get("predicted_value") for row in previous_class],
                [row.get("predicted_value") for row in current_class],
            )

            evaluated_regression = await self.repository.evaluated_samples(
                model_version_id, contract["primary_type"]
            )
            evaluated_classification = await self.repository.evaluated_samples(
                model_version_id, contract["classification_type"]
            )
            baseline = artifact.get("metrics") or {}
            performance["regression"] = regression_performance(
                [row.get("predicted_value") for row in evaluated_regression],
                [row.get("actual_value") for row in evaluated_regression],
                minimum_samples=self.settings.model_monitoring_min_samples,
                baseline_metrics=(baseline.get("regression") or {}).get("test"),
                degradation_ratio=self.settings.model_monitoring_performance_degradation_ratio,
            )
            performance["classification"] = classification_performance(
                [row.get("predicted_value") for row in evaluated_classification],
                [row.get("predicted_class") for row in evaluated_classification],
                [row.get("actual_class") for row in evaluated_classification],
                positive_class=contract["positive_class"],
                minimum_samples=self.settings.model_monitoring_min_samples,
                baseline_metrics=(baseline.get("classification") or {}).get("test"),
            )
            if not current:
                limitations.append("No non-synthetic inference records exist in the monitoring window.")
            if not previous:
                limitations.append("The preceding comparison window has no inference records; prediction shift is unavailable.")
            if all(item.get("status") == "insufficient_data" for item in performance.values()):
                limitations.append("Too few predictions have stored realized outcomes to assess performance degradation.")

        all_tests = list(feature_drift.values()) + list(missingness.values()) + list(prediction_shift.values())
        calculated = [item for item in all_tests if item.get("status") != "insufficient_data"]
        feature_alerts = [
            feature for feature, item in feature_drift.items()
            if item.get("status") in {"watch", "drift_detected"}
        ]
        missing_alerts = [
            feature for feature, item in missingness.items()
            if item.get("status") in {"watch", "drift_detected"}
        ]
        prediction_alerts = [
            output for output, item in prediction_shift.items()
            if item.get("status") in {"watch", "drift_detected"}
        ]
        degraded = [name for name, item in performance.items() if item.get("status") == "degraded"]
        if not calculated:
            status = "insufficient_data"
        elif any(item.get("status") == "insufficient_data" for item in all_tests):
            status = "partial"
        else:
            status = "sufficient"
        summary = {
            "attention_required": bool(feature_alerts or missing_alerts or prediction_alerts or degraded),
            "feature_drift_alerts": feature_alerts,
            "missingness_alerts": missing_alerts,
            "prediction_shift_alerts": prediction_alerts,
            "performance_degradation_alerts": degraded,
            "calculated_test_count": len(calculated),
            "insufficient_test_count": len(all_tests) - len(calculated),
            "automatic_retraining_triggered": False,
        }
        evaluated_count = max(
            [int(item.get("evaluated_count") or 0) for item in performance.values()] or [0]
        )
        timestamp = datetime.now(UTC)
        report = {
            "status": status,
            "monitoring_window_start": started,
            "monitoring_window_end": ended,
            "comparison_window_start": comparison_start,
            "comparison_window_end": comparison_end,
            "reference_sample_size": reference_count,
            "current_sample_size": len(current),
            "comparison_sample_size": len(previous),
            "evaluated_outcome_count": evaluated_count,
            "feature_drift": feature_drift,
            "prediction_shift": prediction_shift,
            "missing_feature_changes": missingness,
            "performance_monitoring": performance,
            "summary": summary,
            "methodology": {
                "numeric_feature_drift": "PSI with training-decile bins plus two-sample KS",
                "categorical_feature_drift": "Pearson chi-square plus Cramer's V",
                "missingness_change": "Pearson chi-square on present versus missing counts",
                "prediction_shift": "Adjacent deployment windows using PSI plus KS",
                "minimum_samples": self.settings.model_monitoring_min_samples,
                "significance_level": self.settings.model_monitoring_significance_level,
                "psi_warning": self.settings.model_monitoring_psi_warning,
                "psi_critical": self.settings.model_monitoring_psi_critical,
                "performance_degradation_ratio": self.settings.model_monitoring_performance_degradation_ratio,
                "automatic_retraining": False,
            },
            "limitations": limitations,
            "started_at": ended,
            "completed_at": timestamp,
        }
        saved = await self.repository.save_run(
            model_version_id=model_version_id, actor_id=profile.id, report=report
        )
        return {**saved, "model_name": model["name"], "model_version": model["version"]}

    async def run_detail(self, run_id: UUID) -> dict[str, Any]:
        row = await self.repository.run(run_id)
        if row is None:
            raise NotFoundError("Model monitoring run", str(run_id))
        return row

    async def history(self, model_version_id: UUID, limit: int) -> dict[str, Any]:
        if await self.repository.model(model_version_id) is None:
            raise NotFoundError("Model version", str(model_version_id))
        items = await self.repository.runs(model_version_id, limit)
        return {"items": items, "total": len(items)}
