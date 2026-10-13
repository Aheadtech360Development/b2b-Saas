"""The partner program's public doors.

The program page and its numbers, a click on a partner's link, and a code
typed at a shop's sign-up. Nobody needs an account for any of these, and none
of them says anything about a partner beyond whether their code works.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
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
