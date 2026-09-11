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
    RULE_ACTIONS,
    ProductOption,
    ProductOptionRule,
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


class RuleIn(BaseModel):
    """A rule refers to options/values by their **position in this payload**.

    A rule can point at a group or a choice that is being created in the very
    same save, which has no id yet — so indices are the only reference that works
    for both. The server resolves them to real ids once the rows are flushed.
    """

    id: Optional[uuid.UUID] = None
    when_option: int = Field(..., ge=0)
    when_value: int = Field(..., ge=0)
    action: str = "disable_option"
    target_option: Optional[int] = Field(None, ge=0)
    target_value: Optional[int] = Field(None, ge=0)
    note: Optional[str] = Field(None, max_length=200)


class ConfigIn(BaseModel):
    pricing_mode: str = "variant"          # 'variant' | 'configurable'
    base_price: Optional[Decimal] = None
    options: list[OptionIn] = Field(default_factory=list)
    qty_tiers: list[TierIn] = Field(default_factory=list)
    rules: list[RuleIn] = Field(default_factory=list)


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


def _rule_rows(product: Product) -> list[dict]:
    """Rules rendered the way the builder edits them — by index, with labels.

    The stored row points at ids; the builder's dropdowns work in positions, so
    the translation happens here rather than in the UI.
    """
    options = sorted(product.options or [], key=lambda x: x.position)
    opt_idx = {str(o.id): i for i, o in enumerate(options)}
    opt_name = {str(o.id): o.name for o in options}
    val_idx: dict[str, tuple[int, int]] = {}
    val_label: dict[str, str] = {}
    for oi, o in enumerate(options):
        for vi, v in enumerate(sorted(o.values, key=lambda x: x.position)):
            val_idx[str(v.id)] = (oi, vi)
            val_label[str(v.id)] = v.label

    rows: list[dict] = []
    for r in product.option_rules or []:
        when = val_idx.get(str(r.when_value_id))
        if when is None:
            continue                       # trigger choice was deleted — ignore
        target_opt = opt_idx.get(str(r.target_option_id)) if r.target_option_id else None
        target_val = val_idx.get(str(r.target_value_id)) if r.target_value_id else None
        rows.append({
            "id": str(r.id),
            "when_option": when[0],
            "when_value": when[1],
            "when_label": f"{opt_name.get(str(options[when[0]].id), '')} · {val_label.get(str(r.when_value_id), '')}",
            "action": r.action,
            "target_option": target_opt if target_opt is not None else (target_val[0] if target_val else None),
            "target_value": target_val[1] if target_val else None,
            "note": r.note,
        })
    return rows


async def _load_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
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
        "rules": _rule_rows(product),
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
    # position -> real id, so the rules below can resolve their index references
    opt_ids: list[uuid.UUID] = []
    val_ids: list[list[uuid.UUID]] = []

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
        opt_ids.append(opt.id)

        existing_vals = {str(v.id): v for v in (opt.values or [])}
        keep_vals: set[str] = set()
        this_opt_vals: list[uuid.UUID] = []
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
            this_opt_vals.append(val.id)

        val_ids.append(this_opt_vals)

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

    # ── Conditional rules ─────────────────────────────────────────────────────
    # Resolved last: every option and value now has a real id, so the payload's
    # index references can be turned into foreign keys.
    def _value_id(oi: int | None, vi: int | None) -> uuid.UUID:
        if oi is None or vi is None or oi >= len(val_ids) or vi >= len(val_ids[oi]):
            raise HTTPException(status_code=400, detail="A rule points at a choice that no longer exists")
        return val_ids[oi][vi]

    def _option_id(oi: int | None) -> uuid.UUID:
        if oi is None or oi >= len(opt_ids):
            raise HTTPException(status_code=400, detail="A rule points at a field that no longer exists")
        return opt_ids[oi]

    # Deleting an option cascades to the rules that referenced it, so the rules
    # are re-read after that flush rather than trusting the collection loaded
    # before the diff.
    await db.flush()
    existing_rules = {
        str(r.id): r for r in (await db.execute(
            select(ProductOptionRule).where(ProductOptionRule.product_id == product_id)
        )).scalars().all()
    }
    keep_rules: set[str] = set()
    for r_in in payload.rules:
        if r_in.action not in RULE_ACTIONS:
            raise HTTPException(status_code=400, detail=f"Unknown rule action '{r_in.action}'")

        when_id = _value_id(r_in.when_option, r_in.when_value)
        if r_in.action == "disable_value":
            target_option_id = None
            target_value_id = _value_id(r_in.target_option, r_in.target_value)
        else:
            target_option_id = _option_id(r_in.target_option)
            target_value_id = None
            # A field cannot switch itself off — that would be unresolvable.
            if str(target_option_id) == str(opt_ids[r_in.when_option]):
                raise HTTPException(status_code=400, detail="A rule cannot target its own field")

        rule = existing_rules.get(str(r_in.id)) if r_in.id else None
        if rule is None:
            rule = ProductOptionRule(product_id=product_id)
            db.add(rule)
        rule.when_value_id = when_id
        rule.action = r_in.action
        rule.target_option_id = target_option_id
        rule.target_value_id = target_value_id
        rule.note = r_in.note
        await db.flush()
        keep_rules.add(str(rule.id))

    for rid, rule in existing_rules.items():
        if rid not in keep_rules:
            await db.delete(rule)

    await db.commit()
    return await get_product_config(product_id, None, db)  # type: ignore[arg-type]
