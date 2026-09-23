from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.config import get_settings
from app.database import get_session_factory
from app.errors import AppError
from app.repositories.cuf import CUFRepository
from app.repositories.predictions import PredictionRepository
from app.repositories.risks import RiskRepository
from app.repositories.warnings import WarningRepository
from app.services.predictions import PredictionService
from app.services.risks import RiskService
from app.services.warning_automation import WarningAutomationService
from sqlalchemy import text


logger = logging.getLogger(__name__)


async def run_cuf_analysis_batch(batch_id: UUID) -> None:
    """Run trusted post-import analysis after the caller's import transaction commits.

    The task uses the server-side database connection, while the initiating endpoint
    remains protected by Supabase Auth and role checks. No service-role credential is
    exposed to the browser.
    """
    session_factory = get_session_factory()
    try:
        async with session_factory() as session:
            async with session.begin():
                await session.execute(text("select set_config('app.audit_source', 'cuf_analysis', true)"))
                await session.execute(text("select set_config('app.import_reference', :batch_id, true)"), {"batch_id": str(batch_id)})
                claimed = await CUFRepository(session).claim_downstream_analysis(batch_id)
            if not claimed:
                logger.info("CUF downstream batch was already claimed", extra={"batch_id": str(batch_id)})
                return

            async with session.begin():
                await session.execute(text("select set_config('app.audit_source', 'cuf_analysis', true)"))
                await session.execute(text("select set_config('app.import_reference', :batch_id, true)"), {"batch_id": str(batch_id)})
                cuf_repository = CUFRepository(session)
                projects = await cuf_repository.imported_projects(batch_id)
                prediction_service = PredictionService(PredictionRepository(session))
                risk_service = RiskService(RiskRepository(session), get_settings())
                warning_service = WarningAutomationService(WarningRepository(session), get_settings())
                results: list[dict[str, Any]] = []

                for project_id in projects:
                    project_result: dict[str, Any] = {"project_id": project_id, "predictions": {}}
                    for prediction_type, operation in (
                        ("cost", prediction_service.predict_cost_overrun),
                        ("schedule", prediction_service.predict_schedule_overrun),
                    ):
                        try:
                            output = await operation(project_id)
                            project_result["predictions"][prediction_type] = {
                                "status": "generated",
                                "model_version": output.get("model_version"),
                            }
                        except AppError as exc:
                            # Deterministic risk and warning evaluation must still run when
                            # a model is not trained or the project lacks eligible features.
                            project_result["predictions"][prediction_type] = {
                                "status": "unavailable",
                                "code": exc.code,
                                "message": exc.message,
                            }

                    risk = await risk_service.assess_project(project_id)
                    project_result["risk"] = {
                        "overall_score": risk["overall_score"],
                        "risk_level": risk["risk_level"],
                    }
                    project_result["warnings"] = await warning_service.evaluate_project(project_id)
                    results.append(project_result)

                await cuf_repository.finish_downstream_analysis(batch_id, {
                    "projects_processed": len(results),
                    "projects": results,
                })
        logger.info("CUF downstream analysis completed", extra={"batch_id": str(batch_id)})
    except Exception as exc:
        logger.exception("CUF downstream analysis failed", extra={"batch_id": str(batch_id)})
        try:
            async with session_factory() as failure_session:
                async with failure_session.begin():
                    await failure_session.execute(text("select set_config('app.audit_source', 'cuf_analysis', true)"))
                    await failure_session.execute(text("select set_config('app.import_reference', :batch_id, true)"), {"batch_id": str(batch_id)})
                    await CUFRepository(failure_session).fail_downstream_analysis(batch_id, str(exc))
        except Exception:
            logger.exception("Unable to persist CUF downstream failure", extra={"batch_id": str(batch_id)})
