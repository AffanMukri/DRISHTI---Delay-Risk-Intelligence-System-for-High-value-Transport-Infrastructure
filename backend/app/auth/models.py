from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr


AppRole = Literal["administrator", "executive", "monitoring_officer", "analyst"]


class AuthUser(BaseModel):
    id: UUID
    email: EmailStr | None = None
    access_token: str


class CurrentProfile(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str | None = None
    role: AppRole
    is_active: bool

