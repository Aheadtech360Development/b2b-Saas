"""A configurable product's price table from a spreadsheet, and back.

Suppliers send their prices as one row per combination (Qty, Size, Sides, ...,
Price). A yard sign alone is 2,688 rows, more than anybody can type into the
price table one cell at a time. This reads such a file and turns every row
into a combination price:

* Columns are read as the product's questions, except the price column (and an
  optional SKU and Note column, and any other column of figures, such as the
  supplier's cost, which is left out). A question or choice the product does
  not have yet is created, so a new product can be set up from the file alone.
* A quantity column (Qty, Quantity, Pieces, ...) becomes the product's quantity
  question: the buyer picks how many from it, and each row's price is the price
  of the whole line for that many (`line_price`).
* "N/A" makes the combination one that cannot be ordered. Two choices that are
  N/A together in every row (30 signs with next-day production) also get a
  pair of rules, each greying the other out once one is picked, so the buyer
  never reaches the refusal. A choice that is N/A in every row is switched off.

Everything but `apply` is plain data in and out, so the preview checks a file
without touching the database.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from itertools import combinations as column_pairs
from typing import Any

from app.services import combinations as combos
from app.services.configurator_service import QUANTITY_INPUT, quantity_of

MAX_BYTES = 3_000_000
MAX_ROWS = combos.MAX_MATRIX
MAX_COLUMNS = 40
MAX_ERRORS_SHOWN = 50
# Past this many N/A pairs the file's gaps are not a pattern a rule can say
# simply; those combinations are still refused when priced.
MAX_RULE_PAIRS = 100
NOT_AVAILABLE_NOTE = "Not available"

_NOT_AVAILABLE = {"n/a", "na", "-", "–", "—", "not available", "unavailable"}
_PRICE_WORDS = re.compile(r"price|cost|amount|total|rate|\$|usd", re.I)
_QTY_WORDS = re.compile(r"^\s*(qty|quantity|quantities|pcs|pieces|units?|count)\b", re.I)
_SKU = re.compile(r"^\s*sku\s*$", re.I)
_NOTE = re.compile(r"^\s*notes?\s*$", re.I)
_SPACE = re.compile(r"\s+")

# Asked of `plan` when the caller leaves the quantity column to the file.
AUTO = object()


class GridError(ValueError):
    """The file cannot be read as a price grid at all."""


def norm(text: str | None) -> str:
    """How names are compared: case and spacing do not make two names different."""
    return _SPACE.sub(" ", (text or "").strip()).casefold()


# ── Reading ───────────────────────────────────────────────────────────────────

@dataclass
class Sheet:
    header: list[str]
    rows: list[list[str]]
    lines: list[int]          # each row's line in the file, for messages


def read_csv(text: str | None) -> Sheet:
    """The file as a header and rows of trimmed cells. Comma, semicolon or tab."""
    text = (text or "").lstrip("﻿")
    if not text.strip():
        raise GridError("The file is empty.")
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise GridError(f"The file is over {MAX_BYTES // 1_000_000} MB. Split it, or leave out columns that are not needed.")

    first_line = text.splitlines()[0]
    try:
        delimiter = csv.Sniffer().sniff(first_line, delimiters=",;\t").delimiter
    except csv.Error:
        delimiter = ","

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    header: list[str] | None = None
    rows: list[list[str]] = []
    lines: list[int] = []
    for raw in reader:
        cells = [c.strip() for c in raw]
        if not any(cells):
            continue
        if header is None:
            while cells and not cells[-1]:
                cells.pop()
            if any(not c for c in cells):
                raise GridError("Every column needs a name in the first row.")
            if len(cells) > MAX_COLUMNS:
                raise GridError(f"The file has {len(cells)} columns; up to {MAX_COLUMNS} can be read.")
            seen: set[str] = set()
            for name in cells:
                if norm(name) in seen:
                    raise GridError(f'Two columns are called "{name}". Give each column its own name.')
                seen.add(norm(name))
            header = cells
            continue
        if len(rows) >= MAX_ROWS:
            raise GridError(f"The file has more than {MAX_ROWS:,} rows, more than one product's price table can hold.")
        rows.append((cells + [""] * len(header))[: len(header)])
        lines.append(reader.line_num)

    if header is None:
        raise GridError("The file is empty.")
    if len(header) < 2:
        raise GridError("The file needs at least two columns: a question and a price.")
    if not rows:
        raise GridError("The file has a header but no rows.")
    return Sheet(header=header, rows=rows, lines=lines)


def read_price(cell: str | None) -> tuple[str, Decimal | None]:
    """("blank", None), ("na", None), ("price", amount) or ("bad", None)."""
    text = (cell or "").strip()
    if not text:
        return "blank", None
    if text.casefold() in _NOT_AVAILABLE:
        return "na", None
    cleaned = text.replace("$", "").replace(",", "").replace(" ", "")
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return "bad", None
    if not value.is_finite() or value < 0:
        return "bad", None
    return "price", value


# ── Working out the columns ───────────────────────────────────────────────────

@dataclass
class Column:
    index: int
    name: str
    distinct: list[str]       # filled values, first seen first
    numeric: bool             # every filled cell is a price or N/A
    decimals: bool
    whole: bool               # every filled cell names a number of items


def profile(sheet: Sheet) -> list[Column]:
    columns: list[Column] = []
    for index, name in enumerate(sheet.header):
        distinct: dict[str, str] = {}
        whole = True
        decimals = False
        filled = bad = 0
        for row in sheet.rows:
            cell = row[index]
            if not cell:
                continue
            filled += 1
            distinct.setdefault(norm(cell), cell)
            kind, _ = read_price(cell)
            if kind == "bad":
                bad += 1
            if "." in cell:
                decimals = True
            if quantity_of(cell) is None:
                whole = False
        # A typo or two in a column of prices leaves it a column of prices, so
        # the typo is reported on its row instead of the column being read as
        # a question with a thousand choices.
        numeric = filled > 0 and bad <= max(2, filled // 50)
        columns.append(Column(index, name, list(distinct.values()), numeric, decimals, whole and filled > 0))
    return columns


def suggest(columns: list[Column]) -> dict[str, Any]:
    """What the file most likely means, for the preview to start from."""
    sku = next((c.name for c in columns if _SKU.match(c.name)), None)
    note = next((c.name for c in columns if _NOTE.match(c.name)), None)
    figures = [
        c for c in columns
        if c.name not in (sku, note) and c.numeric and not _QTY_WORDS.match(c.name)
        and (_PRICE_WORDS.search(c.name) or (c.decimals and len(c.distinct) > 12))
    ]
    selling = [c for c in figures if re.search(r"price", c.name, re.I) and not re.search(r"cost", c.name, re.I)]
    price = (selling or figures or [None])[-1]
    questions = [c for c in columns if c not in figures and c.name not in (sku, note)]
    quantity = next((c for c in questions if _QTY_WORDS.match(c.name) and c.whole), None)
    return {
        "price_column": price.name if price else None,
        "quantity_column": quantity.name if quantity else None,
        "sku_column": sku,
        "note_column": note,
        "figure_columns": [c.name for c in figures],
    }


# ── The plan ──────────────────────────────────────────────────────────────────

@dataclass
class Entry:
    line: int
    labels: list[str]         # one per question, in question order
    status: str               # "price" | "na" | "blank"
    price: Decimal | None
    sku: str | None
    note: str | None


def _find(columns: list[Column], name: str | None) -> Column | None:
    if name is None:
        return None
    return next((c for c in columns if norm(c.name) == norm(name)), None)


def plan(
    sheet: Sheet,
    existing: list[dict],
    *,
    price_column: str | None = None,
    quantity_column: Any = AUTO,
    ignore: list[str] | tuple[str, ...] = (),
) -> dict[str, Any]:
    """What importing this file would do to a product with these questions.

    `existing` is the product's questions as plain data: id, name, input_type,
    is_active and values (id, label, enabled). Row problems are collected, not
    raised, so the preview can list them all; a file that cannot be read as a
    grid at all raises GridError.
    """
    columns = profile(sheet)
    guess = suggest(columns)
    ignored = {norm(n) for n in (ignore or ())}

    price = _find(columns, price_column or guess["price_column"])
    if price is None:
        raise GridError("Choose the column that holds the price.")
    if norm(price.name) in ignored:
        raise GridError("The price column cannot be left out.")

    sku = _find(columns, guess["sku_column"])
    note = _find(columns, guess["note_column"])
    figures = {norm(n) for n in guess["figure_columns"]} - {norm(price.name)}
    left_out = {norm(price.name)} | figures | ignored
    if sku is not None:
        left_out.add(norm(sku.name))
    if note is not None:
        left_out.add(norm(note.name))
    questions = [c for c in columns if norm(c.name) not in left_out]
    if not questions:
        raise GridError("No column is left to be a question: every column is the price or left out.")

    by_name = {norm(q["name"]): q for q in existing}
    asks_how_many = next((q for q in existing if q.get("input_type") == QUANTITY_INPUT), None)

    # The quantity column: the caller's choice, else the product's own quantity
    # question if the file has it, else the file's Qty-like column.
    if quantity_column is AUTO:
        quantity = None
        if asks_how_many is not None:
            quantity = _find(questions, asks_how_many["name"])
        if quantity is None:
            quantity = _find(questions, guess["quantity_column"])
    else:
        quantity = _find(questions, quantity_column) if quantity_column else None
        if quantity_column and quantity is None:
            raise GridError(f'"{quantity_column}" is not one of the question columns.')
    if quantity is not None and not quantity.whole:
        bad = next((v for v in quantity.distinct if quantity_of(v) is None), quantity.distinct[0])
        raise GridError(f'"{quantity.name}" has a value that is not a number of items: "{bad}".')
    if asks_how_many is not None and quantity is not None and norm(asks_how_many["name"]) != norm(quantity.name):
        raise GridError(
            f'This product already asks how many with "{asks_how_many["name"]}". '
            f'Name the file\'s column "{asks_how_many["name"]}", or import without a quantity column.'
        )

    warnings: list[str] = []
    question_plans: list[dict[str, Any]] = []
    for column in questions:
        current = by_name.get(norm(column.name))
        is_quantity = quantity is not None and column.index == quantity.index
        current_labels = {norm(v["label"]): v for v in (current or {}).get("values", [])}
        if current is not None and current.get("input_type") == QUANTITY_INPUT and not is_quantity:
            raise GridError(
                f'"{current["name"]}" is this product\'s quantity question; '
                "import it as the quantity column."
            )
        if current is not None and is_quantity and current.get("input_type") != QUANTITY_INPUT:
            not_numbers = [v["label"] for v in current.get("values", []) if quantity_of(v["label"]) is None]
            if not_numbers:
                raise GridError(
                    f'"{current["name"]}" already has choices that are not numbers ({not_numbers[0]}), '
                    "so it cannot become the quantity question."
                )
            warnings.append(f'"{current["name"]}" becomes the question that asks how many.')
        if current is not None and not current.get("is_active", True):
            warnings.append(f'"{current["name"]}" is switched off on this product and is switched back on.')
        switched_off = [v["label"] for v in current_labels.values() if not v.get("enabled", True)
                        and norm(v["label"]) in {norm(x) for x in column.distinct}]
        if switched_off:
            warnings.append(
                f'In "{column.name}", {", ".join(switched_off[:5])} '
                f'{"is" if len(switched_off) == 1 else "are"} switched off on this product: '
                "the prices are saved but not offered until switched on."
            )
        question_plans.append({
            "name": current["name"] if current else column.name,
            "column": column.name,
            "exists": current is not None,
            "is_quantity": is_quantity,
            "labels": column.distinct,
            "new_labels": [v for v in column.distinct if norm(v) not in current_labels],
        })

    # ── Rows ──────────────────────────────────────────────────────────────────
    errors: list[dict[str, Any]] = []
    entries: list[Entry] = []
    first_seen: dict[tuple[str, ...], int] = {}
    for row, line in zip(sheet.rows, sheet.lines):
        labels = [row[c.index] for c in questions]
        missing = next((c.name for c, label in zip(questions, labels) if not label), None)
        if missing:
            errors.append({"row": line, "message": f'"{missing}" is empty.'})
            continue
        kind, amount = read_price(row[price.index])
        if kind == "bad":
            errors.append({"row": line, "message": f'"{row[price.index]}" in "{price.name}" is not a price.'})
            continue
        key = tuple(norm(x) for x in labels)
        if key in first_seen:
            errors.append({"row": line, "message": f"Same choices as row {first_seen[key]}."})
            continue
        first_seen[key] = line
        entries.append(Entry(
            line=line, labels=labels, status=kind, price=amount,
            sku=(row[sku.index] or None) if sku is not None else None,
            note=(row[note.index] or None) if note is not None else None,
        ))

    # ── N/A patterns ──────────────────────────────────────────────────────────
    never, pairs = _unavailable(entries, len(questions))
    never_named = [(questions[i].name, label) for i, label in never]
    if len(pairs) > MAX_RULE_PAIRS:
        warnings.append(
            f"{len(pairs)} pairs of choices are never available together: too many to grey out "
            "one by one, so they are refused when a buyer tries to order them."
        )
        pairs = []
    rules = [
        {"when": [questions[a].name, la], "disable": [questions[b].name, lb]}
        for (a, la), (b, lb) in pairs
    ]

    priced = sum(1 for e in entries if e.status == "price")
    not_available = sum(1 for e in entries if e.status == "na")
    blank = sum(1 for e in entries if e.status == "blank")
    if blank:
        warnings.append(
            f"{blank} row{'s have' if blank != 1 else ' has'} no price: "
            "those combinations keep whatever price they have now."
        )
    if quantity is None and any(_QTY_WORDS.match(c.name) for c in questions):
        warnings.append("No quantity column is used: every price is the price of one item.")

    columns_out: list[dict[str, Any]] = []
    for c in columns:
        n = norm(c.name)
        if c.index == price.index:
            role = "price"
        elif quantity is not None and c.index == quantity.index:
            role = "quantity"
        elif sku is not None and c.index == sku.index:
            role = "sku"
        elif note is not None and c.index == note.index:
            role = "note"
        elif n in ignored or n in figures:
            role = "ignored"
        else:
            role = "question"
        columns_out.append({"name": c.name, "role": role, "values": len(c.distinct)})

    return {
        "columns": columns_out,
        "price_column": price.name,
        "quantity_column": quantity.name if quantity else None,
        "suggested": guess,
        "questions": [
            {k: q[k] for k in ("name", "column", "exists", "is_quantity")}
            | {"choices": len(q["labels"]), "new_choices": q["new_labels"][:20], "new_choice_count": len(q["new_labels"])}
            for q in question_plans
        ],
        "new_questions": [q["name"] for q in question_plans if not q["exists"]],
        "new_choices": sum(len(q["new_labels"]) for q in question_plans),
        "rows": len(sheet.rows),
        "priced": priced,
        "not_available": not_available,
        "blank": blank,
        "errors": errors[:MAX_ERRORS_SHOWN],
        "error_count": len(errors),
        "rules": rules,
        "switched_off": [{"question": q, "choice": c} for q, c in never_named],
        "warnings": warnings,
        "_questions": question_plans,
        "_entries": entries,
        "_never": never,
        "_pairs": pairs,
    }


def public(the_plan: dict[str, Any]) -> dict[str, Any]:
    """The plan without its working parts, for the preview."""
    return {k: v for k, v in the_plan.items() if not k.startswith("_")}


def _unavailable(entries: list[Entry], width: int):
    """Choices N/A in every row, and pairs of choices N/A together in every row.

    A blank row is not N/A: it is a combination the file does not price, which
    keeps its current price.
    """
    single: dict[tuple[int, str], list[int]] = {}
    double: dict[tuple[tuple[int, str], tuple[int, str]], list[int]] = {}
    for e in entries:
        na = 1 if e.status == "na" else 0
        keys = [(i, norm(label)) for i, label in enumerate(e.labels)]
        for k in keys:
            t = single.setdefault(k, [0, 0])
            t[0] += 1
            t[1] += na
        for a, b in column_pairs(range(width), 2):
            t = double.setdefault((keys[a], keys[b]), [0, 0])
            t[0] += 1
            t[1] += na

    label_of: dict[tuple[int, str], str] = {}
    for e in entries:
        for i, label in enumerate(e.labels):
            label_of.setdefault((i, norm(label)), label)

    never = [(k[0], label_of[k]) for k, (total, na) in single.items() if total and na == total]
    never_keys = {k for k, (total, na) in single.items() if total and na == total}
    pairs = [
        ((a[0], label_of[a]), (b[0], label_of[b]))
        for (a, b), (total, na) in double.items()
        if total and na == total and a not in never_keys and b not in never_keys
    ]
    pairs.sort(key=lambda p: (p[0][0], p[1][0], norm(p[0][1]), norm(p[1][1])))
    return never, pairs


# ── Applying it ───────────────────────────────────────────────────────────────

async def apply(db, product, the_plan: dict[str, Any], *, replace: bool = False, add_rules: bool = True) -> dict[str, Any]:
    """Write the plan to the product: questions, choices, prices, rules.

    The caller commits. `product` must have its options (with values) loaded.
    """
    from sqlalchemy import select

    from app.models.product_option import (
        ProductOption,
        ProductOptionCombination,
        ProductOptionRule,
        ProductOptionValue,
    )

    question_plans = the_plan["_questions"]
    entries: list[Entry] = the_plan["_entries"]
    options = sorted(product.options or [], key=lambda o: o.position)
    by_name = {norm(o.name): o for o in options}
    next_position = max((o.position for o in options), default=-1) + 1
    never = {(i, norm(label)) for i, label in the_plan["_never"]}

    made_questions = made_choices = 0
    option_ids: list[Any] = []
    value_ids: list[dict[str, Any]] = []
    has_quantity = False
    for i, q in enumerate(question_plans):
        option = by_name.get(norm(q["name"]))
        values: list[Any] = []
        if option is None:
            option = ProductOption(
                product_id=product.id, name=q["name"][:150],
                input_type=QUANTITY_INPUT if q["is_quantity"] else "select",
                required=True, is_active=True, in_price_matrix=True, position=next_position,
            )
            next_position += 1
            db.add(option)
            await db.flush()
            made_questions += 1
        else:
            values = list(option.values or [])
            if q["is_quantity"]:
                option.input_type = QUANTITY_INPUT
            option.is_active = True
            option.in_price_matrix = True
        has_quantity = has_quantity or q["is_quantity"]

        by_label = {norm(v.label): v for v in values}
        position = max((v.position for v in values), default=-1) + 1
        for label in q["labels"]:
            value = by_label.get(norm(label))
            if value is None:
                value = ProductOptionValue(
                    option_id=option.id, label=label[:200], price_delta=0, price_mode="flat",
                    position=position, enabled=True, is_default=False,
                )
                position += 1
                db.add(value)
                by_label[norm(label)] = value
                made_choices += 1
            if (i, norm(label)) in never:
                value.enabled = False
        option_ids.append(option.id)
        value_ids.append(by_label)
    await db.flush()

    rows = {
        row.combo_key: row for row in (await db.execute(
            select(ProductOptionCombination).where(ProductOptionCombination.product_id == product.id)
        )).scalars().all()
    }
    keys: set[str] = set()
    saved = switched_off = 0
    for e in entries:
        if e.status == "blank":
            continue
        pairs = [(option_ids[i], value_ids[i][norm(label)].id) for i, label in enumerate(e.labels)]
        key = combos.combo_key(pairs)
        keys.add(key)
        row = rows.get(key)
        if row is None:
            row = ProductOptionCombination(product_id=product.id, combo_key=key)
            db.add(row)
            rows[key] = row
        row.value_ids = combos.value_ids_of(key)
        if e.status == "na":
            row.enabled = False
            row.unit_price = None
            row.line_price = None
            row.note = (e.note or NOT_AVAILABLE_NOTE)[:200]
            switched_off += 1
        else:
            row.enabled = True
            if has_quantity:
                # The row names how many, so its price is the whole line's.
                row.line_price = e.price
                row.unit_price = None
            else:
                row.unit_price = e.price
                row.line_price = None
            if e.note is not None:
                row.note = e.note[:200]
            elif row.note == NOT_AVAILABLE_NOTE:
                row.note = None
            saved += 1
        if e.sku is not None:
            row.sku = e.sku[:80]

    removed = 0
    if replace:
        for key, row in list(rows.items()):
            if key not in keys and row in db:
                await db.delete(row)
                removed += 1

    added_rules = 0
    if add_rules and the_plan["_pairs"]:
        have = {
            (str(r.when_value_id), r.action, str(r.target_value_id))
            for r in (await db.execute(
                select(ProductOptionRule).where(ProductOptionRule.product_id == product.id)
            )).scalars().all()
        }
        for (a, label_a), (b, label_b) in the_plan["_pairs"]:
            va = value_ids[a][norm(label_a)]
            vb = value_ids[b][norm(label_b)]
            for when, target, because in (
                (va, vb, f'{question_plans[a]["name"]}: {label_a}'),
                (vb, va, f'{question_plans[b]["name"]}: {label_b}'),
            ):
                signature = (str(when.id), "disable_value", str(target.id))
                if signature in have:
                    continue
                db.add(ProductOptionRule(
                    product_id=product.id, when_value_id=when.id, action="disable_value",
                    target_option_id=None, target_value_id=target.id,
                    note=f"Not available with {because}"[:200],
                ))
                have.add(signature)
                added_rules += 1

    await db.flush()
    return {
        "questions_created": made_questions,
        "choices_created": made_choices,
        "prices_saved": saved,
        "not_available": switched_off,
        "removed": removed,
        "rules_added": added_rules,
        "choices_switched_off": len(never),
    }


# ── Writing it back out ──────────────────────────────────────────────────────

def _figure(amount: Any) -> str:
    value = Decimal(str(amount))
    cents = value.quantize(Decimal("0.01"))
    return str(cents if cents == value else value.quantize(Decimal("0.0001")))


def export_csv(options: list[Any], stored_rows: list[Any]) -> str:
    """Every combination with its own price, in the shape `read_csv` takes back."""
    taking_part = combos.matrix_options(options)
    if not taking_part:
        raise GridError("This product has no questions with choices yet, so there is nothing to price.")
    total = combos.count_combinations(options)
    if total > combos.MAX_MATRIX:
        raise GridError(f"{total:,} combinations is more than a price table can hold ({combos.MAX_MATRIX:,}).")

    by_key = {row.combo_key: row for row in stored_rows}
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([o.name for o in taking_part] + ["Price", "SKU", "Note"])
    for pairs in combos.iter_combinations(options):
        row = by_key.get(combos.combo_key((o.id, v.id) for o, v in pairs))
        price = sku = note = ""
        if row is not None:
            if not row.enabled:
                price = "N/A"
            elif getattr(row, "line_price", None) is not None:
                price = _figure(row.line_price)
            elif row.unit_price is not None:
                price = _figure(row.unit_price)
            sku = row.sku or ""
            note = "" if (row.note or "") == NOT_AVAILABLE_NOTE else (row.note or "")
        writer.writerow([v.label for _, v in pairs] + [price, sku, note])
    return out.getvalue()
