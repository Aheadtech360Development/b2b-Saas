"""
Platform Admin API — Tenant Management
Only accessible to platform admins (is_platform_admin=true).
Endpoints:
  GET  /platform/tenants          — list all tenants
  POST /platform/tenants          — create new tenant
  GET  /platform/tenants/{slug}   — tenant detail
  PUT  /platform/tenants/{slug}   — update tenant (status, plan)
  DELETE /platform/tenants/{slug} — soft-delete tenant
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password

router = APIRouter(prefix="/platform/tenants", tags=["platform"])


def _require_platform_admin(request: Request) -> None:
    if not getattr(request.state, "is_platform_admin", False):
        raise HTTPException(status_code=403, detail="Platform admin access required")


# ── Schemas ───────────────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    slug: str
    name: str
    email: str
    plan: str = "starter"
    admin_email: str
    admin_password: str
    admin_first_name: str = "Admin"
    admin_last_name: str = "User"


class TenantUpdate(BaseModel):
    name: str | None = None
    status: str | None = None   # active | suspended | cancelled
    plan: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_tenants(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    _require_platform_admin(request)
    result = await db.execute(text("""
        SELECT t.id, t.slug, t.name, t.email, t.status, t.plan,
               t.created_at,
               COUNT(u.id) AS user_count
        FROM tenants t
        LEFT JOIN users u ON u.tenant_id = t.id
        GROUP BY t.id
        ORDER BY t.created_at DESC
    """))
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def create_tenant(
    request: Request,
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_admin(request)

    # Check slug uniqueness
    existing = await db.execute(
        text("SELECT id FROM tenants WHERE slug=:s"), {"s": data.slug}
    )
    if existing.first():
        raise HTTPException(status_code=409, detail=f"Slug '{data.slug}' already taken")

    # Create tenant
    tenant_id = await db.execute(text("""
        INSERT INTO tenants (slug, name, email, status, plan)
        VALUES (:slug, :name, :email, 'active', :plan)
        RETURNING id
    """), {"slug": data.slug, "name": data.name, "email": data.email, "plan": data.plan})
    tenant_id = tenant_id.scalar()

    # Default branding
    await db.execute(text("""
        INSERT INTO tenant_branding (tenant_id, company_name)
        VALUES (:tid, :name)
    """), {"tid": str(tenant_id), "name": data.name})

    # Subscription record
    await db.execute(text("""
        INSERT INTO tenant_subscriptions (tenant_id, plan, status)
        VALUES (:tid, :plan, 'active')
    """), {"tid": str(tenant_id), "plan": data.plan})

    # Default feature flags
    for feature in ["supplier_catalog", "markup_rules", "staff_accounts", "audit_logs"]:
        await db.execute(text("""
            INSERT INTO tenant_feature_flags (tenant_id, feature, is_enabled)
            VALUES (:tid, :f, true)
        """), {"tid": str(tenant_id), "f": feature})

    # Tenant admin user
    hashed = hash_password(data.admin_password)
    await db.execute(text("""
        INSERT INTO users (tenant_id, email, hashed_password, first_name, last_name,
                           role, is_active, email_verified)
        VALUES (:tid, :email, :pwd, :fn, :ln, 'tenant_admin', true, true)
    """), {
        "tid": str(tenant_id),
        "email": data.admin_email.lower(),
        "pwd": hashed,
        "fn": data.admin_first_name,
        "ln": data.admin_last_name,
    })

    await db.commit()

    return {
        "id": str(tenant_id),
        "slug": data.slug,
        "name": data.name,
        "admin_email": data.admin_email,
        "url_local": f"http://{data.slug}.localhost:3000",
        "message": "Tenant created successfully",
    }


@router.get("/{slug}")
async def get_tenant(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_admin(request)
    result = await db.execute(
        text("SELECT * FROM tenants WHERE slug=:s"), {"s": slug}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return dict(row)


@router.put("/{slug}")
async def update_tenant(
    slug: str,
    data: TenantUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_admin(request)

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    set_clause = ", ".join(f"{k}=:{k}" for k in updates)
    updates["slug"] = slug

    await db.execute(
        text(f"UPDATE tenants SET {set_clause}, updated_at=now() WHERE slug=:slug"),
        updates,
    )
    await db.commit()
    return {"message": f"Tenant '{slug}' updated", "updated": list(data.model_dump(exclude_none=True).keys())}


@router.delete("/{slug}", status_code=204)
async def delete_tenant(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete: mark cancelled (reversible)."""
    _require_platform_admin(request)
    await db.execute(
        text("UPDATE tenants SET status='cancelled', updated_at=now() WHERE slug=:s"),
        {"s": slug},
    )
    await db.commit()


# ── Feature flags (per-tenant) ────────────────────────────────────────────────
@router.get("/{slug}/features")
async def get_tenant_features(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    _require_platform_admin(request)
    result = await db.execute(text("""
        SELECT f.feature, f.is_enabled
        FROM tenant_feature_flags f
        JOIN tenants t ON t.id = f.tenant_id
        WHERE t.slug = :s
        ORDER BY f.feature
    """), {"s": slug})
    return [dict(r) for r in result.mappings().all()]


class FeatureFlagUpdate(BaseModel):
    feature: str
    is_enabled: bool


@router.put("/{slug}/features")
async def update_tenant_feature(
    slug: str,
    data: FeatureFlagUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_admin(request)
    tid = await db.execute(text("SELECT id FROM tenants WHERE slug=:s"), {"s": slug})
    row = tid.first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await db.execute(text("""
        INSERT INTO tenant_feature_flags (tenant_id, feature, is_enabled)
        VALUES (:tid, :f, :en)
        ON CONFLICT (tenant_id, feature) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now()
    """), {"tid": str(row[0]), "f": data.feature, "en": data.is_enabled})
    await db.commit()
    return {"feature": data.feature, "is_enabled": data.is_enabled}


# ── Impersonate (enter a brand's admin dashboard) ─────────────────────────────
@router.post("/{slug}/impersonate")
async def impersonate_tenant(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Platform admin 'enters' a brand: issues an access token for that brand's
    admin user, so the super admin lands inside the brand's admin dashboard
    (logged in as the brand admin). Like Shopify Plus 'Login as store'.
    """
    _require_platform_admin(request)

    row = (await db.execute(
        text("SELECT id, name FROM tenants WHERE slug=:s"), {"s": slug}
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant_id = row[0]

    admin = (await db.execute(text("""
        SELECT id, email, role FROM users
        WHERE tenant_id = :tid AND role = 'tenant_admin' AND is_active = true
        ORDER BY created_at ASC LIMIT 1
    """), {"tid": str(tenant_id)})).mappings().first()
    if not admin:
        raise HTTPException(status_code=404, detail="This brand has no active admin user")

    claims = {
        "tenant_id": str(tenant_id),
        "role": "tenant_admin",
        "is_platform_admin": False,
        "is_admin": True,
        "impersonated": True,
    }
    token = create_access_token(subject=str(admin["id"]), extra_claims=claims)
    return {"access_token": token, "slug": slug, "admin_email": admin["email"]}


# ── Hard purge (irreversible) ─────────────────────────────────────────────────
@router.delete("/{slug}/purge", status_code=204)
async def purge_tenant(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a tenant and ALL its data (cascades via FK). Irreversible."""
    _require_platform_admin(request)
    result = await db.execute(text("DELETE FROM tenants WHERE slug=:s"), {"s": slug})
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
