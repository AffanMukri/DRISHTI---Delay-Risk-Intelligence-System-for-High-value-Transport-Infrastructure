from collections.abc import Callable

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AppRole, AuthUser, CurrentProfile
from app.auth.token import get_current_user
from app.database import get_db_session
from app.errors import AuthenticationError, AuthorizationError


async def get_current_profile(
    current_user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CurrentProfile:
    result = await session.execute(
        text(
            """
            select id, email, full_name, role::text as role, is_active
            from public.profiles
            where id = :user_id
            """
        ),
        {"user_id": current_user.id},
    )
    row = result.mappings().one_or_none()
    if row is None or not row["is_active"]:
        raise AuthenticationError("The account profile is missing or inactive.")
    return CurrentProfile.model_validate(dict(row))


def require_roles(*allowed_roles: AppRole) -> Callable[..., CurrentProfile]:
    async def role_dependency(
        profile: CurrentProfile = Depends(get_current_profile),
    ) -> CurrentProfile:
        if profile.role not in allowed_roles:
            raise AuthorizationError()
        return profile

    return role_dependency

