"""Cart upsells (0079): which offers a cart shows, and what an offer's line costs.

One rule set, read in three places so they never disagree: the cart page
(which offers to show), the cart's prices (models/order CartItem lines that
came from an offer), and the order itself (services/order_service). An offer
discounts its line only while its conditions still hold for the rest of the
cart: a buyer who takes the "10% off a hoodie with any tee" and then removes
the tee pays the hoodie's usual price.

What an offer can be:
  * a ready-made product (variants with a price): added in one click, at the
    offer's price;
  * a product that is built or chosen on its page (a gang sheet, an uploaded
    print, a product priced from options): the offer links to that page, at
    its usual price, since there is nothing to add until the buyer makes it.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

DISCOUNT_TYPES = ("none", "percent", "amount")
TRIGGERS = ("any", "products", "collections")
# How many offers a cart shows at once: more reads as an ad wall.
MAX_SHOWN = 2
CENT = Decimal("0.01")


@dataclass
class Line:
    """A cart line as the rules see it."""
    key: str
    product_id: str | None
    quantity: int
    line_total: Decimal
    offer_id: str | None = None


@dataclass
class Shown:
    """One offer, ready for the cart page."""
    data: dict[str, Any] = field(default_factory=dict)


def price_after(offer: Any, price: Decimal) -> Decimal:
    """`price` with the offer's discount taken off, never below zero."""
    price = Decimal(str(price))
    value = Decimal(str(offer.discount_value or 0))
    if offer.discount_type == "percent":
        out = price * (Decimal("1") - min(value, Decimal("100")) / Decimal("100"))
    elif offer.discount_type == "amount":
        out = price - value
    else:
        out = price
    return max(out, Decimal("0")).quantize(CENT, rounding=ROUND_HALF_UP)


def discount_words(offer: Any) -> str | None:
    """"10% off" / "$5.00 off", or None for an offer at the usual price."""
    value = Decimal(str(offer.discount_value or 0))
    if offer.discount_type == "percent" and value > 0:
        return f"{value.normalize():f}% off"
    if offer.discount_type == "amount" and value > 0:
        return f"${value:.2f} off"
    return None


async def _in_collections(db: AsyncSession, collection_ids: list[str]) -> set[str]:
    from app.models.collection import CollectionProduct

    ids = [uuid.UUID(c) for c in collection_ids if _is_uuid(c)]
    if not ids:
        return set()
    rows = (await db.execute(
        select(CollectionProduct.product_id).where(CollectionProduct.collection_id.in_(ids))
    )).scalars().all()
    return {str(r) for r in rows}


def _is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError):
        return False


async def holds(db: AsyncSession, offer: Any, others: list[Line]) -> bool:
    """Whether the offer's conditions hold for these cart lines.

    `others` is the cart without the offer's own line: an upsell sits beside
    something, so a cart holding nothing else never qualifies.
    """
    if not others:
        return False
    subtotal = sum((l.line_total for l in others), Decimal("0"))
    if offer.min_subtotal is not None and subtotal < Decimal(str(offer.min_subtotal)):
        return False
    if offer.max_subtotal is not None and subtotal > Decimal(str(offer.max_subtotal)):
        return False
    wanted = {str(x) for x in (offer.trigger_ids or [])}
    if offer.trigger_kind == "products":
        return any(l.product_id and l.product_id in wanted for l in others)
    if offer.trigger_kind == "collections":
        members = await _in_collections(db, list(wanted))
        return any(l.product_id and l.product_id in members for l in others)
    return True


async def active_offers(db: AsyncSession) -> list[Any]:
    """This shop's switched-on offers, most important first."""
    from app.models.upsell import UpsellOffer

    return list((await db.execute(
        select(UpsellOffer)
        .where(UpsellOffer.is_active.is_(True))
        .order_by(UpsellOffer.priority.desc(), UpsellOffer.created_at)
    )).scalars().all())


async def applying_lines(db: AsyncSession, lines: list[Line]) -> dict[str, Any]:
    """Cart line key → the offer that line is sold under: added from an offer
    that is still on, still for that product, and whose conditions still hold
    for the rest of the cart. Its price is price_after(offer, usual price)."""
    from app.models.upsell import UpsellOffer

    asked = {l.offer_id for l in lines if l.offer_id and _is_uuid(l.offer_id)}
    if not asked:
        return {}
    offers = {str(o.id): o for o in (await db.execute(
        select(UpsellOffer).where(UpsellOffer.id.in_([uuid.UUID(x) for x in asked]), UpsellOffer.is_active.is_(True))
    )).scalars().all()}
    out: dict[str, Any] = {}
    for line in lines:
        offer = offers.get(str(line.offer_id)) if line.offer_id else None
        if offer is None:
            continue
        if str(offer.product_id) != str(line.product_id):
            continue  # an offer prices only its own product
        if await holds(db, offer, [o for o in lines if o.key != line.key]):
            out[line.key] = offer
    return out


def is_ready_made(product: Any) -> bool:
    """Added in one click: a stocked product with variants, nothing to build."""
    return (
        (product.pricing_mode or "variant") == "variant"
        and not product.gang_sheet_enabled
        and not product.allow_design_upload
        and not getattr(product, "bulk_order", False)
    )


PriceFn = Callable[[Any], Awaitable[Decimal]]
ShippingFn = Callable[[int, Decimal], Awaitable[Decimal | None]]


async def offers_for_cart(
    db: AsyncSession,
    lines: list[Line],
    price_of: PriceFn,
    shipping_for: ShippingFn | None = None,
) -> list[dict[str, Any]]:
    """The offers this cart shows, at this buyer's prices.

    `price_of(variant)` is the buyer's own price for a variant (their tier,
    their group); `shipping_for(units, subtotal)` estimates shipping, so an
    offer that takes the cart over the free-shipping line can say so (and
    only one that really does).
    """
    from app.models.product import Product, ProductImage, ProductVariant
    from app.services.inventory_service import sellable_stock

    if not lines:
        return []
    in_cart = {l.product_id for l in lines if l.product_id}
    subtotal = sum((l.line_total for l in lines), Decimal("0"))
    units = sum(l.quantity for l in lines)
    shipping_now: Decimal | None = None
    if shipping_for is not None:
        try:
            shipping_now = await shipping_for(units, subtotal)
        except Exception:  # noqa: BLE001 — the offer still shows, without the shipping line
            shipping_now = None

    shown: list[dict[str, Any]] = []
    for offer in await active_offers(db):
        if len(shown) >= MAX_SHOWN:
            break
        if str(offer.product_id) in in_cart:
            continue
        if not await holds(db, offer, lines):
            continue
        product = (await db.execute(select(Product).where(Product.id == offer.product_id))).scalar_one_or_none()
        if product is None or product.status != "active":
            continue
        image = (await db.execute(
            select(ProductImage).where(ProductImage.product_id == product.id).order_by(ProductImage.sort_order).limit(1)
        )).scalar_one_or_none()
        image_url = (getattr(image, "url_medium_webp", None) or getattr(image, "url_medium", None)
                     or getattr(image, "url_thumbnail", None)) if image else None
        base = {
            "offer_id": str(offer.id),
            "product_id": str(product.id),
            "product_slug": product.slug,
            "product_name": product.name,
            "title": (offer.headline or "").strip() or f"Add {product.name}",
            "description": (offer.description or "").strip() or None,
            "image_url": image_url,
        }

        query = select(ProductVariant).where(
            ProductVariant.product_id == product.id, ProductVariant.status == "active",
        ).order_by(ProductVariant.sort_order)
        if offer.variant_id:
            query = query.where(ProductVariant.id == offer.variant_id)
        variants = list((await db.execute(query)).scalars().all())

        if not is_ready_made(product):
            # Made on its page: point there, at its usual price.
            prices = [await price_of(v) for v in variants]
            shown.append({**base, "kind": "build", "from_price": str(min(prices)) if prices else None,
                          "discount": None, "variants": []})
            continue

        choices = []
        for v in variants:
            left = await sellable_stock(db, v, tracked=product.track_inventory)
            if left is not None and left < 1:
                continue
            price = await price_of(v)
            choices.append({
                "variant_id": str(v.id),
                "label": " / ".join(x for x in (v.color, v.size) if x) or product.name,
                "color": v.color, "size": v.size,
                "price": str(price), "offer_price": str(price_after(offer, price)),
            })
        if not choices:
            continue  # nothing of it left to sell
        first = choices[0]
        unlocks = False
        if shipping_for is not None and shipping_now is not None and shipping_now > 0:
            try:
                after = await shipping_for(units + 1, subtotal + Decimal(first["offer_price"]))
                unlocks = after is not None and after <= 0
            except Exception:  # noqa: BLE001
                unlocks = False
        shown.append({**base, "kind": "ready", "discount": discount_words(offer),
                      "unlocks_free_shipping": unlocks, "variants": choices})
    return shown
