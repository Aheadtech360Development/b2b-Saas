"""
Platform Console — what the redesigned super admin reads.

  GET /platform/console/brands                  every brand: plan, billing, trial, health, usage, owner
  GET /platform/console/brands/{slug}           one brand, with its commission, owner and payments
  GET /platform/console/brands/{slug}/users     the brand's staff and buyers
  GET /platform/console/brands/{slug}/domain    the shop's addresses and DNS records (?check=1 asks the address)
  GET /platform/console/brands/{slug}/checklist what is left before a new brand can sell
  GET /platform/console/users                   everyone across every brand
  GET /platform/console/activity                the activity log, readable, filtered and paged
  GET /platform/console/search?q=               brands, people, orders, products and customers

Read only. Every change is made through the routes that already own it
(platform/tenants.py), which log it against the brand.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(prefix="/platform/console", tags=["platform-console"])


def _require_platform_admin(request: Request) -> None:
    if not getattr(request.state, "is_platform_admin", False):
        raise HTTPException(status_code=403, detail="Platform admin access required")


def _iso(value) -> str | None:
    return value.isoformat() if value else None


# Every brand in one query: a correlated count per thing the list shows. The
# platform has a handful of brands, so this stays a single round trip.
_BRANDS_SQL = """
    SELECT t.id, t.slug, t.name, t.email, t.status, t.plan, t.custom_domain, t.created_at,
           s.status AS billing_status, s.trial_ends_at, s.stripe_subscription_id,
           s.current_period_end, s.cancel_at_period_end,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.is_admin AND u.is_active) AS staff,
           (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id) AS products,
           (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id) AS orders,
           (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id
               AND o.created_at >= date_trunc('month', now())) AS orders_month,
           (SELECT u.email FROM users u WHERE u.tenant_id = t.id AND u.role = 'tenant_admin'
               AND u.is_active ORDER BY u.created_at ASC LIMIT 1) AS owner_email,
           GREATEST(
               COALESCE((SELECT MAX(p.created_at) FROM products p WHERE p.tenant_id = t.id), t.created_at),
               COALESCE((SELECT MAX(o.created_at) FROM orders o WHERE o.tenant_id = t.id), t.created_at),
               COALESCE((SELECT MAX(a.created_at) FROM audit_log a WHERE a.tenant_id = t.id), t.created_at)
           ) AS last_activity,
           (SELECT st.value FROM settings st WHERE st.key = 'platform_hold@' || t.id::text) AS hold
      FROM tenants t
      LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id
"""


def _brand(row) -> dict[str, Any]:
    """One brand as every console screen reads it."""
    from app.core.billing_plans import BILLING_PLANS, effective_plan, plan_summary
    from app.services import brand_status
    from app.services.brand_urls import build as brand_url
    from app.services.trial import days_left

    paying = bool(row["stripe_subscription_id"]) and row["billing_status"] in ("active", "trialing", "past_due")
    left = days_left(row["trial_ends_at"])
    ends = row["trial_ends_at"]
    products, orders = row["products"] or 0, row["orders"] or 0
    limits = BILLING_PLANS[effective_plan(row["plan"])]["limits"]
    hold = brand_status._parse_hold(row["hold"])
    return {
        "id": str(row["id"]),
        "slug": row["slug"],
        "name": row["name"],
        "email": row["email"],
        "status": row["status"],
        "plan": row["plan"],
        "plan_detail": plan_summary(row["plan"]),
        "custom_domain": row["custom_domain"],
        "created_at": _iso(row["created_at"]),
        "billing_status": row["billing_status"] or "none",
        "paying": paying,
        "period_end": _iso(row["current_period_end"]),
        "cancel_at_period_end": bool(row["cancel_at_period_end"]),
        "trial": {
            "on_trial": ends is not None and not paying and (left or 0) > 0,
            "days_left": left,
            "ends_at": _iso(ends),
            "expired": ends is not None and not paying and left == 0,
        },
        "users": row["users"] or 0,
        "staff": row["staff"] or 0,
        "products": products,
        "orders": orders,
        "orders_month": row["orders_month"] or 0,
        "limits": {"orders_per_month": limits["orders_per_month"], "staff_accounts": limits["staff_accounts"]},
        "owner_email": row["owner_email"],
        "last_activity": _iso(row["last_activity"]),
        "health": "empty" if products == 0 else ("no_sales" if orders == 0 else "selling"),
        "held": hold is not None,
        "hold": hold,
        "store_url": brand_url(row["slug"], None, "/"),
    }


async def _brand_id(db: AsyncSession, slug: str):
    tid = (await db.execute(text("SELECT id FROM tenants WHERE slug = :s"), {"s": slug})).scalar()
    if not tid:
        raise HTTPException(status_code=404, detail="Brand not found")
    return tid


@router.get("/brands")
async def brands(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    _require_platform_admin(request)
    rows = (await db.execute(text(_BRANDS_SQL + " ORDER BY t.created_at DESC"))).mappings().all()
    items = [_brand(r) for r in rows]
    return {
        "items": items,
        "totals": {
            "brands": len(items),
            "active": sum(1 for b in items if b["status"] == "active"),
            "suspended": sum(1 for b in items if b["status"] in ("suspended", "cancelled")),
            "users": sum(b["users"] for b in items),
        },
    }


@router.get("/brands/{slug}")
async def brand(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    _require_platform_admin(request)
    row = (await db.execute(text(_BRANDS_SQL + " WHERE t.slug = :s"), {"s": slug})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    out = _brand(row)

    from app.services import commission, stripe_mode

    out["commission"] = await commission.for_tenant(db, row["id"])
    owner = (await db.execute(text("""
        SELECT email, first_name, last_name, last_login, two_factor_enabled
          FROM users WHERE tenant_id = :t AND role = 'tenant_admin' AND is_active
         ORDER BY created_at ASC LIMIT 1
    """), {"t": str(row["id"])})).mappings().first()
    out["owner"] = {
        "email": owner["email"], "name": f"{owner['first_name'] or ''} {owner['last_name'] or ''}".strip(),
        "last_login": _iso(owner["last_login"]), "two_factor": bool(owner["two_factor_enabled"]),
    } if owner else None
    sfx = "" if await stripe_mode.current(db) == stripe_mode.LIVE else "_test"
    out["payments_connected"] = bool((await db.execute(text(
        f"SELECT connect_charges_enabled{sfx} FROM tenants WHERE id = :t"
    ), {"t": str(row["id"])})).scalar())
    return out


@router.get("/brands/{slug}/users")
async def brand_users(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    _require_platform_admin(request)
    tid = await _brand_id(db, slug)
    rows = (await db.execute(text("""
        SELECT id, email, first_name, last_name, role, is_admin, is_active, last_login,
               two_factor_enabled, created_at
          FROM users WHERE tenant_id = :t
         ORDER BY is_admin DESC, created_at ASC
    """), {"t": str(tid)})).mappings().all()
    return {"items": [_person(r) for r in rows]}


def _person(r) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "email": r["email"],
        "name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
        "role": r["role"],
        "type": "staff" if r["is_admin"] else "buyer",
        "active": bool(r["is_active"]),
        "last_login": _iso(r["last_login"]),
        # Two-step is for staff; a buyer's account has no such setting.
        "two_factor": bool(r["two_factor_enabled"]) if r["is_admin"] else None,
        "created_at": _iso(r["created_at"]),
    }


@router.get("/users")
async def users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    brand: str | None = Query(default=None),
    kind: str | None = Query(default=None, pattern="^(staff|buyer)$"),
    two_step: str | None = Query(default=None, pattern="^(on|off)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    """Everyone with an account at any brand. Platform admins are not a brand's."""
    _require_platform_admin(request)
    where = ["u.tenant_id IS NOT NULL"]
    params: dict[str, Any] = {}
    if q and q.strip():
        where.append("(u.email ILIKE :q OR u.first_name ILIKE :q OR u.last_name ILIKE :q"
                     " OR (u.first_name || ' ' || u.last_name) ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    if brand:
        where.append("t.slug = :brand")
        params["brand"] = brand
    if two_step:
        where.append("u.is_admin AND u.two_factor_enabled = :tf")
        params["tf"] = two_step == "on"
    base = "FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE " + " AND ".join(where)

    counts = (await db.execute(text(
        f"SELECT COUNT(*) AS all_, COUNT(*) FILTER (WHERE u.is_admin) AS staff {base}"
    ), params)).mappings().first()
    if kind:
        base += " AND u.is_admin" if kind == "staff" else " AND NOT u.is_admin"
    total = (await db.execute(text(f"SELECT COUNT(*) {base}"), params)).scalar() or 0
    rows = (await db.execute(text(f"""
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_admin, u.is_active,
               u.last_login, u.two_factor_enabled, u.created_at, t.name AS brand_name, t.slug AS brand_slug
          {base}
         ORDER BY u.is_admin DESC, u.created_at DESC
         LIMIT :limit OFFSET :offset
    """), {**params, "limit": page_size, "offset": (page - 1) * page_size})).mappings().all()
    return {
        "total": total, "page": page, "page_size": page_size,
        "counts": {"all": counts["all_"] or 0, "staff": counts["staff"] or 0,
                   "buyers": (counts["all_"] or 0) - (counts["staff"] or 0)},
        "items": [{**_person(r), "brand_name": r["brand_name"], "brand_slug": r["brand_slug"]} for r in rows],
    }


@router.get("/brands/{slug}/domain")
async def brand_domain_status(
    slug: str, request: Request, db: AsyncSession = Depends(get_db),
    check: bool = Query(default=False),
) -> dict[str, Any]:
    """The shop's two addresses, and the records its own domain needs.
    ?check=1 asks the domain itself whether it answers yet (a request over the
    internet, so only when asked)."""
    _require_platform_admin(request)
    from app.services import brand_domain
    from app.services.brand_urls import build as brand_url

    tid = await _brand_id(db, slug)
    out = await (brand_domain.verify(db, tid) if check else brand_domain.get(db, tid))
    return {**out, "slug": slug, "store_url": brand_url(slug, None, "/")}


@router.get("/brands/{slug}/checklist")
async def brand_checklist(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """What is left before a brand made in the console can sell."""
    _require_platform_admin(request)
    from app.core.billing_plans import BILLING_PLANS
    from app.services import stripe_mode

    row = (await db.execute(text(_BRANDS_SQL + " WHERE t.slug = :s"), {"s": slug})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    b = _brand(row)
    owner = (await db.execute(text("""
        SELECT email, last_login FROM users WHERE tenant_id = :t AND role = 'tenant_admin' AND is_active
         ORDER BY created_at ASC LIMIT 1
    """), {"t": str(row["id"])})).mappings().first()
    sfx = "" if await stripe_mode.current(db) == stripe_mode.LIVE else "_test"
    charges = bool((await db.execute(text(
        f"SELECT connect_charges_enabled{sfx} FROM tenants WHERE id = :t"
    ), {"t": str(row["id"])})).scalar())
    known = (row["plan"] or "") in BILLING_PLANS
    trial_line = (f"{b['plan_detail']['name']}, {b['trial']['days_left']} days of free trial left"
                  if b["trial"]["on_trial"] else b["plan_detail"]["name"])
    host = b["store_url"].split("://", 1)[-1].split("/", 1)[0]
    from app.core.config import get_settings

    platform = (get_settings().FRONTEND_URL or "").rstrip("/")
    return {
        "brand": b,
        "steps": [
            {"key": "created", "label": "Brand created", "done": True, "detail": f"Store address: {slug}"},
            {"key": "plan", "label": "Plan and trial set", "done": known, "detail": trial_line},
            {"key": "owner", "label": "Owner has signed in", "done": bool(owner and owner["last_login"]),
             "detail": owner["email"] if owner else "No owner account"},
            {"key": "product", "label": "First product added", "done": b["products"] > 0,
             "detail": f"{b['products']} products"},
            {"key": "payments", "label": "Payments connected", "done": charges,
             "detail": "Stripe can take card payments" if charges else "The owner connects Stripe in Settings, Payments"},
            {"key": "domain", "label": "Own domain", "done": bool(row["custom_domain"]), "optional": True,
             "detail": row["custom_domain"] or "Optional"},
        ],
        # The shop's own address answers only once someone adds it to the
        # deployment by hand; until then the ?tenant= link always works.
        "vercel_host": host,
        "store_url": b["store_url"],
        "fallback_url": f"{platform}/?tenant={slug}" if platform else None,
    }


@router.get("/activity")
async def activity(
    request: Request,
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    brand: str | None = Query(default=None),
    action: str | None = Query(default=None),
    entity: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    """The activity log across every brand, in readable rows, newest first."""
    _require_platform_admin(request)
    where: list[str] = []
    params: dict[str, Any] = {}
    if brand:
        # Console rows written before they carried the brand still name it.
        where.append("(t.slug = :brand OR (a.tenant_id IS NULL AND a.entity_id = :brand))")
        params["brand"] = brand
    if action:
        where.append("a.action = :action")
        params["action"] = action.strip().upper()
    if entity:
        where.append("a.entity_type = :entity")
        params["entity"] = entity
    if q and q.strip():
        where.append("(a.summary ILIKE :q OR a.entity_type ILIKE :q OR a.entity_id ILIKE :q"
                     " OR u.email ILIKE :q OR a.path ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    if date_from:
        where.append("a.created_at >= :date_from")
        params["date_from"] = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
    if date_to:
        # Up to the end of that day: before the start of the next one.
        where.append("a.created_at < :date_to")
        params["date_to"] = datetime(date_to.year, date_to.month, date_to.day, tzinfo=timezone.utc) + timedelta(days=1)
    base = ("FROM audit_log a LEFT JOIN tenants t ON t.id = a.tenant_id "
            "LEFT JOIN users u ON u.id = a.admin_user_id")
    if where:
        base += " WHERE " + " AND ".join(where)

    total = (await db.execute(text(f"SELECT COUNT(*) {base}"), params)).scalar() or 0
    rows = (await db.execute(text(f"""
        SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.method, a.path,
               a.status_code, a.ip_address, a.user_agent, a.new_values, a.old_values, a.created_at,
               t.name AS brand_name, t.slug AS brand_slug,
               u.email AS actor_email, u.first_name, u.last_name,
               u.is_platform_admin AS actor_platform, u.is_active AS actor_active
          {base}
         ORDER BY a.created_at DESC
         LIMIT :limit OFFSET :offset
    """), {**params, "limit": page_size, "offset": (page - 1) * page_size})).mappings().all()

    def values(raw):
        if not raw:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return raw

    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [{
            "id": str(r["id"]),
            "action": r["action"],
            "entity_type": r["entity_type"],
            "entity_id": r["entity_id"],
            "summary": r["summary"],
            "method": r["method"], "path": r["path"], "status_code": r["status_code"],
            "ip_address": r["ip_address"], "user_agent": r["user_agent"],
            "new_values": values(r["new_values"]), "old_values": values(r["old_values"]),
            "created_at": _iso(r["created_at"]),
            "brand_name": r["brand_name"], "brand_slug": r["brand_slug"] or (
                r["entity_id"] if r["entity_type"] in ("tenant", "tenant_trial", "tenant_admin_password",
                                                       "impersonation_session") else None),
            "actor_email": r["actor_email"],
            "actor_name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() or None,
            "actor_platform": bool(r["actor_platform"]),
            "actor_active": r["actor_active"],
        } for r in rows],
    }


@router.get("/search")
async def search(
    request: Request, db: AsyncSession = Depends(get_db), q: str = Query(min_length=2),
) -> dict[str, Any]:
    """Find a brand, a person, an order, a product or a customer in any brand."""
    _require_platform_admin(request)
    like = f"%{q.strip()}%"

    def rows(sql: str):
        return db.execute(text(sql), {"like": like})

    brands_ = (await rows("""
        SELECT name, slug, status, custom_domain FROM tenants
         WHERE name ILIKE :like OR slug ILIKE :like OR custom_domain ILIKE :like OR email ILIKE :like
         ORDER BY created_at DESC LIMIT 8
    """)).mappings().all()
    people = (await rows("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_admin, t.name AS brand_name, t.slug AS brand_slug
          FROM users u JOIN tenants t ON t.id = u.tenant_id
         WHERE u.email ILIKE :like OR u.first_name ILIKE :like OR u.last_name ILIKE :like
         ORDER BY u.is_admin DESC, u.created_at DESC LIMIT 8
    """)).mappings().all()
    orders = (await rows("""
        SELECT o.id, o.order_number, o.status, o.total, t.name AS brand_name, t.slug AS brand_slug
          FROM orders o LEFT JOIN tenants t ON t.id = o.tenant_id
         WHERE o.order_number ILIKE :like OR o.guest_email ILIKE :like
         ORDER BY o.created_at DESC LIMIT 8
    """)).mappings().all()
    products = (await rows("""
        SELECT p.id, p.name, p.slug, p.status, t.name AS brand_name, t.slug AS brand_slug
          FROM products p LEFT JOIN tenants t ON t.id = p.tenant_id
         WHERE p.name ILIKE :like OR p.slug ILIKE :like
         ORDER BY p.created_at DESC LIMIT 8
    """)).mappings().all()
    customers = (await rows("""
        SELECT c.id, c.name, t.name AS brand_name, t.slug AS brand_slug
          FROM companies c LEFT JOIN tenants t ON t.id = c.tenant_id
         WHERE c.name ILIKE :like OR c.company_email ILIKE :like OR c.trading_name ILIKE :like
         ORDER BY c.created_at DESC LIMIT 8
    """)).mappings().all()
    return {
        "brands": [{"name": r["name"], "slug": r["slug"], "status": r["status"],
                    "custom_domain": r["custom_domain"]} for r in brands_],
        "users": [{"id": str(r["id"]), "email": r["email"],
                   "name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
                   "type": "staff" if r["is_admin"] else "buyer", "role": r["role"],
                   "brand_name": r["brand_name"], "brand_slug": r["brand_slug"]} for r in people],
        "orders": [{"id": str(r["id"]), "order_number": r["order_number"], "status": r["status"],
                    "total": float(r["total"] or 0), "brand_name": r["brand_name"],
                    "brand_slug": r["brand_slug"]} for r in orders],
        "products": [{"id": str(r["id"]), "name": r["name"], "slug": r["slug"], "status": r["status"],
                      "brand_name": r["brand_name"], "brand_slug": r["brand_slug"]} for r in products],
        "customers": [{"id": str(r["id"]), "name": r["name"], "brand_name": r["brand_name"],
                       "brand_slug": r["brand_slug"]} for r in customers],
    }
