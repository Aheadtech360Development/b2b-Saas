"""A wholesale buyer's price (services/group_pricing), as the dev fix list
found it broken (item 2, 2026-11-20):

* The product's row in Individual Variant Pricing is an amount off each piece,
  as the admin shows it ("-$"): $0.25 off a $3.10 tee is $2.85, not $0.25.
* A discount group has its own percent off: Preferred 8% off a $3.10 tee pays
  $2.85, on what the group applies to only.
* A variant's own price comes first, then the product's row, then the group's
  percent, then the buyer's pricing tier.
No database.
"""
from decimal import Decimal

import pytest

from app.services.group_pricing import price_for, scope_of

D = Decimal


def test_the_products_row_is_an_amount_off_each_piece():
    assert price_for(D("3.10"), amount_off="0.25") == D("2.85")
    assert price_for(D("3.10"), amount_off="5") == D("0.00")           # never below zero


def test_the_groups_own_percent_applies_where_the_group_does():
    assert price_for(D("3.10"), group_percent=D("8")) == D("2.85")
    assert price_for(D("3.10"), group_percent=D("15")) == D("2.64")
    assert price_for(D("3.10"), group_percent=D("8"), in_scope=False) == D("3.10")


def test_the_most_particular_price_wins():
    assert price_for(D("3.10"), variant_price="2.50", amount_off="0.25", group_percent=D("8")) == D("2.50")
    assert price_for(D("3.10"), amount_off="0.25", group_percent=D("15")) == D("2.85")
    assert price_for(D("3.10"), product_percent="10", group_percent=D("15")) == D("2.79")
    assert price_for(D("3.10"), group_percent=None, tier_percent=D("10")) == D("2.79")
    assert price_for(D("3.10")) == D("3.10")


@pytest.mark.asyncio
async def test_a_group_applies_to_the_store_or_its_chosen_products():
    store = {"percent": D("8"), "applies_to": "store", "ids": set()}
    assert await scope_of(None, store, ["a", "b"]) == {"a", "b"}
    chosen = {"percent": D("8"), "applies_to": "products", "ids": {"b"}}
    assert await scope_of(None, chosen, ["a", "b"]) == {"b"}
    assert await scope_of(None, None, ["a"]) == set()
    nothing_picked = {"percent": D("8"), "applies_to": "collections", "ids": set()}
    assert await scope_of(None, nothing_picked, ["a"]) == set()
