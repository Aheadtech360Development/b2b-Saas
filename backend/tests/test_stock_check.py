"""Sold out means sold out (services/inventory_service.stock_on_hand / stock_problem).

Checkout used to add a variant's stock up to 0 and read that 0 as "no stock
tracked, sell without limit" — so an item whose stock had run out could still be
ordered, by a guest or a signed-in buyer alike.
"""
from decimal import Decimal
from types import SimpleNamespace

from app.services.inventory_service import stock_on_hand, stock_problem


class Rows:
    """An AsyncSession that answers one inventory query with these quantities."""

    def __init__(self, quantities):
        self.quantities = quantities

    async def execute(self, _query):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: list(self.quantities)))


async def test_a_variant_without_inventory_records_does_not_track_stock():
    assert await stock_on_hand(Rows([]), "v1") is None


async def test_records_that_add_up_to_zero_are_sold_out_not_unlimited():
    assert await stock_on_hand(Rows([0, 0]), "v1") == 0


async def test_stock_is_counted_across_every_location():
    assert await stock_on_hand(Rows([2, 3, None]), "v1") == 5


def test_sold_out_is_refused():
    assert stock_problem(0, 1, "Tee (TEE-BLK-L)") == "Tee (TEE-BLK-L) is out of stock."


def test_asking_for_more_than_is_left_says_how_many_are():
    assert stock_problem(3, 5, "Tee (TEE-BLK-L)") == "Only 3 of Tee (TEE-BLK-L) left in stock."


def test_enough_stock_or_untracked_stock_is_fine():
    assert stock_problem(5, 5, "x") is None
    assert stock_problem(None, 1000, "x") is None


def test_negative_stock_reads_as_sold_out():
    assert stock_problem(-2, 1, "x") == "x is out of stock."


# ── Every kind of product (migration 0063) ───────────────────────────────────

import pytest  # noqa: E402
from sqlalchemy.sql.dml import Update  # noqa: E402

from app.core.exceptions import InsufficientStockError  # noqa: E402
from app.services import configurator_service, inventory_service  # noqa: E402


async def test_a_tracked_blank_with_no_stock_entered_is_sold_out():
    """What the admin always showed as "0 in stock" now means it."""
    assert await stock_on_hand(Rows([]), "v1", tracked=True) == 0
    assert await stock_on_hand(Rows([]), "v1", tracked=False) is None


def test_the_storefront_number_for_no_limit():
    assert inventory_service.shown_stock(None) == inventory_service.UNTRACKED
    assert inventory_service.shown_stock(-3) == 0
    assert inventory_service.shown_stock(7) == 7


class Counted:
    """A session over one row's `stock`: the conditional UPDATE takes from it
    only when there is enough, as Postgres would."""

    def __init__(self, stock):
        self.stock = stock

    async def execute(self, stmt):
        if isinstance(stmt, Update):
            wanted = stmt.compile().params["stock_2"]
            if self.stock is not None and self.stock >= wanted:
                self.stock -= wanted
                return SimpleNamespace(first=lambda: ("row",))
            return SimpleNamespace(first=lambda: None)
        return SimpleNamespace(scalar_one_or_none=lambda: self.stock)


async def test_taking_counted_stock_takes_it_down():
    from app.api.v1.gang_sheets import GangSheetSize

    db = Counted(3)
    await inventory_service.counted_stock(db, GangSheetSize, "size-1", 2, "22x24 sheet", take=True)
    assert db.stock == 1


async def test_taking_more_than_is_left_is_refused_and_takes_nothing():
    from app.api.v1.gang_sheets import GangSheetSize

    db = Counted(1)
    with pytest.raises(InsufficientStockError, match="Only 1 of 22x24 sheet left"):
        await inventory_service.counted_stock(db, GangSheetSize, "size-1", 2, "22x24 sheet", take=True)
    assert db.stock == 1


async def test_no_limit_passes_untouched():
    from app.api.v1.gang_sheets import GangSheetSize

    db = Counted(None)
    await inventory_service.counted_stock(db, GangSheetSize, "size-1", 999, "22x24 sheet", take=True)
    await inventory_service.counted_stock(db, GangSheetSize, "size-1", 999, "22x24 sheet")
    assert db.stock is None


async def test_a_gang_sheet_needs_its_size_and_its_product():
    seen = []

    async def counted(db, model, row_id, wanted, label, *, take=False):
        seen.append((model.__name__, row_id, wanted, take))

    job = SimpleNamespace(sheet_size_id="size-1", product_id="prod-1", sheet_quantity=4, sheet_name="22x24")
    original = inventory_service.counted_stock
    inventory_service.counted_stock = counted
    try:
        await inventory_service.gang_sheet_stock(None, job, take=True)
    finally:
        inventory_service.counted_stock = original
    assert seen == [("GangSheetSize", "size-1", 4, True), ("Product", "prod-1", 4, True)]


# ── A yard sign's choices ────────────────────────────────────────────────────

def sign(value_stock, product_stock=None):
    value = SimpleNamespace(id="val-1", label="18x24", enabled=True, stock=value_stock,
                            price_delta=0, price_mode="flat", sku_suffix=None)
    option = SimpleNamespace(id="opt-1", name="Size", position=0, is_active=True, required=True, values=[value])
    product = SimpleNamespace(name="Yard Sign", stock=product_stock, options=[option], option_rules=[],
                              base_price=5, pricing_mode="configurable")
    return product


@pytest.fixture
def priced_from(monkeypatch):
    def use(product):
        async def load(db, product_id, chosen=None):
            return product, [], []
        monkeypatch.setattr(configurator_service, "_load", load)
        monkeypatch.setattr(configurator_service, "_unit_for_qty", lambda p, t, q: Decimal("5"))
    return use


async def test_a_choice_with_stock_left_prices_normally(priced_from):
    priced_from(sign(value_stock=5))
    result = await configurator_service.price_configuration(None, "p", {"opt-1": "val-1"}, 5)
    assert result["breakdown"][0]["value"] == "18x24"


async def test_a_sold_out_choice_cannot_be_priced(priced_from):
    priced_from(sign(value_stock=0))
    with pytest.raises(configurator_service.OutOfStockError, match=r"Yard Sign \(Size: 18x24\) is out of stock"):
        await configurator_service.price_configuration(None, "p", {"opt-1": "val-1"}, 1)


async def test_more_than_a_choice_has_left_cannot_be_priced(priced_from):
    priced_from(sign(value_stock=2))
    with pytest.raises(configurator_service.OutOfStockError, match="Only 2 of"):
        await configurator_service.price_configuration(None, "p", {"opt-1": "val-1"}, 3)


async def test_a_sold_out_product_cannot_be_priced_whatever_is_chosen(priced_from):
    priced_from(sign(value_stock=None, product_stock=0))
    with pytest.raises(configurator_service.OutOfStockError, match="Yard Sign is out of stock"):
        await configurator_service.price_configuration(None, "p", {"opt-1": "val-1"}, 1)
