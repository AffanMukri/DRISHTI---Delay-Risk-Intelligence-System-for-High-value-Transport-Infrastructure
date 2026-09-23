from __future__ import annotations

import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from app.config import get_settings
from app.database import dispose_engine, get_session_factory
from app.ml.schedule_training import ScheduleTrainingDataError, train_schedule_overrun_models
from app.repositories.predictions import PredictionRepository


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and register the independent DRISHTI schedule model.")
    parser.add_argument(
        "--version",
        default=datetime.now(UTC).strftime("%Y.%m.%d.%H%M"),
        help="Immutable model version identifier.",
    )
    parser.add_argument("--artifact-dir", type=Path, help="Override the configured artifact directory.")
    return parser.parse_args()


async def train(version: str, artifact_dir: Path | None) -> dict[str, object]:
    settings = get_settings()
    session_factory = get_session_factory()
    async with session_factory() as session:
        async with session.begin():
            repository = PredictionRepository(session)
            if await repository.schedule_model_version_exists(version):
                raise ScheduleTrainingDataError(
                    f"Schedule model version '{version}' is already registered and is immutable."
                )
            rows = await repository.schedule_training_rows()
            output = train_schedule_overrun_models(
                rows,
                version=version,
                artifact_dir=artifact_dir or settings.ml_artifact_dir,
                minimum_rows=settings.ml_schedule_min_training_rows,
                minimum_class_rows=settings.ml_schedule_min_class_rows,
                overrun_threshold_days=settings.ml_schedule_overrun_threshold_days,
            )
            model_id = await repository.register_model(output.registry_metadata)
    return {
        "modelId": str(model_id),
        "modelName": output.artifact["model_name"],
        "modelVersion": output.artifact["model_version"],
        "artifactPath": str(output.artifact_path),
        "artifactChecksum": output.artifact_checksum,
        "trainingRows": output.artifact["training_metadata"]["row_count"],
        "completionLabelSources": output.artifact["training_metadata"]["completion_label_source_counts"],
        "regressionModel": output.artifact["regression_model_name"],
        "classificationModel": output.artifact["classification_model_name"],
        "metrics": output.artifact["metrics"],
    }


async def main() -> int:
    args = arguments()
    try:
        print(json.dumps(await train(args.version, args.artifact_dir), indent=2, default=str))
        return 0
    except ScheduleTrainingDataError as exc:
        print(json.dumps({"status": "not_trained", "reason": str(exc)}, indent=2))
        return 2
    finally:
        await dispose_engine()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
