"""What the platform takes on a Gang Sheet Builder order.

The pricing sheet promises a percentage on those orders and nothing else:
2.8% on Starter, 1.9% on Wholesale, 1.3% on Scale. Until now that number only
appeared on the pricing page — nothing in the product ever read it, so every
gang sheet order went through at zero.

The rate comes from the brand's plan, unless the platform has set a rate for
that brand specifically. One resolver, so the number quoted on the pricing
page, the number shown in the console and the number actually taken are the
same number.
"""
from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_plans import BILLING_PLANS

logger = logging.getLogger(__name__)

# Basis points: 280 = 2.8%. Kept in bps so a rate like 1.9% needs no float.
KEY = "gang_sheet_commission_bps"

# A ceiling, so a mistyped override cannot take a third of somebody's order.
MAX_BPS = 1000


def plan_bps(plan: str | None) -> int:
    p = BILLING_PLANS.get((plan or "").strip().lower())
    return int(p["commission_bps"]) if p else 0


async def for_tenant(db: AsyncSession, tenant_id: object) -> dict:
    """This brand's rate, and where it came from."""
    row = (await db.execute(
        text("SELECT plan FROM tenants WHERE id = CAST(:t AS uuid)"), {"t": str(tenant_id)}
    )).first()
    plan = row[0] if row else None
    default = plan_bps(plan)

    from app.core.tenant_settings import get_setting

    override = None
    raw = await get_setting(db, KEY, tenant_id=tenant_id)
    if raw not in (None, ""):
        try:
            override = max(0, min(MAX_BPS, int(str(raw).strip())))
        except (TypeError, ValueError):
            logger.warning("commission override for %s is not a number: %r", tenant_id, raw)

    bps = override if override is not None else default
    return {
        "plan": plan,
        "plan_bps": default,
        "override_bps": override,
        "bps": bps,
        "display": f"{bps / 100:.2f}".rstrip("0").rstrip(".") + "%",
    }


async def set_override(db: AsyncSession, tenant_id: object, bps: int | None) -> dict:
    """Charge this one brand a rate of its own, or hand it back to the plan."""
    from app.core.tenant_settings import set_setting

    if bps is None:
        await set_setting(db, KEY, "", tenant_id=tenant_id)
    else:
        if bps < 0 or bps > MAX_BPS:
            raise ValueError(f"A commission is between 0% and {MAX_BPS / 100:.0f}%")
        await set_setting(db, KEY, str(int(bps)), tenant_id=tenant_id)
    await db.commit()
    return await for_tenant(db, tenant_id)


def amount_cents(order_total: Decimal, bps: int) -> int:
    """What to take from one order, in cents, rounded like money."""
    if bps <= 0 or order_total <= 0:
        return 0
    cents = (order_total * Decimal(bps) / Decimal(10000) * Decimal(100))
    return int(cents.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def base_after_discount(gang_sheet_subtotal: Decimal, cart_subtotal: Decimal, discount: Decimal) -> Decimal:
    """What the percentage is taken on once a discount code has come off.

    A code comes off the whole cart, so it comes off the gang sheet lines in
    the share they make up of it. The platform takes its percentage of what the
    shop is paid for those lines, never of money the shop gave away.
    """
    if gang_sheet_subtotal <= 0 or cart_subtotal <= 0:
        return Decimal("0")
    if discount <= 0:
        return gang_sheet_subtotal
    kept = max(Decimal("0"), cart_subtotal - discount) / cart_subtotal
    return (gang_sheet_subtotal * kept).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def share_cents(fee_cents: int, paying: Decimal, total: Decimal) -> int:
    """The part of an order's fee that goes with a part payment of it, so an
    invoice settled in two goes pays the fee once between them."""
    if fee_cents <= 0 or paying <= 0 or total <= 0:
        return 0
    part = min(Decimal("1"), paying / total)
    return int((Decimal(fee_cents) * part).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
