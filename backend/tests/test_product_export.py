"""The products file (Products → Export, services/product_export): Shopify's
product CSV columns and layout, then ours. One test per kind of product; the
loading from the database is checked against the local database separately."""
import csv
import io
import json
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.services import product_export as pe

WHEN = datetime(2026, 10, 1, tzinfo=UTC)


def ns(**kw):
    return SimpleNamespace(**kw)


def product(**kw):
    base = dict(
        name="Classic Tee", slug="classic-tee", description="<p>Soft, \"heavy\" cotton</p>",
        short_description="Soft tee", vendor="Gildan", product_type="T-Shirts", tags=["summer", "cotton"],
        status="active", meta_title="Classic Tee | Shop", meta_description="Our classic tee",
        moq=12, product_code="G5000", fabric="100% cotton", gender="Unisex", care_instructions="Wash cold",
        supplier="S&S", supplier_ref="B00760", weight="200", base_price=None, track_inventory=True,
        images=[], category_links=[], options=[], qty_tiers=[],
    )
    base.update(kw)
    return ns(**base)


def variant(color, size, **kw):
    base = dict(
        id=f"{color}-{size}", sku=f"CT-{color}-{size}".upper(), color=color, size=size, color_hex="#000000",
        retail_price=Decimal("12.5"), compare_price=Decimal("15"), msrp=None, cost_per_item=Decimal("4.25"),
        country_of_origin="US", weight_grams=180.0, status="active", sort_order=0, created_at=WHEN,
    )
    base.update(kw)
    return ns(**base)


def image(url, alt=None, primary=False, order=0):
    return ns(url_large=url, alt_text=alt, is_primary=primary, sort_order=order)


def category(name):
    return ns(category=ns(name=name))


def test_an_apparel_product_is_a_row_per_variant_with_its_images_beside_them():
    p = product(
        images=[image("https://img/white.jpg", "White", order=1), image("https://img/black.jpg", "Black", primary=True, order=2),
                image("https://img/flat.jpg", order=3)],
        category_links=[category("T-Shirts"), category("Best sellers")],
    )
    vs = [variant("Black", "S"), variant("Black", "M", weight_grams=None), variant("White", "S"), variant("White", "M")]
    rows = pe.rows_for(p, kind="stocked", variants=vs, stock={"Black-S": 7, "White-M": 2}, sheet_sizes=[], price_table=0)

    assert len(rows) == 4
    first = rows[0]
    assert first["Title"] == "Classic Tee" and first["URL handle"] == "classic-tee"
    assert first["Description"] == "<p>Soft, \"heavy\" cotton</p>" and first["Vendor"] == "Gildan"
    assert first["Type"] == "T-Shirts" and first["Tags"] == "summer, cotton"
    assert first["Published on online store"] == "true" and first["Status"] == "active"
    assert first["SEO title"] == "Classic Tee | Shop" and first["SEO description"] == "Our classic tee"
    assert first["Collection"] == "Best sellers, T-Shirts"
    assert first["Kind"] == "Stocked" and first["Minimum order quantity"] == "12" and first["Product code"] == "G5000"
    assert (first["Option1 name"], first["Option1 value"], first["Option2 name"], first["Option2 value"]) == ("Color", "Black", "Size", "S")
    assert (first["SKU"], first["Price"], first["Compare-at price"], first["Cost per item"]) == ("CT-BLACK-S", "12.50", "15.00", "4.25")
    assert (first["Inventory tracker"], first["Inventory quantity"], first["Continue selling when out of stock"]) == ("shopify", "7", "deny")
    assert (first["Weight value (grams)"], first["Weight unit for display"]) == ("180", "g")
    assert (first["Charge tax"], first["Requires shipping"], first["Fulfillment service"], first["Gift card"]) == ("true", "true", "manual", "false")
    # The primary image first, then by position; a colour's image beside its variants.
    assert [r.get("Product image URL") for r in rows] == ["https://img/black.jpg", "https://img/white.jpg", "https://img/flat.jpg", None]
    assert [r.get("Image position") for r in rows] == ["1", "2", "3", None]
    assert [r["Variant image URL"] for r in rows] == ["https://img/black.jpg"] * 2 + ["https://img/white.jpg"] * 2

    # The rows after the first: the handle and the variant, never the product's fields.
    second = rows[1]
    assert "Title" not in second and "Option1 name" not in second and "Collection" not in second
    assert (second["URL handle"], second["Option1 value"], second["Option2 value"]) == ("classic-tee", "Black", "M")
    assert second["Inventory quantity"] == "0"
    assert second["Weight value (grams)"] == "200"  # no weight of its own: the product's
    assert rows[3]["Inventory quantity"] == "2" and rows[3]["Color hex"] == "#000000" and rows[3]["Country of origin"] == "US"


def test_images_past_the_last_variant_get_rows_of_their_own():
    p = product(images=[image(f"https://img/{n}.jpg", order=n) for n in range(3)])
    rows = pe.rows_for(p, kind="stocked", variants=[variant(None, None, sku="CT-ONE")], stock={}, sheet_sizes=[], price_table=0)

    assert len(rows) == 3
    assert (rows[0]["Option1 name"], rows[0]["Option1 value"], rows[0]["SKU"]) == ("Title", "Default Title", "CT-ONE")
    for n, row in enumerate(rows[1:], start=2):
        assert row == {"URL handle": "classic-tee", "Product image URL": f"https://img/{n - 1}.jpg",
                       "Image position": str(n), "Image alt text": ""}


def value(label, delta, mode="flat", enabled=True, position=0, **kw):
    return ns(id=label, label=label, price_delta=delta, price_mode=mode, enabled=enabled, position=position,
              is_default=False, swatch_hex=None, image_url=None, sku_suffix=None, **kw)


def option(name, values, position, required=False, active=True):
    return ns(id=name, name=name, input_type="select", required=required, is_active=active, help_text=None,
              in_price_matrix=False, position=position, values=values)


def test_a_made_to_order_product_is_one_row_with_every_option_and_its_price():
    paper = option("Paper", [value("Gloss", 0), value("Matte", Decimal("2"), position=1)], 0, required=True)
    finish = option("Finish", [value("Rush", Decimal("10"), "percent", enabled=False),
                               value("Foil", Decimal("0.025"), "per_unit", position=1)], 1)
    old = option("Size", [value("A4", Decimal("-1.5"))], 2, active=False)
    p = product(name="Brochures", slug="brochures", base_price=Decimal("99.5"), weight=None, track_inventory=True,
                options=[finish, old, paper], qty_tiers=[ns(min_qty=24, unit_price=Decimal("4.5")), ns(min_qty=12, unit_price=5)])
    rule = ns(when_value_id="Rush", action="hide_option", target_option_id="Size", target_value_id=None, note=None)
    rows = pe.rows_for(p, kind="made", variants=[], stock={}, sheet_sizes=[], price_table=12, rules=[rule])

    assert len(rows) == 1
    row = rows[0]
    assert (row["Option1 name"], row["Option1 value"], row["Price"], row["Base price"]) == ("Title", "Default Title", "99.50", "99.50")
    assert row["Options"] == ("Paper (required): Gloss, Matte (+$2.00 per order) | Finish: Rush (+10%) (off), Foil (+$0.025 each)"
                              " | Size (off): A4 (-$1.50 per order)")
    assert row["Quantity price breaks"] == "12+: $5.00; 24+: $4.50"
    assert row["Price table"] == "12 prices" and row["Kind"] == "Made to order"
    # The same options in full for Import, the rule by names.
    data = json.loads(row["Options (data)"])
    assert [o["name"] for o in data["options"]] == ["Paper", "Finish", "Size"]
    assert data["options"][1]["values"][0] == {"label": "Rush", "price": "10", "mode": "percent", "enabled": False,
                                               "default": False, "swatch": None, "image": None, "sku": None}
    assert data["rules"] == [{"when": ["Finish", "Rush"], "action": "hide_option", "option": "Size"}]
    # Made to order is never counted: nothing to track, never out of stock.
    assert (row.get("Inventory tracker", ""), row.get("Inventory quantity", ""),
            row["Continue selling when out of stock"]) == ("", "", "continue")
    assert row["Weight value (grams)"] == ""


def test_a_gang_sheet_is_a_row_per_sheet_size():
    sizes = [
        ns(name='22" x 24"', width_in=Decimal("22"), height_in=Decimal("24"), pricing_mode="fixed", price_per_sheet=Decimal("20"),
           price_per_inch=0, min_length_in=12, max_length_in=240),
        ns(name="By the inch", width_in=Decimal("22"), height_in=Decimal("0"), pricing_mode="per_inch", price_per_sheet=0,
           price_per_inch=Decimal("0.05"), min_length_in=Decimal("12"), max_length_in=Decimal("240")),
    ]
    p = product(name="DTF Gang Sheet", slug="dtf-gang-sheet", weight=None)
    rows = pe.rows_for(p, kind="gang_sheet", variants=[], stock={}, sheet_sizes=sizes, price_table=0)

    assert [(r["Option1 value"], r["Price"], r["Sheet details"]) for r in rows] == [
        ('22" x 24"', "20.00", "22 x 24 in"),
        ("By the inch", "0.60", "22 in wide, $0.0500 per inch, 12 to 240 in long"),
    ]
    assert rows[0]["Option1 name"] == "Sheet size" and "Option1 name" not in rows[1]
    assert rows[0]["Kind"] == "Gang sheet"


def test_a_product_not_counted_is_never_out_of_stock():
    p = product(track_inventory=False)
    rows = pe.rows_for(p, kind="stocked", variants=[variant("Black", "S")], stock={"Black-S": 5}, sheet_sizes=[], price_table=0)
    assert (rows[0]["Inventory tracker"], rows[0]["Inventory quantity"], rows[0]["Continue selling when out of stock"]) == ("", "", "continue")


def test_a_draft_is_not_published():
    rows = pe.rows_for(product(status="draft"), kind="stocked", variants=[], stock={}, sheet_sizes=[], price_table=0)
    assert (rows[0]["Published on online store"], rows[0]["Status"]) == ("false", "draft")
    assert (rows[0]["Option1 name"], rows[0]["Option1 value"]) == ("Title", "Default Title")


def test_the_file_has_shopifys_columns_first_and_reads_back():
    p = product(images=[image("https://img/a.jpg")])
    text = pe.write_csv(pe.rows_for(p, kind="stocked", variants=[variant("Black", "S")], stock={}, sheet_sizes=[], price_table=0))

    assert text.startswith("﻿")  # Excel reads it as UTF-8
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    assert reader.fieldnames == pe.COLUMNS
    assert pe.COLUMNS[:3] == ["Title", "URL handle", "Description"]
    assert pe.COLUMNS.index("Collection") == len(pe.SHOPIFY_COLUMNS) - 1
    row = next(reader)
    assert row["Description"] == "<p>Soft, \"heavy\" cotton</p>"  # commas and quotes survive
    assert row["SKU"] == "CT-BLACK-S" and row["Barcodes"] == "" and row["Product image URL"] == "https://img/a.jpg"


def test_amounts_and_numbers():
    assert pe._amount(12) == "12.00" and pe._amount("12.5") == "12.50" and pe._amount(0.025) == "0.025"
    assert pe._amount(None) == "" and pe._amount("") == "" and pe._amount("abc") == "" and pe._amount("NaN") == ""
    assert pe._amount(Decimal("0.05"), 4) == "0.0500"
    assert pe._number(180.0) == "180" and pe._number("2.50") == "2.5" and pe._number(None) == ""
