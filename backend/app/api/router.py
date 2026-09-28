from fastapi import APIRouter

from app.api.routes import analytics, audit, cuf, dependencies, evidence, health, interventions, portfolio, projects, public_projects, risks, warnings
from app.config import get_settings


api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(public_projects.router)
api_router.include_router(projects.router)
api_router.include_router(dependencies.router)
api_router.include_router(portfolio.router)
api_router.include_router(analytics.router)
api_router.include_router(audit.router)
api_router.include_router(risks.router)
api_router.include_router(warnings.router)
api_router.include_router(interventions.router)
api_router.include_router(evidence.router)
api_router.include_router(cuf.router)

if get_settings().serverless_core_runtime:
    from app.api.routes import runtime_unavailable

    api_router.include_router(runtime_unavailable.router)
else:
    from app.api.routes import assistant, experiments, model_monitoring, predictions, reports

    api_router.include_router(assistant.router)
    api_router.include_router(predictions.router)
    api_router.include_router(experiments.router)
    api_router.include_router(model_monitoring.router)
    api_router.include_router(reports.router)
