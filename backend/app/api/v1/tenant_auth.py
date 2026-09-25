"""
Multi-tenant Auth Router.
Replaces the old single-tenant auth for login/profile/refresh.
Mounted at /api/v1/auth/...
"""
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.tenant import get_current_tenant
from app.schemas.auth import LoginRequest, LoginResponse, TokenRefreshResponse
from app.services.tenant_auth_service import TenantAuthService

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
REFRESH_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    response: Response,
    request: Request,
    tenant: dict = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Login scoped to current tenant (detected from subdomain).
    Platform admins login from root domain (no subdomain).
    """
    import uuid
    raw = tenant.get("id")
    tenant_id = (raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))) if raw else None

    from app.core.rate_limit import enforce_rate_limit
    await enforce_rate_limit(request, "login", limit=10, window=900, extra=data.email)
    await enforce_rate_limit(request, "login_ip", limit=30, window=900)

    service = TenantAuthService(db)
    login_resp, refresh_token = await service.login(data.email, data.password, tenant_id)

    # No refresh token yet when a 2FA challenge is returned — set the cookie only
    # once the login is actually complete.
    if refresh_token:
        response.set_cookie(
            key=REFRESH_COOKIE,
            value=refresh_token,
            max_age=REFRESH_MAX_AGE,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
            path="/api/v1/auth/refresh",
            domain=settings.COOKIE_DOMAIN,
        )
    return login_resp


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenRefreshResponse:
    from app.core.exceptions import UnauthorizedError
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        raise UnauthorizedError("Refresh token not found")

    service = TenantAuthService(db)
    token_resp, new_refresh = await service.refresh_tokens(refresh_token)

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=new_refresh,
        max_age=REFRESH_MAX_AGE,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
        path="/api/v1/auth/refresh",
        domain=settings.COOKIE_DOMAIN,
    )
    return token_resp


@router.get("/profile")
async def get_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        from app.core.exceptions import UnauthorizedError
        raise UnauthorizedError("Not authenticated")

    service = TenantAuthService(db)
    return await service.get_profile(str(user_id))


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response) -> None:
    """Sign out — and mean it.

    This deleted the refresh cookie and nothing else, so the access token in
    the tab's hands went on working. That token is good for seven days, so
    "sign out" left a key that opened the account for the rest of the week —
    on a shared machine, in a copied handover link, in anything that had ever
    held it.

    The token is now revoked for exactly as long as it had left to live, and
    the refresh token it would have been renewed with is dropped too.
    """
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth/refresh")

    import time

    from app.core.redis import redis_delete, redis_set
    from app.core.security import decode_token

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = decode_token(auth.split(" ", 1)[1])
            jti = payload.get("jti")
            # However long it had left, and no longer: a blacklist entry that
            # outlives its token is only taking up room.
            ttl = int(payload.get("exp", 0)) - int(time.time())
            if jti and ttl > 0:
                await redis_set(f"blacklist:{jti}", "1", expire=ttl)
            if payload.get("sub"):
                await redis_delete(f"refresh:{payload['sub']}")
        except Exception:  # an expired or unreadable token is already no use
            pass
