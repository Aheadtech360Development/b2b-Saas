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
shown a table the system will not hold.

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

# The most combinations one product's price table holds. Set by what the system
# can carry, not by what a person could type: grids arrive as a supplier's
# spreadsheet (services/price_grid.py), and a yard sign is already 11,000+
# rows. Measured 2026-10-26 on a local Postgres in Docker at 40,320 rows:
# reading and planning the file 1.5 s; writing it 20-35 s, nearly all of it
# that machine's disk (Postgres idle on CPU; 13,440 rows in one INSERT…SELECT
# is 3.3 s there); a storefront price 38 ms median, the same as at 13,440
# (it looks rows up by name, never scans the table); a page of the admin grid
# 0.2-0.7 s; the download 2.5 s, streamed. Raise it only after measuring again.
# 2026-10-28, raised for a booklet whose questions multiply to 64,584, every
# one sold (the owner fills the downloaded table and imports it back): see the
# note on the import timing in services/price_grid.py.
MAX_MATRIX = 100_000

# Guards the price path: a selection cannot be made to cost time by sending
# hundreds of options. Real configurable products are nowhere near this.
MAX_SELECTION_PAIRS = 64

# The most combination keys one price looks up by name (subset_keys). A
# selection of k single answers has 2**k - 1 non-empty subsets: eight questions
# is 255 keys, twelve is 4,095. Past this the GIN containment test is used.
MAX_SUBSET_KEYS = 4096

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


# ── What a buyer can actually choose (the shop's rules) ──────────────────────
#
# Rules ("Answers that rule others out") change which combinations exist.
# A choice a rule greys out, or leaves out of a "show only these choices"
# list, cannot be bought with the answers that triggered it; a question a rule
# hides is not asked at all, so the buyer's combination does not name it. The
# table has to list those combinations, the shorter ones included, or the
# shop has nowhere to type the price of "14 pt" when 14 pt hides Coating.
# Pricing finds such a row by subset, as it finds any shorter row.

# What the table and its file show for a question a rule hides for these
# answers. Imported back, it means the row leaves that question out.
NOT_ASKED = "-"
NOT_ASKED_MARKS = frozenset({"-", "—", "–"})

# Past this many combinations the rules are not walked: a table that large is
# imported from a file anyway, and walking it would hold the request (150,000
# take about five seconds the first time, then come from the cache below).
RULE_SCAN_LIMIT = 150_000

_BUYABLE_CACHE: dict[tuple, list[tuple[tuple[str, str], ...]]] = {}
_BUYABLE_CACHE_SIZE = 16


def settle(rules: Sequence[Any], options: Sequence[Any], selections: dict[str, list[str]]) -> tuple[dict, set[str]]:
    """The rules' verdict on a selection, with the answers to questions they
    switch off left out, as the buyer's form leaves them out: a hidden
    question's answer triggers nothing. Returns (verdict, questions off)."""
    from app.services.configurator_service import evaluate_rules

    by_id = {str(o.id): o for o in options or []}
    off: set[str] = set()
    active = evaluate_rules(rules, selections)
    for _ in range(len(selections) + 2):
        now = set(active["hidden_options"]) | set(active["disabled_options"])
        now.update(
            option_id for option_id, keep in active["only_values"].items()
            if option_id in by_id
            and not any(getattr(v, "enabled", True) and str(v.id) in keep for v in by_id[option_id].values or [])
        )
        if now == off:
            break
        off = now
        active = evaluate_rules(rules, {k: v for k, v in selections.items() if k not in off})
    return active, off


def _touches(taking_part: Sequence[Any], rules: Sequence[Any]) -> bool:
    """Whether any rule is set off by, or aims at, a question in the table."""
    option_ids = {str(o.id) for o in taking_part}
    value_ids = {str(v.id) for o in taking_part for v in (o.values or [])}
    for r in rules or []:
        if str(getattr(r, "when_value_id", "")) in value_ids and (
            str(getattr(r, "target_option_id", "") or "") in option_ids
            or str(getattr(r, "target_value_id", "") or "") in value_ids
        ):
            return True
    return False


def _signature(taking_part: Sequence[Any], rules: Sequence[Any]) -> tuple:
    return (
        tuple((str(o.id), o.position, tuple((str(v.id), v.position, bool(getattr(v, "enabled", True)))
                                             for v in (o.values or []))) for o in taking_part),
        tuple(sorted((str(r.when_value_id), r.action, str(r.target_option_id or ""), str(r.target_value_id or ""))
                     for r in rules or [])),
    )


def _walk(options: Sequence[Any], rules: Sequence[Any]) -> list[tuple[tuple[str, str], ...]]:
    """Every combination through the rules, the same verdict as
    configurator_service.evaluate_rules + settle, but looking up only the
    rules the picked choices set off (a table of 200,000 is walked in seconds,
    not minutes). A combination no rule touches is kept as it is."""
    by_when: dict[str, list[tuple[str, str, str]]] = {}
    for r in rules or []:
        by_when.setdefault(str(r.when_value_id), []).append(
            (r.action, str(r.target_option_id or ""), str(r.target_value_id or "")))
    offered = {str(o.id): {str(v.id) for v in (o.values or []) if getattr(v, "enabled", True)} for o in options or []}
    pools = [[(str(o.id), str(v.id)) for v in _option_values(o)] for o in matrix_options(options)]

    def verdict(picked: list[str]) -> tuple[set[str], set[str], dict[str, set[str]]]:
        off: set[str] = set()
        disabled: set[str] = set()
        kept: dict[tuple[str, str], set[str]] = {}
        for value_id in picked:
            for action, option_id, target in by_when.get(value_id, ()):
                if action in ("hide_option", "disable_option") and option_id:
                    off.add(option_id)
                elif action == "disable_value" and target:
                    disabled.add(target)
                elif action == "only_values" and option_id and target:
                    kept.setdefault((value_id, option_id), set()).add(target)
        only: dict[str, set[str]] = {}
        for (_, option_id), choices in kept.items():
            only[option_id] = only[option_id] & choices if option_id in only else set(choices)
        off.update(option_id for option_id, keep in only.items() if not (keep & offered.get(option_id, set())))
        return off, disabled, only

    seen: dict[tuple[tuple[str, str], ...], None] = {}
    for combo in itertools.product(*pools):
        picked = [v for _, v in combo]
        if not any(v in by_when for v in picked):
            seen.setdefault(combo, None)
            continue
        off, disabled, only = verdict(picked)
        for _ in range(len(combo) + 2):
            again = verdict([v for o, v in combo if o not in off])
            if again[0] == off:
                off, disabled, only = again
                break
            off, disabled, only = again
        kept_pairs: list[tuple[str, str]] = []
        for option_id, value_id in combo:
            if option_id in off:
                continue
            keep = only.get(option_id)
            if value_id in disabled or (keep is not None and value_id not in keep):
                break
            kept_pairs.append((option_id, value_id))
        else:
            if kept_pairs:
                seen.setdefault(tuple(kept_pairs), None)
    return list(seen)


def buyable(options: Sequence[Any], rules: Sequence[Any] | None) -> list[tuple[tuple[Any, Any], ...]] | None:
    """The combinations a buyer can make under the shop's rules, in table
    order, each without the questions a rule hides for it. None when no rule
    touches the table (every combination is one) or it is too large to walk."""
    taking_part = matrix_options(options)
    if not taking_part or not rules or not _touches(taking_part, rules):
        return None
    if count_combinations(options) > RULE_SCAN_LIMIT:
        return None
    key = _signature(taking_part, rules)
    ids = _BUYABLE_CACHE.get(key)
    if ids is None:
        ids = _walk(options, rules)
        if len(_BUYABLE_CACHE) >= _BUYABLE_CACHE_SIZE:
            _BUYABLE_CACHE.pop(next(iter(_BUYABLE_CACHE)))
        _BUYABLE_CACHE[key] = ids
    option_of = {str(o.id): o for o in taking_part}
    value_of = {str(v.id): v for o in taking_part for v in (o.values or [])}
    return [tuple((option_of[o], value_of[v]) for o, v in combo) for combo in ids]


def labels_in_columns(pairs: Sequence[tuple[Any, Any]], columns: Sequence[Any]) -> list[str]:
    """One label per table column: the choice, or NOT_ASKED for a question
    this combination leaves out."""
    chosen = {str(o.id): v for o, v in pairs}
    return [chosen[str(o.id)].label if str(o.id) in chosen else NOT_ASKED for o in columns]


# ── Matching a stored row to a selection ─────────────────────────────────────

class Override:
    """One stored price, reduced to what matching needs."""

    __slots__ = ("key", "pairs", "unit_price", "line_price", "setup_fee", "sku", "enabled", "note")

    def __init__(self, row: Any):
        self.key: str = row.combo_key or ""
        self.pairs: frozenset[tuple[str, str]] = frozenset(parse_key(self.key))
        self.unit_price = None if row.unit_price is None else Decimal(str(row.unit_price))
        line_price = getattr(row, "line_price", None)
        self.line_price = None if line_price is None else Decimal(str(line_price))
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


def subset_keys(options: Sequence[Any], selections: dict) -> list[str] | None:
    """Every key a stored row could have and still apply to this selection:
    each non-empty pick of at most one chosen answer per question, spelt as
    combo_key spells it. With them the price is an exact lookup on the
    (product, combination) index, one probe per key, however large the table:
    the row matching most pairs, and any switched-off row inside the selection,
    are among them by definition.

    Only answers the product has count (a typed name to print is no key).
    None when there would be more than MAX_SUBSET_KEYS; the caller then asks
    the GIN index for rows contained in the selection instead.
    """
    known = {str(o.id): {str(v.id) for v in (o.values or [])} for o in (options or [])}
    groups: list[list[tuple[str, str]]] = []
    for option_id, chosen in (selections or {}).items():
        values = chosen if isinstance(chosen, (list, tuple)) else [chosen]
        valid = list(dict.fromkeys(str(v) for v in values if str(v) in known.get(str(option_id), ())))
        if valid:
            groups.append([(str(option_id), v) for v in valid])
    count = 1
    for group in groups:
        count *= len(group) + 1
        if count - 1 > MAX_SUBSET_KEYS:
            return None
    keys: list[str] = []
    for pick in itertools.product(*[[None, *group] for group in groups]):
        pairs = [p for p in pick if p is not None]
        if pairs:
            keys.append(combo_key(pairs))
    return keys


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
