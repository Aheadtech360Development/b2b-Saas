"""The price table from a supplier's spreadsheet, and the quantity question.

A supplier sends one row per combination with the price of the whole line
("30 signs, 24x24, next day: $1,106.84"). These check that such a file is read
the way an admin would read it, that every row is priced exactly as given once
it is in the table, and that the line a buyer gets adds up to that price
everywhere it is billed (unit price to the cent x quantity + one-off fees).
"""
from __future__ import annotations

import csv
import io
import itertools
import os
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import combinations as combos
from app.services import price_grid as grid
from app.services.configurator_service import (
    ConfigurationError,
    compute_price,
    quantity_of,
)

YARD_SIGN_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "printnoise_yard_sign_grid_2688.csv")


# ── A small yard sign grid, built the way the supplier's file is ─────────────

QTYS = ["1", "5", "30"]
SIZES = ["12x18", "24x24"]
SPEED = ["5 Business Days", "Next Day"]
BASE = {"12x18": Decimal("20.00"), "24x24": Decimal("37.11")}
RUSH = {"5 Business Days": Decimal("1"), "Next Day": Decimal("1.95")}


def _total(qty: str, size: str, speed: str) -> Decimal:
    each = BASE[size] * RUSH[speed] * (Decimal("1") - Decimal(qty) / 100)
    return (each * int(qty) + 15).quantize(Decimal("0.01"))


def _grid_text(extra: list[list[str]] | None = None) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Qty", "Size", "Material", "Production Time", "Supplier Cost", "Your Price (+$15)"])
    for qty, size, speed in itertools.product(QTYS, SIZES, SPEED):
        if qty == "30" and speed == "Next Day":
            w.writerow([qty, size, "4mm Corrugated Plastic", speed, "N/A", "N/A"])
        else:
            price = _total(qty, size, speed)
            w.writerow([qty, size, "4mm Corrugated Plastic", speed, f"{price - 15:.2f}", f"{price:.2f}"])
    for row in extra or []:
        w.writerow(row)
    return out.getvalue()


# ── Fakes for the pricing engine ──────────────────────────────────────────────

def _value(label, position, enabled=True):
    return SimpleNamespace(id=uuid.uuid4(), label=label, enabled=enabled, price_delta=Decimal("0"),
                           price_mode="flat", sku_suffix=None, position=position, is_default=False)


def _option(name, labels, position, input_type="select"):
    return SimpleNamespace(id=uuid.uuid4(), name=name, input_type=input_type, is_active=True, required=True,
                           position=position, values=[_value(x, i) for i, x in enumerate(labels)])


def _product_from_plan(the_plan):
    """The product `grid.apply` would leave behind, without a database."""
    options = []
    for i, q in enumerate(the_plan["_questions"]):
        options.append(_option(q["name"], q["labels"], i, "quantity" if q["is_quantity"] else "select"))
    return SimpleNamespace(id=uuid.uuid4(), options=options, option_rules=[], base_price=None)


def _rows_from_plan(product, the_plan):
    rows = []
    has_quantity = any(q["is_quantity"] for q in the_plan["_questions"])
    for e in the_plan["_entries"]:
        if e.status == "blank":
            continue
        pairs = []
        for option, label in zip(product.options, e.labels):
            value = next(v for v in option.values if grid.norm(v.label) == grid.norm(label))
            pairs.append((option.id, value.id))
        na = e.status == "na"
        rows.append(SimpleNamespace(
            combo_key=combos.combo_key(pairs), enabled=not na, note="Not available" if na else None, sku=None,
            setup_fee=None,
            line_price=None if na or not has_quantity else e.price,
            unit_price=None if na or has_quantity else e.price,
        ))
    return rows


def _pick(product, **labels):
    sel = {}
    for option in product.options:
        want = labels.get(option.name, option.values[0].label)
        sel[str(option.id)] = str(next(v.id for v in option.values if v.label == want))
    return sel


def _billed(priced) -> Decimal:
    """How the cart, checkout and invoice add a configured line up."""
    return (Decimal(str(priced["unit_price"])) * priced["quantity"] + Decimal(str(priced["setup_fees"]))).quantize(
        Decimal("0.01"))


# ── quantity_of ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("label,expected", [
    ("1", 1), ("30", 30), ("1,000", 1000), ("250 cards", 250), ("  5 ", 5), ("10000", 10000),
    ("24x24", None), ("2.5", None), ("10 x 10", None), ("0", None), ("", None), ("Front Only", None),
    ("1,00", None),
])
def test_quantity_of(label, expected):
    assert quantity_of(label) == expected


# ── Reading the file ─────────────────────────────────────────────────────────

def test_the_file_is_read_the_way_an_admin_reads_it():
    the_plan = grid.plan(grid.read_csv(_grid_text()), [])
    roles = {c["name"]: c["role"] for c in the_plan["columns"]}
    assert roles == {
        "Qty": "quantity", "Size": "question", "Material": "question", "Production Time": "question",
        "Supplier Cost": "ignored", "Your Price (+$15)": "price",
    }
    assert the_plan["price_column"] == "Your Price (+$15)"
    assert the_plan["quantity_column"] == "Qty"
    assert the_plan["rows"] == 12 and the_plan["priced"] == 10 and the_plan["not_available"] == 2
    assert the_plan["error_count"] == 0
    assert the_plan["new_questions"] == ["Qty", "Size", "Material", "Production Time"]
    # 30 with next day is N/A in every row, so each greys the other out.
    assert the_plan["rules"] == [{"when": ["Qty", "30"], "disable": ["Production Time", "Next Day"]}]
    assert the_plan["switched_off"] == []


def test_semicolons_a_bom_and_dollar_signs_are_read():
    text = "﻿Qty;Size;Price\n1;Small;$1,106.84\n5;Small;n/a\n"
    the_plan = grid.plan(grid.read_csv(text), [])
    assert the_plan["priced"] == 1 and the_plan["not_available"] == 1
    assert the_plan["_entries"][0].price == Decimal("1106.84")


def test_row_problems_are_listed_with_their_line():
    text = _grid_text(extra=[
        ["1", "12x18", "4mm Corrugated Plastic", "5 Business Days", "1", "2.00"],   # repeats line 2
        ["1", "", "4mm Corrugated Plastic", "Next Day", "1", "3.00"],               # empty question
        ["5", "36x24", "4mm Corrugated Plastic", "Next Day", "1", "lots"],          # not a price
    ])
    the_plan = grid.plan(grid.read_csv(text), [])
    assert the_plan["error_count"] == 3
    messages = {e["row"]: e["message"] for e in the_plan["errors"]}
    assert messages[14] == "Same choices as row 2."
    assert messages[15] == '"Size" is empty.'
    assert messages[16] == '"lots" in "Your Price (+$15)" is not a price.'


def test_the_admin_can_choose_the_price_and_leave_quantity_out():
    the_plan = grid.plan(grid.read_csv(_grid_text()), [], price_column="Supplier Cost", quantity_column="")
    assert the_plan["price_column"] == "Supplier Cost"
    assert the_plan["quantity_column"] is None
    roles = {c["name"]: c["role"] for c in the_plan["columns"]}
    assert roles["Your Price (+$15)"] == "ignored" and roles["Qty"] == "question"


def test_a_quantity_column_must_be_numbers():
    text = "Qty,Size,Price\n1,Small,2\nsome,Small,3\n"
    with pytest.raises(grid.GridError, match="not a number of items"):
        grid.plan(grid.read_csv(text), [], quantity_column="Qty")


def test_a_product_that_already_asks_how_many_keeps_its_question():
    existing = [{"id": "1", "name": "Pieces", "input_type": "quantity", "is_active": True,
                 "values": [{"id": "a", "label": "1", "enabled": True}]}]
    with pytest.raises(grid.GridError, match='already asks how many with "Pieces"'):
        grid.plan(grid.read_csv(_grid_text()), existing)


def test_existing_questions_and_choices_are_matched_by_name():
    existing = [
        {"id": "1", "name": "size", "input_type": "select", "is_active": True,
         "values": [{"id": "a", "label": "12X18", "enabled": True}]},
    ]
    the_plan = grid.plan(grid.read_csv(_grid_text()), existing)
    size = next(q for q in the_plan["questions"] if q["column"] == "Size")
    assert size["exists"] is True and size["new_choices"] == ["24x24"]
    assert "Size" not in the_plan["new_questions"]


def test_a_choice_never_available_is_switched_off_not_ruled():
    text = "Qty,Size,Price\n1,Small,2\n1,Huge,N/A\n5,Small,8\n5,Huge,N/A\n"
    the_plan = grid.plan(grid.read_csv(text), [])
    assert the_plan["switched_off"] == [{"question": "Size", "choice": "Huge"}]
    assert the_plan["rules"] == []


def test_files_that_are_not_grids_are_refused():
    for text, why in [("", "empty"), ("Price\n1\n", "at least two columns"), ("Qty,Qty\n1,2\n", "Two columns"),
                      ("Qty,Size,Price\n", "no rows")]:
        with pytest.raises(grid.GridError, match=why):
            grid.plan(grid.read_csv(text), [])


# ── Pricing what was imported ─────────────────────────────────────────────────

def test_every_imported_row_is_billed_at_exactly_its_price():
    the_plan = grid.plan(grid.read_csv(_grid_text()), [])
    product = _product_from_plan(the_plan)
    rows = _rows_from_plan(product, the_plan)
    for e in the_plan["_entries"]:
        labels = dict(zip([o.name for o in product.options], e.labels))
        if e.status == "na":
            with pytest.raises(ConfigurationError):
                compute_price(product, [], rows, _pick(product, **labels), 1)
            continue
        priced = compute_price(product, [], rows, _pick(product, **labels), 1)
        assert priced["quantity"] == int(labels["Qty"])
        assert priced["quantity_from_option"] is True
        assert Decimal(str(priced["total"])) == e.price
        assert _billed(priced) == e.price
        assert priced["rounding"] >= 0


def test_the_quantity_question_overrides_the_number_sent():
    the_plan = grid.plan(grid.read_csv(_grid_text()), [])
    product = _product_from_plan(the_plan)
    rows = _rows_from_plan(product, the_plan)
    priced = compute_price(product, [], rows, _pick(product, Qty="5"), 999)
    assert priced["quantity"] == 5
    assert Decimal(str(priced["total"])) == _total("5", "12x18", "5 Business Days")


def test_a_line_price_that_does_not_divide_into_cents_still_adds_up():
    size = _option("Size", ["A"], 1)
    qty = _option("Qty", ["30"], 0, input_type="quantity")
    product = SimpleNamespace(id=uuid.uuid4(), options=[qty, size], option_rules=[], base_price=None)
    key = combos.combo_key([(qty.id, qty.values[0].id), (size.id, size.values[0].id)])
    row = SimpleNamespace(combo_key=key, enabled=True, note=None, sku=None, setup_fee=None,
                          unit_price=None, line_price=Decimal("1106.84"))
    priced = compute_price(product, [], [row], _pick(product), 1)
    assert priced["unit_price"] == 36.89          # taken down to the cent
    assert priced["rounding"] == 0.14             # carried so the line adds up
    assert priced["setup_fees"] == 0.14
    assert priced["total"] == 1106.84
    assert _billed(priced) == Decimal("1106.84")


def test_a_quantity_choice_that_is_not_a_number_is_refused():
    qty = _option("Qty", ["lots"], 0, input_type="quantity")
    product = SimpleNamespace(id=uuid.uuid4(), options=[qty], option_rules=[], base_price=Decimal("1"))
    with pytest.raises(ConfigurationError, match="not a number of items"):
        compute_price(product, [], [], _pick(product), 1)


def test_a_combination_a_whole_line_table_does_not_price_is_not_for_sale():
    """A product sold in sets by a supplier's list (Business Flyer, Bulk
    Booklets, yard signs) that kept choices of its own the list never priced.
    The rule would charge the base price for every item in the set, so the
    page jumped between the file's prices and figures nobody set."""
    the_plan = grid.plan(grid.read_csv(_grid_text()), [])
    product = _product_from_plan(the_plan)
    product.base_price = Decimal("550.31")
    rows = _rows_from_plan(product, the_plan)
    size = next(o for o in product.options if o.name == "Size")
    size.values.append(_value('36" x 24"', len(size.values)))      # the product's own, not in the file
    sel = _pick(product, Size='36" x 24"', Qty="30")
    with pytest.raises(ConfigurationError, match="not available"):
        compute_price(product, [], rows, sel, 1, listed_only=True)
    # What the file lists still sells at exactly its price.
    listed = compute_price(product, [], rows, _pick(product, Size="24x24", Qty="30"), 1, listed_only=True)
    assert Decimal(str(listed["total"])) == _total("30", "24x24", "5 Business Days")
    # A question left unanswered is asked for, not called unavailable.
    del sel[str(size.id)]
    with pytest.raises(ConfigurationError, match='Please choose a "Size"'):
        compute_price(product, [], rows, sel, 1, listed_only=True)
    # A product whose table does not price whole lines keeps its rule.
    ruled = compute_price(product, [], rows, _pick(product, Size='36" x 24"', Qty="30"), 1)
    assert Decimal(str(ruled["total"])) == Decimal("550.31") * 30


def test_the_plan_names_the_products_own_choices_the_file_does_not_list():
    existing = [
        {"id": "s", "name": "Size", "input_type": "select", "is_active": True,
         "values": [{"id": "a", "label": "12X18", "enabled": True},
                    {"id": "b", "label": '36" x 24"', "enabled": True},
                    {"id": "c", "label": "Retired", "enabled": False}]},
    ]
    the_plan = grid.plan(grid.read_csv(_grid_text()), existing)
    assert the_plan["unlisted"] == [{"question": "Size", "choices": ['36" x 24"'], "count": 1}]
    assert the_plan["unlisted_count"] == 1


def test_the_files_combinations_are_spelt_as_the_table_stores_them():
    the_plan = grid.plan(grid.read_csv(_grid_text()), [])
    product = _product_from_plan(the_plan)
    existing = [
        {"id": str(o.id), "name": o.name, "input_type": o.input_type, "is_active": True,
         "values": [{"id": str(v.id), "label": v.label, "enabled": True} for v in o.values]}
        for o in product.options
    ]
    assert grid.listed_keys(the_plan, existing) == [r.combo_key for r in _rows_from_plan(product, the_plan)]
    # A question the product does not have yet: no stored row is one of the file's.
    assert grid.listed_keys(the_plan, existing[1:]) == []


def test_choices_are_ordered_by_number_and_a_whole_list_by_the_file():
    qty = [_value(x, i) for i, x in enumerate(["1", "5", "30", "2", "10"])]
    grid._order(qty, ["1", "2", "5", "10", "30"], is_quantity=True, whole_list=False)
    assert [v.label for v in sorted(qty, key=lambda v: v.position)] == ["1", "2", "5", "10", "30"]
    sizes = [_value(x, i) for i, x in enumerate(["Old", "24x24", "12x18"])]
    grid._order(sizes, ["12x18", "24x24"], is_quantity=False, whole_list=True)
    assert [v.label for v in sorted(sizes, key=lambda v: v.position)] == ["12x18", "24x24", "Old"]
    kept = [_value(x, i) for i, x in enumerate(["Old", "24x24"])]
    grid._order(kept, ["24x24"], is_quantity=False, whole_list=False)
    assert [v.position for v in kept] == [0, 1]


def test_products_without_a_quantity_question_price_as_before():
    size = _option("Size", ["A", "B"], 0)
    product = SimpleNamespace(id=uuid.uuid4(), options=[size], option_rules=[], base_price=Decimal("2.50"))
    priced = compute_price(product, [], [], _pick(product), 4)
    assert priced["quantity"] == 4 and priced["quantity_from_option"] is False
    assert priced["unit_price"] == 2.5 and priced["setup_fees"] == 0 and priced["rounding"] == 0
    assert priced["total"] == 10.0


# ── Out and back in ───────────────────────────────────────────────────────────

def test_the_downloaded_table_imports_back_unchanged():
    the_plan = grid.plan(grid.read_csv(_grid_text()), [])
    product = _product_from_plan(the_plan)
    rows = _rows_from_plan(product, the_plan)
    text = grid.export_csv(product.options, rows)
    again = grid.plan(grid.read_csv(text), [
        {"id": str(o.id), "name": o.name, "input_type": o.input_type, "is_active": True,
         "values": [{"id": str(v.id), "label": v.label, "enabled": True} for v in o.values]}
        for o in product.options
    ])
    assert again["error_count"] == 0
    assert again["price_column"] == "Price" and again["quantity_column"] == "Qty"
    assert again["new_questions"] == [] and again["new_choices"] == 0
    first = {tuple(e.labels): (e.status, e.price) for e in the_plan["_entries"]}
    second = {tuple(e.labels): (e.status, e.price) for e in again["_entries"]}
    assert first == second


# ── The supplier's own file, when it is in the repository ─────────────────────

@pytest.mark.skipif(not os.path.exists(YARD_SIGN_FILE), reason="the supplier's file is not in this checkout")
def test_the_yard_sign_file():
    with open(YARD_SIGN_FILE, encoding="utf-8") as f:
        the_plan = grid.plan(grid.read_csv(f.read()), [])
    assert (the_plan["rows"], the_plan["priced"], the_plan["not_available"], the_plan["error_count"]) == (2688, 2592, 96, 0)
    assert the_plan["quantity_column"] == "Qty" and the_plan["price_column"] == "Your Price (+$15)"
    assert the_plan["rules"] == [{"when": ["Qty", "30"], "disable": ["Production Time", "Next Day"]}]
    product = _product_from_plan(the_plan)
    rows = _rows_from_plan(product, the_plan)
    for e in the_plan["_entries"]:
        if e.status != "price":
            continue
        priced = compute_price(product, [], rows, _pick(product, **dict(zip([o.name for o in product.options], e.labels))), 1)
        assert _billed(priced) == e.price, e.labels


# ── Finding the rows that apply, at any table size ────────────────────────────

def test_subset_keys_find_exactly_the_rows_inside_a_selection():
    """The price path looks stored rows up by name (every key a subset of the
    selection could have) instead of scanning. Whatever rows are stored, short
    or long, on or off, it must find exactly the ones whose choices are all in
    the selection: the set best_match and blocked_by choose from."""
    import random

    rnd = random.Random(26)
    options = [_option(f"Q{i}", [f"v{j}" for j in range(rnd.randint(2, 5))], i) for i in range(7)]
    options.append(_option("Extras", ["a", "b", "c"], 7, input_type="checkbox"))
    options.append(SimpleNamespace(id=uuid.uuid4(), name="Name to print", input_type="text", is_active=True,
                                   required=False, position=8, values=[]))
    stored = set()
    for _ in range(3000):
        chosen = rnd.sample(options[:8], rnd.randint(1, 8))
        stored.add(combos.combo_key((o.id, rnd.choice(o.values).id) for o in chosen))
    for _ in range(300):
        sel = {str(o.id): str(rnd.choice(o.values).id) for o in options[:7]}
        extras = options[7]
        sel[str(extras.id)] = [str(v.id) for v in rnd.sample(extras.values, rnd.randint(0, 3))]
        sel[str(options[8].id)] = "Jane's Bakery"            # a typed answer is no key
        picked = combos.selection_pairs(sel)
        inside = {k for k in stored if set(combos.parse_key(k)) <= picked}
        keys = combos.subset_keys(options, sel)
        assert keys is not None and len(keys) == len(set(keys))
        assert {k for k in stored if k in set(keys)} == inside


def test_too_many_answers_fall_back_to_the_index_test():
    options = [_option(f"Q{i}", ["x", "y"], i) for i in range(13)]       # 2**13 - 1 subsets
    sel = {str(o.id): str(o.values[0].id) for o in options}
    assert combos.subset_keys(options, sel) is None
    assert len(combos.subset_keys(options[:12], sel)) == 2 ** 12 - 1      # 4,095 still looked up by name


def test_a_large_grid_is_read_and_planned():
    """Past the old 5,000-row cap: 13,440 rows, planned whole."""
    head = "Qty,Size,Material,Price\n"
    body = "".join(f"{q},S{s},M{m},{q * 1.5 + s + m:.2f}\n" for q in range(1, 113) for s in range(24) for m in range(5))
    the_plan = grid.plan(grid.read_csv(head + body), [])
    assert the_plan["rows"] == 13_440 and the_plan["priced"] == 13_440 and the_plan["error_count"] == 0
    assert the_plan["quantity_column"] == "Qty"


def test_a_file_longer_than_a_table_imports_the_rows_it_prices(monkeypatch):
    """A booklet's questions multiply to 64,584; its downloaded table comes back
    with only the combinations the shop sells priced. Empty rows write nothing,
    so only the priced ones count against what one product's table holds."""
    monkeypatch.setattr(combos, "MAX_MATRIX", 4)
    text = "Qty,Size,Price\n" + "".join(f"{q},S{s},{q * 2 + s if s < 2 else ''}\n" for q in (1, 5) for s in range(4))
    the_plan = grid.plan(grid.read_csv(text), [])
    assert (the_plan["rows"], the_plan["priced"], the_plan["blank"], the_plan["error_count"]) == (8, 4, 4, 0)
    with pytest.raises(grid.GridError, match="5 rows have a price or N/A"):
        grid.plan(grid.read_csv(text.replace("1,S2,\n", "1,S2,9\n")), [])


def test_a_table_bigger_than_a_product_holds_still_downloads(monkeypatch):
    monkeypatch.setattr(combos, "MAX_MATRIX", 10)
    many = [_option("Q", [str(i) for i in range(1, 7)], 0, "quantity"), _option("S", ["a", "b", "c"], 1)]
    assert "".join(grid.export_lines(many, [])).count("\n") == 1 + 18
    monkeypatch.setattr(grid, "MAX_ROWS", 12)
    with pytest.raises(grid.GridError, match="more than one file can hold"):
        grid.check_exportable(many)


def test_the_download_streams_in_pieces():
    the_plan = grid.plan(grid.read_csv(_grid_text()), [])
    product = _product_from_plan(the_plan)
    rows = _rows_from_plan(product, the_plan)
    many = [_option("Q", [str(i) for i in range(1, 41)], 0, "quantity"), _option("S", [f"s{i}" for i in range(30)], 1)]
    pieces = list(grid.export_lines(many, []))
    assert len(pieces) > 1 and "".join(pieces).count("\n") == 1 + 40 * 30
    assert grid.export_csv(product.options, rows).count("\n") == 1 + len(rows)
