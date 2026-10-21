"""
Platform Admin API — Tenant Management
Only accessible to platform admins (is_platform_admin=true).
Endpoints:
  GET  /platform/tenants          — list all tenants
  POST /platform/tenants          — create new tenant
  GET  /platform/tenants/{slug}   — tenant detail
  PUT  /platform/tenants/{slug}   — update tenant (status, plan)
  DELETE /platform/tenants/{slug} — soft-delete tenant

Every change made here is written to the activity log, against the brand it
was made to, so a brand's own history shows what the platform did to it.
"""
import json
import logging
import re
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
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


async def _audit(
    db: AsyncSession, request: Request, *, action: str, entity_type: str, slug: str | None,
    tenant_id: Any = None, new_values: dict | None = None, old_values: dict | None = None,
    summary: str | None = None,
) -> None:
    """One activity-log row for a console action, against the brand it touched.

    The console's own requests are not under /api/v1/admin, so the audit
    middleware never saw them: creating, suspending, re-planning or deleting a
    brand left no trace, and the few rows that were written named no brand.
    The caller commits; a row that cannot be written never blocks the action.
    """
    try:
        from app.middleware.audit_middleware import _client_ip, write_audit_log

        await write_audit_log(
            db,
            admin_user_id=getattr(request.state, "user_id", None),
            action=action, entity_type=entity_type, entity_id=slug,
            old_values=old_values, new_values=new_values,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            summary=summary, tenant_id=tenant_id,
        )
    except Exception:
        logger.exception("Could not record %s %s for %s", action, entity_type, slug)


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
    # The free period in days: absent is the usual fortnight, 0 starts none.
    trial_days: int | None = None
    # A Gang Sheet Builder rate of its own, in basis points; absent is the plan's.
    commission_bps: int | None = None
    # The shop's own time zone (an IANA name, "America/Chicago").
    timezone: str | None = None


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
    # Why the platform closed the shop: kept with the hold and in the log.
    reason: str | None = None


# Addresses the platform keeps for itself, so a brand can never take one.
_RESERVED_SLUGS = {
    "www", "api", "admin", "platform", "app", "static", "assets", "cdn",
    "mail", "smtp", "ftp", "blog", "help", "support", "status", "docs",
}
_STATUSES = ("active", "suspended", "cancelled")


def clean_slug(value: str) -> str:
    """A brand address as stored: lower-case letters, numbers and hyphens.
    ValueError when there is nothing usable left, 3 to 50 characters."""
    wanted = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,48}[a-z0-9]", wanted or ""):
        raise ValueError("An address is lower-case letters, numbers and hyphens, 3 characters or more.")
    return wanted


def _plan_problem(plan: str | None) -> str | None:
    """Why this is not a plan a brand can be put on, or None when it is."""
    from app.core.billing_plans import BILLING_PLANS, PLAN_ORDER

    if (plan or "").strip().lower() in BILLING_PLANS:
        return None
    names = ", ".join(BILLING_PLANS[k]["name"] for k in PLAN_ORDER)
    return f"'{plan}' is not a plan. Choose one of: {names}."


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
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """A shop made from the console, the way a shop that signs itself up is made.

    It used to be a different, thinner shop: on a plan that does not exist
    ("standard", so 0% Gang Sheet commission), with no free period, no setup
    steps for its owner and nobody told to add its address. Now it has a real
    plan, the free period (14 days unless told otherwise), the owner's setup
    steps, and the same notice to the platform inbox a sign-up sends.
    """
    _require_platform_admin(request)
    from app.core.tenant_settings import set_setting
    from app.services import commission, onboarding, trial

    try:
        slug = clean_slug(data.slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if slug in _RESERVED_SLUGS:
        raise HTTPException(status_code=409, detail=f"'{slug}' is reserved by the platform")
    plan = (data.plan or "").strip().lower()
    problem = _plan_problem(plan)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    if len(data.admin_password or "") < 8:
        raise HTTPException(status_code=400, detail="The owner's password must be at least 8 characters.")
    if data.commission_bps is not None and not 0 <= data.commission_bps <= commission.MAX_BPS:
        raise HTTPException(status_code=400, detail=f"A commission is between 0% and {commission.MAX_BPS / 100:.0f}%.")
    zone = ""
    if data.timezone:
        from app.services.production_board import clean_timezone

        try:
            zone = clean_timezone(data.timezone)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"'{data.timezone}' is not a time zone.")
    trial_days = trial.DEFAULT_DAYS if data.trial_days is None else max(0, min(int(data.trial_days), 365))

    if (await db.execute(text("SELECT 1 FROM tenants WHERE slug=:s"), {"s": slug})).first():
        raise HTTPException(status_code=409, detail=f"Slug '{slug}' already taken")
    owner_email = data.admin_email.strip().lower()

    tenant_id = (await db.execute(text("""
        INSERT INTO tenants (slug, name, email, status, plan)
        VALUES (:slug, :name, :email, 'active', :plan)
        RETURNING id
    """), {"slug": slug, "name": data.name.strip(), "email": data.email.strip(), "plan": plan})).scalar()

    await db.execute(text("""
        INSERT INTO tenant_branding (tenant_id, company_name)
        VALUES (:tid, :name)
    """), {"tid": str(tenant_id), "name": data.name.strip()})

    # Starts 'inactive' until the brand actually pays (a Stripe event or sync
    # makes it 'active'): seeding 'active' would make a brand look paid-up
    # without a real subscription. The free period starts now.
    await db.execute(text("""
        INSERT INTO tenant_subscriptions (tenant_id, plan, status, trial_ends_at, trial_notices_sent)
        VALUES (:tid, :plan, 'inactive',
                CASE WHEN :days > 0 THEN now() + make_interval(days => :days) END, '[]'::jsonb)
    """), {"tid": str(tenant_id), "plan": plan, "days": trial_days})

    # No feature rows: the plan decides (app/core/features.py). The four rows
    # this used to write changed nothing the plan did not already include, and
    # read in the console as decisions somebody had made.

    await db.execute(text("""
        INSERT INTO users (tenant_id, email, hashed_password, first_name, last_name,
                           role, is_admin, is_active, email_verified)
        VALUES (:tid, :email, :pwd, :fn, :ln, 'tenant_admin', true, true, true)
    """), {
        "tid": str(tenant_id),
        "email": owner_email,
        "pwd": hash_password(data.admin_password),
        "fn": data.admin_first_name.strip(),
        "ln": data.admin_last_name.strip(),
    })

    # The owner's setup steps, from the second: the shop itself is made.
    await set_setting(db, onboarding.KEY, json.dumps(onboarding.initial(None, None)), tenant_id=tenant_id)
    if data.commission_bps is not None:
        await set_setting(db, commission.KEY, str(int(data.commission_bps)), tenant_id=tenant_id)
    if zone:
        await set_setting(db, "shop_timezone", zone, tenant_id=tenant_id)

    await _audit(
        db, request, action="CREATE", entity_type="tenant", slug=slug, tenant_id=tenant_id,
        new_values={"brand": data.name.strip(), "plan": plan, "trial_days": trial_days,
                    "owner": owner_email, "commission_bps": data.commission_bps, "timezone": zone or None},
        summary=f"Created the brand {data.name.strip()} on {plan.title()}",
    )
    await db.commit()

    from app.services import tenant_hosts
    from app.services.brand_urls import build as brand_url

    tenant_hosts.forget()
    store_url = brand_url(slug, None, "/")
    background.add_task(_announce_created, data.name.strip(), slug, plan, owner_email, store_url)

    return {
        "id": str(tenant_id),
        "slug": slug,
        "name": data.name.strip(),
        "plan": plan,
        "trial_days": trial_days,
        "admin_email": owner_email,
        "store_url": store_url,
        "url_local": f"http://{slug}.localhost:3000",
        "message": "Tenant created successfully",
    }


def _announce_created(shop: str, slug: str, plan: str, owner: str, shop_url: str) -> None:
    """Tell the platform inbox, as a sign-up does: the shop's address only
    answers once someone adds it to the deployment by hand."""
    from html import escape

    from app.services.email_service import notify_platform

    host = shop_url.split("://", 1)[-1].split("/", 1)[0].split("?", 1)[0]
    body = (
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">'
        f'<h2 style="margin:0 0 4px">New shop: {escape(shop)}</h2>'
        '<p style="color:#6B7280;margin:0 0 20px">Created in the Platform Console just now.</p>'
        f'<p style="margin:0 0 20px"><strong>To do:</strong> add <code>{escape(host)}</code> '
        "in Vercel → the project → Domains, so the shop's address answers.</p>"
        f'<p style="margin:0">Plan: {escape(plan.title())}<br>Owner: {escape(owner)}<br>'
        f'Address: <a href="{escape(shop_url)}">{escape(shop_url)}</a></p></div>'
    )
    try:
        notify_platform(f"New shop created in the console — {shop} ({slug})", body)
    except Exception:
        logger.warning("console create notice failed for %s", slug, exc_info=True)


# ── Which Stripe world the platform is in ────────────────────────────────────
# Declared before /{slug}: routes match in order, and /{slug} took
# "stripe-mode" for a brand's address, so this panel answered "not found".

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

    before = (await stripe_mode.status(db)).get("mode")
    try:
        result = await stripe_mode.set_mode(db, data.mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await _audit(db, request, action="UPDATE", entity_type="stripe_mode", slug=None,
                 old_values={"mode": before}, new_values={"mode": data.mode},
                 summary=f"Payments switched to {data.mode} mode")
    await db.commit()
    return result


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

    reason = (data.reason or "").strip()
    updates = {k: v for k, v in data.model_dump(exclude={"reason"}).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    current = (await db.execute(text(
        "SELECT id, name, slug, status, plan, custom_domain FROM tenants WHERE slug = :s"
    ), {"s": slug})).mappings().first()
    if not current:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant_id = current["id"]

    if "status" in updates and updates["status"] not in _STATUSES:
        raise HTTPException(status_code=400, detail=f"A status is one of: {', '.join(_STATUSES)}.")

    if "slug" in updates:
        try:
            wanted = clean_slug(updates["slug"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
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

    # A plan change goes through Stripe for a paying brand (switch_plan), so it
    # is applied before anything else and not written here a second time.
    plan_billing = None
    if "plan" in updates:
        new_plan = str(updates.pop("plan")).strip().lower()
        problem = _plan_problem(new_plan)
        if problem:
            raise HTTPException(status_code=400, detail=problem)
        if new_plan != (current["plan"] or ""):
            from app.services.billing_service import BillingService

            try:
                plan_billing = (await BillingService(db).switch_plan(slug, new_plan))["billing"]
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            except Exception as exc:
                logger.exception("Stripe refused the plan change for %s", slug)
                raise HTTPException(
                    status_code=502,
                    detail=f"Stripe did not accept the plan change, so nothing was changed: {exc}",
                )

    # Renaming a brand here changed the name the platform files it under and
    # nothing the brand's own customers ever see — so a shop renamed in this
    # console kept its old name in the browser tab, in its emails and on its
    # order pages. The shop's name follows, but only while it was still the
    # same name: a brand that deliberately trades under something else keeps it.
    rename_shop = False
    if "name" in updates:
        shop = (await db.execute(text(
            "SELECT store_name, company_name FROM tenant_branding WHERE tenant_id = :t"
        ), {"t": str(tenant_id)})).mappings().first()
        if shop is not None:
            rename_shop = _shop_name_follows(current["name"], shop["store_name"], shop["company_name"])

    if updates:
        set_clause = ", ".join(f"{k}=:{k}" for k in updates)
        # The row is found by its id: the slug may be one of the things changing.
        await db.execute(
            text(f"UPDATE tenants SET {set_clause}, updated_at=now() WHERE id=:tenant_id"),
            {**updates, "tenant_id": str(tenant_id)},
        )
    if rename_shop:
        await db.execute(text(
            "UPDATE tenant_branding SET store_name = :n, company_name = :n, updated_at = now() "
            " WHERE tenant_id = :t"
        ), {"n": updates["name"], "t": str(tenant_id)})

    # Closing or opening the shop by hand is a decision a Stripe event must not
    # undo (services/brand_status).
    from app.services import brand_status

    new_status = updates.get("status")
    if new_status and new_status != current["status"]:
        if new_status == "active":
            await brand_status.release(db, tenant_id)
        else:
            await brand_status.hold(db, tenant_id, status=new_status,
                                    by=getattr(request.state, "user_id", None), reason=reason)

    changed = {k: v for k, v in updates.items() if current.get(k) != v}
    if plan_billing:
        changed["plan"] = data.plan.strip().lower()
    if changed:
        await _audit(
            db, request, action="UPDATE", entity_type="tenant", slug=updates.get("slug", slug),
            tenant_id=tenant_id,
            old_values={k: current.get(k) for k in changed},
            new_values={**changed, **({"billing": plan_billing} if plan_billing else {}),
                        **({"reason": reason} if reason else {})},
            summary=_update_summary(current, changed, plan_billing, reason),
        )
    await db.commit()

    from app.services import entitlements

    entitlements.forget(tenant_id)
    brand_status.forget(tenant_id)
    if rename_shop:
        from app.core.database import forget_brand_name

        forget_brand_name(tenant_id)
    if "custom_domain" in updates or "slug" in updates:
        from app.services import tenant_hosts

        tenant_hosts.forget()
    return {
        "message": f"Tenant '{slug}' updated",
        "slug": updates.get("slug", slug),
        "updated": list(data.model_dump(exclude_none=True, exclude={"reason"}).keys()),
        # "switched": Stripe now bills the new plan; "not_subscribed": nothing is
        # billed yet, and the card on file will start this plan; "unchanged".
        "plan_billing": plan_billing,
    }


def _update_summary(current: dict, changed: dict, plan_billing: str | None, reason: str) -> str:
    """The activity log's line for a console change, in words."""
    parts = []
    if "plan" in changed:
        how = {"switched": " (Stripe switched)", "not_subscribed": " (nothing billed yet)"}.get(plan_billing or "", "")
        parts.append(f"plan {current.get('plan') or 'none'} to {changed['plan']}{how}")
    if "status" in changed:
        parts.append(f"status {current.get('status')} to {changed['status']}")
    if "name" in changed:
        parts.append(f"renamed to {changed['name']}")
    if "slug" in changed:
        parts.append(f"address moved to {changed['slug']}")
    if "custom_domain" in changed:
        parts.append(f"shop domain set to {changed['custom_domain'] or 'none'}")
    line = "Changed " + ", ".join(parts) if parts else "Updated the brand"
    return f"{line}. Reason: {reason}" if reason else line


class CancelIn(BaseModel):
    reason: str | None = None


@router.delete("/{slug}", status_code=204)
async def delete_tenant(
    slug: str,
    request: Request,
    data: CancelIn | None = None,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete: mark cancelled (reversible), held so Stripe cannot reopen it."""
    _require_platform_admin(request)
    from app.services import brand_status

    row = (await db.execute(
        text("SELECT id, status FROM tenants WHERE slug=:s"), {"s": slug}
    )).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    reason = ((data.reason if data else None) or "").strip()
    await db.execute(
        text("UPDATE tenants SET status='cancelled', updated_at=now() WHERE id=:t"),
        {"t": str(row["id"])},
    )
    await brand_status.hold(db, row["id"], status="cancelled",
                            by=getattr(request.state, "user_id", None), reason=reason)
    await _audit(db, request, action="UPDATE", entity_type="tenant", slug=slug, tenant_id=row["id"],
                 old_values={"status": row["status"]},
                 new_values={"status": "cancelled", **({"reason": reason} if reason else {})},
                 summary=f"Suspended and cancelled the brand{'. Reason: ' + reason if reason else ''}")
    await db.commit()
    brand_status.forget(row["id"])


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
    before = await commission.for_tenant(db, tid)
    try:
        result = await commission.set_override(db, tid, data.bps)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await _audit(db, request, action="UPDATE", entity_type="tenant_commission", slug=slug, tenant_id=tid,
                 old_values={"override_bps": before.get("override_bps")},
                 new_values={"override_bps": data.bps},
                 summary=(f"Gang Sheet commission set to {result['display']}" if data.bps is not None
                          else f"Gang Sheet commission back to the plan rate, {result['display']}"))
    await db.commit()
    return result


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
    from app.core.features import ALL_FEATURES, LABELS
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
    label = LABELS.get(data.feature, data.feature)
    await _audit(db, request, action="UPDATE", entity_type="tenant_feature", slug=slug, tenant_id=row[0],
                 new_values={"feature": data.feature, "is_enabled": data.is_enabled},
                 summary=(f"{label}: back to the plan" if data.is_enabled is None
                          else f"{label}: {'granted' if data.is_enabled else 'removed'}"))
    await db.commit()
    entitlements.forget(row[0])
    return await entitlements.detail(db, row[0])


# ── A brand's free period ─────────────────────────────────────────────────────
class TrialIn(BaseModel):
    # Absent means the usual fortnight. Zero or less ends it.
    days: int | None = None
    # Add the days to the current end instead of starting again from today.
    extend: bool = False


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
    """Start a brand's trial now, extend it, or end it.

    Starting or extending clears which reminders have gone out, so a brand
    given more time is warned about the new end too.
    """
    _require_platform_admin(request)
    from app.services import trial

    row = (await db.execute(
        text("SELECT id, name FROM tenants WHERE slug=:s"), {"s": slug}
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")

    days = trial.DEFAULT_DAYS if data.days is None else int(data.days)
    if days <= 0:
        result = await trial.clear(db, row[0])
        line = "Ended the free trial"
    elif data.extend:
        result = await trial.extend(db, row[0], days)
        line = f"Extended the free trial by {days} days"
    else:
        result = await trial.start(db, row[0], days)
        line = f"Started a {days}-day free trial from today"

    await _audit(db, request, action="UPDATE", entity_type="tenant_trial", slug=slug, tenant_id=row[0],
                 new_values={"brand": row[1], "days": days, "extend": data.extend,
                             "ends_at": result.get("ends_at")},
                 summary=line)
    await db.commit()
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
    await _audit(db, request, action="UPDATE", entity_type="tenant_admin_password", slug=slug,
                 tenant_id=tenant_id, new_values={"brand": tenant_name, "admin_email": admin["email"]},
                 summary=f"Set a new password for the owner, {admin['email']}")
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
# How long platform support stays inside a brand, in minutes. The session was
# an ordinary owner token, good for days, that renewed itself.
SUPPORT_MINUTES_DEFAULT = 60
SUPPORT_MINUTES_RANGE = (15, 240)


class ImpersonateIn(BaseModel):
    # Why support is going in: kept in the brand's activity log.
    reason: str = ""
    minutes: int | None = None


@router.post("/{slug}/impersonate")
async def impersonate_tenant(
    slug: str,
    request: Request,
    data: ImpersonateIn | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Platform support enters a brand: an access token for that brand's owner,
    so support lands inside the brand's admin dashboard (Shopify Plus 'Login
    as store').

    The session is short and marked as support's: it carries who opened it,
    the brand's console shows a banner and never renews it, and whatever is
    done inside is logged against the support person, not the owner.
    """
    _require_platform_admin(request)
    reason = ((data.reason if data else "") or "").strip()[:300]
    low, high = SUPPORT_MINUTES_RANGE
    minutes = max(low, min(high, int((data.minutes if data else None) or SUPPORT_MINUTES_DEFAULT)))

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

    support_id = getattr(request.state, "user_id", None)
    support_email = (await db.execute(
        text("SELECT email FROM users WHERE id = CAST(:u AS uuid)"), {"u": str(support_id)}
    )).scalar() if support_id else None

    claims = {
        "tenant_id": str(tenant_id),
        "tenant_slug": slug,
        "role": "tenant_admin",
        "is_platform_admin": False,
        "is_admin": True,
        "impersonated": True,
        "impersonated_by": str(support_id) if support_id else None,
        "impersonator_email": support_email,
    }
    token = create_access_token(subject=str(admin["id"]), extra_claims=claims, expires_minutes=minutes)

    # Impersonation grants a super admin full access to a brand's data, so it
    # must leave an accountable trail, against the brand, with the reason.
    await _audit(db, request, action="CREATE", entity_type="impersonation_session", slug=slug,
                 tenant_id=tenant_id,
                 new_values={"brand": row[1], "entered_as": admin["email"], "reason": reason or None,
                             "minutes": minutes},
                 summary=f"Opened the brand console as support for {minutes} minutes"
                         + (f". Reason: {reason}" if reason else ""))
    try:
        await db.commit()
    except Exception:
        # Never let audit bookkeeping block the admin from entering the brand.
        await db.rollback()
        logger.exception("Could not record entering %s", slug)

    return {"access_token": token, "slug": slug, "admin_email": admin["email"], "minutes": minutes}


# ── Clearing out a trial run ──────────────────────────────────────────────────

# What a shop accumulates while it is being tried out, in the order it has to
# go. Returns come before orders because an order with a return against it
# cannot be deleted while the return is there, and the gang-sheet designs come
# before the orders that bought them for the same reason in reverse: nothing
# points at a design, so it goes early and reads better in the count.
#
# Everything else either hangs off these rows and follows them down, or holds a
# reference that the database empties by itself.
#
# Not here, on purpose: gang_sheet_library_designs. That is the shop's own
# shelf of ready-made designs, put there by the brand for its buyers — part of
# the shop, like its products, and nothing a trial run leaves behind.
_CLEARED: tuple[tuple[str, str], ...] = (
    ("returns", "rma_requests"),
    ("built gang sheets", "gang_sheet_orders"),
    ("orders", "orders"),
    ("discount uses", "discount_usage"),
    ("statement lines", "statement_transactions"),
    ("refunds", "payment_refunds"),
    ("disputes", "disputes"),
    ("carts", "cart_items"),
    ("abandoned carts", "abandoned_carts"),
    ("customer totals", "customer_metrics"),
)


class ClearTestData(BaseModel):
    """Typing the brand's own address is the confirmation."""

    confirm: str


@router.post("/{slug}/clear-test-data")
async def clear_test_data(
    slug: str,
    data: ClearTestData,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Throw away what a shop did while it was being tested, and nothing else.

    A brand is tried before it is launched — orders placed to see the emails,
    gang sheets uploaded to see the review queue — and then it goes live with
    somebody else's experiments sitting in its order list, in its numbering and
    in its customers' totals. This clears the trading history and leaves the
    shop itself alone: products, customers, staff, theme, settings, suppliers
    and the sizes the builder offers all stay exactly as they are.

    It cannot be undone, so it asks for the brand's address to be typed, it is
    a platform admin's call rather than a brand's own, and the audit log is
    deliberately not touched: a record of what happened is the one thing that
    should survive the records being cleared.
    """
    _require_platform_admin(request)

    tenant_id = (await db.execute(
        text("SELECT id FROM tenants WHERE slug = :s"), {"s": slug}
    )).scalar()
    if not tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if (data.confirm or "").strip().lower() != slug.lower():
        raise HTTPException(
            status_code=400,
            detail=f"Type '{slug}' to confirm. Nothing has been deleted.",
        )

    removed: dict[str, int] = {}
    for label, table in _CLEARED:
        result = await db.execute(
            text(f"DELETE FROM {table} WHERE tenant_id = CAST(:t AS uuid)"),
            {"t": str(tenant_id)},
        )
        if result.rowcount:
            removed[label] = result.rowcount
    await _audit(db, request, action="DELETE", entity_type="test_data", slug=slug, tenant_id=tenant_id,
                 new_values={"removed": removed},
                 summary=f"Cleared the test data: {sum(removed.values())} rows")
    await db.commit()

    logger.warning(
        "Test data cleared for tenant %s (%s): %s", slug, tenant_id, removed or "nothing"
    )
    return {
        "slug": slug,
        "removed": removed,
        "total": sum(removed.values()),
        # Said back rather than assumed: the point of the action is what it
        # leaves behind, and that is worth reading on screen.
        "kept": "products, customers, staff, settings, the site, suppliers and the shop's ready-made designs",
    }


# ── Hard purge (irreversible) ─────────────────────────────────────────────────
@router.delete("/{slug}/purge", status_code=204)
async def purge_tenant(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a tenant and ALL its data (cascades via FK). Irreversible."""
    _require_platform_admin(request)
    row = (await db.execute(text("SELECT id, name FROM tenants WHERE slug=:s"), {"s": slug})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    # Written against no brand: the brand's own rows go with it.
    await _audit(db, request, action="DELETE", entity_type="tenant", slug=slug, tenant_id=None,
                 new_values={"brand": row[1], "tenant_id": str(row[0])},
                 summary=f"Permanently deleted the brand {row[1]} ({slug})")
    await db.execute(text("DELETE FROM tenants WHERE id=:t"), {"t": str(row[0])})
    await db.commit()
    from app.services import brand_status, tenant_hosts

    brand_status.forget(row[0])
    tenant_hosts.forget()
