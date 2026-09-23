from __future__ import annotations

import asyncio
import os
from datetime import date, timedelta
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.loop import compatible_loop_factory
from app.repositories.analytics import AnalyticsRepository
from app.repositories.interventions import InterventionRepository
from app.repositories.portfolio import PortfolioRepository
from app.repositories.predictions import PredictionRepository
from app.repositories.projects import ProjectRepository
from app.repositories.risks import RiskRepository
from app.repositories.warnings import WarningRepository
from app.schemas.intervention import InterventionCreate, InterventionPatch
from app.services.interventions import InterventionService


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
TEST_USER_ID = UUID(os.getenv("TEST_USER_ID", "11111111-1111-1111-1111-111111111111"))


def async_database_url(value: str) -> str:
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    return value


@pytest.mark.integration
@pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not configured")
def test_all_repository_queries_against_migrated_database() -> None:
    with asyncio.Runner(loop_factory=compatible_loop_factory) as runner:
        runner.run(exercise_repositories())


async def exercise_repositories() -> None:
    engine = create_async_engine(async_database_url(TEST_DATABASE_URL or ""), pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as session:
            assert isinstance(session, AsyncSession)
            transaction = await session.begin()
            try:
                await session.execute(text("set local role authenticated"))
                await session.execute(
                    text("select set_config('request.jwt.claim.sub', :user_id, true)"),
                    {"user_id": str(TEST_USER_ID)},
                )

                projects = ProjectRepository(session)
                project_rows, project_total = await projects.list(
                    search=None,
                    ministry=None,
                    sector=None,
                    status=None,
                    limit=10,
                    offset=0,
                )
                assert project_total >= 1
                project_code = project_rows[0]["id"]
                project = await projects.get(project_code)
                assert project is not None
                await projects.get_milestones(project["database_id"])
                history = await projects.get_history(project["database_id"])
                assert set(history) == {"monthly_updates", "cost_history", "schedule_history"}

                portfolio = await PortfolioRepository(session).summary()
                assert portfolio["total_projects"] == project_total

                analytics = AnalyticsRepository(session)
                assert (await analytics.cost())["summary"]
                assert (await analytics.schedule())["summary"]
                assert (await analytics.benchmark())["breakdown"]

                risks = RiskRepository(session)
                risk_rows = await risks.list(risk_level=None, current_only=True)
                assert risk_rows
                assert await risks.get_for_project(project_code)

                warnings = WarningRepository(session)
                warning_rows = await warnings.list(status=None, severity=None)
                assert warning_rows
                assert await warnings.acknowledge(warning_rows[0]["id"], TEST_USER_ID)

                predictions_project, prediction_rows = await PredictionRepository(session).for_project(project_code)
                assert predictions_project == project_code
                assert isinstance(prediction_rows, list)

                interventions = InterventionRepository(session)
                existing_interventions = await interventions.list(status=None, priority=None)
                assert existing_interventions

                service = InterventionService(interventions)
                created = await service.create(
                    InterventionCreate(
                        project_id=project_code,
                        issue="Integration test issue",
                        recommended_action="Verify repository and rollback transaction",
                        priority="low",
                        due_date=date.today() + timedelta(days=7),
                    ),
                    TEST_USER_ID,
                )
                updated = await service.update(
                    str(created["id"]),
                    InterventionPatch(status="in_progress", notes="Repository integration verified."),
                    TEST_USER_ID,
                )
                assert updated["status"] == "in_progress"
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()
