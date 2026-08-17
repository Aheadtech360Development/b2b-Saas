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


# Roles that can access the admin panel (staff roles). 'buyer' is a customer.
# 'tenant_custom' = a user on a tenant-defined custom role (scopes in the token).
_ADMIN_PANEL_ROLES = {
    "platform_admin", "tenant_admin", "tenant_manager",
    "tenant_editor", "tenant_fulfillment", "tenant_viewer", "tenant_custom",
}


def _build_claims(user_row: dict, scopes: list | None = None, read_only: bool = False) -> dict:
    """Build JWT extra claims from user dict. When the user is on a custom role,
    `scopes` + `read_only` are embedded so enforcement needs no DB lookup."""
    role = user_row["role"]
    claims = {
        "tenant_id": str(user_row["tenant_id"]) if user_row["tenant_id"] else None,
        "role": role,
        "is_platform_admin": user_row["is_platform_admin"],
        "is_admin": role in _ADMIN_PANEL_ROLES or scopes is not None,
    }
    if scopes is not None:
        claims["scopes"] = list(scopes)
        claims["read_only"] = bool(read_only)
    return claims


async def _resolve_custom_scopes(db, user_row: dict) -> tuple[list | None, bool]:
    """If the user is on a custom role, return (scopes, read_only); else (None, False)."""
    cr_id = user_row.get("custom_role_id")
    if not cr_id:
        return None, False
    from sqlalchemy import text as _text
    row = (await db.execute(
        _text("SELECT scopes, read_only FROM custom_roles WHERE id = :id"),
        {"id": str(cr_id)},
    )).mappings().first()
    if not row:
        return None, False
    return list(row["scopes"] or []), bool(row["read_only"])


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
        _scopes, _read_only = await _resolve_custom_scopes(self.db, dict(row))
        claims = _build_claims(dict(row), _scopes, _read_only)

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

        _scopes, _read_only = await _resolve_custom_scopes(self.db, dict(row))
        claims = _build_claims(dict(row), _scopes, _read_only)
        new_access = create_access_token(subject=user_id, extra_claims=claims)
        new_refresh = create_refresh_token(subject=user_id)

        return TokenRefreshResponse(access_token=new_access, token_type="bearer"), new_refresh
