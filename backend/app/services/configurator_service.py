"""Pricing engine for configurable products.

A configurable product never stores its combinations — the unit price is derived
from the chosen options each time. This is what lets a brand attach unlimited
option groups (Business Cards has ~14) without a combinatorial table.

Price model
-----------
    unit  = quantity-tier price (or the product's base_price)
    unit += Σ price_delta where price_mode = 'per_unit'
    unit *= Π (1 + pct/100) where price_mode = 'percent'
    total = unit × quantity + Σ price_delta where price_mode = 'flat'

`flat` is a once-per-order charge (setup/plate fees); `per_unit` rides on every
unit (stock upgrades); `percent` scales the running unit price (rush handling).

Everything here is server-authoritative: the storefront shows a live estimate,
but the cart and checkout re-price through `price_configuration` and ignore any
figure the client sends.
"""
from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.product_option import ProductOption, ProductQtyTier

logger = logging.getLogger(__name__)

CENTS = Decimal("0.01")


def _money(d: Decimal) -> float:
    return float(d.quantize(CENTS, rounding=ROUND_HALF_UP))


class ConfigurationError(ValueError):
    """A selection was missing, unknown, or disabled."""


async def _load(db, product_id):
    product = (await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.options).selectinload(ProductOption.values))
    )).scalar_one_or_none()
    if product is None:
        raise ConfigurationError("Product not found")
    tiers = (await db.execute(
        select(ProductQtyTier)
        .where(ProductQtyTier.product_id == product_id)
        .order_by(ProductQtyTier.min_qty)
    )).scalars().all()
    return product, tiers


def _unit_for_qty(product: Product, tiers, quantity: int) -> Decimal:
    """Highest tier the quantity reaches wins; else the product's base price."""
    chosen = None
    for t in tiers:
        if quantity >= int(t.min_qty):
            chosen = t
        else:
            break
    if chosen is not None:
        return Decimal(str(chosen.unit_price))
    return Decimal(str(product.base_price or 0))


async def price_configuration(db, product_id, selections: dict, quantity: int) -> dict:
    """Resolve the authoritative price for one configured line.

    `selections` maps option id → chosen value id (a list is accepted for
    multi-select options). Returns the unit price, total, and a per-choice
    breakdown so the UI can show exactly how the price was built.
    """
    quantity = max(1, int(quantity or 1))
    product, tiers = await _load(db, product_id)

    # Normalise: everything becomes option_id -> [value_id, ...]
    wanted: dict[str, list[str]] = {}
    for k, v in (selections or {}).items():
        if v is None or v == "":
            continue
        wanted[str(k)] = [str(x) for x in v] if isinstance(v, (list, tuple)) else [str(v)]

    unit = _unit_for_qty(product, tiers, quantity)
    flat_total = Decimal("0")
    percent_factors: list[Decimal] = []
    breakdown: list[dict] = []
    sku_parts: list[str] = []

    for option in sorted(product.options or [], key=lambda o: o.position):
        if not option.is_active:
            continue
        picked = wanted.get(str(option.id), [])
        if not picked:
            if option.required:
                raise ConfigurationError(f'Please choose a "{option.name}".')
            continue

        by_id = {str(v.id): v for v in option.values}
        for value_id in picked:
            value = by_id.get(value_id)
            if value is None:
                raise ConfigurationError(f'"{option.name}" has no such choice.')
            if not value.enabled:
                raise ConfigurationError(f'"{value.label}" is not available for {option.name}.')

            delta = Decimal(str(value.price_delta or 0))
            mode = (value.price_mode or "flat").lower()
            if mode == "per_unit":
                unit += delta
            elif mode == "percent":
                percent_factors.append(Decimal("1") + (delta / Decimal("100")))
            else:  # flat — charged once for the whole line
                flat_total += delta

            if value.sku_suffix:
                sku_parts.append(value.sku_suffix)
            breakdown.append({
                "option_id": str(option.id), "option": option.name,
                "value_id": str(value.id), "value": value.label,
                "price_delta": float(delta), "price_mode": mode,
            })

    for f in percent_factors:
        unit *= f
    if unit < 0:
        unit = Decimal("0")

    total = unit * Decimal(quantity) + flat_total
    if total < 0:
        total = Decimal("0")

    return {
        "unit_price": _money(unit),
        "quantity": quantity,
        "setup_fees": _money(flat_total),
        "total": _money(total),
        "breakdown": breakdown,
        "sku_suffix": "-".join(sku_parts) if sku_parts else None,
    }


def default_selections(product: Product) -> dict:
    """The pre-selected configuration a product page opens with."""
    out: dict[str, str] = {}
    for option in sorted(product.options or [], key=lambda o: o.position):
        if not option.is_active:
            continue
        values = [v for v in sorted(option.values, key=lambda v: v.position) if v.enabled]
        if not values:
            continue
        chosen = next((v for v in values if v.is_default), values[0])
        out[str(option.id)] = str(chosen.id)
    return out
