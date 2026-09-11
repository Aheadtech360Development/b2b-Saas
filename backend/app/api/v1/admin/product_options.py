"""Admin API — configurable-product option builder.

The builder edits a product's whole option set as one document (options, their
choices, and the quantity breaks), so this exposes a single GET/PUT pair rather
than per-row CRUD. The PUT is an upsert-diff: rows whose id is sent are updated,
new rows are created, and anything the payload omits is deleted — which keeps
existing ids stable so saved configurations keep resolving.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.product import Product
from app.models.product_option import (
    INPUT_TYPES,
    PRICE_MODES,
    ProductOption,
    ProductOptionValue,
    ProductQtyTier,
)

router = APIRouter(prefix="/admin/products", tags=["admin", "product-options"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class ValueIn(BaseModel):
    id: Optional[uuid.UUID] = None
    label: str = Field(..., min_length=1, max_length=200)
    price_delta: Decimal = Decimal("0")
    price_mode: str = "flat"
    image_url: Optional[str] = None
    swatch_hex: Optional[str] = None
    sku_suffix: Optional[str] = None
    is_default: bool = False
    enabled: bool = True


class OptionIn(BaseModel):
    id: Optional[uuid.UUID] = None
    name: str = Field(..., min_length=1, max_length=150)
    input_type: str = "select"
    required: bool = True
    help_text: Optional[str] = None
    is_active: bool = True
    values: list[ValueIn] = Field(default_factory=list)


class TierIn(BaseModel):
    id: Optional[uuid.UUID] = None
    min_qty: int = Field(..., ge=1)
    unit_price: Decimal = Field(..., ge=0)


class ConfigIn(BaseModel):
    pricing_mode: str = "variant"          # 'variant' | 'configurable'
    base_price: Optional[Decimal] = None
    options: list[OptionIn] = Field(default_factory=list)
    qty_tiers: list[TierIn] = Field(default_factory=list)


# ── Serialisers ───────────────────────────────────────────────────────────────
def _value_row(v: ProductOptionValue) -> dict:
    return {
        "id": str(v.id),
        "label": v.label,
        "price_delta": float(v.price_delta or 0),
        "price_mode": v.price_mode,
        "image_url": v.image_url,
        "swatch_hex": v.swatch_hex,
        "sku_suffix": v.sku_suffix,
        "position": v.position,
        "is_default": bool(v.is_default),
        "enabled": bool(v.enabled),
    }


def _option_row(o: ProductOption) -> dict:
    return {
        "id": str(o.id),
        "name": o.name,
        "input_type": o.input_type,
        "required": bool(o.required),
        "help_text": o.help_text,
        "position": o.position,
        "is_active": bool(o.is_active),
        "values": [_value_row(v) for v in sorted(o.values, key=lambda x: x.position)],
    }


async def _load_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
    product = (await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.options).selectinload(ProductOption.values))
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


async def _tiers(db: AsyncSession, product_id: uuid.UUID) -> list[ProductQtyTier]:
    return list((await db.execute(
        select(ProductQtyTier)
        .where(ProductQtyTier.product_id == product_id)
        .order_by(ProductQtyTier.min_qty)
    )).scalars().all())


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/{product_id}/options")
async def get_product_config(
    product_id: uuid.UUID,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """This product's pricing mode, option groups and quantity breaks."""
    product = await _load_product(db, product_id)
    return {
        "product_id": str(product.id),
        "pricing_mode": getattr(product, "pricing_mode", "variant") or "variant",
        "base_price": float(product.base_price) if product.base_price is not None else None,
        "options": [_option_row(o) for o in sorted(product.options or [], key=lambda x: x.position)],
        "qty_tiers": [
            {"id": str(t.id), "min_qty": int(t.min_qty), "unit_price": float(t.unit_price)}
            for t in await _tiers(db, product_id)
        ],
    }


@router.put("/{product_id}/options")
async def save_product_config(
    product_id: uuid.UUID,
    payload: ConfigIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Replace the product's option configuration (upsert-diff, ids preserved)."""
    if payload.pricing_mode not in ("variant", "configurable"):
        raise HTTPException(status_code=400, detail="pricing_mode must be 'variant' or 'configurable'")

    product = await _load_product(db, product_id)
    product.pricing_mode = payload.pricing_mode
    product.base_price = payload.base_price

    # ── Options (and their values) ────────────────────────────────────────────
    existing_opts = {str(o.id): o for o in (product.options or [])}
    keep_opts: set[str] = set()

    for pos, o_in in enumerate(payload.options):
        if o_in.input_type not in INPUT_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown input_type '{o_in.input_type}'")

        opt = existing_opts.get(str(o_in.id)) if o_in.id else None
        if opt is None:
            opt = ProductOption(product_id=product_id)
            db.add(opt)
        opt.name = o_in.name
        opt.input_type = o_in.input_type
        opt.required = o_in.required
        opt.help_text = o_in.help_text
        opt.is_active = o_in.is_active
        opt.position = pos
        await db.flush()                      # need opt.id for its values
        keep_opts.add(str(opt.id))

        existing_vals = {str(v.id): v for v in (opt.values or [])}
        keep_vals: set[str] = set()
        for vpos, v_in in enumerate(o_in.values):
            if v_in.price_mode not in PRICE_MODES:
                raise HTTPException(status_code=400, detail=f"Unknown price_mode '{v_in.price_mode}'")
            val = existing_vals.get(str(v_in.id)) if v_in.id else None
            if val is None:
                val = ProductOptionValue(option_id=opt.id)
                db.add(val)
            val.label = v_in.label
            val.price_delta = v_in.price_delta
            val.price_mode = v_in.price_mode
            val.image_url = v_in.image_url
            val.swatch_hex = v_in.swatch_hex
            val.sku_suffix = v_in.sku_suffix
            val.is_default = v_in.is_default
            val.enabled = v_in.enabled
            val.position = vpos
            await db.flush()
            keep_vals.add(str(val.id))

        for vid, val in existing_vals.items():
            if vid not in keep_vals:
                await db.delete(val)

    for oid, opt in existing_opts.items():
        if oid not in keep_opts:
            await db.delete(opt)

    # ── Quantity tiers ────────────────────────────────────────────────────────
    existing_tiers = {str(t.id): t for t in await _tiers(db, product_id)}
    keep_tiers: set[str] = set()
    for t_in in sorted(payload.qty_tiers, key=lambda t: t.min_qty):
        tier = existing_tiers.get(str(t_in.id)) if t_in.id else None
        if tier is None:
            tier = ProductQtyTier(product_id=product_id)
            db.add(tier)
        tier.min_qty = t_in.min_qty
        tier.unit_price = t_in.unit_price
        await db.flush()
        keep_tiers.add(str(tier.id))
    for tid, tier in existing_tiers.items():
        if tid not in keep_tiers:
            await db.delete(tier)

    await db.commit()
    return await get_product_config(product_id, None, db)  # type: ignore[arg-type]
