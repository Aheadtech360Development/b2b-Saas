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

That formula is separable: it forces price(Small, Rounded) to equal
price(Small) + price(Rounded). Real pricing often is not — rounded corners cost
more on a bigger card — so a brand may also store a price for a particular
**combination** of choices (see `services/combinations.py`). A stored
combination replaces the per-unit and percent deltas of the options inside it,
because that cell *is* the price for those choices and charging their deltas on
top would bill them twice. Options outside the match contribute exactly as
before, and a selection matching nothing is priced by the formula above,
unchanged — which is why existing products keep their current prices.

Everything here is server-authoritative: the storefront shows a live estimate,
but the cart and checkout re-price through `price_configuration` and ignore any
figure the client sends.
"""
from __future__ import annotations

import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.product_option import (
    ProductOption,
    ProductOptionCombination,
    ProductQtyTier,
)
from app.services import combinations as combos

logger = logging.getLogger(__name__)

CENTS = Decimal("0.01")


def _money(d: Decimal) -> float:
    return float(d.quantize(CENTS, rounding=ROUND_HALF_UP))


class ConfigurationError(ValueError):
    """A selection was missing, unknown, or disabled."""


async def _load(db, product_id, selected_value_ids: list | None = None):
    product = (await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.options).selectinload(ProductOption.values),
            selectinload(Product.option_rules),
        )
    )).scalar_one_or_none()
    if product is None:
        raise ConfigurationError("Product not found")
    tiers = (await db.execute(
        select(ProductQtyTier)
        .where(ProductQtyTier.product_id == product_id)
        .order_by(ProductQtyTier.min_qty)
    )).scalars().all()
    # Only the combinations somebody priced, and of those only the ones that
    # could possibly apply here. A row matches by naming choices the buyer
    # made, so a row sharing no choice with this selection can be skipped: the
    # overlap test is GIN-indexed, which keeps pricing flat even for a product
    # carrying thousands of priced combinations. The exact subset test still
    # happens in Python, since overlap only narrows the field.
    query = select(ProductOptionCombination).where(
        ProductOptionCombination.product_id == product_id
    )
    if selected_value_ids is not None:
        if not selected_value_ids:
            return product, tiers, []
        query = query.where(ProductOptionCombination.value_ids.overlap(selected_value_ids))
    overrides = (await db.execute(query)).scalars().all()
    return product, tiers, overrides


def evaluate_rules(rules, selections: dict) -> dict:
    """Work out what the current selection switches off.

    Returns the option ids to hide, the option ids to disable (with the note to
    show instead), and the individual choices to disable. Both the storefront and
    this engine call it, so what the buyer sees and what the server accepts can
    never disagree.
    """
    picked: set[str] = set()
    for v in (selections or {}).values():
        if isinstance(v, (list, tuple)):
            picked.update(str(x) for x in v)
        elif v not in (None, ""):
            picked.add(str(v))

    hidden: set[str] = set()
    disabled_options: dict[str, str] = {}
    disabled_values: dict[str, str] = {}

    for r in rules or []:
        if str(r.when_value_id) not in picked:
            continue
        note = r.note or "Not available with your current selection"
        if r.action == "hide_option" and r.target_option_id:
            hidden.add(str(r.target_option_id))
        elif r.action == "disable_option" and r.target_option_id:
            disabled_options[str(r.target_option_id)] = note
        elif r.action == "disable_value" and r.target_value_id:
            disabled_values[str(r.target_value_id)] = note

    return {"hidden_options": hidden, "disabled_options": disabled_options, "disabled_values": disabled_values}


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

    # Normalise: everything becomes option_id -> [value_id, ...]
    wanted: dict[str, list[str]] = {}
    for k, v in (selections or {}).items():
        if v is None or v == "":
            continue
        wanted[str(k)] = [str(x) for x in v] if isinstance(v, (list, tuple)) else [str(v)]

    # The chosen value ids narrow which stored combinations are even worth
    # loading. Anything unparseable is simply left out of the filter; it cannot
    # match a stored row either way, and the selection itself is validated
    # choice by choice below.
    chosen_ids: list[uuid.UUID] = []
    for values in wanted.values():
        for value in values:
            try:
                chosen_ids.append(uuid.UUID(str(value)))
            except (ValueError, AttributeError, TypeError):
                continue

    product, tiers, override_rows = await _load(db, product_id, chosen_ids)

    # Conditional rules are resolved from the selection itself, so a field the
    # buyer can't see is never charged for and never counts as "required".
    active = evaluate_rules(product.option_rules, wanted)
    off_options = active["hidden_options"] | set(active["disabled_options"])

    # A price stored for this particular combination of choices, if the brand
    # set one. Resolved before anything is charged, because it decides which
    # options' own deltas still apply.
    stored = combos.rows_to_overrides(override_rows)

    # A combination the brand switched off is refused before anything is
    # priced, and regardless of whether some longer combination also names a
    # price for it. `enabled` is a constraint, not a price: if this were part
    # of picking the best price, pricing one impossible configuration more
    # precisely would quietly put it back on sale.
    try:
        blocked = combos.blocked_by(stored, wanted)
        matched = combos.best_match(stored, wanted)
    except combos.CombinationError as exc:
        # A selection the combination engine refuses to look at — too many
        # pairs, for instance. That is the buyer's request being wrong, not the
        # server failing, so it must reach them as a refusal they can act on
        # rather than a 500.
        raise ConfigurationError(str(exc))

    if blocked is not None:
        raise ConfigurationError(
            blocked.note or "That combination is not available. Please choose differently."
        )
    priced_by_combo: set[str] = (
        {option_id for option_id, _ in matched.pairs} if matched is not None else set()
    )
    combo_sets_unit = matched is not None and matched.unit_price is not None
    combo_sets_fee = matched is not None and matched.setup_fee is not None

    unit = matched.unit_price if combo_sets_unit else _unit_for_qty(product, tiers, quantity)
    flat_total = Decimal("0")
    percent_factors: list[Decimal] = []
    breakdown: list[dict] = []
    sku_parts: list[str] = []

    for option in sorted(product.options or [], key=lambda o: o.position):
        if not option.is_active:
            continue
        if str(option.id) in off_options:
            continue
        picked = wanted.get(str(option.id), [])
        if not picked:
            if option.required:
                raise ConfigurationError(f'Please choose a "{option.name}".')
            continue

        # This option is part of the combination that set the price, so its own
        # delta is already accounted for — adding it would charge it twice.
        combo_priced = str(option.id) in priced_by_combo

        by_id = {str(v.id): v for v in option.values}
        for value_id in picked:
            value = by_id.get(value_id)
            if value is None:
                raise ConfigurationError(f'"{option.name}" has no such choice.')
            if not value.enabled:
                raise ConfigurationError(f'"{value.label}" is not available for {option.name}.')
            if value_id in active["disabled_values"]:
                raise ConfigurationError(
                    f'"{value.label}" is not available - {active["disabled_values"][value_id]}.'
                )

            delta = Decimal(str(value.price_delta or 0))
            mode = (value.price_mode or "flat").lower()
            unit_from_combo = combo_priced and combo_sets_unit
            fee_from_combo = combo_priced and combo_sets_fee

            if mode == "per_unit":
                if not unit_from_combo:
                    unit += delta
            elif mode == "percent":
                if not unit_from_combo:
                    percent_factors.append(Decimal("1") + (delta / Decimal("100")))
            else:  # flat — charged once for the whole line
                if not fee_from_combo:
                    flat_total += delta

            if value.sku_suffix:
                sku_parts.append(value.sku_suffix)
            breakdown.append({
                "option_id": str(option.id), "option": option.name,
                "value_id": str(value.id), "value": value.label,
                "price_delta": float(delta), "price_mode": mode,
                # So the admin is told the price table decided this, rather
                # than shown a delta that was never charged.
                "from_combination": bool(unit_from_combo or fee_from_combo),
            })

    for f in percent_factors:
        unit *= f
    if unit < 0:
        unit = Decimal("0")

    if combo_sets_fee:
        flat_total += matched.setup_fee

    total = unit * Decimal(quantity) + flat_total
    if total < 0:
        total = Decimal("0")

    if matched is not None and matched.sku:
        sku_parts = [matched.sku]

    return {
        "unit_price": _money(unit),
        "quantity": quantity,
        "setup_fees": _money(flat_total),
        "total": _money(total),
        "breakdown": breakdown,
        "sku_suffix": "-".join(sku_parts) if sku_parts else None,
        # Which stored combination decided this price, if any, so a surprising
        # figure can be traced back to the cell that set it.
        "combination_key": matched.key if matched is not None else None,
    }


def default_selections(product: Product) -> dict:
    """The pre-selected configuration a product page opens with.

    Defaults can themselves trigger a rule, so the first pass is filtered through
    `evaluate_rules` — a field the buyer would never see must not arrive
    pre-selected (and pre-priced).
    """
    out: dict[str, str] = {}
    for option in sorted(product.options or [], key=lambda o: o.position):
        if not option.is_active:
            continue
        values = [v for v in sorted(option.values, key=lambda v: v.position) if v.enabled]
        if not values:
            continue
        chosen = next((v for v in values if v.is_default), values[0])
        out[str(option.id)] = str(chosen.id)

    rules = getattr(product, "option_rules", None)
    active = evaluate_rules(rules, out)
    off = active["hidden_options"] | set(active["disabled_options"])
    for option_id in off:
        out.pop(option_id, None)

    # A default choice that a rule forbids falls through to the next allowed one,
    # so a required field still opens with something valid selected.
    for option in product.options or []:
        current = out.get(str(option.id))
        if not current or current not in active["disabled_values"]:
            continue
        allowed = [
            v for v in sorted(option.values, key=lambda v: v.position)
            if v.enabled and str(v.id) not in active["disabled_values"]
        ]
        if allowed:
            out[str(option.id)] = str(allowed[0].id)
        else:
            out.pop(str(option.id), None)
    return out
