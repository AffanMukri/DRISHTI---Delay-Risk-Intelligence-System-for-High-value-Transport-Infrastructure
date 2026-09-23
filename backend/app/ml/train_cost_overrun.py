from __future__ import annotations

import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from app.config import get_settings
from app.database import dispose_engine, get_session_factory
from app.ml.cost_training import TrainingDataError, train_cost_overrun_models
from app.repositories.predictions import PredictionRepository


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and register the DRISHTI cost-overrun model.")
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
            if await repository.cost_model_version_exists(version):
                raise TrainingDataError(f"Model version '{version}' is already registered and is immutable.")
            rows = await repository.cost_training_rows()
            output = train_cost_overrun_models(
                rows,
                version=version,
                artifact_dir=artifact_dir or settings.ml_artifact_dir,
                minimum_rows=settings.ml_min_training_rows,
                minimum_class_rows=settings.ml_min_class_rows,
                significant_overrun_threshold_pct=settings.ml_significant_overrun_threshold_pct,
            )
            model_id = await repository.register_model(output.registry_metadata)
    return {
        "modelId": str(model_id),
        "modelName": output.artifact["model_name"],
        "modelVersion": output.artifact["model_version"],
        "artifactPath": str(output.artifact_path),
        "artifactChecksum": output.artifact_checksum,
        "trainingRows": output.artifact["training_metadata"]["row_count"],
        "regressionModel": output.artifact["regression_model_name"],
        "classificationModel": output.artifact["classification_model_name"],
        "metrics": output.artifact["metrics"],
    }


async def main() -> int:
    args = arguments()
    try:
        result = await train(args.version, args.artifact_dir)
        print(json.dumps(result, indent=2, default=str))
        return 0
    except TrainingDataError as exc:
        print(json.dumps({"status": "not_trained", "reason": str(exc)}, indent=2))
        return 2
    finally:
        await dispose_engine()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
