"""Admin API — configurable-product option builder.

The builder edits a product's whole option set as one document (options, their
choices, and the quantity breaks), so this exposes a single GET/PUT pair rather
than per-row CRUD. The PUT is an upsert-diff: rows whose id is sent are updated,
new rows are created, and anything the payload omits is deleted — which keeps
existing ids stable so saved configurations keep resolving.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text as _sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, get_db
from app.core.redis import redis_get, redis_set
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
from app.services import price_grid
from app.services.configurator_service import QUANTITY_INPUT, quantity_of

router = APIRouter(prefix="/admin/products", tags=["admin", "product-options"])
logger = logging.getLogger(__name__)


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

    # A question that asks how many sets the line's quantity from its answer
    # (configurator_service), so there can be one, and its choices are numbers.
    asks_how_many = [o for o in payload.options if o.input_type == QUANTITY_INPUT and o.is_active]
    if len(asks_how_many) > 1:
        raise HTTPException(status_code=400, detail="Only one question can ask how many.")
    for o in asks_how_many:
        for v in o.values:
            if quantity_of(v.label) is None:
                raise HTTPException(
                    status_code=400,
                    detail=f'"{v.label}" in {o.name} is not a number of items. '
                           "A quantity question needs choices like 1, 5, 10.",
                )

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
    # The whole line's price, for a combination naming the quantity question.
    line_price: Optional[Decimal] = Field(None, ge=0)
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
        "line_price": float(row.line_price) if row.line_price is not None else None,
        "setup_fee": float(row.setup_fee) if row.setup_fee is not None else None,
        "sku": row.sku,
        "enabled": bool(row.enabled),
        "note": row.note,
    }


def _quantity_option_id(options) -> str | None:
    asked = next(
        (o for o in sorted(options or [], key=lambda x: x.position)
         if o.is_active and o.input_type == QUANTITY_INPUT),
        None,
    )
    return str(asked.id) if asked is not None else None


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
    C = ProductOptionCombination

    page = combos.page_combinations(options, offset=offset, limit=limit) if total and total <= combos.MAX_MATRIX else []
    # Only the stored rows this page can use, never the whole table (an
    # imported grid is tens of thousands of rows): every row naming nothing
    # outside the page's choices. That is each cell's own row and any shorter
    # row a cell inherits from, by the GIN index on value_ids.
    page_values = sorted({v.id for pairs in page for _, v in pairs}, key=str)
    stored = (await db.execute(
        select(C).where(C.product_id == product_id, C.value_ids.contained_by(page_values))
    )).scalars().all() if page_values else []
    by_key = {row.combo_key: row for row in stored}
    overrides = combos.rows_to_overrides(stored)
    priced_count = (await db.execute(
        select(func.count()).select_from(C).where(C.product_id == product_id)
    )).scalar() or 0

    # The choices no saved price names, in the questions the saved prices
    # cover: every combination with one of them has no price of its own. It is
    # what a product's own choices that a supplier's file did not list look
    # like, and why its table can be far bigger than the file.
    unpriced: list[dict] = []
    line_priced = False
    if priced_count:
        named = set((await db.execute(
            select(func.unnest(C.value_ids)).where(
                C.product_id == product_id, C.enabled.is_(True),
                or_(C.line_price.isnot(None), C.unit_price.isnot(None)),
            ).distinct()
        )).scalars().all())
        line_priced = (await db.execute(
            select(C.id).where(C.product_id == product_id, C.line_price.isnot(None)).limit(1)
        )).first() is not None
        for o in taking_part:
            choices = [v for v in sorted(o.values, key=lambda x: x.position) if v.enabled]
            if not any(v.id in named for v in choices):
                continue   # a question the table does not price: every choice keeps its own amount
            missing = [v.label for v in choices if v.id not in named]
            if missing:
                unpriced.append({"option": o.name, "choices": missing[:12], "count": len(missing)})

    cells: list[dict] = []
    if page:
        for pairs in page:
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
                "line_price": float(own.line_price) if own is not None and own.line_price is not None else None,
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
                "inherited_line_price": (
                    float(effective.line_price)
                    if effective is not None and effective.line_price is not None
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
        # Set when the product asks how many as a question: its cells are then
        # priced as whole lines ("30 signs: $1,106.84"), not per item.
        "quantity_option_id": _quantity_option_id(options),
        "total": total,
        "offset": offset,
        "limit": limit,
        "max_matrix": combos.MAX_MATRIX,
        # True when the chosen options multiply out to more cells than a person
        # could work through. The admin is told the number rather than shown a
        # grid that never finishes loading.
        "too_large": bool(total > combos.MAX_MATRIX),
        "combinations": cells,
        "priced_count": priced_count,
        "unpriced_choices": unpriced,
        # The table prices whole lines, so a combination without a price of
        # its own cannot be ordered (configurator_service.prices_whole_lines).
        "line_priced": line_priced,
        # The stored rows behind this page's cells (their own and any shorter
        # row they inherit from). The whole table is not sent: an imported grid
        # is tens of thousands of rows.
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

    asked = _quantity_option_id(options)
    saved, cleared = 0, 0
    for item in payload.combinations:
        try:
            pairs = combos.validate_pairs(
                [(str(o), str(v)) for o, v in item.selections.items()], options
            )
        except combos.CombinationError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        # A whole line's price only means something when the combination says
        # how many the line is for.
        if item.line_price is not None and asked not in {o for o, _ in pairs}:
            raise HTTPException(
                status_code=400,
                detail="A price for the whole quantity needs the quantity question in the combination.",
            )

        key = combos.combo_key(pairs)
        row = existing.get(key)
        empty = (
            item.unit_price is None and item.line_price is None and item.setup_fee is None
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
        row.line_price = item.line_price
        row.setup_fee = item.setup_fee
        row.sku = item.sku
        row.enabled = item.enabled
        row.note = item.note
        saved += 1

    await db.commit()
    return {"saved": saved, "cleared": cleared, "message": "Combination prices saved."}


# ── The price table as a spreadsheet ─────────────────────────────────────────

class PriceGridIn(BaseModel):
    """A supplier's grid, one row per combination (services/price_grid.py)."""

    csv: str = Field(..., min_length=1, max_length=price_grid.MAX_BYTES)
    price_column: Optional[str] = Field(None, max_length=200)
    # Left out: worked out from the file. "": the file has no quantity column.
    quantity_column: Optional[str] = Field(None, max_length=200)
    ignore: list[str] = Field(default_factory=list, max_length=price_grid.MAX_COLUMNS)
    # The file is the whole price list: the stored prices it does not mention
    # are cleared and the product's choices it does not list are switched off.
    replace: bool = False
    # Grey out the pairs of choices the file never sells together.
    rules: bool = True


def _questions_of(product: Product) -> list[dict]:
    return [
        {
            "id": str(o.id), "name": o.name, "input_type": o.input_type,
            "is_active": bool(o.is_active),
            "values": [{"id": str(v.id), "label": v.label, "enabled": bool(v.enabled)} for v in o.values],
        }
        for o in sorted(product.options or [], key=lambda x: x.position)
    ]


async def _grid_plan(db: AsyncSession, product_id: uuid.UUID, payload: PriceGridIn) -> tuple[Product, dict]:
    product = await _load_product(db, product_id)
    if (getattr(product, "pricing_mode", "variant") or "variant") != "configurable":
        raise HTTPException(
            status_code=400,
            detail="This product is not priced by options yet. Choose options pricing, save, then import.",
        )
    questions = _questions_of(product)

    def read_and_plan() -> dict:
        return price_grid.plan(
            price_grid.read_csv(payload.csv), questions,
            price_column=payload.price_column,
            quantity_column=price_grid.AUTO if payload.quantity_column is None else payload.quantity_column,
            ignore=payload.ignore,
        )

    try:
        # Pure CPU work on plain data (a 40,000-row file is a second or two):
        # done off the event loop, so this worker keeps answering other
        # requests meanwhile.
        the_plan = await asyncio.to_thread(read_and_plan)
    except price_grid.GridError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return product, the_plan


@router.post("/{product_id}/price-grid/preview")
async def preview_price_grid(
    product_id: uuid.UUID,
    payload: PriceGridIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """What importing this file would do. Nothing is saved."""
    product, the_plan = await _grid_plan(db, product_id, payload)
    # The stored prices a whole-price-list import would remove: every row but
    # the file's own. Compared as digests here, not as keys sent to Postgres:
    # with eight questions a key is ~600 characters, and a file lists up to
    # 100,000 of them.
    listed = {hashlib.md5(k.encode()).hexdigest() for k in price_grid.listed_keys(the_plan, _questions_of(product))}
    C = ProductOptionCombination
    stored = (await db.execute(select(func.md5(C.combo_key)).where(C.product_id == product_id))).scalars().all()
    removes = sum(1 for digest in stored if digest not in listed)
    return {**price_grid.public(the_plan), "removes": removes}


# ── Writing an import in the background ───────────────────────────────────────
# A booklet's table is 64,584 rows, about a minute to write on a slow disk:
# longer than a request should hang open (Railway's edge may cut one that sends
# nothing for 60 s, and the admin would be told it failed while it went on).
# So the request plans the file, which also refuses a bad one, and answers at
# once; the rows are written in their own session and single transaction, and
# the page asks how it went every two seconds. The state lives in Redis so any
# worker can answer; the product id is unique across shops, and the status
# route loads the product first, so only its own shop can read it.
_IMPORT_JOB = "price-grid-import:{}"
_IMPORT_JOB_TTL = 3600
# No import runs this long: a job still "running" after it died with its
# worker (a deploy), and its transaction went with it.
_IMPORT_JOB_STALE = 10 * 60
_import_tasks: set[asyncio.Task] = set()   # held until done, so none is collected mid-write


def _import_message(result: dict) -> str:
    message = f"{result['prices_saved']:,} prices imported."
    if result["removed"]:
        message += f" {result['removed']:,} old price{'s' if result['removed'] != 1 else ''} removed."
    if result["unlisted_switched_off"]:
        n = result["unlisted_switched_off"]
        message += f" {n} choice{'s' if n != 1 else ''} not in the file switched off."
    return message


async def _import_job(product_id: uuid.UUID) -> dict | None:
    raw = await redis_get(_IMPORT_JOB.format(product_id))
    if not raw:
        return None
    job = json.loads(raw)
    if job.get("state") == "running" and time.time() - float(job.get("started") or 0) > _IMPORT_JOB_STALE:
        return {"state": "failed",
                "error": "The import stopped before it finished, and nothing was saved. Import the file again."}
    return job


async def _set_import_job(product_id: uuid.UUID, job: dict) -> None:
    await redis_set(_IMPORT_JOB.format(product_id), json.dumps(job, default=str), expire=_IMPORT_JOB_TTL)


async def _write_import(product_id: uuid.UUID, the_plan: dict, replace: bool, rules: bool) -> None:
    """The import's writes, after the request has answered. Runs in a copy of
    the request's context, so it is scoped to the same shop."""
    try:
        async with AsyncSessionLocal() as db:
            product = await _load_product(db, product_id)
            result = await price_grid.apply(db, product, the_plan, replace=replace, add_rules=rules)
            await db.commit()
        await _set_import_job(product_id, {"state": "done", "result": {**result, "message": _import_message(result)}})
    except Exception:  # noqa: BLE001 - reported to the page, logged with its cause
        logger.exception("Price grid import failed for product %s", product_id)
        await _set_import_job(product_id, {
            "state": "failed", "error": "The import failed, and nothing was saved. Try again.",
        })


@router.post("/{product_id}/price-grid/import")
async def import_price_grid(
    product_id: uuid.UUID,
    payload: PriceGridIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fill the price table from the file, in one go and all or nothing.

    Answers {"state": "running"} once the file is checked; the rows are then
    written in the background (see above) and GET on this address says how it
    went. Without Redis to report through, it writes them here and answers
    with the result, as it always did."""
    product, the_plan = await _grid_plan(db, product_id, payload)
    if the_plan["error_count"]:
        n = the_plan["error_count"]
        raise HTTPException(
            status_code=400,
            detail=f"{n} row{'s' if n != 1 else ''} in the file {'need' if n != 1 else 'needs'} fixing first. "
                   "Nothing was imported.",
        )
    try:
        current = await _import_job(product_id)
        if current and current.get("state") == "running":
            raise HTTPException(status_code=409, detail="This product's last import is still being written. "
                                                        "Wait for it to finish, then import again.")
        rows = the_plan["priced"] + the_plan["not_available"]
        await _set_import_job(product_id, {"state": "running", "started": time.time(), "rows": rows})
        reporting = await _import_job(product_id) is not None
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("Price grid import cannot report through Redis, writing it in the request: %s", exc)
        reporting = False

    if not reporting:
        result = await price_grid.apply(db, product, the_plan, replace=payload.replace, add_rules=payload.rules)
        await db.commit()
        return {**result, "message": _import_message(result)}

    task = asyncio.create_task(_write_import(product_id, the_plan, payload.replace, payload.rules))
    _import_tasks.add(task)
    task.add_done_callback(_import_tasks.discard)
    return {"state": "running", "rows": rows}


@router.get("/{product_id}/price-grid/import")
async def price_grid_import_state(
    product_id: uuid.UUID,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """How the product's last import went: running, done (with its result),
    failed (with why) or none."""
    await _load_product(db, product_id)   # this shop's product, or 404
    return await _import_job(product_id) or {"state": "none"}


@router.get("/{product_id}/price-grid.csv")
async def export_price_grid(
    product_id: uuid.UUID,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Every combination and its own price, ready to edit and import again.

    Streamed as it is written, from the six columns it needs (not a row object
    per combination), so a 50,000-row table costs a few megabytes at most."""
    from fastapi.responses import StreamingResponse

    product = await _load_product(db, product_id)
    options = list(product.options or [])
    try:
        price_grid.check_exportable(options)
    except price_grid.GridError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    C = ProductOptionCombination
    stored = (await db.execute(
        select(C.combo_key, C.enabled, C.line_price, C.unit_price, C.sku, C.note).where(C.product_id == product_id)
    )).all()
    name = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in (product.slug or "product"))[:80]
    return StreamingResponse(
        price_grid.export_lines(options, list(stored)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}-prices.csv"'},
    )

