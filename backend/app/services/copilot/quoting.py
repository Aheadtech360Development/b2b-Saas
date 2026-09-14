"""Turning "how much for 200 shirts?" into a real price, and into a draft order.

The price is never the model's arithmetic. A configurable product is priced by
`price_configuration` — the same server-side engine the storefront and the cart
use — and a stocked product by its own variants. So a figure quoted in chat is
the figure the customer would be charged.

The model speaks in words ("matte", "next day"), not ids, so choices are matched
by label here and anything that could not be matched is reported rather than
quietly dropped: a quote missing an option the buyer asked for is worse than no
quote.
"""
from __future__ import annotations

import random
import string
import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Company, CompanyUser
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductVariant
from app.services.configurator_service import (
    ConfigurationError, default_selections, price_configuration,
)


class QuoteError(Exception):
    """Something the admin or customer needs to resolve; safe to show."""


def _money(v) -> float:
    return float(Decimal(str(v or 0)).quantize(Decimal("0.01")))


def _is_configurable(p: Product) -> bool:
    return (getattr(p, "pricing_mode", "variant") or "variant") == "configurable"


async def find_product(db: AsyncSession, name: str) -> Product:
    """One product by name, slug or SKU. Ambiguity is raised, not guessed at."""
    q = (name or "").strip()
    if not q:
        raise QuoteError("Which product?")
    like = f"%{q}%"
    skus = select(ProductVariant.product_id).where(ProductVariant.sku.ilike(like))
    rows = (await db.execute(
        select(Product)
        .options(selectinload(Product.options), selectinload(Product.option_rules))
        .where(
            Product.status != "archived",
            or_(Product.name.ilike(like), Product.slug.ilike(like), Product.id.in_(skus)),
        )
        .limit(6)
    )).scalars().all()
    if not rows:
        raise QuoteError(f"No product matching “{q}”.")
    exact = [p for p in rows if p.name.lower() == q.lower() or (p.slug or "").lower() == q.lower()]
    if exact:
        return exact[0]
    if len(rows) > 1:
        raise QuoteError("More than one product matches “" + q + "”: "
                         + ", ".join(p.name for p in rows) + ". Which one?")
    return rows[0]


def _match_choices(product: Product, choices: dict) -> tuple[dict, list[str]]:
    """Map {option label: choice label} onto option/value ids, starting from the
    product's defaults. Returns the selections and anything unmatched."""
    selections = dict(default_selections(product))
    unmatched: list[str] = []

    for asked_option, asked_value in (choices or {}).items():
        want_o = str(asked_option or "").strip().lower()
        want_v = str(asked_value or "").strip().lower()
        if not want_o or not want_v:
            continue
        option = next(
            (o for o in (product.options or [])
             if o.is_active and (o.name or "").lower() == want_o), None,
        ) or next(
            (o for o in (product.options or [])
             if o.is_active and want_o in (o.name or "").lower()), None,
        )
        if option is None:
            unmatched.append(f"{asked_option} (no such option)")
            continue
        value = next(
            (v for v in option.values if v.enabled and (v.label or "").lower() == want_v), None,
        ) or next(
            (v for v in option.values if v.enabled and want_v in (v.label or "").lower()), None,
        )
        if value is None:
            allowed = ", ".join(v.label for v in option.values if v.enabled)
            unmatched.append(f"{option.name} = {asked_value} (choices: {allowed})")
            continue
        selections[str(option.id)] = str(value.id)

    return selections, unmatched


def option_catalogue(product: Product) -> list[dict]:
    """What the buyer can choose, in words — so the copilot can ask."""
    out = []
    for o in sorted(product.options or [], key=lambda o: o.position):
        if not o.is_active:
            continue
        out.append({
            "option": o.name,
            "required": o.required,
            "choices": [v.label for v in sorted(o.values, key=lambda v: v.position) if v.enabled],
        })
    return out


async def quote_for(db: AsyncSession, product: Product, quantity: int, choices: dict | None) -> dict:
    """The authoritative price for `quantity` of `product` with these choices."""
    quantity = max(1, int(quantity or 1))
    moq = int(getattr(product, "moq", 1) or 1)

    if _is_configurable(product):
        selections, unmatched = _match_choices(product, choices or {})
        try:
            priced = await price_configuration(db, product.id, selections, quantity)
        except ConfigurationError as exc:
            raise QuoteError(str(exc))
        return {
            "product": product.name,
            "type": "configurable",
            "quantity": quantity,
            "unit_price": priced["unit_price"],
            "setup_fees": priced["setup_fees"],
            "total": priced["total"],
            "chosen": [{"option": b["option"], "value": b["value"]} for b in priced["breakdown"]],
            "breakdown": priced["breakdown"],
            "unmatched_choices": unmatched,
            "below_minimum": quantity < moq,
            "minimum_order_quantity": moq,
            "admin_link": f"/admin/products/{product.slug}/edit",
        }

    # Stocked product: price comes off a variant.
    wanted = {str(k).lower(): str(v).lower() for k, v in (choices or {}).items()}
    variants = (await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id,
                                     ProductVariant.status == "active")
    )).scalars().all()
    if not variants:
        raise QuoteError(f"{product.name} has no variants priced yet.")

    picked = variants
    for field in ("color", "size"):
        if field in wanted:
            narrowed = [v for v in picked if (getattr(v, field, None) or "").lower() == wanted[field]]
            if not narrowed:
                have = sorted({(getattr(v, field, None) or "") for v in variants} - {""})
                raise QuoteError(f"No {field} “{wanted[field]}” on {product.name}. Available: {', '.join(have)}.")
            picked = narrowed
    variant = min(picked, key=lambda v: float(v.retail_price or 0))
    unit = Decimal(str(variant.retail_price or 0))
    return {
        "product": product.name,
        "type": "stocked",
        "variant_sku": variant.sku,
        "color": variant.color,
        "size": variant.size,
        "quantity": quantity,
        "unit_price": _money(unit),
        "setup_fees": 0.0,
        "total": _money(unit * quantity),
        "note": "List price for this variant. A customer's own tier or group discount is applied at checkout.",
        "below_minimum": quantity < moq,
        "minimum_order_quantity": moq,
        "admin_link": f"/admin/products/{product.slug}/edit",
    }


async def find_company(db: AsyncSession, name: str) -> Company:
    q = (name or "").strip()
    if not q:
        raise QuoteError("Which customer?")
    rows = (await db.execute(
        select(Company).where(Company.name.ilike(f"%{q}%")).limit(6)
    )).scalars().all()
    if not rows:
        raise QuoteError(f"No customer matching “{q}”.")
    exact = [c for c in rows if c.name.lower() == q.lower()]
    if exact:
        return exact[0]
    if len(rows) > 1:
        raise QuoteError("More than one customer matches: " + ", ".join(c.name for c in rows) + ". Which one?")
    return rows[0]


async def create_draft(db: AsyncSession, company: Company, product: Product,
                       quantity: int, choices: dict | None) -> dict:
    """Write the quote as a DRAFT- order the admin can send or convert.

    Prices are recomputed here rather than carried from the preview, so what the
    order holds is what the engine says now, not what was quoted a minute ago.
    """
    quote = await quote_for(db, product, quantity, choices)

    member = (await db.execute(
        select(CompanyUser).where(CompanyUser.company_id == company.id,
                                  CompanyUser.is_active.is_(True)).limit(1)
    )).scalar_one_or_none()
    if not member:
        raise QuoteError(f"{company.name} has no active user yet, so an order can't be placed for them.")

    unit = Decimal(str(quote["unit_price"]))
    fees = Decimal(str(quote.get("setup_fees") or 0))
    total = Decimal(str(quote["total"]))

    order = Order(
        company_id=company.id,
        placed_by_id=member.user_id,
        order_number=f"DRAFT-{''.join(random.choices(string.digits, k=6))}",
        status="pending",
        payment_status="unpaid",
        notes="Quote prepared by the AI copilot.",
        subtotal=total, shipping_cost=0, tax_amount=0, total=total,
    )
    db.add(order)
    await db.flush()

    item = OrderItem(
        order_id=order.id,
        quantity=quantity,
        unit_price=unit,
        line_total=total,
        product_name=product.name,
        sku="",
    )
    if quote["type"] == "configurable":
        item.product_id = product.id
        item.configuration = {
            "selections": {}, "breakdown": quote["breakdown"],
            "unit_price": quote["unit_price"], "setup_fees": quote["setup_fees"],
        }
        item.sku = ""
    else:
        variant = (await db.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id,
                                         ProductVariant.sku == quote["variant_sku"])
        )).scalar_one_or_none()
        if variant is not None:
            item.variant_id = variant.id
            item.sku = variant.sku or ""
            item.color = variant.color
            item.size = variant.size
    db.add(item)
    await db.flush()

    return {
        "order_number": order.order_number,
        "admin_link": f"/admin/orders/{order.order_number}",
        "total": _money(total),
        "setup_fees": _money(fees),
    }
