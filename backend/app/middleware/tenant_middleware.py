"""
Tenant Middleware — works out which brand a request belongs to.

Local:      http://demo.localhost:3000     → slug = "demo"
Production: https://demo.platform.com      → slug = "demo"
Own domain: https://shop.example.com       → the brand that address belongs to
Fallback:   ?tenant=demo, carried by the frontend in X-Tenant-Slug

Sets request.state.tenant_slug so all downstream code can use it.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

# Paths that work WITHOUT a tenant (platform-level)
_NO_TENANT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


async def _slug_for_host(host: str) -> str | None:
    """The brand whose own address this is, looked up once a minute."""
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping
    from app.services import tenant_hosts

    if not tenant_hosts.normalise(host):
        return None
    try:
        set_bypass_scoping(True)
        async with AsyncSessionLocal() as db:
            return await tenant_hosts.slug_for_host(db, host)
    except Exception:
        return None  # never let this fail a request
    finally:
        set_bypass_scoping(False)


async def _slug_exists(slug: str) -> bool:
    """Whether any active brand actually answers to this slug."""
    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping
    from app.services import tenant_hosts

    known = await tenant_hosts.slugs()
    if known is not None:
        return slug in known
    try:
        set_bypass_scoping(True)
        async with AsyncSessionLocal() as db:
            return bool((await db.execute(
                text("SELECT 1 FROM tenants WHERE slug = :s AND status = 'active'"), {"s": slug}
            )).first())
    except Exception:
        return True  # unknown — treat it as real rather than dropping the brand
    finally:
        set_bypass_scoping(False)


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
                slug = None  # not a subdomain — the brand's own address, below

        # 3. The brand's own web address. Two cases land here.
        #
        #    A link opened in a fresh browser, on a host with no wildcard
        #    subdomains: no cookie, no ?tenant= and no subdomain, so without
        #    this the visitor arrives at no brand at all.
        #
        #    And a subdomain that is not a slug. A brand's address does not
        #    have to match the name it was created under — "interflow" can be
        #    the address of a brand whose slug is "bravo-apparels" — so a
        #    subdomain nobody answers to is looked up as an address before it
        #    is given up on.
        if not slug or not await _slug_exists(slug):
            host = request.headers.get("x-storefront-host") or request.headers.get("host", "")
            found = await _slug_for_host(host)
            if found:
                slug = found

        request.state.tenant_slug = slug

        # Allow health + docs without tenant
        if request.url.path in _NO_TENANT_PATHS:
            return await call_next(request)

        return await call_next(request)
