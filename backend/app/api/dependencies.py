from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session, get_public_db_session
from app.config import get_settings
from app.repositories.analytics import AnalyticsRepository
from app.repositories.audit import AuditRepository
from app.repositories.assistant import AssistantRepository
from app.repositories.cuf import CUFRepository
from app.repositories.dependencies import DependencyRepository
from app.repositories.evidence import EvidenceRepository
from app.repositories.experiments import ExperimentRepository
from app.repositories.interventions import InterventionRepository
from app.repositories.model_monitoring import ModelMonitoringRepository
from app.repositories.portfolio import PortfolioRepository
from app.repositories.predictions import PredictionRepository
from app.repositories.projects import ProjectRepository
from app.repositories.reports import ReportRepository
from app.repositories.risks import RiskRepository
from app.repositories.warnings import WarningRepository
from app.services.analytics import AnalyticsService
from app.services.audit import AuditService
from app.services.assistant import AssistantDocumentService, AssistantService
from app.services.cuf import CUFService
from app.services.dependencies import DependencyService
from app.services.evidence import EvidenceService
from app.services.experiments import ExperimentService
from app.services.health import HealthService
from app.services.interventions import InterventionService
from app.services.model_monitoring import ModelMonitoringService
from app.services.portfolio import PortfolioService
from app.services.predictions import PredictionService
from app.services.projects import ProjectService
from app.services.reports import ReportService
from app.services.risks import RiskService
from app.services.scenarios import ScenarioService
from app.services.warnings import WarningService
from app.workflows.cuf_analysis import run_cuf_analysis_batch


def get_health_service() -> HealthService:
    return HealthService()


def get_project_service(session: AsyncSession = Depends(get_db_session)) -> ProjectService:
    return ProjectService(ProjectRepository(session), get_settings())


def get_public_project_service(session: AsyncSession = Depends(get_public_db_session)) -> ProjectService:
    return ProjectService(ProjectRepository(session), get_settings())


def get_portfolio_service(session: AsyncSession = Depends(get_db_session)) -> PortfolioService:
    return PortfolioService(PortfolioRepository(session), get_settings())


def get_analytics_service(session: AsyncSession = Depends(get_db_session)) -> AnalyticsService:
    return AnalyticsService(AnalyticsRepository(session))


def get_audit_service(session: AsyncSession = Depends(get_db_session)) -> AuditService:
    return AuditService(AuditRepository(session))


def get_assistant_service(session: AsyncSession = Depends(get_db_session)) -> AssistantService:
    settings = get_settings()
    return AssistantService(AssistantRepository(session), AnalyticsRepository(session), settings)


def get_assistant_document_service(
    session: AsyncSession = Depends(get_db_session),
) -> AssistantDocumentService:
    settings = get_settings()
    return AssistantDocumentService(AssistantRepository(session), settings)


def get_risk_service(session: AsyncSession = Depends(get_db_session)) -> RiskService:
    return RiskService(RiskRepository(session), get_settings())


def get_warning_service(session: AsyncSession = Depends(get_db_session)) -> WarningService:
    return WarningService(WarningRepository(session))


def get_intervention_service(session: AsyncSession = Depends(get_db_session)) -> InterventionService:
    return InterventionService(InterventionRepository(session))


def get_prediction_service(session: AsyncSession = Depends(get_db_session)) -> PredictionService:
    return PredictionService(PredictionRepository(session))


def get_scenario_service(session: AsyncSession = Depends(get_db_session)) -> ScenarioService:
    return ScenarioService(PredictionRepository(session), RiskRepository(session), get_settings())


def get_cuf_service(session: AsyncSession = Depends(get_db_session)) -> CUFService:
    return CUFService(CUFRepository(session))


def get_dependency_service(session: AsyncSession = Depends(get_db_session)) -> DependencyService:
    return DependencyService(DependencyRepository(session))


def get_evidence_service(session: AsyncSession = Depends(get_db_session)) -> EvidenceService:
    return EvidenceService(EvidenceRepository(session))


def get_experiment_service(session: AsyncSession = Depends(get_db_session)) -> ExperimentService:
    return ExperimentService(ExperimentRepository(session), PredictionRepository(session), get_settings())


def get_model_monitoring_service(
    session: AsyncSession = Depends(get_db_session),
) -> ModelMonitoringService:
    return ModelMonitoringService(ModelMonitoringRepository(session), get_settings())


def get_report_service(session: AsyncSession = Depends(get_db_session)) -> ReportService:
    return ReportService(ReportRepository(session))


def get_cuf_analysis_runner():
    return run_cuf_analysis_batch
