"""JWT authentication middleware and rate limiting."""
import time

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select, text as _sa_text
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.database import AsyncSessionLocal
from app.core.redis import redis_exists, redis_increment
from app.core.security import decode_token
from app.models.company import Company

# Paths that do not require authentication
PUBLIC_PATHS = {
    # ── Legacy single-tenant auth ──────────────────────────────────────────
    "/api/v1/login",
    "/api/v1/register-wholesale",
    "/api/v1/forgot-password",
    "/api/v1/reset-password",
    "/api/v1/refresh",
    "/api/v1/activate-account",
    "/api/v1/resend-activation",
    "/api/v1/validate-activation-token",
    # ── New multi-tenant auth ──────────────────────────────────────────────
    "/api/v1/auth/login",
    "/api/v1/auth/logout",
    "/api/v1/auth/refresh",
    # ── Public content ─────────────────────────────────────────────────────
    "/api/v1/products",
    "/api/v1/products/categories",
    "/api/v1/shipping/live-rates",
    "/api/v1/shipping/shipping-type",
    "/api/v1/webhooks/stripe",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}

RATE_LIMIT_PATHS = {"/api/v1/auth/"}
RATE_LIMIT_MAX = 100  # requests per minute


async def require_admin(request: Request) -> None:
    """FastAPI dependency: raises 403 if the authenticated user is not an admin."""
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Admin access required"},
        )


async def _feature_gate(request, path: str, *, public: bool):
    """403 when this brand's plan does not include what the path needs."""
    from app.core.features import feature_for_path

    feature = feature_for_path(path, public=public)
    if feature is None:
        return None
    tenant_id = getattr(request.state, "tenant_id", None)
    slug = getattr(request.state, "tenant_slug", None)
    if not tenant_id and not slug:
        return None
    try:
        from sqlalchemy import text as _text

        from app.core.database import AsyncSessionLocal
        from app.core.tenant_context import set_bypass_scoping
        from app.services import entitlements

        set_bypass_scoping(True)
        try:
            async with AsyncSessionLocal() as db:
                if not tenant_id:
                    # A shopper with no account still belongs to a shop, and
                    # that shop's plan is what decides — the gang sheet builder
                    # is open to guests, so gating only signed-in requests
                    # would gate nobody who actually uses it.
                    tenant_id = (await db.execute(
                        _text("SELECT id FROM tenants WHERE slug = :s AND status = 'active'"),
                        {"s": slug},
                    )).scalar()
                    if not tenant_id:
                        return None
                if await entitlements.enabled(db, tenant_id, feature):
                    return None
        finally:
            set_bypass_scoping(False)
    except Exception:
        return None  # a lookup that fails must not take the shop down

    from app.core.features import LABELS

    return JSONResponse(
        status_code=403,
        content={"error": {
            "code": "FEATURE_NOT_IN_PLAN",
            "message": f"{LABELS.get(feature, feature)} is not part of this store's plan.",
        }},
    )


class AuthMiddleware(BaseHTTPMiddleware):
    """Decode JWT, inject user state, enforce rate limiting on public endpoints."""

    async def dispatch(self, request: Request, call_next: any) -> Response:
        # OPTIONS preflight requests must pass through without auth checks so
        # that CORS headers (added by the outermost CORSMiddleware) are returned.
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        # ── T209: Rate limiting (non-public paths only, 100 req/min per IP) ────
        is_unauthenticated = not request.headers.get("Authorization", "").startswith("Bearer ")
        skip_rate_limit = self._is_public(path) or any(
            path.startswith(p) for p in ["/docs", "/redoc", "/openapi", "/health"]
        )
        if is_unauthenticated and not skip_rate_limit:
            client_ip = request.client.host if request.client else "unknown"
            rate_key = f"rate_limit:{client_ip}:{int(time.time() // 60)}"
            try:
                count = await redis_increment(rate_key, expire=60)
                if count > RATE_LIMIT_MAX:
                    return JSONResponse(
                        status_code=429,
                        content={"error": {"code": "RATE_LIMITED", "message": "Too many requests. Please retry after 60 seconds."}},
                        headers={"Retry-After": "60"},
                    )
            except Exception:
                pass  # Redis unavailable — skip rate limiting rather than blocking requests

        # ── Skip auth for public paths ────────────────────────────────────────
        # For public product/review routes: if a valid Bearer token is present,
        # inject user state so pricing middleware can return tier pricing.
        # If no token or invalid token, pass through silently as a guest.
        if self._is_public(path):
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1]
                try:
                    payload = decode_token(token)
                    if payload.get("type") == "access":
                        jti = payload.get("jti")
                        if not (jti and await redis_exists(f"blacklist:{jti}")):
                            request.state.user_id = payload.get("sub")
                            request.state.is_admin = payload.get("is_admin", False)
                            request.state.company_id = payload.get("company_id")
                            request.state.pricing_tier_id = payload.get("pricing_tier_id")
                            request.state.company_role = payload.get("company_role")
                            request.state.account_type = payload.get("account_type", "wholesale")
                except (JWTError, Exception):
                    pass  # Invalid/expired token — treat as guest, don't block

            # A public path can still belong to a feature the shop's plan does
            # not include. The gang sheet builder is open to guests, so gating
            # only the signed-in half of it would gate almost nobody.
            denied = await _feature_gate(request, path, public=True)
            if denied is not None:
                return denied
            return await call_next(request)

        # ── Extract Bearer token ──────────────────────────────────────────────
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"error": {"code": "UNAUTHORIZED", "message": "Authentication required"}},
            )

        token = auth_header.split(" ", 1)[1]

        try:
            payload = decode_token(token)
        except JWTError:
            return JSONResponse(
                status_code=401,
                content={"error": {"code": "INVALID_TOKEN", "message": "Token is invalid or expired"}},
            )

        if payload.get("type") != "access":
            return JSONResponse(
                status_code=401,
                content={"error": {"code": "WRONG_TOKEN_TYPE", "message": "Access token required"}},
            )

        # ── Check if token is blacklisted (logged out) ────────────────────────
        jti = payload.get("jti")
        if jti and await redis_exists(f"blacklist:{jti}"):
            return JSONResponse(
                status_code=401,
                content={"error": {"code": "TOKEN_REVOKED", "message": "Token has been revoked"}},
            )

        # ── Inject user info into request state ───────────────────────────────
        request.state.user_id = payload.get("sub")
        request.state.is_admin = payload.get("is_admin", False)
        request.state.is_platform_admin = payload.get("is_platform_admin", False)
        request.state.tenant_id = payload.get("tenant_id")
        request.state.role = payload.get("role")
        request.state.scopes = payload.get("scopes")          # custom role scopes, or None
        request.state.read_only = payload.get("read_only", False)
        request.state.company_id = payload.get("company_id")
        request.state.pricing_tier_id = payload.get("pricing_tier_id")
        request.state.company_role = payload.get("company_role")
        request.state.account_type = payload.get("account_type", "wholesale")

        # ── Company suspension check ──────────────────────────────────────────
        company_id = request.state.company_id
        if company_id and not request.state.is_admin:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Company.status).where(Company.id == company_id)
                )
                company_status = result.scalar_one_or_none()
            if company_status == "suspended":
                return JSONResponse(
                    status_code=403,
                    content={"error": {"code": "ACCOUNT_SUSPENDED", "message": "Your account has been suspended"}},
                )

        # ── Admin-only path enforcement ───────────────────────────────────────
        if path.startswith("/api/v1/admin/") and not request.state.is_admin:
            return JSONResponse(
                status_code=403,
                content={"error": {"code": "FORBIDDEN", "message": "Admin access required"}},
            )

        # ── Role-based (RBAC) enforcement for admin sections ───────────────────
        if path.startswith("/api/v1/admin/"):
            from app.core.permissions import can_access

            # Take the permissions from the database rather than the token.
            # A token is minted at login and lives for hours: without this,
            # taking somebody's access away would not take effect until it
            # expired, and the whole point of an access control screen is that
            # it works now. Cached briefly, so this costs one query per user
            # per half-minute rather than one per request.
            role, scopes, read_only = await _live_permissions(
                getattr(request.state, "user_id", None),
                request.state.role,
                getattr(request.state, "scopes", None),
                getattr(request.state, "read_only", False),
            )
            request.state.role = role
            request.state.scopes = scopes
            request.state.read_only = read_only

            if not can_access(role, path, request.method,
                              scopes=scopes, read_only=read_only):
                return JSONResponse(
                    status_code=403,
                    content={"error": {"code": "FORBIDDEN", "message": "Your role does not allow this action"}},
                )

            # ── What this brand's plan actually includes ──────────────────
            # Checked here, with the permissions, so a feature switched off in
            # the platform console cannot still be reached through the API.
            # The platform's own console is exempt: that is where features are
            # switched, and gating it with them could lock the operator out.
            if not getattr(request.state, "is_platform_admin", False):
                denied = await _feature_gate(request, path, public=False)
                if denied is not None:
                    return denied

        # The same for a signed-in shopper on a path that is not public.
        elif path.startswith("/api/v1/"):
            denied = await _feature_gate(request, path, public=True)
            if denied is not None:
                return denied
        # Platform-admin-only paths
        if path.startswith("/api/v1/platform/") and not request.state.is_platform_admin:
            return JSONResponse(
                status_code=403,
                content={"error": {"code": "FORBIDDEN", "message": "Platform admin access required"}},
            )

        return await call_next(request)

    def _is_public(self, path: str) -> bool:
        if path in PUBLIC_PATHS:
            return True
        # All new multi-tenant auth paths are public
        if path.startswith("/api/v1/auth/"):
            return True
        # Allow GET /api/v1/products/* and /api/v1/reviews/* for guests
        if path.startswith("/api/v1/products"):
            return True
        if path.startswith("/api/v1/reviews"):
            return True
        # Guest checkout and order tracking — no auth required
        if path.startswith("/api/v1/guest"):
            return True
        # Google sends the browser back here after sign-in. It is a redirect, so
        # it carries no admin token; the signed `state` identifies the brand and
        # is verified by the handler before anything is stored.
        if path == "/api/v1/integrations/google-reviews/callback":
            return True
        # Storefront branding — public so the store chrome renders for guests
        if path.startswith("/api/v1/storefront"):
            return True
        # Card tokenization — guests need this too (card-save is skipped when no company_id)
        if path == "/api/v1/checkout/tokenize":
            return True
        # Which ways the store can be paid — asked before anyone signs in, so a
        # shopper is not offered a card the store cannot take.
        if path == "/api/v1/checkout/payment-options":
            return True
        # Public content pages — no auth required
        if path.startswith("/api/v1/style-sheets"):
            return True
        if path.startswith("/api/v1/product-specs"):
            return True
        # Tax rate + ZipTax calculate/test — needed for guest checkout and debugging
        if path.startswith("/api/v1/tax-rate"):
            return True
        if path.startswith("/api/v1/tax/"):
            return True
        # Page SEO metadata — needed for SSR on all public pages
        if path.startswith("/api/v1/pages-seo"):
            return True
        # Blog posts — public listing and detail
        if path.startswith("/api/v1/blog-posts"):
            return True
        # The gang sheet builder, open to anybody.
        #
        # A sheet is ordered the way everything else here is ordered: no
        # account. What identifies a job is the email the buyer gives it —
        # every message about the job goes there — and coming back to one
        # needs its id, which is a random uuid nobody is given but its owner.
        # The buyer's own list of jobs still needs an account, because that is
        # a list of everything they have ever sent and only a signed-in person
        # may have it.
        if path.startswith("/api/v1/gang-sheets/") and not path.startswith("/api/v1/gang-sheets/my-"):
            return True
        if path == "/api/v1/gang-sheets/sizes":
            return True
        # The artwork a buyer is ordering. Nobody needs an account to order,
        # so nobody needs one to hand over the file being printed. The
        # endpoint's own rate limit and its extension allow-list are what keep
        # it from being a free file host.
        if path == "/api/v1/upload/artwork":
            return True
        # Invoice summary — public for pay-now email link access
        if path.endswith('/invoice-summary'):
            return True
        return False

# How long a user's permissions may lag behind a change. Short enough that
# revoking access is effectively immediate, long enough that a busy admin
# session is not one extra query per request.
_PERM_TTL_SECONDS = 30
_perm_cache: dict[str, tuple[float, str, object, bool]] = {}


async def _live_permissions(user_id, token_role, token_scopes, token_read_only):
    """This user's role and permissions as they stand now.

    Falls back to what the token says if the lookup fails: a database blip
    should not lock every admin out, and the token was signed by us, so it is
    the last thing we knew to be true rather than something a client chose.
    """
    import time as _time

    if not user_id:
        return token_role, token_scopes, token_read_only

    key = str(user_id)
    hit = _perm_cache.get(key)
    now = _time.monotonic()
    if hit and now - hit[0] < _PERM_TTL_SECONDS:
        return hit[1], hit[2], hit[3]

    try:
        async with AsyncSessionLocal() as session:
            row = (await session.execute(
                _sa_text("""
                    SELECT u.role, u.is_active, r.scopes, r.read_only
                    FROM users u
                    LEFT JOIN custom_roles r ON r.id = u.custom_role_id
                    WHERE u.id = CAST(:uid AS uuid)
                """),
                {"uid": key},
            )).mappings().first()
    except Exception:
        return token_role, token_scopes, token_read_only

    if not row:
        return token_role, token_scopes, token_read_only
    if not row["is_active"]:
        # A deactivated account keeps a valid token until it expires. Nothing
        # it can reach should be an admin section.
        return "", {}, True

    scopes = row["scopes"]
    if scopes is None:
        resolved = (row["role"], None, False)
    else:
        resolved = (row["role"],
                    dict(scopes) if isinstance(scopes, dict) else list(scopes),
                    bool(row["read_only"]))

    _perm_cache[key] = (now, *resolved)
    return resolved


def forget_permissions(user_id) -> None:
    """Drop a user's cached permissions — called when their access changes, so
    the change lands on their very next request rather than up to 30s later."""
    _perm_cache.pop(str(user_id), None)
