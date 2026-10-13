"""The program's own settings and rates.

Every number the deal is made of lives here, not in code: the hold, the
minimum payout, how long a click is remembered, which plans earn, the rates.
The super admin changes them on Program settings, so a decision about the
deal is a setting changed, never a release. A rate change reaches only lines
still to come: each line stores the rate it was earned at.

The settings are one JSON row in app_settings. Read with defaults, so a
setting nobody has saved yet still means what the design says it does.
"""
from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_plans import BILLING_PLANS, PLAN_ORDER

KEY = "partner_program"

DEFAULT_CAPTIONS = [
    {"title": "Short post",
     "text": "Still quoting print jobs by hand? PrintCoPilot puts orders, production and gang sheets in "
             "one place. There is a 14 day free trial. Link in bio. (Affiliate link, I earn a commission.)"},
    {"title": "Email",
     "text": "Hi [NAME], I have been looking at PrintCoPilot for print and apparel shops. It runs your "
             "storefront, orders and production from one dashboard. You can try it free for 14 days: "
             "[YOUR LINK]. Full disclosure, I earn a commission if you sign up."},
    {"title": "Video description",
     "text": "Tools I would look at if I ran a print shop: PrintCoPilot for orders, production and the gang "
             "sheet builder. Free trial here: [YOUR LINK]. This is an affiliate link and I earn a commission."},
]

DEFAULTS: dict[str, Any] = {
    "accepting_applications": True,
    "accepting_referrals": True,
    "earning": True,
    "auto_approve": False,
    "show_standard_rate": True,
    "hold_days": 30,
    "minimum_payout_cents": 5000,
    "cookie_days": 90,
    "return_window_days": 90,
    "commissionable_plans": list(PLAN_ORDER),
    "support_email": "",
    "captions": DEFAULT_CAPTIONS,
}

_BOOLS = ("accepting_applications", "accepting_referrals", "earning", "auto_approve", "show_standard_rate")
# name: (lowest, highest)
_INTS = {
    "hold_days": (0, 365),
    "minimum_payout_cents": (0, 10_000_000),
    "cookie_days": (1, 365),
    "return_window_days": (0, 365),
}
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SettingError(ValueError):
    """A setting that cannot be saved, in words the admin can act on."""


def clean(raw: dict | None) -> dict[str, Any]:
    """The settings as they stand: what was saved, over the defaults.

    A stored value of the wrong kind falls back to its default rather than
    breaking the program; saving goes through `validate`, which refuses it.
    """
    out = {k: (list(v) if isinstance(v, list) else v) for k, v in DEFAULTS.items()}
    raw = raw if isinstance(raw, dict) else {}
    for k in _BOOLS:
        if isinstance(raw.get(k), bool):
            out[k] = raw[k]
    for k, (lo, hi) in _INTS.items():
        v = raw.get(k)
        if isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi:
            out[k] = v
    plans = raw.get("commissionable_plans")
    if isinstance(plans, list):
        out["commissionable_plans"] = [p for p in PLAN_ORDER if p in plans]
    email = raw.get("support_email")
    if isinstance(email, str) and (not email or _EMAIL.match(email.strip())):
        out["support_email"] = email.strip()
    captions = raw.get("captions")
    if isinstance(captions, list):
        kept = [
            {"title": str(c.get("title") or "")[:60], "text": str(c.get("text") or "")[:600]}
            for c in captions if isinstance(c, dict) and str(c.get("text") or "").strip()
        ][:6]
        out["captions"] = kept
    return out


def validate(changes: dict) -> dict[str, Any]:
    """The changes, checked. Raises SettingError naming the first bad one."""
    if not isinstance(changes, dict):
        raise SettingError("Nothing to save.")
    good: dict[str, Any] = {}
    for k, v in changes.items():
        if k in _BOOLS:
            if not isinstance(v, bool):
                raise SettingError(f"{k} is on or off.")
            good[k] = v
        elif k in _INTS:
            lo, hi = _INTS[k]
            if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
                raise SettingError(f"{k} must be a whole number from {lo} to {hi}.")
            good[k] = v
        elif k == "commissionable_plans":
            if not isinstance(v, list) or any(p not in BILLING_PLANS for p in v):
                raise SettingError("Choose plans from the list.")
            good[k] = [p for p in PLAN_ORDER if p in v]
        elif k == "support_email":
            v = (v or "").strip()
            if v and not _EMAIL.match(v):
                raise SettingError("That support email does not look right.")
            good[k] = v
        elif k == "captions":
            if not isinstance(v, list) or len(v) > 6:
                raise SettingError("Up to six captions.")
            good[k] = clean({"captions": v})["captions"]
        else:
            raise SettingError(f"There is no setting called {k}.")
    return good


async def load(db: AsyncSession) -> dict[str, Any]:
    row = (await db.execute(text("SELECT value FROM app_settings WHERE key = :k"), {"k": KEY})).first()
    try:
        raw = json.loads(row[0]) if row and row[0] else {}
    except (TypeError, ValueError):
        raw = {}
    return clean(raw)


async def save(db: AsyncSession, changes: dict) -> tuple[dict, dict]:
    """Apply the changes. Returns (before, after); the caller logs them."""
    good = validate(changes)
    before = await load(db)
    after = {**before, **good}
    await db.execute(text("""
        INSERT INTO app_settings (key, value, updated_at) VALUES (:k, :v, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    """), {"k": KEY, "v": json.dumps(after)})
    return before, after


# ── Rates ─────────────────────────────────────────────────────────────────────

def effective_rate(plan_bps: int, custom_bps: int | None, custom_ends_on: date | None,
                   on: date) -> tuple[int, str]:
    """The rate a line earned on `on` takes, and where it came from.

    An override with no end date stands until it is removed; one with an end
    date covers that whole last day.
    """
    if custom_bps is not None and (custom_ends_on is None or on <= custom_ends_on):
        return int(custom_bps), "override"
    return int(plan_bps), "plan"


def rate_words(bps: int) -> str:
    """2000 -> "20%", 2250 -> "22.5%"."""
    pct = bps / 100
    return f"{pct:g}%"


def plan_price_cents(plan_key: str) -> int:
    return int((BILLING_PLANS.get(plan_key) or {}).get("amount_cents") or 0)


def plan_name(plan_key: str | None) -> str:
    return (BILLING_PLANS.get(plan_key or "") or {}).get("name") or (plan_key or "").title()


async def rate_plans(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT id, key, name, rate_bps, is_public, is_default, updated_at
          FROM partner_rate_plans ORDER BY rate_bps, name
    """))).mappings().all()
    return [dict(r) for r in rows]


async def default_rate_plan(db: AsyncSession) -> dict | None:
    row = (await db.execute(text("""
        SELECT id, key, name, rate_bps FROM partner_rate_plans
         ORDER BY is_default DESC, rate_bps LIMIT 1
    """))).mappings().first()
    return dict(row) if row else None


async def latest_terms(db: AsyncSession) -> dict | None:
    row = (await db.execute(text("""
        SELECT version, clauses, changes, published_at FROM partner_terms_versions
         ORDER BY version DESC LIMIT 1
    """))).mappings().first()
    return dict(row) if row else None
