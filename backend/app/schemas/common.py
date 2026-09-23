from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )


class MessageResponse(APIModel):
    message: str


class HealthResponse(APIModel):
    status: str
    service: str
    version: str
    environment: str
    database: str
    timestamp: datetime


class ErrorDetail(APIModel):
    code: str
    message: str
    details: Any = None
    request_id: str


class ErrorResponse(APIModel):
    error: ErrorDetail

