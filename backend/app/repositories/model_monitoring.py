import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


class ModelMonitoringRepository(BaseRepository):
    async def models(self) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select model.id, model.name, model.version, model.model_type,
                   model.algorithm, model.description, model.status::text as status,
                   model.artifact_uri, model.artifact_checksum, model.feature_schema,
                   model.parameters, model.evaluation_metrics, model.training_data_version,
                   model.trained_at, model.deployed_at, model.created_at,
                   inference.last_inference_at, coalesce(inference.inference_count, 0)::integer as inference_count,
                   latest_run.id as latest_monitoring_run_id,
                   latest_run.status::text as latest_monitoring_status,
                   latest_run.completed_at as latest_monitored_at,
                   latest_run.summary as latest_monitoring_summary
            from public.model_versions model
            left join lateral (
              select max(prediction.generated_at) as last_inference_at,
                     count(distinct (prediction.project_id, prediction.source_update_id, prediction.generated_at))::integer
                       as inference_count
              from public.predictions prediction
              where prediction.model_version_id = model.id
                and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
            ) inference on true
            left join lateral (
              select run.id, run.status, run.completed_at, run.summary
              from public.model_monitoring_runs run
              where run.model_version_id = model.id
              order by run.completed_at desc
              limit 1
            ) latest_run on true
            order by (model.status = 'active') desc, model.name, model.trained_at desc nulls last
        """))
        return self.rows(result)

    async def model(self, model_version_id: UUID) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, name, version, model_type, algorithm, description,
                   status::text as status, artifact_uri, artifact_checksum,
                   feature_schema, parameters, evaluation_metrics,
                   training_data_version, trained_at, deployed_at, created_at
            from public.model_versions where id = :model_version_id
        """), {"model_version_id": model_version_id})
        return self.row(result)

    async def prediction_samples(
        self,
        model_version_id: UUID,
        prediction_type: str,
        start: datetime,
        end: datetime,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select prediction.id, prediction.project_id, prediction.prediction_type,
                   prediction.predicted_value::double precision as predicted_value,
                   prediction.predicted_class,
                   prediction.actual_value::double precision as actual_value,
                   prediction.actual_class, prediction.evaluated_at,
                   prediction.feature_snapshot, prediction.generated_at
            from public.predictions prediction
            where prediction.model_version_id = :model_version_id
              and prediction.prediction_type = :prediction_type
              and prediction.generated_at >= :start
              and prediction.generated_at < :end
              and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
            order by prediction.generated_at, prediction.id
        """), {
            "model_version_id": model_version_id,
            "prediction_type": prediction_type,
            "start": start,
            "end": end,
        })
        return self.rows(result)

    async def evaluated_samples(
        self,
        model_version_id: UUID,
        prediction_type: str,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select prediction.predicted_value::double precision as predicted_value,
                   prediction.predicted_class, prediction.actual_value::double precision as actual_value,
                   prediction.actual_class, prediction.evaluated_at
            from public.predictions prediction
            where prediction.model_version_id = :model_version_id
              and prediction.prediction_type = :prediction_type
              and prediction.evaluated_at is not null
              and (prediction.actual_value is not null or prediction.actual_class is not null)
              and lower(coalesce(prediction.metadata->>'synthetic', 'false')) = 'false'
            order by prediction.evaluated_at desc
        """), {"model_version_id": model_version_id, "prediction_type": prediction_type})
        return self.rows(result)

    async def save_run(
        self,
        *,
        model_version_id: UUID,
        actor_id: UUID,
        report: dict[str, Any],
    ) -> dict[str, Any]:
        result = await self.session.execute(text("""
            insert into public.model_monitoring_runs (
              model_version_id, status, monitoring_window_start, monitoring_window_end,
              comparison_window_start, comparison_window_end,
              reference_sample_size, current_sample_size, comparison_sample_size,
              evaluated_outcome_count, feature_drift, prediction_shift,
              missing_feature_changes, performance_monitoring, summary,
              methodology, limitations, run_by, started_at, completed_at
            ) values (
              :model_version_id, cast(:status as public.model_monitoring_status),
              :monitoring_window_start, :monitoring_window_end,
              :comparison_window_start, :comparison_window_end,
              :reference_sample_size, :current_sample_size, :comparison_sample_size,
              :evaluated_outcome_count, cast(:feature_drift as jsonb),
              cast(:prediction_shift as jsonb), cast(:missing_feature_changes as jsonb),
              cast(:performance_monitoring as jsonb), cast(:summary as jsonb),
              cast(:methodology as jsonb), cast(:limitations as jsonb),
              :actor_id, :started_at, :completed_at
            ) returning *
        """), {
            "model_version_id": model_version_id,
            "actor_id": actor_id,
            **{key: report[key] for key in (
                "status", "monitoring_window_start", "monitoring_window_end",
                "comparison_window_start", "comparison_window_end",
                "reference_sample_size", "current_sample_size", "comparison_sample_size",
                "evaluated_outcome_count", "started_at", "completed_at",
            )},
            **{
                key: json.dumps(report[key], default=str)
                for key in (
                    "feature_drift", "prediction_shift", "missing_feature_changes",
                    "performance_monitoring", "summary", "methodology", "limitations",
                )
            },
        })
        row = self.row(result) or {}
        await self.session.execute(text("""
            insert into public.audit_logs (
              actor_id, action, entity_type, entity_id, table_name, record_key, new_values
            ) values (
              :actor_id, 'model.monitoring_run', 'model_monitoring_run', :run_id,
              'model_monitoring_runs', :record_key, cast(:new_values as jsonb)
            )
        """), {
            "actor_id": actor_id,
            "run_id": row["id"],
            "record_key": str(row["id"]),
            "new_values": json.dumps({
                "model_version_id": str(model_version_id),
                "status": report["status"],
                "monitoring_window_start": str(report["monitoring_window_start"]),
                "monitoring_window_end": str(report["monitoring_window_end"]),
            }),
        })
        return row

    async def run(self, run_id: UUID) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select run.*, model.name as model_name, model.version as model_version
            from public.model_monitoring_runs run
            join public.model_versions model on model.id = run.model_version_id
            where run.id = :run_id
        """), {"run_id": run_id})
        return self.row(result)

    async def runs(self, model_version_id: UUID, limit: int) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select run.*, model.name as model_name, model.version as model_version
            from public.model_monitoring_runs run
            join public.model_versions model on model.id = run.model_version_id
            where run.model_version_id = :model_version_id
            order by run.completed_at desc
            limit :limit
        """), {"model_version_id": model_version_id, "limit": limit})
        return self.rows(result)
