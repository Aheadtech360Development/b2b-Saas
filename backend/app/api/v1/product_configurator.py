"""Public API for configurable products — the storefront's option feed + pricing.

Deliberately generic: it returns whatever option groups the brand defined for a
product, in order, with no knowledge of what the product *is*. A new product type
(yard signs, banners, mugs) needs zero backend work — the admin defines its
fields and this endpoint already serves them, so the storefront can render it.

Pricing is resolved here, server-side. The storefront shows what this returns;
the cart re-prices through the same service, so a tampered client can't set its
own price.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.product import Product
from app.models.product_option import ProductOption, ProductQtyTier
from app.services.configurator_service import (
    ConfigurationError,
    default_selections,
    price_configuration,
)

router = APIRouter(prefix="/products", tags=["products", "configurator"])


class PriceRequest(BaseModel):
    # option_id -> value_id (or list of value ids for multi-select options)
    selections: dict[str, object] = Field(default_factory=dict)
    quantity: int = Field(1, ge=1)


@router.get("/{product_id}/options")
async def get_public_options(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Everything the storefront needs to render this product's configurator."""
    product = (await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.options).selectinload(ProductOption.values),
            selectinload(Product.option_rules),
        )
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    tiers = (await db.execute(
        select(ProductQtyTier)
        .where(ProductQtyTier.product_id == product_id)
        .order_by(ProductQtyTier.min_qty)
    )).scalars().all()

    options = []
    for o in sorted(product.options or [], key=lambda x: x.position):
        if not o.is_active:
            continue
        values = [
            {
                "id": str(v.id),
                "label": v.label,
                "price_delta": float(v.price_delta or 0),
                "price_mode": v.price_mode,
                "image_url": v.image_url,
                "swatch_hex": v.swatch_hex,
                "is_default": bool(v.is_default),
            }
            for v in sorted(o.values, key=lambda x: x.position) if v.enabled
        ]
        if not values:
            continue  # an option with nothing to pick would just confuse the buyer
        options.append({
            "id": str(o.id),
            "name": o.name,
            "input_type": o.input_type,
            "required": bool(o.required),
            "help_text": o.help_text,
            "values": values,
        })

    # Rules go to the client as plain data so the form can react instantly, with
    # no round trip. The server re-applies the same rules when pricing, so the
    # client copy is a convenience — never the authority.
    rules = [
        {
            "when_value_id": str(r.when_value_id),
            "action": r.action,
            "target_option_id": str(r.target_option_id) if r.target_option_id else None,
            "target_value_id": str(r.target_value_id) if r.target_value_id else None,
            "note": r.note,
        }
        for r in (product.option_rules or [])
    ]

    return {
        "product_id": str(product.id),
        "pricing_mode": getattr(product, "pricing_mode", "variant") or "variant",
        "base_price": float(product.base_price) if product.base_price is not None else None,
        "options": options,
        "qty_tiers": [{"min_qty": int(t.min_qty), "unit_price": float(t.unit_price)} for t in tiers],
        "rules": rules,
        "default_selections": default_selections(product),
    }


@router.post("/{product_id}/price")
async def price_product(
    product_id: uuid.UUID,
    payload: PriceRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Authoritative price for a configuration — what the buyer is shown."""
    try:
        return await price_configuration(db, product_id, payload.selections, payload.quantity)
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
