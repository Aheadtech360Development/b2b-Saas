"""Products sold in bulk (owner, 2026-10-30): products.bulk_order switches a
stocked product's page to the bulk order form, products.bulk_cards says what
its colour cards show. Here: the products file carries both both ways, the
admin's list names it, and the API takes only what the form can show. The
product page's data and the API are checked against the local database
separately."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.schemas.product import ProductCreate, ProductUpdate
from app.services import product_catalog as pc
from app.services import product_export as pe
from app.services import product_import as pi

WHEN = datetime(2026, 10, 30, tzinfo=UTC)


def ns(**kw):
    return SimpleNamespace(**kw)


def tee(**kw):
    base = dict(
        id=uuid.uuid4(), name="Gildan 5000", slug="gildan-5000", description="", short_description="",
        vendor="Gildan", product_type="T-Shirts", tags=[], status="active", meta_title="", meta_description="",
        moq=12, product_code="G5000", fabric="", gender="", care_instructions="", supplier="", supplier_ref="",
        weight=None, base_price=None, track_inventory=False, pricing_mode="variant", gang_sheet_enabled=False,
        gang_sheet_type=None, bulk_order=True, bulk_cards="pictures", images=[], category_links=[], options=[],
        qty_tiers=[], variants=[],
    )
    base.update(kw)
    return ns(**base)


def variant(color, size):
    return ns(id=uuid.uuid4(), sku=f"G5000-{color}-{size}".upper(), color=color, size=size, color_hex=None,
              retail_price=Decimal("3.99"), compare_price=None, msrp=None, cost_per_item=None,
              country_of_origin=None, weight_grams=None, status="active", sort_order=0, created_at=WHEN)


def exported(product, kind="stocked"):
    text = pe.write_csv(pe.rows_for(product, kind=kind, variants=[variant("Black", "S"), variant("Black", "M")],
                                    stock={}, sheet_sizes=[], price_table=0))
    present, rows = pi.read_file(text)
    groups, problems = pi.group_rows(rows)
    assert not problems
    return present, groups


def test_the_products_file_says_whether_a_product_is_sold_in_bulk_and_what_its_cards_show():
    assert pe.COLUMNS.index("Bulk order form") == pe.COLUMNS.index("Kind") + 1
    for product, said in ((tee(), "Pictures"), (tee(bulk_cards="swatches"), "Swatches"), (tee(bulk_order=False), "")):
        rows = pe.rows_for(product, kind="stocked", variants=[variant("Black", "S")], stock={}, sheet_sizes=[], price_table=0)
        assert rows[0]["Bulk order form"] == said
    # Only a stocked product is sold on the form, whatever was left switched on.
    rows = pe.rows_for(tee(pricing_mode="configurable"), kind="made", variants=[], stock={}, sheet_sizes=[], price_table=0)
    assert rows[0]["Bulk order form"] == ""


def test_it_reads_back_as_it_was_written():
    for product, want in ((tee(), (True, "pictures")), (tee(bulk_cards="swatches"), (True, "swatches"))):
        present, groups = exported(product)
        plan = pi.plan_product("gildan-5000", groups["gildan-5000"], present)
        assert plan.errors == []
        assert (plan.fields["bulk_order"], plan.fields["bulk_cards"]) == want

    # Blank: the usual buy box. A file that says so switches an existing one off.
    present, groups = exported(tee(bulk_order=False))
    plan = pi.plan_product("gildan-5000", groups["gildan-5000"], present, existing=tee(), update_existing=True)
    assert plan.errors == [] and plan.fields["bulk_order"] is False and "bulk_cards" not in plan.fields


def _plan_with(said: str, kind_word: str = "Stocked"):
    text = ("URL handle,Title,Kind,Bulk order form,Option1 name,Option1 value,Option2 name,Option2 value,SKU,Price\n"
            f"tee,Tee,{kind_word},{said},Color,Black,Size,M,T-B-M,4.00\n")
    present, rows = pi.read_file(text)
    groups, _ = pi.group_rows(rows)
    return pi.plan_product("tee", groups["tee"], present)


def test_words_people_write_for_it_and_one_it_refuses():
    assert (_plan_with("yes").fields["bulk_order"], _plan_with("yes").fields["bulk_cards"]) == (True, "pictures")
    assert _plan_with("Swatch").fields["bulk_cards"] == "swatches"
    assert _plan_with("no").fields["bulk_order"] is False
    bad = _plan_with("maybe")
    assert bad.errors == ['Bulk order form "maybe" is Pictures, Swatches, or blank.']
    # A file without the column leaves it as it is.
    text = "URL handle,Title,Option1 name,Option1 value,SKU,Price\ntee,Tee,Size,M,T-M,4.00\n"
    present, rows = pi.read_file(text)
    plan = pi.plan_product("tee", pi.group_rows(rows)[0]["tee"], present)
    assert "bulk_order" not in plan.fields and "bulk_cards" not in plan.fields


def test_the_admins_list_names_a_stocked_product_sold_in_bulk():
    facts = pc.Facts(kind="stocked", status="active", images=1, variants=2, min_variant_price=3.99, stock=0)
    when = ns(isoformat=lambda: "2026-10-30T00:00:00+00:00")
    row = pc.row(ns(id="p1", slug="t", name="T", status="active", product_code=None, updated_at=when, bulk_order=True), facts, None)
    assert row["bulk"] is True and row["kind"] == "stocked"
    row = pc.row(ns(id="p1", slug="t", name="T", status="active", product_code=None, updated_at=when, bulk_order=False), facts, None)
    assert row["bulk"] is False
    made = pc.Facts(kind="made", status="active", base_price=1.0)
    assert pc.row(ns(id="p2", slug="m", name="M", status="active", product_code=None, updated_at=when, bulk_order=True), made, None)["bulk"] is False


def test_the_api_takes_only_what_the_cards_can_show():
    assert (ProductCreate(name="T", slug="t").bulk_order, ProductCreate(name="T", slug="t").bulk_cards) == (False, "pictures")
    assert ProductCreate(name="T", slug="t", bulk_order=True, bulk_cards="swatches").bulk_cards == "swatches"
    assert ProductUpdate(bulk_cards="pictures").bulk_cards == "pictures"
    with pytest.raises(ValidationError):
        ProductUpdate(bulk_cards="photos")
    with pytest.raises(ValidationError):
        ProductCreate(name="T", slug="t", bulk_cards="")
