"""Which partner a shop belongs to.

A visitor arrives on the platform with `?ref=CODE`. The click is counted and
the browser keeps `CODE.<click id>` for the cookie window (90 days unless the
program says otherwise); a later valid click replaces it. At sign-up the shop
is saved to the partner that cookie names, or, with no valid cookie, to the
code the owner typed: "Last valid click wins. A typed code beats a missing
cookie."

A shop whose owner is the partner, or shares the partner's own email domain
or website, is still saved to them but goes to the review queue, and its
lines are held until the super admin decides.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.partners import activity, program

_CODE = re.compile(r"^[A-Z0-9]{3,20}$")
_SRC = re.compile(r"[^a-z0-9_-]+")

# Addresses anybody can have. Sharing one says nothing about who owns a shop.
PUBLIC_EMAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com",
    "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
    "protonmail.com", "mail.com", "gmx.com", "gmx.net", "yandex.com", "zoho.com",
    "comcast.net", "att.net", "verizon.net", "sbcglobal.net", "bellsouth.net", "cox.net",
})


def normalise_code(raw: str | None) -> str | None:
    """A code as it is stored: letters and numbers, upper case, 3 to 20 long."""
    code = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    return code if _CODE.match(code) else None


def clean_src(raw: str | None) -> str | None:
    """A campaign tag (`&src=instagram`), kept short and plain."""
    src = _SRC.sub("", (raw or "").strip().lower())[:60]
    return src or None


def parse_cookie(raw: str | None) -> tuple[str | None, int | None]:
    """`CODE.123` -> ("CODE", 123). Anything else -> (None, None)."""
    code, _, click = (raw or "").strip().partition(".")
    code = normalise_code(code)
    try:
        click_id = int(click) if click else None
    except ValueError:
        click_id = None
    return (code, click_id) if code and click_id and click_id > 0 else (None, None)


def email_domain(email: str | None) -> str:
    return (email or "").strip().lower().rpartition("@")[2]


def web_host(url: str | None) -> str:
    raw = (url or "").strip().lower()
    if not raw:
        return ""
    host = urlparse(raw if "://" in raw else f"http://{raw}").hostname or ""
    return host[4:] if host.startswith("www.") else host


def self_referral_flags(owner_email: str, partner_email: str, partner_website: str | None) -> list[str]:
    """Why a sign-up might be the partner referring themselves."""
    if (owner_email or "").strip().lower() == (partner_email or "").strip().lower():
        return ["self_referral"]
    domain = email_domain(owner_email)
    if domain and domain not in PUBLIC_EMAIL_DOMAINS:
        partner_domain = email_domain(partner_email)
        if domain == partner_domain or domain == web_host(partner_website):
            return ["domain_match"]
    return []


def visitor_hash(ip: str | None, user_agent: str | None, day: str) -> str:
    """Who clicked, as far as counting goes: the same browser on the same day
    is one click. Salted with the app's secret, so it is not an address."""
    secret = get_settings().APP_SECRET_KEY
    return hashlib.sha256(f"{ip or ''}|{user_agent or ''}|{day}|{secret}".encode()).hexdigest()


async def partner_by_code(db: AsyncSession, code: str | None) -> dict | None:
    code = normalise_code(code)
    if not code:
        return None
    row = (await db.execute(text("""
        SELECT id, code, name, email, website, status
          FROM partners WHERE upper(code) = :c
    """), {"c": code})).mappings().first()
    return dict(row) if row else None


async def record_click(
    db: AsyncSession, *, code: str | None, src: str | None, landing: str | None,
    referrer: str | None, ip: str | None, user_agent: str | None,
) -> dict[str, Any]:
    """Count a click on a partner's link. Says whether the link works.

    A paused, suspended or ended partner's link is off, and so is every link
    while the program takes no new referrals: the visitor sees the "link not
    available" page and nothing is remembered.
    """
    settings = await program.load(db)
    if not settings["accepting_referrals"]:
        return {"ok": False, "reason": "closed"}
    partner = await partner_by_code(db, code)
    if not partner or partner["status"] != "active":
        return {"ok": False, "reason": "unavailable"}

    now = datetime.now(timezone.utc)
    who = visitor_hash(ip, user_agent, now.date().isoformat())
    click_id = (await db.execute(text("""
        SELECT id FROM partner_clicks
         WHERE partner_id = :p AND visitor_hash = :h AND at > now() - interval '1 day'
         ORDER BY id DESC LIMIT 1
    """), {"p": str(partner["id"]), "h": who})).scalar()
    if not click_id:
        click_id = (await db.execute(text("""
            INSERT INTO partner_clicks (partner_id, src, landing, referrer_host, visitor_hash)
            VALUES (:p, :src, :landing, :ref, :h) RETURNING id
        """), {
            "p": str(partner["id"]), "src": clean_src(src),
            "landing": (landing or "")[:300] or None,
            "ref": web_host(referrer)[:200] or None, "h": who,
        })).scalar()
    return {"ok": True, "code": partner["code"], "click_id": int(click_id),
            "cookie_days": settings["cookie_days"]}


async def code_status(db: AsyncSession, code: str | None) -> dict[str, Any]:
    """Whether a code typed at sign-up names a partner who can take a shop."""
    settings = await program.load(db)
    partner = await partner_by_code(db, code)
    ok = bool(settings["accepting_referrals"] and partner and partner["status"] == "active")
    return {"valid": ok, "code": partner["code"] if ok else normalise_code(code)}


async def attribute_signup(
    db: AsyncSession, *, tenant_id: uuid.UUID | str, shop_name: str, owner_email: str,
    typed_code: str | None, cookie: str | None,
) -> dict[str, Any] | None:
    """Save a new shop to the partner who brought it, if one did.

    Runs inside the sign-up's own transaction, under a savepoint the caller
    opens, so a problem here costs the partner a referral and never costs the
    shop its sign-up.
    """
    settings = await program.load(db)
    if not settings["accepting_referrals"]:
        return None

    partner, source, used, click_id, src = None, None, None, None, None
    cookie_code, cookie_click = parse_cookie(cookie)
    if cookie_code:
        candidate = await partner_by_code(db, cookie_code)
        if candidate and candidate["status"] == "active":
            click = (await db.execute(text("""
                SELECT id, src FROM partner_clicks
                 WHERE id = :id AND partner_id = :p AND at > :since
            """), {
                "id": cookie_click, "p": str(candidate["id"]),
                "since": datetime.now(timezone.utc) - timedelta(days=settings["cookie_days"]),
            })).mappings().first()
            if click:
                partner, source, used = candidate, "cookie", candidate["code"]
                click_id, src = click["id"], click["src"]
    if partner is None and typed_code:
        candidate = await partner_by_code(db, typed_code)
        if candidate and candidate["status"] == "active":
            partner, source, used = candidate, "code", candidate["code"]
    if partner is None:
        return None

    flags = self_referral_flags(owner_email, partner["email"], partner["website"])
    status = "review" if flags else "active"
    referral_id = (await db.execute(text("""
        INSERT INTO partner_referrals
            (partner_id, shop_tenant_id, shop_name, owner_email, source, code_used, click_id,
             src, status, flags)
        VALUES (:p, :t, :name, :email, :source, :code, :click, :src, :status, CAST(:flags AS jsonb))
        RETURNING id
    """), {
        "p": str(partner["id"]), "t": str(tenant_id), "name": (shop_name or "")[:200],
        "email": (owner_email or "").lower(), "source": source, "code": used,
        "click": click_id, "src": src, "status": status,
        "flags": json.dumps(flags),
    })).scalar()
    await activity.log(
        db, action="referral_attributed", actor_kind="system", partner_id=partner["id"],
        subject_kind="referral", subject_id=referral_id,
        after={"shop": shop_name, "source": source, "code": used, "status": status, "flags": flags},
    )
    return {"referral_id": str(referral_id), "partner_id": str(partner["id"]),
            "source": source, "status": status, "flags": flags}
