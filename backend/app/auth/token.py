import logging

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.models import AuthUser
from app.config import get_settings
from app.errors import AuthenticationError, ConfigurationError


logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False, scheme_name="Supabase access token")


class SupabaseAuthClient:
    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            settings = get_settings()
            self._client = httpx.AsyncClient(timeout=settings.supabase_auth_timeout_seconds)
        return self._client

    async def validate_token(self, access_token: str) -> AuthUser:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_publishable_key:
            raise ConfigurationError("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.")

        url = f"{str(settings.supabase_url).rstrip('/')}/auth/v1/user"
        try:
            response = await self._http().get(
                url,
                headers={
                    "apikey": settings.supabase_publishable_key,
                    "Authorization": f"Bearer {access_token}",
                },
            )
        except httpx.HTTPError as exc:
            logger.warning("Supabase Auth validation unavailable", exc_info=exc)
            raise AuthenticationError("Authentication service is temporarily unavailable.") from exc

        if response.status_code != 200:
            raise AuthenticationError("The access token is invalid or expired.")

        payload = response.json()
        return AuthUser(id=payload["id"], email=payload.get("email"), access_token=access_token)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


auth_client = SupabaseAuthClient()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError()
    return await auth_client.validate_token(credentials.credentials)

