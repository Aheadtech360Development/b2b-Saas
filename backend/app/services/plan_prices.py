"""Plan prices the platform sets from its console (super admin).

`BILLING_PLANS` (core/billing_plans.py) holds each plan's default monthly
price. The console can set another: one JSON row in app_settings
("plan_prices": plan key -> cents), applied to BILLING_PLANS in every worker
(at start, and each minute after, since each worker holds its own copy), so
everything that shows or charges a plan reads it: the console, sign-up,
Billing, the website's pricing pages (through /api/v1/signup/plans) and Stripe.

In Stripe a new amount is a new Price that takes the plan's lookup key over
(billing_service._ensure_price); subscriptions already running keep the Price
they started on. A brand's bill changes when it starts or changes a plan, not
behind its back.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_plans import BILLING_PLANS

logger = logging.getLogger(__name__)

KEY = "plan_prices"
# The prices the code ships with, before any the console set.
DEFAULTS: dict[str, int] = {key: int(plan["amount_cents"]) for key, plan in BILLING_PLANS.items()}
MIN_CENTS = 100            # $1
MAX_CENTS = 1_000_000      # $10,000 a month
REFRESH_SECONDS = 60


class PriceError(ValueError):
    pass


def _clean(raw: Any) -> dict[str, int]:
    out: dict[str, int] = {}
    for key, cents in (raw or {}).items() if isinstance(raw, dict) else []:
        if key in DEFAULTS and isinstance(cents, int) and not isinstance(cents, bool) and MIN_CENTS <= cents <= MAX_CENTS:
            out[key] = cents
    return out


def apply(overrides: dict[str, int]) -> None:
    """Every plan at the console's price, or its default."""
    for key, default in DEFAULTS.items():
        BILLING_PLANS[key]["amount_cents"] = overrides.get(key, default)


async def load(db: AsyncSession) -> dict[str, int]:
    row = (await db.execute(text("SELECT value FROM app_settings WHERE key = :k"), {"k": KEY})).first()
    try:
        return _clean(json.loads(row[0])) if row and row[0] else {}
    except ValueError:
        logger.warning("plan_prices setting is not JSON; using the defaults")
        return {}


async def refresh(db: AsyncSession) -> None:
    apply(await load(db))


async def save(db: AsyncSession, prices: dict[str, int]) -> dict[str, int]:
    """Set the prices sent (plan key -> cents); a plan sent at its default
    goes back to following the code. Returns the plans whose price changed.
    The caller commits, then refreshes: a price is charged once it is stored."""
    unknown = [k for k in prices if k not in DEFAULTS]
    if unknown:
        raise PriceError(f"Not a plan: {', '.join(unknown)}.")
    for key, cents in prices.items():
        if not isinstance(cents, int) or isinstance(cents, bool) or not MIN_CENTS <= cents <= MAX_CENTS:
            raise PriceError(f"{BILLING_PLANS[key]['name']}: a price is between $1 and $10,000 a month.")
    current = await load(db)
    before = {k: current.get(k, DEFAULTS[k]) for k in DEFAULTS}
    for key, cents in prices.items():
        if cents == DEFAULTS[key]:
            current.pop(key, None)
        else:
            current[key] = cents
    await db.execute(text("""
        INSERT INTO app_settings (key, value, updated_at) VALUES (:k, :v, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    """), {"k": KEY, "v": json.dumps(current, sort_keys=True)})
    return {k: current.get(k, DEFAULTS[k]) for k in DEFAULTS if current.get(k, DEFAULTS[k]) != before[k]}


async def refresh_loop() -> None:
    """Each worker re-reads the prices every minute: one set them, all charge them."""
    from app.core.database import AsyncSessionLocal

    while True:
        try:
            async with AsyncSessionLocal() as db:
                await refresh(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("could not refresh plan prices", exc_info=True)
        await asyncio.sleep(REFRESH_SECONDS)
