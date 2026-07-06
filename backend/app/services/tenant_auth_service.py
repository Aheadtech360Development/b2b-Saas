"""
Multi-tenant Auth Service.
Handles login/register scoped to a specific tenant (by tenant_id).
Platform admins (tenant_id=None) can log in from the root domain.
"""
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AccountSuspendedError, UnauthorizedError
from app.core.redis import redis_delete, redis_get, redis_set
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.schemas.auth import LoginResponse, TokenRefreshResponse

REFRESH_TOKEN_EXPIRE_DAYS = 7


def _build_claims(user_row: dict) -> dict:
    """Build JWT extra claims from user dict."""
    return {
        "tenant_id": str(user_row["tenant_id"]) if user_row["tenant_id"] else None,
        "role": user_row["role"],
        "is_platform_admin": user_row["is_platform_admin"],
        "is_admin": user_row["role"] in ("tenant_admin", "platform_admin"),
    }


class TenantAuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def login(
        self,
        email: str,
        password: str,
        tenant_id: uuid.UUID | None,
    ) -> tuple[LoginResponse, str]:
        """
        Authenticate a user within a tenant.
        tenant_id=None → platform admin login (root domain).
        Returns (LoginResponse, refresh_token).
        """
        from sqlalchemy import text

        if tenant_id is None:
            # Platform admin — no tenant scope
            result = await self.db.execute(
                text("SELECT * FROM users WHERE email=:e AND tenant_id IS NULL AND is_platform_admin=true"),
                {"e": email.lower()},
            )
        else:
            result = await self.db.execute(
                text("SELECT * FROM users WHERE email=:e AND tenant_id=:t"),
                {"e": email.lower(), "t": str(tenant_id)},
            )

        row = result.mappings().first()

        if not row or not verify_password(password, row["hashed_password"] or ""):
            raise UnauthorizedError("Invalid email or password")

        if not row["is_active"]:
            raise AccountSuspendedError()

        user_id = str(row["id"])
        claims = _build_claims(dict(row))

        access_token = create_access_token(subject=user_id, extra_claims=claims)
        refresh_token = create_refresh_token(subject=user_id)

        # Store refresh token in Redis (7 days TTL)
        await redis_set(
            f"refresh:{user_id}:{refresh_token[-10:]}",
            refresh_token,
            expire=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        )

        # Update last_login
        await self.db.execute(
            text("UPDATE users SET last_login=now() WHERE id=:id"),
            {"id": user_id},
        )
        await self.db.commit()

        return LoginResponse(access_token=access_token, token_type="bearer"), refresh_token

    async def get_profile(self, user_id: str) -> dict:
        from sqlalchemy import text
        result = await self.db.execute(
            text("SELECT id, tenant_id, email, first_name, last_name, role, is_platform_admin, is_active FROM users WHERE id=:id"),
            {"id": user_id},
        )
        row = result.mappings().first()
        if not row:
            raise UnauthorizedError("User not found")
        return dict(row)

    async def refresh_tokens(self, refresh_token: str) -> tuple[TokenRefreshResponse, str]:
        from jose import JWTError
        try:
            payload = decode_token(refresh_token)
        except JWTError:
            raise UnauthorizedError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise UnauthorizedError("Invalid token")

        from sqlalchemy import text
        result = await self.db.execute(
            text("SELECT * FROM users WHERE id=:id AND is_active=true"),
            {"id": user_id},
        )
        row = result.mappings().first()
        if not row:
            raise UnauthorizedError("User not found or inactive")

        claims = _build_claims(dict(row))
        new_access = create_access_token(subject=user_id, extra_claims=claims)
        new_refresh = create_refresh_token(subject=user_id)

        return TokenRefreshResponse(access_token=new_access, token_type="bearer"), new_refresh
