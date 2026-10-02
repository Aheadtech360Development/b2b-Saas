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
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password

logger = logging.getLogger(__name__)
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
    # The brand's address on the platform: /?tenant=<slug> and, where wildcard
    # DNS exists, <slug>.<platform>. Changing it moves the shop.
    slug: str | None = None
    status: str | None = None   # active | suspended | cancelled
    plan: str | None = None
    # The web address this brand's shop is reached at, so a link opened in a
    # fresh browser lands on the right shop. Host only — no scheme, no path.
    custom_domain: str | None = None


# Addresses the platform keeps for itself, so a brand can never take one.
_RESERVED_SLUGS = {
    "www", "api", "admin", "platform", "app", "static", "assets", "cdn",
    "mail", "smtp", "ftp", "blog", "help", "support", "status", "docs",
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_tenants(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    _require_platform_admin(request)
    result = await db.execute(text("""
        SELECT t.id, t.slug, t.name, t.email, t.status, t.plan,
               t.custom_domain, t.created_at,
               s.status AS billing_status,
               COUNT(u.id) AS user_count
        FROM tenants t
        LEFT JOIN users u ON u.tenant_id = t.id
        LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id
        GROUP BY t.id, s.status
        ORDER BY t.created_at DESC
    """))
    from app.core.billing_plans import plan_summary

    out = []
    for r in result.mappings().all():
        row = dict(r)
        # What this brand pays and what we take, spelled out — the console
        # showed a bare key, which answers neither.
        row["plan_detail"] = plan_summary(row.get("plan"))
        row["billing_status"] = row.get("billing_status") or "none"
        out.append(row)
    return out


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

    # Subscription record — starts 'inactive' until the brand actually pays via
    # Stripe (a webhook/sync flips it to 'active'). Seeding 'active' would let a
    # brand appear paid-up without a real subscription.
    await db.execute(text("""
        INSERT INTO tenant_subscriptions (tenant_id, plan, status)
        VALUES (:tid, :plan, 'inactive')
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
                           role, is_admin, is_active, email_verified)
        VALUES (:tid, :email, :pwd, :fn, :ln, 'tenant_admin', true, true, true)
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


def _shop_name_follows(
    tenant_name: str | None, store_name: str | None, company_name: str | None
) -> bool:
    """Whether renaming the brand should rename the shop too.

    Yes while the shop is still called what the platform calls it, or nothing
    at all — then the two names were never meant to differ and leaving one
    behind is the bug. No once the shop trades under a name of its own, which
    is a decision the brand made and this console has no business undoing.
    """
    was = (tenant_name or "").strip().lower()
    if not was:
        return False
    return all(
        (chosen or "").strip().lower() in ("", was)
        for chosen in (store_name, company_name)
    )


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

    if "slug" in updates:
        import re as _re

        wanted = _re.sub(r"[^a-z0-9]+", "-", str(updates["slug"]).strip().lower()).strip("-")
        if not _re.fullmatch(r"[a-z0-9][a-z0-9-]{1,48}[a-z0-9]", wanted or ""):
            raise HTTPException(
                status_code=400,
                detail="An address is lower-case letters, numbers and hyphens, 3 characters or more.",
            )
        if wanted in _RESERVED_SLUGS:
            raise HTTPException(status_code=409, detail=f"'{wanted}' is reserved by the platform")
        taken = (await db.execute(
            text("SELECT slug FROM tenants WHERE slug = :s AND slug <> :cur"),
            {"s": wanted, "cur": slug},
        )).first()
        if taken:
            raise HTTPException(status_code=409, detail=f"'{wanted}' is already taken")
        updates["slug"] = wanted

    if "custom_domain" in updates:
        from app.services import tenant_hosts

        cleaned = tenant_hosts.normalise(updates["custom_domain"])
        clash = (await db.execute(text(
            "SELECT slug FROM tenants WHERE lower(custom_domain) = :d AND slug <> :s"
        ), {"d": cleaned, "s": slug})).first()
        if cleaned and clash:
            raise HTTPException(status_code=409, detail=f"'{cleaned}' already belongs to '{clash[0]}'")
        updates["custom_domain"] = cleaned or None

    # Renaming a brand here changed the name the platform files it under and
    # nothing the brand's own customers ever see — so a shop renamed in this
    # console kept its old name in the browser tab, in its emails and on its
    # order pages. The shop's name follows, but only while it was still the
    # same name: a brand that deliberately trades under something else keeps it.
    rename_shop = False
    if "name" in updates:
        before = (await db.execute(
            text("SELECT name FROM tenants WHERE slug = :s"), {"s": slug}
        )).scalar()
        shop = (await db.execute(text(
            "SELECT store_name, company_name FROM tenant_branding "
            " WHERE tenant_id = (SELECT id FROM tenants WHERE slug = :s)"
        ), {"s": slug})).mappings().first()
        if shop is not None:
            rename_shop = _shop_name_follows(
                before, shop["store_name"], shop["company_name"]
            )

    set_clause = ", ".join(f"{k}=:{k}" for k in updates)
    # The row is found by the slug it has now, under its own parameter name —
    # sharing one with the column being set would write the old value back.
    params = {**updates, "current_slug": slug}

    await db.execute(
        text(f"UPDATE tenants SET {set_clause}, updated_at=now() WHERE slug=:current_slug"),
        params,
    )
    if rename_shop:
        await db.execute(text(
            "UPDATE tenant_branding SET store_name = :n, company_name = :n, updated_at = now() "
            " WHERE tenant_id = (SELECT id FROM tenants WHERE slug = :s)"
        ), {"n": updates["name"], "s": updates.get("slug", slug)})
    await db.commit()
    if rename_shop:
        from app.core.database import forget_brand_name

        tid = (await db.execute(
            text("SELECT id FROM tenants WHERE slug = :s"), {"s": updates.get("slug", slug)}
        )).scalar()
        if tid:
            forget_brand_name(tid)
    if "custom_domain" in updates:
        from app.services import tenant_hosts

        tenant_hosts.forget()
    return {
        "message": f"Tenant '{slug}' updated",
        "slug": updates.get("slug", slug),
        "updated": list(data.model_dump(exclude_none=True).keys()),
    }


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
) -> dict[str, Any]:
    """Every feature the platform offers, and where this brand stands on it.

    Not just the rows that happen to exist: the whole catalogue, what the
    brand's plan includes, and what has been decided for it regardless of the
    plan — because you cannot grant something you cannot see.
    """
    _require_platform_admin(request)
    from app.services import entitlements

    tid = (await db.execute(text("SELECT id FROM tenants WHERE slug=:s"), {"s": slug})).scalar()
    if not tid:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return await entitlements.detail(db, tid)


# ── Which Stripe world the platform is in ────────────────────────────────────

@router.get("/stripe-mode")
async def get_stripe_mode(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Whether the platform is taking real money or pretending to."""
    _require_platform_admin(request)
    from app.services import stripe_mode

    return await stripe_mode.status(db)


class StripeModeUpdate(BaseModel):
    mode: str  # "live" | "test"


@router.put("/stripe-mode")
async def set_stripe_mode(
    data: StripeModeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Switch the platform between Stripe's test and live worlds.

    The platform's alone to change: both keys sit in the environment, and one
    brand flipping this would put every other brand's checkout into test mode
    with it.
    """
    _require_platform_admin(request)
    from app.services import stripe_mode

    try:
        return await stripe_mode.set_mode(db, data.mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Gang Sheet Builder commission ─────────────────────────────────────────────

@router.get("/{slug}/commission")
async def get_tenant_commission(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """What we take on this brand's Gang Sheet Builder orders."""
    _require_platform_admin(request)
    from app.services import commission

    tid = (await db.execute(text("SELECT id FROM tenants WHERE slug=:s"), {"s": slug})).scalar()
    if not tid:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return await commission.for_tenant(db, tid)


class CommissionUpdate(BaseModel):
    # Basis points: 280 = 2.8%. Null hands the brand back to its plan's rate,
    # which is different from setting it to zero — one is "whatever the tier
    # says", the other is "this brand pays nothing".
    bps: int | None = None


@router.put("/{slug}/commission")
async def set_tenant_commission(
    slug: str,
    data: CommissionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Charge one brand a rate of its own, or hand it back to the plan."""
    _require_platform_admin(request)
    from app.services import commission

    tid = (await db.execute(text("SELECT id FROM tenants WHERE slug=:s"), {"s": slug})).scalar()
    if not tid:
        raise HTTPException(status_code=404, detail="Tenant not found")
    try:
        return await commission.set_override(db, tid, data.bps)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class FeatureFlagUpdate(BaseModel):
    feature: str
    # True grants it, False takes it away, and null goes back to whatever the
    # brand's plan says — three states, because "off" and "not decided" are
    # different answers once a plan change can move the default underneath.
    is_enabled: bool | None = None


@router.put("/{slug}/features")
async def update_tenant_feature(
    slug: str,
    data: FeatureFlagUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_admin(request)
    from app.core.features import ALL_FEATURES
    from app.services import entitlements

    if data.feature not in ALL_FEATURES:
        raise HTTPException(status_code=400, detail=f"'{data.feature}' is not a feature")

    tid = await db.execute(text("SELECT id FROM tenants WHERE slug=:s"), {"s": slug})
    row = tid.first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if data.is_enabled is None:
        # Back to the plan's own answer.
        await db.execute(text(
            "DELETE FROM tenant_feature_flags WHERE tenant_id = :tid AND feature = :f"
        ), {"tid": str(row[0]), "f": data.feature})
    else:
        await db.execute(text("""
            INSERT INTO tenant_feature_flags (tenant_id, feature, is_enabled)
            VALUES (:tid, :f, :en)
            ON CONFLICT (tenant_id, feature) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now()
        """), {"tid": str(row[0]), "f": data.feature, "en": data.is_enabled})
    await db.commit()
    entitlements.forget(row[0])
    return await entitlements.detail(db, row[0])


# ── A brand's free period ─────────────────────────────────────────────────────
class TrialIn(BaseModel):
    # Absent means the usual fortnight. Zero or less ends it.
    days: int | None = None


@router.get("/{slug}/trial")
async def get_trial(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Where this brand stands on its trial."""
    _require_platform_admin(request)
    from app.services import trial

    row = (await db.execute(text("SELECT id FROM tenants WHERE slug=:s"), {"s": slug})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return await trial.status(db, row[0])


@router.put("/{slug}/trial")
async def set_trial(
    slug: str,
    data: TrialIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Start a brand's trial now, or end it.

    Starting resets the clock and clears which reminders have gone out, so a
    brand given another fortnight is warned about that one too.
    """
    _require_platform_admin(request)
    from app.services import trial

    row = (await db.execute(
        text("SELECT id, name FROM tenants WHERE slug=:s"), {"s": slug}
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")

    days = trial.DEFAULT_DAYS if data.days is None else int(data.days)
    result = await trial.clear(db, row[0]) if days <= 0 else await trial.start(db, row[0], days)

    try:
        from app.middleware.audit_middleware import write_audit_log

        await write_audit_log(
            db,
            admin_user_id=getattr(request.state, "user_id", None),
            action="UPDATE", entity_type="tenant_trial", entity_id=slug,
            old_values=None,
            new_values={"brand": row[1], "days": days, "ends_at": result.get("ends_at")},
            ip_address=getattr(getattr(request, "client", None), "host", None),
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
    except Exception:
        logger.exception("Could not record the trial change for %s", slug)
    return result


# ── Hand a brand's owner their login ──────────────────────────────────────────
class SetAdminPassword(BaseModel):
    # Left out, a strong one is generated. Chosen passwords are for handing to
    # somebody over the phone, so they are allowed but not encouraged.
    password: str | None = None


@router.post("/{slug}/admin-password")
async def set_tenant_admin_password(
    slug: str,
    data: SetAdminPassword,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Set the brand admin's password and return it once.

    A stored password cannot be read back — it is a hash, and that is the
    point of it. So when the owner of a brand has lost theirs, the only
    honest answer is a new one, set deliberately and handed over.

    This exists so that is not done with an UPDATE typed into a production
    database console, where a mistyped WHERE changes every brand's password
    and nothing records that it happened.
    """
    _require_platform_admin(request)

    row = (await db.execute(
        text("SELECT id, name FROM tenants WHERE slug=:s"), {"s": slug}
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant_id, tenant_name = row[0], row[1]

    admin = (await db.execute(text("""
        SELECT id, email FROM users
        WHERE tenant_id = :tid AND role = 'tenant_admin' AND is_active = true
        ORDER BY created_at ASC LIMIT 1
    """), {"tid": str(tenant_id)})).mappings().first()
    if not admin:
        raise HTTPException(status_code=404, detail="This brand has no active admin user")

    password = (data.password or "").strip()
    if password:
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    else:
        password = _readable_password()

    await db.execute(text("""
        UPDATE users SET
            hashed_password = :h,
            password_reset_token = NULL,
            password_reset_expires = NULL,
            updated_at = now()
        WHERE id = :u
    """), {"h": hash_password(password), "u": str(admin["id"])})

    # Taking over an account is exactly the kind of thing that has to leave a
    # trace, so the commit carries the audit row with it rather than after it.
    try:
        from app.middleware.audit_middleware import write_audit_log

        await write_audit_log(
            db,
            admin_user_id=getattr(request.state, "user_id", None),
            action="UPDATE",
            entity_type="tenant_admin_password",
            entity_id=slug,
            old_values=None,
            new_values={"brand": tenant_name, "admin_email": admin["email"]},
            ip_address=getattr(getattr(request, "client", None), "host", None),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        logger.exception("Could not write the audit row for a password reset on %s", slug)
    await db.commit()

    # Returned once and never stored anywhere readable. Reloading the console
    # will not show it again.
    return {"email": admin["email"], "password": password, "brand": tenant_name}


def _readable_password() -> str:
    """A password strong enough to matter and plain enough to read aloud.

    No l/I/1 or O/0, because this gets dictated over a phone or copied out of
    a chat message, and a password that cannot be transcribed just becomes a
    second support call.
    """
    import secrets

    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    return "-".join(
        "".join(secrets.choice(alphabet) for _ in range(5)) for _ in range(3)
    )


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

    # Record who entered which brand. Impersonation grants a super admin full
    # access to a brand's data, so it must leave an accountable trail — the audit
    # middleware can't capture it because the request carries no brand context yet.
    try:
        from app.middleware.audit_middleware import write_audit_log

        await write_audit_log(
            db,
            admin_user_id=getattr(request.state, "user_id", None),
            action="CREATE",
            entity_type="impersonation_session",
            entity_id=slug,
            old_values=None,
            new_values={"brand": row[1], "entered_as": admin["email"]},
            ip_address=getattr(getattr(request, "client", None), "host", None),
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
    except Exception:
        # Never let audit bookkeeping block the admin from entering the brand.
        pass

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
