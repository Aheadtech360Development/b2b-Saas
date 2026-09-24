"""A shop signs itself up.

Until now a brand only existed because the platform typed it in. This is the
front door: pick a plan, give your details, and the shop exists with you signed
into its admin — the same three steps Shopify walks somebody through.

No card at this step: a plan is chosen, the details are given, and the shop is
made. The card is added from the shop's own Billing screen, where Stripe's page
collects it — the number never reaches this application, only the customer we
charge each month and the last four digits to show back.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_plans import is_valid_plan, public_pricing_table
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import create_access_token, hash_password

router = APIRouter(prefix="/signup", tags=["signup"])

# Addresses the platform keeps for itself, so a shop can never take one.
RESERVED = {
    "www", "api", "admin", "platform", "app", "static", "assets", "cdn", "mail",
    "smtp", "ftp", "blog", "help", "support", "status", "docs", "signup", "login",
    "account", "billing", "dashboard", "console", "shop", "store", "test", "demo",
    # Names the platform's mail already owns in DNS. A shop taking one would
    # not just clash with a page — it would break sending for every brand.
    "send", "rsend", "resend", "email", "mx", "dmarc", "bounce", "track",
}

_SLUG_OK = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$")


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")[:50]


class AvailabilityOut(BaseModel):
    slug: str
    available: bool
    reason: str = ""


class SignupIn(BaseModel):
    plan: str
    shop_name: str = Field(min_length=2, max_length=120)
    # Where the shop lives until it brings a domain. Derived from the name when
    # it isn't given, because most people never think about it.
    slug: str | None = None
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    phone: str = Field(default="", max_length=40)


@router.get("/plans")
async def plans() -> dict[str, Any]:
    """The tiers, as the sign-up page shows them."""
    return {"plans": public_pricing_table()}


@router.get("/availability")
async def availability(slug: str, db: AsyncSession = Depends(get_db)) -> AvailabilityOut:
    """Whether a shop can have this address."""
    cleaned = slugify(slug)
    if not _SLUG_OK.match(cleaned or ""):
        return AvailabilityOut(slug=cleaned, available=False,
                               reason="Use letters, numbers and hyphens — at least 3 characters.")
    if cleaned in RESERVED:
        return AvailabilityOut(slug=cleaned, available=False, reason="That one is reserved.")
    taken = (await db.execute(
        text("SELECT 1 FROM tenants WHERE slug = :s"), {"s": cleaned}
    )).first()
    return AvailabilityOut(slug=cleaned, available=not taken,
                           reason="Already taken." if taken else "")


def _welcome(shop: str, who: str, email: str, plan: str, shop_url: str) -> None:
    """Tell the new owner where their shop is and how to get into it.

    The two links are the whole point: the shop's own address, and the door to
    its admin. Everything else they can find once they are inside.
    """
    from app.services.email_service import platform_inbox, send_as_platform

    admin_url = f"{shop_url.rstrip('/')}/admin/dashboard"
    support = platform_inbox() or ""
    steps = [
        ("Add your first product", "Products → Add product. Or import a whole "
         "catalogue from S&amp;S Activewear in one go."),
        ("Make your shop yours", "Design → upload your logo and colours, and set "
         "the pages your customers will read."),
        ("Turn payments on", "Billing → add a card. Nothing is charged until you do, "
         "and nothing is taken from your orders before it."),
        ("Bring your own domain", "Settings → Domain. Point it at us and your shop "
         "answers there instead — everything else stays exactly as it is."),
    ]
    body = (
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
        'max-width:560px;color:#111318">'
        f'<h1 style="font-size:24px;margin:0 0 6px">Your shop is open, {who.split(" ")[0]}.</h1>'
        f'<p style="color:#5A5F68;margin:0 0 24px;line-height:1.6">'
        f'<strong>{shop}</strong> is live on the {plan.title()} plan. '
        'Here is where it lives and how to get in.</p>'
        f'<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;'
        'border:1px solid #E7E5E2;border-radius:10px;padding:4px 16px">'
        f'<tr><td style="padding:12px 0;color:#5A5F68">Your shop</td>'
        f'<td style="padding:12px 0;text-align:right"><a href="{shop_url}" '
        f'style="color:#111318;font-weight:600">{shop_url.replace("https://", "")}</a></td></tr>'
        f'<tr><td style="padding:12px 0;color:#5A5F68;border-top:1px solid #E7E5E2">Sign in with</td>'
        f'<td style="padding:12px 0;text-align:right;border-top:1px solid #E7E5E2;'
        f'font-weight:600">{email}</td></tr></table>'
        f'<p style="margin:24px 0"><a href="{admin_url}" style="background:#111318;color:#fff;'
        'padding:13px 26px;border-radius:9px;text-decoration:none;font-weight:700;'
        'display:inline-block">Open your admin →</a></p>'
        '<h2 style="font-size:15px;margin:30px 0 10px">First four things</h2>'
        + "".join(
            f'<p style="margin:0 0 14px;font-size:14px;line-height:1.6">'
            f'<strong>{n}. {title}</strong><br>'
            f'<span style="color:#5A5F68">{text}</span></p>'
            for n, (title, text) in enumerate(steps, 1)
        )
        + (f'<p style="color:#5A5F68;font-size:13px;margin:26px 0 0;border-top:1px solid #E7E5E2;'
           f'padding-top:16px">Stuck on anything, reply to this email or write to '
           f'<a href="mailto:{support}" style="color:#111318">{support}</a>.</p>' if support else "")
        + "</div>"
    )
    try:
        send_as_platform(email, f"{shop} is live — here's how to get in", body)
    except Exception:
        import logging

        logging.getLogger(__name__).warning("welcome mail failed for %s", email, exc_info=True)


def _announce(shop: str, slug: str, plan: str, who: str, email: str,
              phone: str, shop_url: str) -> None:
    """Tell the platform a shop just signed up.

    Runs after the response: a sign-up must not fail, or wait, because an inbox
    was unreachable.
    """
    from app.services.email_service import notify_platform

    rows = [
        ("Shop", shop), ("Address", f'<a href="{shop_url}">{shop_url}</a>'),
        ("Plan", plan.title()), ("Owner", who),
        ("Email", f'<a href="mailto:{email}">{email}</a>'),
        ("Phone", phone or "—"),
    ]
    body = (
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">'
        f'<h2 style="margin:0 0 4px">New shop: {shop}</h2>'
        '<p style="color:#6B7280;margin:0 0 20px">Signed up just now. '
        'No card yet — billing starts when they add one.</p>'
        '<table cellpadding="0" cellspacing="0" style="font-size:14px">'
        + "".join(
            f'<tr><td style="padding:6px 24px 6px 0;color:#6B7280">{k}</td>'
            f'<td style="padding:6px 0;font-weight:600">{v}</td></tr>'
            for k, v in rows
        )
        + "</table></div>"
    )
    try:
        notify_platform(f"New shop signed up — {shop} ({slug})", body)
    except Exception:  # never let a notification surface as a failed sign-up
        import logging

        logging.getLogger(__name__).warning("signup notice failed for %s", slug, exc_info=True)


@router.post("", status_code=201)
async def sign_up(payload: SignupIn, request: Request, background: BackgroundTasks,
                  db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Create the shop and sign its owner in.

    Everything happens in one transaction: a half-made shop — a tenant with no
    admin, or an admin who owns nothing — is worse than a failed sign-up.
    """
    await enforce_rate_limit(request, "signup", limit=10, window=3600)
    await enforce_rate_limit(request, "signup_email", limit=3, window=3600, extra=payload.email)

    if not is_valid_plan(payload.plan):
        raise HTTPException(status_code=400, detail="Choose one of the available plans")

    slug = slugify(payload.slug or payload.shop_name)
    if not _SLUG_OK.match(slug or "") or slug in RESERVED:
        raise HTTPException(
            status_code=400,
            detail="That shop address can't be used. Letters, numbers and hyphens, at least 3 characters.",
        )
    email = payload.email.lower()
    tenant_id = uuid.uuid4()
    user_id = uuid.uuid4()

    # A shop is created by somebody who does not belong to it yet, so the
    # request carries no tenant and row-level security would refuse every row
    # of the shop being made. This is the one place that is legitimate, and it
    # runs on its own session so the bypass covers the whole of it and nothing
    # else.
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping

    previous = is_scoping_bypassed()
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as new_db:
            # Checked on the same session that does the writing, so the answer
            # covers every shop on the platform rather than the ones this
            # request happens to be allowed to see.
            if (await new_db.execute(
                text("SELECT 1 FROM tenants WHERE slug = :s"), {"s": slug}
            )).first():
                raise HTTPException(status_code=409, detail=f"'{slug}' is already taken")
            if (await new_db.execute(
                text("SELECT 1 FROM users WHERE lower(email) = :e"), {"e": email}
            )).first():
                raise HTTPException(
                    status_code=409,
                    detail="That email already has an account here. Sign in with it instead.",
                )

            await new_db.execute(text("""
                INSERT INTO tenants (id, slug, name, email, status, plan)
                VALUES (:tid, :slug, :name, :email, 'active', :plan)
            """), {"tid": str(tenant_id), "slug": slug, "name": payload.shop_name.strip(),
                   "email": email, "plan": payload.plan})

            await new_db.execute(text("""
                INSERT INTO tenant_branding (tenant_id, company_name)
                VALUES (:tid, :name)
            """), {"tid": str(tenant_id), "name": payload.shop_name.strip()})

            # Nothing is billed until a card is on file, so the subscription
            # starts pending rather than active — a shop that looks paid-up
            # and never paid is how revenue quietly goes missing.
            await new_db.execute(text("""
                INSERT INTO tenant_subscriptions (tenant_id, plan, status)
                VALUES (:tid, :plan, 'inactive')
            """), {"tid": str(tenant_id), "plan": payload.plan})

            # No feature rows: the plan decides, and the platform overrides
            # what it wants to (app/core/features.py). Seeding rows here
            # would freeze a brand's features at whatever its plan included
            # on the day it signed up.

            await new_db.execute(text("""
                INSERT INTO users (id, tenant_id, email, hashed_password, first_name,
                                   last_name, phone, role, is_admin, is_active,
                                   email_verified, account_type)
                VALUES (:uid, :tid, :email, :pwd, :fn, :ln, :phone,
                        'tenant_admin', true, true, true, 'wholesale')
            """), {
                "uid": str(user_id), "tid": str(tenant_id), "email": email,
                "pwd": hash_password(payload.password),
                "fn": payload.first_name.strip(), "ln": payload.last_name.strip(),
                "phone": payload.phone.strip() or None,
            })
            await new_db.commit()

    except IntegrityError:
        # Two people signing up with the same address or email at the same
        # moment: the check above let both through, the constraint did not.
        raise HTTPException(
            status_code=409,
            detail="That shop address or email was just taken. Please try another.",
        )
    finally:
        set_bypass_scoping(previous)

    from app.services import tenant_hosts
    from app.services.brand_urls import build as brand_url

    tenant_hosts.forget()

    shop_url = brand_url(slug, None, "/")
    who = f"{payload.first_name} {payload.last_name}".strip()
    background.add_task(
        _announce, payload.shop_name.strip(), slug, payload.plan,
        who, email, payload.phone.strip(), shop_url,
    )
    background.add_task(
        _welcome, payload.shop_name.strip(), who, email, payload.plan, shop_url,
    )

    token = create_access_token(str(user_id), {
        "is_admin": True, "is_platform_admin": False,
        "tenant_id": str(tenant_id), "role": "tenant_admin",
        "account_type": "wholesale",
    })

    # No card here. Signing up is details and nothing else, and the owner goes
    # straight into their shop; the card is added from Billing when they are
    # ready for it, on Stripe's own page.
    return {
        "slug": slug,
        "tenant_id": str(tenant_id),
        "plan": payload.plan,
        "access_token": token,
        "next": "/admin/dashboard",
        "billing": "pending",
    }
