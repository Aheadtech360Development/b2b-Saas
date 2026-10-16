"""Whether a product counts its stock is its own switch (products.track_inventory).

It used to be inferred from stock records: a variant with none sold without a
limit while the admin showed it as "0", so a brand saw stock 0 and orders still
coming in, with no switch to say which products it counts.
"""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

from app.api.v1.admin.inventory import made_to_order, stock_state
from app.services.inventory_service import sellable_stock


class Session:
    """An AsyncSession that answers the product's switch, then its stock rows."""

    def __init__(self, tracked=None, quantities=()):
        self.answers = ([] if tracked is None else [tracked]) + [list(quantities)]

    async def execute(self, _query):
        value = self.answers.pop(0)
        if isinstance(value, list):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: value))
        return SimpleNamespace(scalar=lambda: value)


VARIANT = SimpleNamespace(id="v1", product_id="p1")


async def test_a_product_that_does_not_count_stock_sells_without_a_limit():
    assert await sellable_stock(Session(quantities=[0]), VARIANT, tracked=False) is None
    assert await sellable_stock(Session(quantities=[]), VARIANT, tracked=False) is None


async def test_a_counted_product_sells_only_what_it_has():
    assert await sellable_stock(Session(quantities=[4, 3]), VARIANT, tracked=True) == 7
    assert await sellable_stock(Session(quantities=[0]), VARIANT, tracked=True) == 0


async def test_a_counted_variant_with_no_stock_record_has_none():
    # The case behind "stock 0 but orders still come": no record now reads as
    # 0 on a product that counts its stock, as the admin has always shown it.
    assert await sellable_stock(Session(quantities=[]), VARIANT, tracked=True) == 0


async def test_the_switch_is_read_from_the_product_when_not_given():
    assert await sellable_stock(Session(tracked=True, quantities=[]), VARIANT) == 0
    assert await sellable_stock(Session(tracked=False), VARIANT) is None


def product(**over):
    base = dict(gang_sheet_enabled=False, gang_sheet_type=None, pricing_mode="variant", allow_design_upload=False)
    return SimpleNamespace(**{**base, **over})


def test_gang_sheets_and_option_built_products_are_made_to_order():
    assert made_to_order(product(gang_sheet_enabled=True, gang_sheet_type="gang_sheet")) == "Gang sheet"
    assert made_to_order(product(gang_sheet_enabled=True)) == "Gang sheet"
    assert made_to_order(product(gang_sheet_enabled=True, gang_sheet_type="upload_by_size")) == "Upload by size"
    assert made_to_order(product(gang_sheet_enabled=True, gang_sheet_type="upload_own")) == "Buyer's own gang sheet"
    assert made_to_order(product(pricing_mode="configurable")) == "Made to order from its options"


def test_anything_sold_by_colour_and_size_can_count_its_stock():
    assert made_to_order(product()) is None
    # A sign printed from the buyer's file, sold in sizes: the brand decides.
    assert made_to_order(product(allow_design_upload=True)) is None


def test_stock_states():
    assert stock_state(0, 10) == "out"
    assert stock_state(-1, 10) == "out"
    assert stock_state(10, 10) == "low"
    assert stock_state(11, 10) == "in_stock"


def test_the_migration_follows_mains_newest_and_fits_alembic():
    path = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0063_product_track_inventory.py"
    spec = importlib.util.spec_from_file_location("m0063", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.revision == "0063_product_track_inventory"
    assert len(module.revision) <= 32
    assert module.down_revision == "0062_partner_earn_until"
