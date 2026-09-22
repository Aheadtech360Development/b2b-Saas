"""Every combination of a product's options, and the price of one.

Why this is not a table of rows
-------------------------------
A configurable product's combinations grow multiplicatively. Business Cards has
around fourteen option groups; written out that is on the order of 10^8 rows,
and Shopify's own answer to the same arithmetic is to cap products at three
options and a hundred variants. So combinations are *generated* here, lazily,
and only the ones a brand actually priced are stored.

Which options take part
-----------------------
All of them, automatically — every active option with choices to pick from.
Add an option and the table grows by itself. A free-typed answer (the name to
print) is the one exception, because it has no fixed list of values to combine.
A product whose options multiply past MAX_MATRIX is told its size rather than
shown a table nobody could fill in.

Matching is by subset, most specific first
------------------------------------------
A stored row lists the (option, value) pairs it applies to, and matches any
selection containing all of them. The row naming the most pairs wins.

That is what makes adding an option safe. A product priced over
Size x Quantity gains a Shape option: every existing row still matches, so
every price already set keeps applying to both shapes until somebody prices
them apart. Nothing to migrate, nothing silently repriced.

What a match does to the price
------------------------------
A matched `unit_price` *replaces* the per-unit and percent deltas of the
options inside that match — the cell is the price for those choices, so
charging their deltas on top would bill them twice. Options outside the match
contribute exactly as they always did, and a selection matching no row is
priced by the original formula, untouched.
"""
from __future__ import annotations

import itertools
import uuid
from decimal import Decimal
from typing import Any, Iterable, Iterator, Sequence

# A grid the admin could not work through is not worth generating. Well above
# any real price table (5 sizes x 8 quantities x 4 finishes is 160) and far
# below the point where paging it becomes slow.
MAX_MATRIX = 5000

# Guards the price path: a selection cannot be made to cost time by sending
# hundreds of options. Real configurable products are nowhere near this.
MAX_SELECTION_PAIRS = 64

_PAIR_SEP = "|"
_KV_SEP = ":"


class CombinationError(ValueError):
    """A combination was malformed, unknown, or switched off."""


# ── The key ──────────────────────────────────────────────────────────────────

def combo_key(pairs: Iterable[tuple[Any, Any]]) -> str:
    """The canonical spelling of a set of (option, value) choices.

    Sorted by option id, so the same combination produces the same key whatever
    order the admin's grid or the buyer's payload happened to use — which is
    what lets the unique index actually mean "one row per combination".
    """
    cleaned = sorted(
        (str(option_id), str(value_id))
        for option_id, value_id in pairs
        if option_id is not None and value_id is not None
    )
    if not cleaned:
        return ""
    return _PAIR_SEP.join(f"{o}{_KV_SEP}{v}" for o, v in cleaned)


def parse_key(key: str) -> list[tuple[str, str]]:
    """The pairs a key stands for. Unreadable fragments are skipped."""
    out: list[tuple[str, str]] = []
    for chunk in (key or "").split(_PAIR_SEP):
        if not chunk:
            continue
        option_id, _, value_id = chunk.partition(_KV_SEP)
        if option_id and value_id:
            out.append((option_id, value_id))
    return out


def value_ids_of(key: str) -> list[uuid.UUID]:
    """The value ids in a key, for the array column used by cleanup."""
    out: list[uuid.UUID] = []
    for _, value_id in parse_key(key):
        try:
            out.append(uuid.UUID(value_id))
        except (ValueError, AttributeError, TypeError):
            continue
    return out


# ── Generating the grid ──────────────────────────────────────────────────────

# Answers that are typed rather than picked. There is no list of them to
# combine — "the name to print" has as many values as there are names — so they
# can never be a column in the price table.
FREE_INPUT_TYPES = ("text", "number")


def matrix_options(options: Sequence[Any]) -> list[Any]:
    """The options that make up the price table, in display order.

    Every active option with choices to pick from, automatically. Adding an
    option grows the table on its own, which is what an admin expects: nobody
    should have to opt an option in before its combinations exist.

    Left out, because there is nothing to combine: an option with no enabled
    choices (it would multiply the grid by zero and show an empty table), and a
    free-typed answer, which has no fixed list of values.
    """
    return [
        option for option in sorted(options or [], key=lambda o: (o.position, str(o.id)))
        if getattr(option, "is_active", True)
        and getattr(option, "input_type", "select") not in FREE_INPUT_TYPES
        and [v for v in (option.values or []) if getattr(v, "enabled", True)]
    ]


def _option_values(option: Any) -> list[Any]:
    return [
        v for v in sorted(option.values or [], key=lambda v: (v.position, str(v.id)))
        if getattr(v, "enabled", True)
    ]


def count_combinations(options: Sequence[Any]) -> int:
    """How many cells the grid would have. Multiplied, never generated."""
    taking_part = matrix_options(options)
    if not taking_part:
        return 0
    total = 1
    for option in taking_part:
        total *= len(_option_values(option))
        if total > MAX_MATRIX * 1000:
            # Stop multiplying once the answer is "far too many" — the exact
            # figure stops being useful and the product of fourteen groups
            # runs into numbers nobody can read.
            return total
    return total


def iter_combinations(options: Sequence[Any]) -> Iterator[tuple[tuple[Any, Any], ...]]:
    """Every combination, one at a time, as tuples of (option, value).

    A generator on purpose: the caller pages through it, so a grid of thousands
    never exists in memory at once.
    """
    taking_part = matrix_options(options)
    if not taking_part:
        return
    pools = [[(option, value) for value in _option_values(option)] for option in taking_part]
    yield from itertools.product(*pools)


def page_combinations(
    options: Sequence[Any], *, offset: int = 0, limit: int = 100
) -> list[tuple[tuple[Any, Any], ...]]:
    """One page of the grid, without walking past what it needs."""
    offset = max(0, int(offset or 0))
    limit = max(1, min(int(limit or 100), 500))
    return list(itertools.islice(iter_combinations(options), offset, offset + limit))


# ── Matching a stored row to a selection ─────────────────────────────────────

class Override:
    """One stored price, reduced to what matching needs."""

    __slots__ = ("key", "pairs", "unit_price", "setup_fee", "sku", "enabled", "note")

    def __init__(self, row: Any):
        self.key: str = row.combo_key or ""
        self.pairs: frozenset[tuple[str, str]] = frozenset(parse_key(self.key))
        self.unit_price = None if row.unit_price is None else Decimal(str(row.unit_price))
        self.setup_fee = None if row.setup_fee is None else Decimal(str(row.setup_fee))
        self.sku = row.sku
        self.enabled = bool(row.enabled)
        self.note = getattr(row, "note", None)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Override {self.key} unit={self.unit_price} enabled={self.enabled}>"


def selection_pairs(selections: dict) -> set[tuple[str, str]]:
    """The buyer's choices as (option, value) pairs.

    A multi-select option contributes one pair per chosen value, so a
    combination can be priced on any one of them.
    """
    pairs: set[tuple[str, str]] = set()
    for option_id, chosen in (selections or {}).items():
        if chosen is None or chosen == "":
            continue
        values = chosen if isinstance(chosen, (list, tuple)) else [chosen]
        for value in values:
            if value is None or value == "":
                continue
            pairs.add((str(option_id), str(value)))
            if len(pairs) > MAX_SELECTION_PAIRS:
                raise CombinationError("That is more options than this product has.")
    return pairs


def blocked_by(overrides: Sequence[Override], selections: dict) -> Override | None:
    """The switched-off combination this selection runs into, if any.

    Checked separately from pricing, and before it, because `enabled` is a
    constraint rather than a price. "Rounded corners are not available on
    Medium" rules out *every* Medium+Rounded configuration; if this were folded
    into `best_match`, pricing one of them more precisely — Medium, quantity 1,
    rounded — would quietly put the impossible combination back on sale.

    The shortest blocking row is reported, since that is the rule the brand
    wrote and the wording the buyer should see.
    """
    picked = selection_pairs(selections)
    if not picked:
        return None
    blocking = [o for o in overrides if not o.enabled and o.pairs and o.pairs <= picked]
    if not blocking:
        return None
    return min(blocking, key=lambda o: (len(o.pairs), o.key))


def best_match(overrides: Sequence[Override], selections: dict) -> Override | None:
    """The stored row that describes this selection most precisely.

    Subset matching, most pairs first. Ties — two rows naming the same number
    of pairs, both of which apply — are broken on the key so the answer is the
    same on every server and every request; a price that depended on row order
    would be a bug nobody could reproduce.
    """
    picked = selection_pairs(selections)
    if not picked:
        return None
    # A switched-off row is a constraint, not a price — `blocked_by` deals
    # with it. Letting one win here could hand back a price for something
    # that is not for sale.
    candidates = [o for o in overrides if o.enabled and o.pairs and o.pairs <= picked]
    if not candidates:
        return None
    return max(candidates, key=lambda o: (len(o.pairs), o.key))


def rows_to_overrides(rows: Iterable[Any]) -> list[Override]:
    return [Override(row) for row in rows]


# ── Validation ───────────────────────────────────────────────────────────────

def validate_pairs(
    pairs: Sequence[tuple[str, str]], options: Sequence[Any]
) -> list[tuple[str, str]]:
    """Check a combination the admin is trying to save, and canonicalise it.

    Refuses a pair whose option or value does not exist on this product, and a
    combination naming one option twice — both would store a row that could
    never match anything, and the admin would be left wondering why their price
    did nothing.
    """
    by_option: dict[str, Any] = {str(o.id): o for o in (options or [])}
    seen: set[str] = set()
    out: list[tuple[str, str]] = []

    for option_id, value_id in pairs:
        option_id, value_id = str(option_id), str(value_id)
        option = by_option.get(option_id)
        if option is None:
            raise CombinationError("That price is for an option this product no longer has.")
        if option_id in seen:
            raise CombinationError(f'"{option.name}" is named twice in one combination.')
        if not any(str(v.id) == value_id for v in (option.values or [])):
            raise CombinationError(f'"{option.name}" has no such choice.')
        seen.add(option_id)
        out.append((option_id, value_id))

    if not out:
        raise CombinationError("A price needs at least one choice to apply to.")
    return sorted(out)


def describe(pairs: Sequence[tuple[Any, Any]]) -> str:
    """A combination in words — "Size: Medium · Corners: Rounded"."""
    return " · ".join(f"{option.name}: {value.label}" for option, value in pairs)
