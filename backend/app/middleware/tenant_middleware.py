"""
Tenant Middleware — extracts tenant slug from subdomain on every request.

Local:      http://demo.localhost:3000  → slug = "demo"
Production: https://demo.platform.com  → slug = "demo"

Sets request.state.tenant_slug so all downstream code can use it.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

# Paths that work WITHOUT a tenant (platform-level)
_NO_TENANT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        slug: str | None = None

        # 1. Preferred: explicit X-Tenant-Slug header. The SPA frontend calls the
        #    API on a fixed origin (localhost:8001) so the browser's subdomain is
        #    lost from Host — the frontend forwards it in this header instead.
        header_slug = request.headers.get("x-tenant-slug", "").strip()
        if header_slug:
            slug = header_slug
        else:
            # 2. Fallback: derive from the Host subdomain (direct API access / curl).
            host = request.headers.get("host", "")
            hostname = host.split(":")[0]  # strip port
            platform = settings.PLATFORM_DOMAIN  # e.g. "localhost" or "platform.com"

            if hostname == platform or hostname == f"www.{platform}":
                slug = None  # root domain — platform-level (no tenant)
            elif hostname.endswith(f".{platform}"):
                slug = hostname[: -(len(platform) + 1)]  # subdomain → slug
            else:
                slug = None  # unknown host — no tenant

        request.state.tenant_slug = slug

        # Allow health + docs without tenant
        if request.url.path in _NO_TENANT_PATHS:
            return await call_next(request)

        return await call_next(request)
