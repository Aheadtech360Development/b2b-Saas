"""
Platform Admin API — cross-tenant insights.

Four super-admin views that only make sense above the tenant boundary:
  GET /platform/analytics      — per-brand + platform-wide totals
  GET /platform/activity       — audit trail across every brand
  GET /platform/search?q=      — find an order/customer/product in any brand
  GET /platform/brands/health  — each brand's size and last activity

Every query here is intentionally cross-tenant. A platform admin bypasses the
row-scoping layer, so these read straight across all brands; each is still gated
on is_platform_admin so a tenant user can never reach them.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(prefix="/platform", tags=["platform-insights"])


def _require_platform_admin(request: Request) -> None:
    if not getattr(request.state, "is_platform_admin", False):
        raise HTTPException(status_code=403, detail="Platform admin access required")


# ── Analytics ─────────────────────────────────────────────────────────────────
@router.get("/analytics")
async def platform_analytics(
    request: Request, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Per-brand counts and revenue, plus platform-wide totals.

    Revenue counts only paid orders so the number matches money actually taken,
    not carts that were abandoned mid-checkout.
    """
    _require_platform_admin(request)

    per_brand = (await db.execute(text("""
        SELECT
            t.id, t.slug, t.name, t.status, t.created_at,
            (SELECT COUNT(*) FROM products p  WHERE p.tenant_id = t.id) AS products,
            (SELECT COUNT(*) FROM users u     WHERE u.tenant_id = t.id) AS users,
            (SELECT COUNT(*) FROM companies c WHERE c.tenant_id = t.id) AS companies,
            (SELECT COUNT(*) FROM orders o    WHERE o.tenant_id = t.id) AS orders,
            COALESCE((SELECT SUM(o.total) FROM orders o
                      WHERE o.tenant_id = t.id AND o.payment_status = 'paid'), 0) AS revenue
        FROM tenants t
        ORDER BY revenue DESC, t.created_at DESC
    """))).mappings().all()

    brands = [
        {
            "id": str(r["id"]),
            "slug": r["slug"],
            "name": r["name"],
            "status": r["status"],
            "products": r["products"],
            "users": r["users"],
            "companies": r["companies"],
            "orders": r["orders"],
            "revenue": float(r["revenue"] or 0),
        }
        for r in per_brand
    ]

    totals = {
        "brands": len(brands),
        "active_brands": sum(1 for b in brands if b["status"] == "active"),
        "products": sum(b["products"] for b in brands),
        "users": sum(b["users"] for b in brands),
        "companies": sum(b["companies"] for b in brands),
        "orders": sum(b["orders"] for b in brands),
        "revenue": round(sum(b["revenue"] for b in brands), 2),
    }
    return {"totals": totals, "brands": brands}


# ── Activity log ──────────────────────────────────────────────────────────────
@router.get("/activity")
async def platform_activity(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """Audit trail across every brand, newest first.

    Reads the same audit_log the middleware already populates on every admin
    write, joined to readable brand and actor names so the super admin sees
    "who did what, where" without decoding UUIDs.
    """
    _require_platform_admin(request)

    where = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if tenant_id:
        where.append("a.tenant_id = :tenant_id")
        params["tenant_id"] = tenant_id
    if action:
        where.append("a.action = :action")
        params["action"] = action
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = (await db.execute(text(f"""
        SELECT a.id, a.action, a.entity_type, a.entity_id, a.ip_address,
               a.created_at, a.tenant_id,
               t.name AS brand_name, t.slug AS brand_slug,
               u.email AS actor_email
        FROM audit_log a
        LEFT JOIN tenants t ON t.id = a.tenant_id
        LEFT JOIN users u   ON u.id = a.admin_user_id
        {where_sql}
        ORDER BY a.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params)).mappings().all()

    return {
        "items": [
            {
                "id": str(r["id"]),
                "action": r["action"],
                "entity_type": r["entity_type"],
                "entity_id": r["entity_id"],
                "ip_address": r["ip_address"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "brand_name": r["brand_name"],
                "brand_slug": r["brand_slug"],
                "actor_email": r["actor_email"],
            }
            for r in rows
        ]
    }


# ── Global search ─────────────────────────────────────────────────────────────
@router.get("/search")
async def platform_search(
    request: Request,
    q: str = Query(min_length=2),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Find an order, customer, or product in any brand.

    Each hit carries its brand so the super admin knows where it lives. Capped
    per category to stay responsive on a broad term.
    """
    _require_platform_admin(request)
    like = f"%{q.strip()}%"

    orders = (await db.execute(text("""
        SELECT o.id, o.order_number, o.status, o.total, o.tenant_id,
               t.name AS brand_name, t.slug AS brand_slug
        FROM orders o LEFT JOIN tenants t ON t.id = o.tenant_id
        WHERE o.order_number ILIKE :like OR o.guest_email ILIKE :like
        ORDER BY o.created_at DESC LIMIT 15
    """), {"like": like})).mappings().all()

    customers = (await db.execute(text("""
        SELECT c.id, c.name, c.tenant_id,
               t.name AS brand_name, t.slug AS brand_slug
        FROM companies c LEFT JOIN tenants t ON t.id = c.tenant_id
        WHERE c.name ILIKE :like OR c.email ILIKE :like
        ORDER BY c.created_at DESC LIMIT 15
    """), {"like": like})).mappings().all()

    products = (await db.execute(text("""
        SELECT p.id, p.name, p.slug, p.status, p.tenant_id,
               t.name AS brand_name, t.slug AS brand_slug
        FROM products p LEFT JOIN tenants t ON t.id = p.tenant_id
        WHERE p.name ILIKE :like OR p.slug ILIKE :like
        ORDER BY p.created_at DESC LIMIT 15
    """), {"like": like})).mappings().all()

    def brand(r: Any) -> dict[str, Any]:
        return {"brand_name": r["brand_name"], "brand_slug": r["brand_slug"]}

    return {
        "orders": [
            {"id": str(r["id"]), "order_number": r["order_number"], "status": r["status"],
             "total": float(r["total"] or 0), **brand(r)}
            for r in orders
        ],
        "customers": [
            {"id": str(r["id"]), "name": r["name"], **brand(r)} for r in customers
        ],
        "products": [
            {"id": str(r["id"]), "name": r["name"], "slug": r["slug"],
             "status": r["status"], **brand(r)}
            for r in products
        ],
    }


# ── Brand health ──────────────────────────────────────────────────────────────
@router.get("/brands/health")
async def brands_health(
    request: Request, db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    """Each brand's size and last activity — to spot empty or dormant stores.

    last_activity is the most recent of the brand's newest product, order, or
    audit entry, so a brand that has been configured but never sells still reads
    as recently touched rather than looking abandoned.
    """
    _require_platform_admin(request)

    rows = (await db.execute(text("""
        SELECT
            t.id, t.slug, t.name, t.status, t.created_at,
            (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id) AS products,
            (SELECT COUNT(*) FROM orders o   WHERE o.tenant_id = t.id) AS orders,
            (SELECT COUNT(*) FROM users u    WHERE u.tenant_id = t.id) AS users,
            GREATEST(
                COALESCE((SELECT MAX(p.created_at) FROM products p WHERE p.tenant_id = t.id), t.created_at),
                COALESCE((SELECT MAX(o.created_at) FROM orders o   WHERE o.tenant_id = t.id), t.created_at),
                COALESCE((SELECT MAX(a.created_at) FROM audit_log a WHERE a.tenant_id = t.id), t.created_at)
            ) AS last_activity
        FROM tenants t
        ORDER BY last_activity DESC
    """))).mappings().all()

    result = []
    for r in rows:
        products, orders = r["products"], r["orders"]
        # A brand with no products has nothing to sell yet; one with products but
        # no orders is live but hasn't converted. Surfacing this is the point.
        if products == 0:
            state = "empty"
        elif orders == 0:
            state = "no_sales"
        else:
            state = "selling"
        result.append({
            "id": str(r["id"]),
            "slug": r["slug"],
            "name": r["name"],
            "status": r["status"],
            "products": products,
            "orders": orders,
            "users": r["users"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "last_activity": r["last_activity"].isoformat() if r["last_activity"] else None,
            "state": state,
        })
    return result
