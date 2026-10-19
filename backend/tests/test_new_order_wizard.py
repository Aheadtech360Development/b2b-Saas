"""The New order wizard (design 32): what does not need a database.

Pasted SKUs are read the ways people paste them; the routes are walked against
the local API (session scratchpad, new_order_local.py).
"""
from app.services.draft_orders import parse_skus


def test_pasted_skus_in_the_ways_people_paste_them():
    text = "TEE-BLK-L 12\nTEE-BLK-M, 6\n  tee-blk-s x3  \nHOOD-GRY-XL\t2\nCAP-01\n\n"
    assert parse_skus(text) == [
        ("TEE-BLK-L", 12), ("TEE-BLK-M", 6), ("TEE-BLK-S", 3), ("HOOD-GRY-XL", 2), ("CAP-01", 1),
    ]


def test_the_same_sku_twice_adds_up_and_unreadable_lines_come_back():
    assert parse_skus("TEE-1 2\ntee-1 3") == [("TEE-1", 5)]
    # A line with words in it is not a SKU line: kept, with no quantity, so the
    # wizard can say it was not added.
    assert parse_skus("please send 10 black tees") == [("PLEASE SEND 10 BLACK TEES", 0)]
    assert parse_skus("") == []
