"""The partner program's public doors.

The program page and its numbers, a click on a partner's link, and a code
typed at a shop's sign-up. Nobody needs an account for any of these, and none
of them says anything about a partner beyond whether their code works.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import client_ip, enforce_rate_limit
from app.services.partners import ledger, program, referrals
from app.services.partners.db import get_partner_db

router = APIRouter(prefix="/partners", tags=["partners"])


class ClickIn(BaseModel):
    code: str = Field(max_length=40)
    src: str | None = Field(default=None, max_length=80)
    landing: str | None = Field(default=None, max_length=300)
    referrer: str | None = Field(default=None, max_length=300)


@router.get("/program")
async def program_page(db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    """What the public program page and the application form show."""
    settings = await program.load(db)
    standard = None
    if settings["show_standard_rate"]:
        public = [p for p in await program.rate_plans(db) if p["is_public"]]
        standard = public[0] if public else None
    terms = await program.latest_terms(db)
    examples = []
    if standard:
        for key in settings["commissionable_plans"]:
            price = program.plan_price_cents(key)
            examples.append({
                "plan": key, "name": program.plan_name(key), "price_cents": price,
                "earns_cents": ledger.commission_cents(price, standard["rate_bps"]),
            })
    return {
        "accepting_applications": settings["accepting_applications"],
        "accepting_referrals": settings["accepting_referrals"],
        "standard_rate_bps": standard["rate_bps"] if standard else None,
        "standard_rate": program.rate_words(standard["rate_bps"]) if standard else None,
        "examples": examples,
        "hold_days": settings["hold_days"],
        "minimum_payout_cents": settings["minimum_payout_cents"],
        "cookie_days": settings["cookie_days"],
        "support_email": settings["support_email"] or None,
        "terms": {"version": terms["version"], "clauses": terms["clauses"],
                  "published_at": terms["published_at"]} if terms else None,
    }


@router.post("/click")
async def click(payload: ClickIn, request: Request,
                db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    """A visitor arrived on a partner's link. Says whether the link works,
    and what the browser should remember if it does."""
    await enforce_rate_limit(request, "partner_click", limit=120, window=3600)
    return await referrals.record_click(
        db, code=payload.code, src=payload.src, landing=payload.landing,
        referrer=payload.referrer, ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.get("/codes/{code}")
async def code(code: str, request: Request,
               db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    """Whether a code typed at sign-up will count."""
    await enforce_rate_limit(request, "partner_code", limit=60, window=3600)
    return await referrals.code_status(db, code)


class ApplyIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    business_name: str | None = Field(default=None, max_length=200)
    website: str | None = Field(default=None, max_length=300)
    promote_how: str = Field(min_length=10, max_length=2000)
    audience_size: str | None = Field(default=None, max_length=60)
    terms_version: int
    accept_terms: bool = False
    # Left empty by people. A form-filling bot fills every field it finds.
    company: str | None = Field(default=None, max_length=200)


def _spam_flags(payload: ApplyIn) -> list[str]:
    import re

    links = len(re.findall(r"https?://", payload.promote_how or ""))
    if (payload.company or "").strip() or links > 3:
        return ["spam"]
    return []


@router.post("/apply")
async def apply(payload: ApplyIn, request: Request, background: BackgroundTasks,
                db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    """Apply to the partner program. The super admin decides; with auto
    approve on, an application with nothing to look at is approved at once."""
    from app.services.partners import actions, activity, auth, mail

    await enforce_rate_limit(request, "partner_apply", limit=5, window=3600)
    await enforce_rate_limit(request, "partner_apply_email", limit=3, window=86400, extra=payload.email)
    settings = await program.load(db)
    if not settings["accepting_applications"]:
        raise HTTPException(409, detail={"code": "CLOSED", "message": "We are not taking applications right now."})
    if not payload.accept_terms:
        raise HTTPException(400, detail={"code": "TERMS", "message": "Accept the partner terms to apply."})
    terms = await program.latest_terms(db)
    if not terms or payload.terms_version != terms["version"]:
        raise HTTPException(409, detail={"code": "TERMS", "message": "The terms changed. Reload the page and read them again."})
    email = payload.email.lower()

    waiting = (await db.execute(text("""
        SELECT id, status FROM partner_applications
         WHERE lower(email) = :e AND status IN ('waiting', 'info_requested') LIMIT 1
    """), {"e": email})).first()
    if waiting:
        return {"ok": True, "status": waiting[1]}

    flags = _spam_flags(payload)
    if (await db.execute(text("SELECT 1 FROM partners WHERE lower(email) = :e"), {"e": email})).first():
        flags.append("duplicate_email")
    if (await db.execute(text("""
        SELECT 1 FROM tenants WHERE lower(email) = :e
        UNION SELECT 1 FROM users WHERE lower(email) = :e AND role = 'tenant_admin' LIMIT 1
    """), {"e": email})).first():
        flags.append("existing_customer")
    domain = referrals.email_domain(email)
    host = referrals.web_host(payload.website)
    looks = [d for d in {domain if domain not in referrals.PUBLIC_EMAIL_DOMAINS else "", host} if d]
    if looks and (await db.execute(text("""
        SELECT 1 FROM tenants
         WHERE lower(custom_domain) = ANY(CAST(:d AS varchar[]))
            OR split_part(lower(email), '@', 2) = ANY(CAST(:d AS varchar[]))
         LIMIT 1
    """), {"d": looks})).first():
        flags.append("domain_match")

    app_id = (await db.execute(text("""
        INSERT INTO partner_applications (name, email, business_name, website, promote_how, audience_size,
                                          terms_version, terms_accepted_at, flags, ip_hash, user_agent)
        VALUES (:name, :email, :business, :website, :how, :audience, :tv, now(), CAST(:flags AS jsonb), :ip, :ua)
        RETURNING id
    """), {"name": payload.name.strip(), "email": email,
           "business": (payload.business_name or "").strip() or None,
           "website": (payload.website or "").strip() or None, "how": payload.promote_how.strip(),
           "audience": (payload.audience_size or "").strip() or None, "tv": terms["version"],
           "flags": json.dumps(flags), "ip": auth.ip_hash(client_ip(request)),
           "ua": (request.headers.get("user-agent") or "")[:300]})).scalar()
    await db.execute(text("""
        INSERT INTO partner_terms_acceptances (application_id, version, ip_hash, user_agent)
        VALUES (:a, :v, :ip, :ua)
    """), {"a": app_id, "v": terms["version"], "ip": auth.ip_hash(client_ip(request)),
           "ua": (request.headers.get("user-agent") or "")[:300]})
    await activity.log(db, action="application_received", actor_kind="system", actor_name=payload.name.strip(),
                       actor_email=email, subject_kind="application", subject_id=app_id, after={"flags": flags})

    if "spam" in flags:
        # Kept for the record, answered like any other, and never mailed.
        return {"ok": True, "status": "waiting"}
    if settings["auto_approve"] and not flags:
        system = actions.Actor(name="Auto approve", kind="system")
        partner, token = await actions.approve(db, system, app_id)
        plan = await program.default_rate_plan(db)
        background.add_task(mail.invite, partner["name"], partner["email"],
                            mail.portal_url(f"/partners/invite?token={token}"), partner["code"],
                            program.rate_words(plan["rate_bps"]) if plan else None)
        return {"ok": True, "status": "approved"}
    background.add_task(mail.application_received, payload.name, email)
    background.add_task(mail.notify_new_application, payload.name.strip(), email, payload.business_name,
                        payload.website, flags)
    return {"ok": True, "status": "waiting"}
