"""Async SQLAlchemy engine and session factory."""
import ssl
from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
_db_url = settings.DATABASE_URL.replace("?ssl=true", "").replace("?sslmode=require", "")

_is_cloud_db = any(h in settings.DATABASE_URL for h in ["neon.tech", "amazonaws.com", "supabase", "railway.app", "render.com"])

_connect_args = {}
if _is_cloud_db:
    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE
    _connect_args = {"ssl": _ssl_ctx}

engine = create_async_engine(
    _db_url,
    echo=settings.DEBUG,
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
    pool_recycle=1800,
    # Neon (serverless PG) closes idle connections server-side; without a pre-ping
    # the first use of a stale pooled connection raises "connection is closed".
    # pre_ping transparently checks/replaces dead connections before handing them out.
    pool_pre_ping=True,
    connect_args=_connect_args,
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# ── Multi-tenant query scoping ────────────────────────────────────────────────
# Installs global SELECT-filter + INSERT-stamp hooks so every TenantMixin model
# is automatically isolated per tenant. Safe to import here (no circular deps).
from app.core.tenant_scope import install_tenant_scoping  # noqa: E402

install_tenant_scoping()


# ── Tenant context resolution ─────────────────────────────────────────────────
async def _apply_tenant_context(request: Request | None, session: AsyncSession) -> None:
    """
    Resolve the active tenant for this request and set it in the ContextVar so the
    SQLAlchemy scoping events isolate every query. Runs inside the endpoint's task,
    so the context reliably reaches the query layer.

    Priority:
      1. Platform admin (JWT is_platform_admin) → bypass scoping (sees all tenants).
      2. Authenticated tenant user (JWT tenant_id) → scope to that tenant.
      3. Public storefront (subdomain slug) → resolve slug → tenant_id, scope to it.
      4. Otherwise → no tenant (unscoped; platform/root context).
    """
    from sqlalchemy import text

    from app.core.tenant_context import set_bypass_scoping, set_current_tenant, set_current_tenant_slug

    # Fresh defaults for this request task.
    set_bypass_scoping(False)
    set_current_tenant(None)
    set_current_tenant_slug(None)

    if request is None:
        return

    state = request.state
    # Readable storage folder key (subdomain), independent of scoping bypass.
    set_current_tenant_slug(getattr(state, "tenant_slug", None))

    # 1. Platform admin operates across all tenants.
    if getattr(state, "is_platform_admin", False):
        set_bypass_scoping(True)
        return

    # 2. Authenticated tenant user — tenant_id from JWT.
    tenant_id = getattr(state, "tenant_id", None)
    if tenant_id:
        set_current_tenant(tenant_id)
        return

    # 3. Public storefront — resolve the subdomain slug to a tenant id.
    slug = getattr(state, "tenant_slug", None)
    if slug:
        result = await session.execute(
            text("SELECT id FROM tenants WHERE slug = :s AND status = 'active'"),
            {"s": slug},
        )
        row = result.first()
        if row:
            set_current_tenant(row[0])
        return

    # 4. No tenant context (root domain / platform routes) — leave unscoped.


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_db(request: Request = None) -> AsyncGenerator[AsyncSession, None]:  # type: ignore[assignment]
    """Yield a database session scoped to the current tenant.

    Commits on success, rolls back on exception. The tenant context is applied
    inside this dependency (same task as the endpoint) so query scoping is
    reliable and leak-free across concurrent requests.
    """
    async with AsyncSessionLocal() as session:
        await _apply_tenant_context(request, session)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_db_connection() -> bool:
    """Health check: verify DB is reachable."""
    from sqlalchemy import text

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
