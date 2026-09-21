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
from sqlalchemy import select, text as _sa_text
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
    ProductOptionCombination,
    ProductOptionRule,
    ProductOptionValue,
    ProductQtyTier,
)
from app.services import combinations as combos

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
    # Does price turn on this option? Only these build the combination price
    # table — see services/combinations.py.
    in_price_matrix: bool = False
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
        "in_price_matrix": bool(getattr(o, "in_price_matrix", False)),
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
        # Without this, a re-read inside the same session hands back the Product
        # already in the identity map along with the option collection it was
        # loaded with — so the PUT that had just created a product's first
        # options answered with none of them.
        .execution_options(populate_existing=True)
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
        # A group that already existed came in through selectinload, so its
        # values are in memory. A brand-new one has none — and asking for them
        # after the flush would fire a lazy load, which async SQLAlchemy cannot
        # do mid-request (MissingGreenlet).
        is_new_option = opt is None
        if opt is None:
            opt = ProductOption(product_id=product_id)
            db.add(opt)
        opt.name = o_in.name
        opt.input_type = o_in.input_type
        opt.required = o_in.required
        opt.help_text = o_in.help_text
        opt.is_active = o_in.is_active
        opt.in_price_matrix = o_in.in_price_matrix
        opt.position = pos
        await db.flush()                      # need opt.id for its values
        keep_opts.add(str(opt.id))
        opt_ids.append(opt.id)

        existing_vals = {} if is_new_option else {str(v.id): v for v in (opt.values or [])}
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

    # A stored combination price refers to choices by id. When a choice is
    # deleted the rows naming it can never match again, so they are removed
    # rather than left behind to confuse the next person who opens the grid.
    # The option rows cascade on their own foreign key; these do not, because
    # the reference is an array rather than a column.
    await db.flush()
    await db.execute(_sa_text("""
        DELETE FROM product_option_combinations
        WHERE product_id = :pid
          AND NOT (value_ids <@ (
              SELECT COALESCE(array_agg(v.id), '{}'::uuid[])
              FROM product_option_values v
              JOIN product_options o ON o.id = v.option_id
              WHERE o.product_id = :pid
          ))
    """), {"pid": str(product_id)})

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


# ── Combination pricing ──────────────────────────────────────────────────────

class CombinationIn(BaseModel):
    """One cell of the price table.

    The pairs are sent rather than a key so the server can check every one of
    them against the product before storing anything — a row naming a choice
    that does not exist could never match a selection, and the admin would be
    left wondering why their price did nothing.
    """

    # option_id -> value_id
    selections: dict[uuid.UUID, uuid.UUID] = Field(default_factory=dict)
    unit_price: Optional[Decimal] = Field(None, ge=0)
    setup_fee: Optional[Decimal] = Field(None, ge=0)
    sku: Optional[str] = Field(None, max_length=80)
    enabled: bool = True
    note: Optional[str] = Field(None, max_length=200)


class CombinationsIn(BaseModel):
    combinations: list[CombinationIn] = Field(default_factory=list)


def _combo_row(row: ProductOptionCombination) -> dict:
    return {
        "combo_key": row.combo_key,
        "selections": {o: v for o, v in combos.parse_key(row.combo_key)},
        "unit_price": float(row.unit_price) if row.unit_price is not None else None,
        "setup_fee": float(row.setup_fee) if row.setup_fee is not None else None,
        "sku": row.sku,
        "enabled": bool(row.enabled),
        "note": row.note,
    }


@router.get("/{product_id}/combinations")
async def get_combinations(
    product_id: uuid.UUID,
    offset: int = 0,
    limit: int = 100,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """One page of the price table.

    Combinations are generated, never stored, so this pages through a generator
    rather than a query — a product whose grid runs to thousands of cells costs
    no rows at all until somebody prices one.

    Each cell reports the price that would actually apply: its own if it has
    one, an inherited one when a shorter stored combination covers it (which is
    what keeps existing prices working after a new option is added), or none,
    meaning the ordinary per-choice formula decides.
    """
    product = await _load_product(db, product_id)
    options = list(product.options or [])
    taking_part = combos.matrix_options(options)
    total = combos.count_combinations(options)

    stored = (await db.execute(
        select(ProductOptionCombination)
        .where(ProductOptionCombination.product_id == product_id)
    )).scalars().all()
    by_key = {row.combo_key: row for row in stored}
    overrides = combos.rows_to_overrides(stored)

    cells: list[dict] = []
    if total and total <= combos.MAX_MATRIX:
        for pairs in combos.page_combinations(options, offset=offset, limit=limit):
            key = combos.combo_key((o.id, v.id) for o, v in pairs)
            own = by_key.get(key)
            # What this cell would be charged at today, whether or not it has a
            # row of its own.
            effective = combos.best_match(
                overrides, {str(o.id): str(v.id) for o, v in pairs}
            )
            cells.append({
                "combo_key": key,
                "label": combos.describe(pairs),
                "selections": {str(o.id): str(v.id) for o, v in pairs},
                "values": [{"option": o.name, "value": v.label} for o, v in pairs],
                "unit_price": float(own.unit_price) if own is not None and own.unit_price is not None else None,
                "setup_fee": float(own.setup_fee) if own is not None and own.setup_fee is not None else None,
                "sku": own.sku if own is not None else None,
                "enabled": bool(own.enabled) if own is not None else True,
                "note": own.note if own is not None else None,
                "has_own_price": own is not None,
                # Set when a shorter stored combination is what decides this
                # cell — so the admin can see the price is inherited, not blank.
                "inherited_from": (
                    effective.key
                    if effective is not None and (own is None or effective.key != key)
                    else None
                ),
                "inherited_unit_price": (
                    float(effective.unit_price)
                    if effective is not None and effective.unit_price is not None
                    and (own is None or effective.key != key)
                    else None
                ),
            })

    return {
        "product_id": str(product_id),
        "matrix_options": [
            {"id": str(o.id), "name": o.name,
             "values": [{"id": str(v.id), "label": v.label}
                        for v in sorted(o.values, key=lambda x: x.position) if v.enabled]}
            for o in taking_part
        ],
        "all_options": [
            {"id": str(o.id), "name": o.name,
             "in_price_matrix": bool(getattr(o, "in_price_matrix", False)),
             "value_count": len([v for v in (o.values or []) if v.enabled])}
            for o in sorted(options, key=lambda x: x.position) if o.is_active
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
        "max_matrix": combos.MAX_MATRIX,
        # True when the chosen options multiply out to more cells than a person
        # could work through. The admin is told the number rather than shown a
        # grid that never finishes loading.
        "too_large": bool(total > combos.MAX_MATRIX),
        "combinations": cells,
        "priced_count": len(stored),
        # Rows that no longer line up with any generated cell, usually because
        # they were priced before an option joined the table. They still apply.
        "stored": [_combo_row(r) for r in stored],
    }


@router.put("/{product_id}/combinations")
async def save_combinations(
    product_id: uuid.UUID,
    payload: CombinationsIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Save prices for combinations, one page of the grid at a time.

    Only the combinations in the payload are touched, so an admin editing page
    three cannot wipe the prices on page one. A cell sent with nothing set on
    it — no price, no fee, no SKU, not disabled — is deleted rather than stored
    as a row that says nothing.
    """
    product = await _load_product(db, product_id)
    options = list(product.options or [])

    existing = {
        row.combo_key: row for row in (await db.execute(
            select(ProductOptionCombination)
            .where(ProductOptionCombination.product_id == product_id)
        )).scalars().all()
    }

    saved, cleared = 0, 0
    for item in payload.combinations:
        try:
            pairs = combos.validate_pairs(
                [(str(o), str(v)) for o, v in item.selections.items()], options
            )
        except combos.CombinationError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        key = combos.combo_key(pairs)
        row = existing.get(key)
        empty = (
            item.unit_price is None and item.setup_fee is None
            and not item.sku and item.enabled and not item.note
        )

        if empty:
            if row is not None:
                await db.delete(row)
                cleared += 1
            continue

        if row is None:
            row = ProductOptionCombination(product_id=product_id, combo_key=key)
            db.add(row)
        row.value_ids = combos.value_ids_of(key)
        row.unit_price = item.unit_price
        row.setup_fee = item.setup_fee
        row.sku = item.sku
        row.enabled = item.enabled
        row.note = item.note
        saved += 1

    await db.commit()
    return {"saved": saved, "cleared": cleared, "message": "Combination prices saved."}

