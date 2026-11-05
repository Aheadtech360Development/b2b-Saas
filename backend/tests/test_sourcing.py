"""One product, several sources (services/suppliers/sourcing.py): the parts
that decide without a database.

Matching a supplier's rows to the shop's variants (same colour and size, a
barcode, a close colour name), the order a checkout takes stock in (own
first, then the cheapest supplier), and what a supplier row is worth.
"""
from types import SimpleNamespace

from app.services.suppliers import sourcing


def _row(color, size, sku, **extra):
    return {"colorName": color, "sizeName": size, "sku": sku, **extra}


def test_colour_and_size_match_however_they_are_written():
    variants = [{"id": 1, "color": "Black", "size": "2XL"}, {"id": 2, "color": "Sport Grey", "size": "Small"}]
    rows = [_row("BLACK", "XXL", "B-XXL"), _row("Sport  Grey", "S", "SG-S"), _row("White", "M", "W-M")]
    found = sourcing.match(variants, rows)
    assert [(v["id"], r["sku"], how) for v, r, how in found["pairs"]] == [(1, "B-XXL", "exact"), (2, "SG-S", "exact")]
    assert found["unmatched"] == [] and found["spare"] == 1


def test_a_close_colour_name_matches_in_the_same_size_only():
    variants = [{"id": 1, "color": "Denim Sapphaire", "size": "M"}, {"id": 2, "color": "Denim Sapphaire", "size": "4XL"}]
    rows = [_row("Denim Sapphire", "M", "DS-M"), _row("Denim Sapphire", "L", "DS-L")]
    found = sourcing.match(variants, rows)
    assert [(v["id"], r["sku"], how) for v, r, how in found["pairs"]] == [(1, "DS-M", "close")]
    assert [v["id"] for v in found["unmatched"]] == [2]


def test_a_barcode_from_another_supplier_matches_a_renamed_colour():
    variants = [{"id": 1, "color": "Heather Navy", "size": "L", "gtin": "00821780000000"}]
    rows = [_row("Navy Heather", "L", "NH-L", gtin="00821780000000")]
    found = sourcing.match(variants, rows)
    assert [(r["sku"], how) for _, r, how in found["pairs"]] == [("NH-L", "barcode")]


def test_a_row_pairs_once_and_unlike_colours_do_not_pair():
    variants = [{"id": 1, "color": "Red", "size": "M"}, {"id": 2, "color": "red", "size": "M"},
                {"id": 3, "color": "Blue", "size": "M"}]
    rows = [_row("Red", "M", "R-M"), _row("Black", "M", "K-M")]
    found = sourcing.match(variants, rows)
    assert [(v["id"], r["sku"]) for v, r, _ in found["pairs"]] == [(1, "R-M")]
    assert [v["id"] for v in found["unmatched"]] == [2, 3]


def _rec(qty):
    return SimpleNamespace(quantity=qty)


def test_checkout_takes_own_stock_first_then_the_cheapest_supplier():
    own_a, own_b = _rec(5), _rec(40)
    ss, sanmar = _rec(900), _rec(4000)
    records = [(ss, "ss_activewear"), (own_a, None), (sanmar, "sanmar"), (own_b, None)]
    ordered = sourcing.order_records(records, {"ss_activewear": 3.10, "sanmar": 2.85})
    assert [r for r, _ in ordered] == [own_b, own_a, sanmar, ss]


def test_a_supplier_with_no_cost_comes_after_priced_ones_and_more_stock_breaks_a_tie():
    a, b, c = _rec(10), _rec(500), _rec(80)
    ordered = sourcing.order_records([(a, "x"), (b, "y"), (c, "z")], {"x": 2.0, "y": 2.0, "z": None})
    assert [r for r, _ in ordered] == [b, a, c]


def test_a_shop_without_suppliers_keeps_most_stock_first():
    a, b, c = _rec(3), _rec(30), _rec(12)
    assert [r for r, _ in sourcing.order_records([(a, None), (b, None), (c, None)], {})] == [b, c, a]


def test_supplier_stock_leaves_out_drop_ship_and_the_safety_stock():
    row = {"warehouses": [{"warehouseAbbr": "KS", "qty": 120}, {"warehouseAbbr": "DS", "qty": 900},
                          {"warehouseAbbr": "NV", "qty": 30}]}
    assert sourcing.stock_of(row, 0) == 150
    assert sourcing.stock_of(row, 10) == 140
    assert sourcing.stock_of({"qty": 4}, 10) == 0          # never below zero
    assert sourcing.stock_of({"qty": 4500}, 0) == 4500     # one figure for all warehouses (SanMar)


def test_cost_is_the_shops_price_at_the_supplier():
    assert sourcing.cost_of({"customerPrice": "4.12"}) == 4.12
    assert sourcing.cost_of({"piecePrice": 3.5}) == 3.5
    assert sourcing.cost_of({"customerPrice": "0"}) is None
    assert sourcing.cost_of({"customerPrice": "n/a"}) is None
