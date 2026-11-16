"""Marketing → Upsells: the offers a shop shows in its cart (services/upsells).

Each offer names a product, when it shows (every cart, a cart holding certain
products or collections, a cart worth between two amounts) and its price (as
it is, or a percentage or amount off). The list carries what each offer has
sold, from the order lines it put there.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductImage, ProductVariant
from app.models.upsell import UpsellOffer
from app.services import upsells

router = APIRouter(prefix="/admin/upsells", tags=["admin", "upsells"])


class OfferIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_active: bool = True
    priority: int = Field(0, ge=-1000, le=1000)
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    headline: str | None = Field(None, max_length=120)
    description: str | None = Field(None, max_length=200)
    discount_type: str = "none"
    discount_value: Decimal = Field(Decimal("0"), ge=0, le=Decimal("100000"))
    trigger_kind: str = "any"
    trigger_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    min_subtotal: Decimal | None = Field(None, ge=0)
    max_subtotal: Decimal | None = Field(None, ge=0)


class ActiveIn(BaseModel):
    is_active: bool


def _bad(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail=message)


async def _check(db: AsyncSession, data: OfferIn) -> None:
    """Refuse an offer that could never work, saying why."""
    if data.discount_type not in upsells.DISCOUNT_TYPES:
        raise _bad("Choose no discount, a percentage or an amount.")
    if data.discount_type == "percent" and not (0 < data.discount_value <= 100):
        raise _bad("A percentage off is between 1 and 100.")
    if data.discount_type == "amount" and data.discount_value <= 0:
        raise _bad("Enter how much to take off.")
    if data.trigger_kind not in upsells.TRIGGERS:
        raise _bad("Choose when the offer shows.")
    if data.trigger_kind != "any" and not data.trigger_ids:
        raise _bad("Pick at least one product or collection for the offer to follow.")
    if data.min_subtotal is not None and data.max_subtotal is not None and data.min_subtotal > data.max_subtotal:
        raise _bad("The lowest cart value is above the highest.")
    product = (await db.execute(select(Product).where(Product.id == data.product_id))).scalar_one_or_none()
    if product is None:
        raise _bad("That product was not found.")
    if data.variant_id is not None:
        found = (await db.execute(select(ProductVariant.id).where(
            ProductVariant.id == data.variant_id, ProductVariant.product_id == data.product_id,
        ))).scalar_one_or_none()
        if found is None:
            raise _bad("That option is not one of the product's.")
    if data.discount_type != "none" and not upsells.is_ready_made(product):
        raise _bad(f"{product.name} is built or chosen on its page, so its offer opens that page at the usual "
                   "price. A discount works on a ready-made product.")
    if data.trigger_kind == "products" and data.product_id in data.trigger_ids:
        raise _bad("An offer cannot follow its own product: it only shows when that product is not in the cart.")


def _apply(offer: UpsellOffer, data: OfferIn) -> None:
    offer.name = data.name.strip()
    offer.is_active = data.is_active
    offer.priority = data.priority
    offer.product_id = data.product_id
    offer.variant_id = data.variant_id
    offer.headline = (data.headline or "").strip() or None
    offer.description = (data.description or "").strip() or None
    offer.discount_type = data.discount_type
    offer.discount_value = data.discount_value if data.discount_type != "none" else Decimal("0")
    offer.trigger_kind = data.trigger_kind
    offer.trigger_ids = [str(x) for x in data.trigger_ids] if data.trigger_kind != "any" else []
    offer.min_subtotal = data.min_subtotal
    offer.max_subtotal = data.max_subtotal


async def _out(db: AsyncSession, offers: list[UpsellOffer]) -> list[dict[str, Any]]:
    if not offers:
        return []
    ids = [o.id for o in offers]
    # What each offer sold: orders and money from the lines it put there,
    # leaving out cancelled and refunded orders.
    sold = {
        str(r[0]): (int(r[1] or 0), Decimal(str(r[2] or 0)))
        for r in (await db.execute(
            select(OrderItem.upsell_offer_id, func.count(func.distinct(OrderItem.order_id)), func.sum(OrderItem.line_total))
            .join(Order, Order.id == OrderItem.order_id)
            .where(OrderItem.upsell_offer_id.in_(ids), Order.status.notin_(["cancelled", "refunded"]))
            .group_by(OrderItem.upsell_offer_id)
        )).all()
    }
    products = {str(p.id): p for p in (await db.execute(
        select(Product).where(Product.id.in_({o.product_id for o in offers}))
    )).scalars().all()}
    images: dict[str, str | None] = {}
    for pid in products:
        img = (await db.execute(
            select(ProductImage).where(ProductImage.product_id == uuid.UUID(pid)).order_by(ProductImage.sort_order).limit(1)
        )).scalar_one_or_none()
        images[pid] = (getattr(img, "url_thumbnail", None) or getattr(img, "url_medium", None)) if img else None
    variants = {str(v.id): v for v in (await db.execute(
        select(ProductVariant).where(ProductVariant.id.in_({o.variant_id for o in offers if o.variant_id}))
    )).scalars().all()} if any(o.variant_id for o in offers) else {}
    out = []
    for o in offers:
        p = products.get(str(o.product_id))
        v = variants.get(str(o.variant_id)) if o.variant_id else None
        orders, revenue = sold.get(str(o.id), (0, Decimal("0")))
        out.append({
            "id": str(o.id), "name": o.name, "is_active": o.is_active, "priority": o.priority,
            "product_id": str(o.product_id), "product_name": p.name if p else "Product removed",
            "product_image": images.get(str(o.product_id)),
            "ready_made": bool(p and upsells.is_ready_made(p)),
            "variant_id": str(o.variant_id) if o.variant_id else None,
            "variant_label": " / ".join(x for x in (v.color, v.size) if x) if v else None,
            "headline": o.headline, "description": o.description,
            "discount_type": o.discount_type, "discount_value": str(o.discount_value),
            "discount_words": upsells.discount_words(o),
            "trigger_kind": o.trigger_kind, "trigger_ids": [str(x) for x in (o.trigger_ids or [])],
            "min_subtotal": str(o.min_subtotal) if o.min_subtotal is not None else None,
            "max_subtotal": str(o.max_subtotal) if o.max_subtotal is not None else None,
            "orders": orders, "revenue": str(revenue.quantize(Decimal("0.01"))),
        })
    return out


async def _one(db: AsyncSession, offer_id: uuid.UUID) -> UpsellOffer:
    offer = (await db.execute(select(UpsellOffer).where(UpsellOffer.id == offer_id))).scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


@router.get("")
async def list_offers(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    offers = list((await db.execute(
        select(UpsellOffer).order_by(UpsellOffer.is_active.desc(), UpsellOffer.priority.desc(), UpsellOffer.created_at)
    )).scalars().all())
    return {"offers": await _out(db, offers), "max_shown": upsells.MAX_SHOWN}


@router.post("", status_code=201)
async def create_offer(data: OfferIn, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    await _check(db, data)
    offer = UpsellOffer()
    _apply(offer, data)
    db.add(offer)
    await db.flush()
    await db.commit()
    return (await _out(db, [offer]))[0]


@router.put("/{offer_id}")
async def update_offer(offer_id: uuid.UUID, data: OfferIn, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    offer = await _one(db, offer_id)
    await _check(db, data)
    _apply(offer, data)
    await db.commit()
    return (await _out(db, [offer]))[0]


@router.patch("/{offer_id}/active")
async def set_active(offer_id: uuid.UUID, data: ActiveIn, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    offer = await _one(db, offer_id)
    offer.is_active = data.is_active
    await db.commit()
    return (await _out(db, [offer]))[0]


@router.delete("/{offer_id}", status_code=204)
async def delete_offer(offer_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    offer = await _one(db, offer_id)
    await db.delete(offer)
    await db.commit()
