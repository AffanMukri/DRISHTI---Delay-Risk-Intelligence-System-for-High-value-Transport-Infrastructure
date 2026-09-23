from collections.abc import AsyncIterator
from functools import lru_cache

from fastapi import Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.auth.models import AuthUser
from app.auth.token import get_current_user
from app.config import get_settings
from app.errors import ConfigurationError
from app.logging_config import request_id_context


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    try:
        database_url = settings.sqlalchemy_database_url
    except ValueError as exc:
        raise ConfigurationError(str(exc)) from exc
    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_seconds,
    )


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False, autoflush=False)


async def get_db_session(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
) -> AsyncIterator[AsyncSession]:
    """Create one transaction and apply the caller's Supabase RLS identity."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        async with session.begin():
            await session.execute(text("set local role authenticated"))
            await session.execute(
                text("select set_config('request.jwt.claim.sub', :user_id, true)"),
                {"user_id": str(current_user.id)},
            )
            context = {
                "request_id": request_id_context.get(),
                "audit_source": "api",
                "user_agent": (request.headers.get("user-agent") or "")[:512],
                "client_ip": request.client.host if request.client else "",
            }
            for key, value in context.items():
                await session.execute(
                    text("select set_config(:key, :value, true)"),
                    {"key": f"app.{key}", "value": value},
                )
            yield session


async def get_public_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Anonymous read-only transaction limited to explicitly granted public views."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        async with session.begin():
            await session.execute(text("set transaction read only"))
            await session.execute(text("set local role anon"))
            await session.execute(
                text("select set_config('app.request_id', :value, true)"),
                {"value": request_id_context.get()},
            )
            yield session


async def dispose_engine() -> None:
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
        get_session_factory.cache_clear()
        get_engine.cache_clear()
