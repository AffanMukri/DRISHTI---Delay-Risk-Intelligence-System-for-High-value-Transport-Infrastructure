import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.logging_config import request_id_context


logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "application_error",
        status_code: int = 400,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class AuthenticationError(AppError):
    def __init__(self, message: str = "A valid Supabase access token is required.") -> None:
        super().__init__(message, code="authentication_required", status_code=401)


class AuthorizationError(AppError):
    def __init__(self, message: str = "Your role does not permit this operation.") -> None:
        super().__init__(message, code="insufficient_permissions", status_code=403)


class NotFoundError(AppError):
    def __init__(self, resource: str, identifier: str) -> None:
        super().__init__(
            f"{resource} '{identifier}' was not found.",
            code="not_found",
            status_code=404,
        )


class ConflictError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="conflict", status_code=409)


class ConfigurationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="configuration_error", status_code=503)


def error_payload(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "requestId": request_id_context.get(),
        }
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=jsonable_encoder(error_payload(exc.code, exc.message, exc.details)),
            headers={"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder(error_payload("validation_error", "Request validation failed.", details)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=jsonable_encoder(error_payload("http_error", str(exc.detail))),
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error_handler(_: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.exception("Database operation failed", exc_info=exc)
        constraint_conflict = isinstance(exc, DBAPIError) and getattr(exc.orig, "sqlstate", None) in {
            "23503", "23505", "23514", "23P01",
        }
        status = 409 if constraint_conflict else 503
        code = "conflict" if status == 409 else "database_unavailable"
        message = "The request conflicts with existing data." if status == 409 else "The database is temporarily unavailable."
        return JSONResponse(status_code=status, content=error_payload(code, message))

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled API error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_payload("internal_error", "An unexpected server error occurred."),
        )
