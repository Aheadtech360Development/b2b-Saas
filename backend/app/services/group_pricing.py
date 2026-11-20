"""A wholesale buyer's price for one variant: the one rule the cart, the order
and the product pages all use.

The buyer's discount group (Customers → Discount groups, matched by the
customer's tag) sets the price, from the most particular to the least:

1. Individual Variant Pricing, a variant's row: the price itself.
2. Individual Variant Pricing, the product's row: an amount off each piece
   (the admin shows it as "-$"), or a percent off.
3. The group's own percent off the list price, on the products the group
   applies to: the whole store, chosen products, or chosen categories.

Without any of them the buyer's pricing tier percent applies (0 for most).

The product's row used to be read as a price while the admin asked for an
amount off, so $0.25 off a $3.10 tee sold it for $0.25 (dev fix list, item 2,
2026-11-20). It is an amount off now, as the admin says.
"""
from __future__ import annotations

import json
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

CENT = Decimal("0.01")
ZERO = Decimal("0")


def _money(v: Any) -> Decimal:
    return Decimal(str(v)).quantize(CENT, rounding=ROUND_HALF_UP)


def _off(retail: Decimal, percent: Any) -> Decimal:
    pct = Decimal(str(percent))
    if pct <= 0:
        return _money(retail)
    return _money(retail * (Decimal("1") - pct / Decimal("100")))


def price_for(
    retail: Any,
    *,
    variant_price: Any = None,
    amount_off: Any = None,
    product_percent: Any = None,
    group_percent: Any = None,
    in_scope: bool = True,
    tier_percent: Any = ZERO,
) -> Decimal:
    """The price, by the order above. Never below zero."""
    retail = Decimal(str(retail or 0))
    if variant_price is not None:
        return max(ZERO, _money(variant_price))
    if amount_off is not None:
        return max(ZERO, _money(retail - Decimal(str(amount_off))))
    if product_percent is not None:
        return _off(retail, product_percent)
    if group_percent is not None and in_scope and Decimal(str(group_percent)) > 0:
        return _off(retail, group_percent)
    return _off(retail, tier_percent or ZERO)


async def group_of(db: AsyncSession, group_id: str | None) -> dict[str, Any] | None:
    """The group's percent off and what it applies to, or None."""
    if not group_id:
        return None
    from app.models.discount_group import DiscountGroup

    try:
        g = (await db.execute(select(DiscountGroup).where(DiscountGroup.id == group_id))).scalar_one_or_none()
    except Exception:  # noqa: BLE001  (a bad id is no group)
        return None
    if g is None or g.status != "enabled":
        return None
    try:
        ids = {str(x) for x in json.loads(g.applies_to_ids or "[]")}
    except (TypeError, ValueError):
        ids = set()
    pct = getattr(g, "discount_percent", None)
    return {"percent": Decimal(str(pct)) if pct is not None else None,
            "applies_to": g.applies_to or "store", "ids": ids}


async def scope_of(db: AsyncSession, group: dict[str, Any] | None, product_ids: list[str]) -> set[str]:
    """Which of these products the group's own percent applies to."""
    if not group:
        return set()
    if group["applies_to"] == "products":
        return {p for p in product_ids if p in group["ids"]}
    if group["applies_to"] == "collections":
        # The admin's "collections" here are the store's categories.
        if not group["ids"] or not product_ids:
            return set()
        import uuid

        from app.models.product import ProductCategory

        wanted = []
        for p in product_ids:
            try:
                wanted.append(uuid.UUID(str(p)))
            except ValueError:
                continue
        if not wanted:
            return set()
        rows = (await db.execute(
            select(ProductCategory.product_id, ProductCategory.category_id)
            .where(ProductCategory.product_id.in_(wanted))
        )).all()
        return {str(p) for p, c in rows if str(c) in group["ids"]}
    return set(product_ids)


async def unit_price(db: AsyncSession, variant: Any, tier_percent: Decimal, group_id: str | None) -> Decimal:
    """One variant's price for this buyer (the cart and the order)."""
    variant_price = amount_off = product_percent = None
    group = None
    in_scope = False
    if group_id:
        from app.models.discount_group import VariantLevelPricingOverride, VariantPricingOverride

        vlp = (await db.execute(select(VariantLevelPricingOverride).where(
            VariantLevelPricingOverride.variant_id == str(variant.id),
            VariantLevelPricingOverride.group_id == group_id,
        ))).scalar_one_or_none()
        if vlp is not None and vlp.price is not None:
            variant_price = vlp.price
        ov = (await db.execute(select(VariantPricingOverride).where(
            VariantPricingOverride.product_id == str(variant.product_id),
            VariantPricingOverride.tier_id == group_id,
        ))).scalar_one_or_none()
        if ov is not None:
            amount_off, product_percent = ov.price, ov.discount_percent
        group = await group_of(db, group_id)
        in_scope = str(variant.product_id) in await scope_of(db, group, [str(variant.product_id)])
    return price_for(
        variant.retail_price, variant_price=variant_price, amount_off=amount_off,
        product_percent=product_percent, group_percent=(group or {}).get("percent"),
        in_scope=in_scope, tier_percent=tier_percent,
    )
