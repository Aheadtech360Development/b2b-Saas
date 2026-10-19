"""Sold out means sold out (services/inventory_service.stock_on_hand / stock_problem).

Checkout used to add a variant's stock up to 0 and read that 0 as "no stock
tracked, sell without limit" — so an item whose stock had run out could still be
ordered, by a guest or a signed-in buyer alike.
"""
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
