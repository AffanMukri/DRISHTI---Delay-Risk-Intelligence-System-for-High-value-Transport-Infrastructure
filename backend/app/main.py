from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.auth.token import auth_client
from app.config import get_settings
from app.database import dispose_engine
from app.errors import register_exception_handlers
from app.logging_config import configure_logging
from app.middleware import RequestContextMiddleware


configure_logging()
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await auth_client.close()
    await dispose_engine()


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Authenticated project monitoring, CUF ingestion, risk, analytics, reporting, warning, and intervention API for DRISHTI.",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    application.add_middleware(RequestContextMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=[
            "X-Request-ID",
            "Content-Disposition",
            "X-Report-ID",
            "X-Report-Checksum-SHA256",
            "X-Data-As-Of",
        ],
    )
    register_exception_handlers(application)
    application.include_router(api_router, prefix=settings.api_prefix)
    return application


app = create_app()
