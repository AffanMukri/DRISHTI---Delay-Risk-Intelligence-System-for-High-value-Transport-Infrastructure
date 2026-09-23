from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel


class AuditActor(APIModel):
    id: UUID | None = None
    email: str | None = None
    full_name: str | None = None
    role: str | None = None


class AuditProject(APIModel):
    id: UUID
    project_code: str
    name: str


class AuditLogItem(APIModel):
    id: UUID
    actor: AuditActor
    project: AuditProject | None = None
    action: str
    entity_type: str
    entity_id: UUID | None = None
    table_name: str | None = None
    record_key: str | None = None
    old_values: dict[str, Any] | None = None
    new_values: dict[str, Any] | None = None
    source: str
    request_reference: str | None = None
    import_reference: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    metadata: dict[str, Any]
    event_version: int = Field(ge=1)
    occurred_at: datetime


class AuditLogListResponse(APIModel):
    items: list[AuditLogItem]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class AuditFilterActor(APIModel):
    id: UUID
    email: str
    full_name: str | None = None


class AuditFilterOptions(APIModel):
    actions: list[str]
    entity_types: list[str]
    sources: list[str]
    actors: list[AuditFilterActor]


class SecurityAuditMetadata(APIModel):
    client: str = Field(default="dhristi-web", min_length=1, max_length=64)


class SecurityAuditEventRequest(APIModel):
    action: Literal["login_success", "logout_requested"]
    metadata: SecurityAuditMetadata = Field(default_factory=SecurityAuditMetadata)


class SecurityAuditEventResponse(APIModel):
    audit_id: UUID
