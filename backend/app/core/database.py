"""Async SQLAlchemy engine and session factory."""
import logging
import ssl
from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Engine ────────────────────────────────────────────────────────────────────
_db_url = settings.DATABASE_URL.replace("?ssl=true", "").replace("?sslmode=require", "")

_is_cloud_db = any(h in settings.DATABASE_URL for h in [
    "neon.tech", "amazonaws.com", "supabase", "render.com",
    # Railway-managed Postgres: public TCP proxy (*.rlwy.net) and the in-project
    # private network (*.railway.internal). Its postgres-ssl image speaks TLS, so
    # connect with the same relaxed (self-signed-tolerant) context as the others.
    "railway.app", "rlwy.net", "railway.internal",
])

_connect_args = {}
if _is_cloud_db:
    # 'prefer': negotiate TLS without certificate verification (managed Postgres
    # uses self-signed certs) and transparently fall back to a plain connection
    # if the server doesn't offer TLS on that interface — e.g. Railway's private
    # network. One setting that works for Neon (TLS-required) and Railway
    # (public *.rlwy.net proxy or private *.railway.internal) alike.
    _connect_args = {"ssl": "prefer"}

# ── Connection budget ─────────────────────────────────────────────────────────
# Every process has its own pool, so the database sees the sum of them.
#
#   Postgres (Railway default)  max_connections 100, 3 reserved for superusers
#   web      1 replica x 2 uvicorn workers x (8 + 4)  = 24
#            x 2 for the moment a deploy runs old and new side by side = 48
#   worker   celery --concurrency=2 x (4 + 2)          = 12  (railway.worker.json)
#   beat     no database sessions                       =  0
#   alembic  during a deploy                            =  1
#   ------------------------------------------------------------
#   worst case                                          = 61 of 97 usable
#
# leaving room for psql, Railway's own monitoring and a manual script. It used
# to be 20 + 40 per process: 2 x 60 for the web service alone, 120 against a
# limit of 100, before a deploy doubled it. Raising replicas or workers means
# lowering DB_POOL_SIZE / DB_MAX_OVERFLOW so the sum still fits; the startup
# log line below states the numbers this process is running with.
engine = create_async_engine(
    _db_url,
    echo=settings.DEBUG,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
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

# Centralized customer-metrics propagation: any order change enqueues a recompute
# for that company on commit (no per-controller wiring). Safe — enqueue failures
# never break the transaction.
from app.core.segment_events import install_segment_events  # noqa: E402

install_segment_events()

# Phase A of DB row-level security: bind the current tenant into a Postgres
# session variable on every transaction. Harmless until RLS policies exist.
from app.core.rls import install_rls_session_binding  # noqa: E402

install_rls_session_binding()


# Process-local cache of tenant_id → (store_name, expires_at). Emails read the
# brand name synchronously from a contextvar, but resolving it needs a DB lookup;
# caching keeps that to one lightweight query per tenant per TTL window instead of
# one on every request. A short TTL lets a renamed store propagate without a
# restart.
import time as _time

_BRAND_CACHE: dict[str, tuple[str | None, float]] = {}
_BRAND_TTL_SECONDS = 300

# Same treatment for the brand's email setup: the email service is synchronous
# and can't look this up itself, so it is resolved here and read from context.
_EMAIL_CACHE: dict[str, tuple[dict | None, float]] = {}


async def _resolve_tenant_email(session: AsyncSession, tenant_id: object) -> dict | None:
    """This brand's Resend settings, or None when it hasn't connected its own."""
    import json as _json
    from sqlalchemy import text

    key = str(tenant_id)
    hit = _EMAIL_CACHE.get(key)
    now = _time.monotonic()
    if hit and hit[1] > now:
        return hit[0]

    cfg = None
    try:
        raw = (
            await session.execute(
                text("SELECT value FROM settings WHERE key = :k"),
                {"k": f"integrations@{key}"},
            )
        ).scalar()
        if raw:
            blob = _json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(blob, dict):
                cfg = blob.get("resend") or None
    except Exception:
        cfg = None

    _EMAIL_CACHE[key] = (cfg, now + _BRAND_TTL_SECONDS)
    return cfg


def forget_tenant_email(tenant_id: object) -> None:
    """Drop the cached email config so a just-saved change is used at once."""
    _EMAIL_CACHE.pop(str(tenant_id), None)


def forget_brand_name(tenant_id: object) -> None:
    """Drop the cached store name, so a rename reaches the next email sent.

    Without this the old name sat here for the rest of the TTL, which is long
    enough for a brand to change its name, send itself a test and be told it
    had not worked.
    """
    _BRAND_CACHE.pop(str(tenant_id), None)


async def _resolve_brand_name(session: AsyncSession, tenant_id: object) -> str | None:
    from sqlalchemy import text

    key = str(tenant_id)
    hit = _BRAND_CACHE.get(key)
    now = _time.monotonic()
    if hit and hit[1] > now:
        return hit[0]
    try:
        name = (
            await session.execute(
                text("SELECT store_name FROM tenant_branding WHERE tenant_id = :t"),
                {"t": key},
            )
        ).scalar()
    except Exception:
        name = None
    _BRAND_CACHE[key] = (name, now + _BRAND_TTL_SECONDS)
    return name


# Where each brand's shop lives. Same treatment again: every link we mail out
# has to land on the brand's own address, and the email service cannot look it
# up because it is synchronous.
_SITE_CACHE: dict[str, tuple[str | None, float]] = {}


async def _resolve_brand_site(session: AsyncSession, tenant_id: object) -> str | None:
    from sqlalchemy import text

    key = str(tenant_id)
    hit = _SITE_CACHE.get(key)
    now = _time.monotonic()
    if hit and hit[1] > now:
        return hit[0]
    origin = None
    try:
        row = (
            await session.execute(
                text("SELECT slug, custom_domain FROM tenants WHERE id = CAST(:t AS uuid)"),
                {"t": key},
            )
        ).first()
        if row:
            from app.services.brand_urls import build

            origin = build(row[0], row[1], "/").rstrip("/")
    except Exception:
        origin = None
    _SITE_CACHE[key] = (origin, now + _BRAND_TTL_SECONDS)
    return origin


def forget_brand_site(tenant_id: object) -> None:
    """Drop the cached address so a just-connected domain is used at once."""
    _SITE_CACHE.pop(str(tenant_id), None)


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
         An unresolvable slug scopes to NO_TENANT (empty results), never unscoped.
      4. Otherwise → no tenant (unscoped; platform/root context).
    """
    from sqlalchemy import text

    from app.core.tenant_context import (
        NO_TENANT,
        set_bypass_scoping,
        set_current_brand_name,
        set_current_brand_site,
        set_current_tenant,
        set_current_tenant_email,
        set_current_tenant_slug,
    )

    set_current_brand_name(None)
    set_current_brand_site(None)
    set_current_tenant_email(None)

    # Fresh defaults for this request task.
    set_bypass_scoping(False)
    set_current_tenant(None)
    set_current_tenant_slug(None)

    if request is None:
        return

    state = request.state
    # Readable storage folder key. The subdomain when there is one, otherwise
    # what the token says — a brand's admin signing in on the platform's own
    # address arrives with no subdomain at all.
    set_current_tenant_slug(
        getattr(state, "tenant_slug", None) or getattr(state, "tenant_slug_claim", None)
    )

    # 1. Platform admin operates across all tenants.
    if getattr(state, "is_platform_admin", False):
        set_bypass_scoping(True)
        return

    # 2. Authenticated tenant user — tenant_id from JWT.
    tenant_id = getattr(state, "tenant_id", None)
    if tenant_id:
        set_current_tenant(tenant_id)
        set_current_brand_name(await _resolve_brand_name(session, tenant_id))
        set_current_brand_site(await _resolve_brand_site(session, tenant_id))
        set_current_tenant_email(await _resolve_tenant_email(session, tenant_id))
        return

    # 3. Public storefront — resolve the subdomain slug to a tenant id.
    slug = getattr(state, "tenant_slug", None)
    if slug:
        result = await session.execute(
            text("SELECT id FROM tenants WHERE slug = :s AND status = 'active'"),
            {"s": slug},
        )
        row = result.first()
        # An unknown or suspended slug must scope to nothing. Falling through with
        # the tenant unset would leave the session unscoped, so a made-up subdomain
        # would return every tenant's products pooled together.
        set_current_tenant(row[0] if row else NO_TENANT)
        if row:
            set_current_brand_name(await _resolve_brand_name(session, row[0]))
            set_current_brand_site(await _resolve_brand_site(session, row[0]))
            set_current_tenant_email(await _resolve_tenant_email(session, row[0]))
        return

    # 4. No tenant and not a platform admin — a public request to the bare root.
    # This must scope to nothing, not run unscoped: the storefront ORM reads
    # (products, categories, pages…) would otherwise pool every brand's rows
    # together on the platform domain. Platform admins never reach here — they
    # bypass at step 1 — and login/refresh use raw SQL that ORM scoping ignores.
    set_current_tenant(NO_TENANT)


async def _apply_pricing_context(request, session) -> None:
    """Put the buyer's pricing tier discount and discount group on the request.

    Products, cart, checkout and shipping read `request.state.tier_discount_percent`
    and `request.state.discount_group_id`. They were set by PricingMiddleware,
    which was dropped from the middleware stack when the app was rebuilt for
    multiple brands — so every buyer got 0% and no group, and Discount Groups and
    pricing tiers changed nothing. It can't simply go back as middleware: it runs
    before the brand is resolved, and under row-level security its lookups would
    find nothing. Here it runs on this request's own session, scoped to the brand.

    Cached briefly in Redis under the keys the admin already clears when a
    customer's tags change.
    """
    if request is None:
        return
    state = request.state
    company_id = getattr(state, "company_id", None)
    if hasattr(state, "discount_group_id") and hasattr(state, "tier_discount_percent"):
        return
    from decimal import Decimal

    state.tier_discount_percent = Decimal("0")
    state.discount_group_id = None
    if not company_id or getattr(state, "is_platform_admin", False):
        return
    from sqlalchemy import select

    from app.core.redis import redis_get, redis_set

    try:
        from app.models.company import Company

        company = (await session.execute(
            select(Company.pricing_tier_id, Company.tags).where(Company.id == company_id)
        )).first()
        if not company:
            return
        tier_id, tags = company

        if tier_id:
            key = f"pricing_tier:{tier_id}:discount"
            cached = await redis_get(key)
            if cached is not None:
                state.tier_discount_percent = Decimal(str(cached))
            else:
                from app.models.pricing import PricingTier

                pct = (await session.execute(
                    select(PricingTier.discount_percent).where(PricingTier.id == tier_id)
                )).scalar_one_or_none()
                state.tier_discount_percent = Decimal(str(pct or 0))
                await redis_set(key, str(state.tier_discount_percent), expire=300)

        dg_key = f"company:{company_id}:discount_group_id"
        cached_dg = await redis_get(dg_key)
        if cached_dg is not None:
            state.discount_group_id = cached_dg if cached_dg != "none" else None
        elif tags:
            from app.models.discount_group import DiscountGroup

            dg_id = (await session.execute(
                select(DiscountGroup.id).where(
                    DiscountGroup.customer_tag.in_(tags), DiscountGroup.status == "enabled",
                ).limit(1)
            )).scalar_one_or_none()
            state.discount_group_id = str(dg_id) if dg_id else None
            await redis_set(dg_key, state.discount_group_id or "none", expire=300)
        else:
            await redis_set(dg_key, "none", expire=300)
    except Exception as exc:  # pricing must never break the request
        import logging
        logging.getLogger(__name__).warning("pricing context failed: %s", exc)


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_db(request: Request = None) -> AsyncGenerator[AsyncSession, None]:  # type: ignore[assignment]
    """Yield a database session scoped to the current tenant.

    Commits on success, rolls back on exception. The tenant context is applied
    inside this dependency (same task as the endpoint) so query scoping is
    reliable and leak-free across concurrent requests.
    """
    from sqlalchemy import text
    async with AsyncSessionLocal() as session:
        await _apply_tenant_context(request, session)
        # RLS: the after_begin hook binds the tenant GUC at transaction start, but a
        # public/subdomain request only resolves its tenant *inside*
        # _apply_tenant_context — after that first transaction already began with an
        # empty GUC. Rebind now to the resolved tenant so RLS matches the queries the
        # endpoint is about to run (otherwise it would see zero rows → default data).
        try:
            from app.core.tenant_context import get_current_tenant_id, is_scoping_bypassed
            if is_scoping_bypassed():
                await session.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
            else:
                _tid = get_current_tenant_id()
                await session.execute(text("SELECT set_config('app.bypass_rls', 'off', true)"))
                await session.execute(
                    text("SELECT set_config('app.current_tenant', :t, true)"),
                    {"t": str(_tid) if _tid else ""},
                )
        except Exception:
            pass
        await _apply_pricing_context(request, session)
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


async def report_connection_budget() -> None:
    """Say, at startup, what this service may use against what the database allows.

    Read from the database itself, so the numbers in the log are the real ones
    for whichever database this deployment points at.
    """
    from sqlalchemy import text

    per_process = settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW
    service = per_process * max(1, settings.DB_PROCESSES)
    try:
        async with AsyncSessionLocal() as session:
            row = (await session.execute(text(
                "SELECT current_setting('max_connections')::int, "
                "current_setting('superuser_reserved_connections')::int, "
                "(SELECT count(*) FROM pg_stat_activity)"
            ))).first()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not read the database connection limit: %s", exc)
        return
    limit, reserved, in_use = int(row[0]), int(row[1]), int(row[2])
    usable = limit - reserved
    msg = ("DB connections: this service may open %s (%s processes x %s), %s are open now, "
           "the database allows %s (%s usable)")
    if service * 2 > usable:  # x2: old and new side by side during a deploy
        logger.warning(msg + " — too close to the limit; lower DB_POOL_SIZE/DB_MAX_OVERFLOW",
                       service, settings.DB_PROCESSES, per_process, in_use, limit, usable)
    else:
        print(msg % (service, settings.DB_PROCESSES, per_process, in_use, limit, usable))


async def email_owner(email: str, tenant_id=None) -> dict | None:
    """Who already holds this login email at this shop.

    An address is one account per shop (migration 0058), so this asks about
    one shop: `tenant_id`, or the request's own. With no shop at all it asks
    about the accounts that have none (the platform's admins).

    It runs its own bypassing session and names the shop in the query itself,
    rather than leaning on row-level security — which also shows every shop
    the accounts with no shop, and would have counted a platform admin's
    address as taken at every store.

    It returns the row rather than a yes or no, because "that email is taken"
    is not something an admin can act on. Knowing it belongs to a customer of
    their own shop, or to somebody they deactivated, tells them what to do
    next. What is said back to them is decided at the call site.
    """
    from sqlalchemy import text

    from app.core.tenant_context import NO_TENANT, get_current_tenant_id, is_scoping_bypassed, set_bypass_scoping

    address = (email or "").strip().lower()
    if not address:
        return None
    shop = tenant_id if tenant_id is not None else get_current_tenant_id()
    if shop == NO_TENANT:
        shop = None
    previous = is_scoping_bypassed()
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as session:
            row = (await session.execute(text(
                "SELECT id, tenant_id, role, is_active, is_platform_admin, "
                "       first_name, last_name "
                "FROM users WHERE lower(email) = :e "
                "AND tenant_id IS NOT DISTINCT FROM CAST(:t AS uuid) LIMIT 1"
            ), {"e": address, "t": str(shop) if shop else None})).mappings().first()
            return dict(row) if row else None
    except Exception:  # never block account creation on this check
        logger.exception("Could not check whether %s is already taken", address)
        return None
    finally:
        set_bypass_scoping(previous)


async def email_taken_here(email: str, tenant_id=None) -> bool:
    """Whether this login email already has an account at this shop."""
    return await email_owner(email, tenant_id) is not None

