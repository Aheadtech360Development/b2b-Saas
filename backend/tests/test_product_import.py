"""Products from a products file (services/product_import): reading the file
(ours, and Shopify's under its old and new column names) and planning each
product. Planning writes nothing; writing is checked against the local
database separately."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import product_export as pe
from app.services import product_import as pi

WHEN = datetime(2026, 10, 1, tzinfo=UTC)


def ns(**kw):
    return SimpleNamespace(**kw)


def tee(**kw):
    base = dict(
        id=uuid.uuid4(), name="Classic Tee", slug="classic-tee", description="<p>Soft, \"heavy\" cotton</p>",
        short_description="Soft tee", vendor="Gildan", product_type="T-Shirts", tags=["summer", "cotton"],
        status="active", meta_title="Classic Tee | Shop", meta_description="Our classic tee", moq=12,
        product_code="G5000", fabric="100% cotton", gender="Unisex", care_instructions="Wash cold",
        supplier="S&S", supplier_ref="B00760", weight=None, base_price=None, track_inventory=True,
        pricing_mode="variant", gang_sheet_enabled=False, gang_sheet_type=None,
        images=[ns(id=uuid.uuid4(), url_large="https://img/black.jpg", url_medium="", url_thumbnail="", alt_text="Black",
                   is_primary=True, sort_order=0),
                ns(id=uuid.uuid4(), url_large="https://img/flat.jpg", url_medium="", url_thumbnail="", alt_text=None,
                   is_primary=False, sort_order=1)],
        category_links=[ns(category=ns(name="T-Shirts"))], options=[], qty_tiers=[], variants=[],
    )
    base.update(kw)
    return ns(**base)


def variant(color, size, **kw):
    base = dict(
        id=uuid.uuid4(), sku=f"CT-{color}-{size}".upper(), color=color, size=size, color_hex="#000000",
        retail_price=Decimal("12.5"), compare_price=Decimal("15"), msrp=None, cost_per_item=Decimal("4.25"),
        country_of_origin="US", weight_grams=180.0, status="active", sort_order=0, created_at=WHEN,
    )
    base.update(kw)
    return ns(**base)


def exported(product, kind="stocked", variants=(), stock=None, rules=()):
    """The file Export writes for one product, read back as Import reads it."""
    text = pe.write_csv(pe.rows_for(product, kind=kind, variants=list(variants), stock=stock or {},
                                    sheet_sizes=[], price_table=0, rules=list(rules)))
    present, rows = pi.read_file(text)
    groups, problems = pi.group_rows(rows)
    assert not problems
    return present, groups


def test_a_product_exported_reads_back_as_the_same_product():
    vs = [variant("Black", "S"), variant("Black", "M"), variant("White", "S", weight_grams=None)]
    present, groups = exported(tee(), variants=vs, stock={vs[0].id: 7, vs[1].id: 0, vs[2].id: 3})
    plan = pi.plan_product("classic-tee", groups["classic-tee"], present)

    assert (plan.action, plan.kind, plan.errors) == ("create", "stocked", [])
    f = plan.fields
    assert (f["name"], f["description"], f["vendor"], f["product_type"]) == ("Classic Tee", "<p>Soft, \"heavy\" cotton</p>", "Gildan", "T-Shirts")
    assert (f["tags"], f["status"], f["moq"], f["meta_title"], f["meta_description"]) == (
        ["summer", "cotton"], "active", 12, "Classic Tee | Shop", "Our classic tee")
    assert (f["product_code"], f["fabric"], f["gender"], f["supplier_ref"], f["track_inventory"]) == ("G5000", "100% cotton", "Unisex", "B00760", True)
    assert plan.categories == ["T-Shirts"]
    got = [(v.values["sku"], v.values["color"], v.values["size"], v.values["retail_price"], v.stock) for v in plan.variants]
    assert got == [("CT-BLACK-S", "Black", "S", Decimal("12.50"), 7), ("CT-BLACK-M", "Black", "M", Decimal("12.50"), 0),
                   ("CT-WHITE-S", "White", "S", Decimal("12.50"), 3)]
    assert plan.variants[0].values["weight_grams"] == 180.0 and plan.variants[2].values.get("weight_grams") is None
    assert (plan.variants[0].values["compare_price"], plan.variants[0].values["cost_per_item"]) == (Decimal("15.00"), Decimal("4.25"))
    assert (plan.variants[0].values["color_hex"], plan.variants[0].values["country_of_origin"]) == ("#000000", "US")
    # Images in order, the colour's image keeping its colour.
    assert [(i.url, i.alt) for i in plan.images] == [("https://img/black.jpg", "Black"), ("https://img/flat.jpg", None)]


def test_shopifys_older_column_names_read_too():
    text = ("﻿Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,"
            "Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Price,Variant Compare At Price,"
            "Image Src,Image Position,Image Alt Text,Variant Image\n"
            "hoodie,Hoodie,<b>Warm</b>,Acme,Hoodies,\"winter, fleece\",FALSE,Colour,Grey,Size,M,HD-G-M,450,shopify,4,40.00,,"
            "https://cdn/h1.jpg,1,,https://cdn/grey.jpg\n"
            "hoodie,,,,,,,,Grey,,L,HD-G-L,470,shopify,0,42.00,,https://cdn/h2.jpg,2,,https://cdn/grey.jpg\n")
    present, rows = pi.read_file(text)
    groups, _ = pi.group_rows(rows)
    plan = pi.plan_product("hoodie", groups["hoodie"], present)

    assert plan.errors == [] and plan.fields["status"] == "draft" and plan.fields["description"] == "<b>Warm</b>"
    assert plan.fields["tags"] == ["winter", "fleece"] and plan.fields["track_inventory"] is True
    assert [(v.values["sku"], v.values["color"], v.values["size"], v.values["weight_grams"], v.stock) for v in plan.variants] == [
        ("HD-G-M", "Grey", "M", 450.0, 4), ("HD-G-L", "Grey", "L", 470.0, 0)]
    assert [(i.url, i.alt) for i in plan.images] == [("https://cdn/h1.jpg", None), ("https://cdn/h2.jpg", None), ("https://cdn/grey.jpg", "Grey")]


def test_a_file_without_handles_is_not_a_products_file():
    with pytest.raises(pi.ImportFileError):
        pi.read_file("name,slug,sku\nTee,tee,T1\n")
    with pytest.raises(pi.ImportFileError):
        pi.read_file("")


def test_an_existing_product_is_updated_only_when_asked():
    black_s, black_m = variant("Black", "S"), variant("Black", "M", sku="OLD-SKU")
    have = tee(variants=[black_s, black_m])
    rows = [variant("Black", "S", retail_price=Decimal("14")), variant("Black", "M", sku="NEW-SKU"), variant("Navy", "L", sku="")]
    present, groups = exported(tee(images=[]), variants=rows)

    skipped = pi.plan_product("classic-tee", groups["classic-tee"], present, existing=have)
    assert skipped.action == "skip" and skipped.variants == []

    plan = pi.plan_product("classic-tee", groups["classic-tee"], present, existing=have, update_existing=True)
    assert plan.action == "update" and plan.errors == []
    by_label = {v.label: v for v in plan.variants}
    assert by_label["Black / S"].match_id == black_s.id and by_label["Black / S"].values["retail_price"] == Decimal("14.00")
    # Matched by colour and size, its SKU changed to the file's.
    assert by_label["Black / M"].match_id == black_m.id and by_label["Black / M"].values["sku"] == "NEW-SKU"
    # New, with no SKU in the file: one is made from the handle.
    navy = by_label["Navy / L"]
    assert navy.match_id is None and navy.values["sku"] == "CLASSIC-TEE-NAVY-L" and navy.values["status"] == "active"


def test_a_sku_another_product_uses_is_refused():
    present, groups = exported(tee(), variants=[variant("Black", "S")])
    other = uuid.uuid4()
    plan = pi.plan_product("classic-tee", groups["classic-tee"], present, sku_owner={"ct-black-s": (other, "Polo")})
    assert plan.action == "error" and plan.errors == ["SKU CT-BLACK-S is already used by Polo."]


def test_only_color_and_size_options_and_each_once():
    head = "URL handle,Title,Option1 name,Option1 value,Option2 name,Option2 value,Price\n"
    present, rows = pi.read_file(head + "mug,Mug,Material,Ceramic,,,9\n")
    plan = pi.plan_product("mug", pi.group_rows(rows)[0]["mug"], present)
    assert plan.action == "error" and "Material" in plan.errors[0]

    present, rows = pi.read_file(head + "tee,Tee,Color,Black,Size,S,9\ntee,,,Black,,S,9\n")
    plan = pi.plan_product("tee", pi.group_rows(rows)[0]["tee"], present)
    assert plan.errors == ["Black / S is in the file twice."]


def test_tracking_with_no_quantities_does_not_turn_counting_on():
    head = "URL handle,Title,Option1 name,Option1 value,Price,Inventory tracker,Inventory quantity\n"
    present, rows = pi.read_file(head + "tee,Tee,Size,S,9,shopify,\ntee,,,M,9,shopify,\n")
    plan = pi.plan_product("tee", pi.group_rows(rows)[0]["tee"], present)
    assert "track_inventory" not in plan.fields and plan.notes[0].startswith("Stock not counted")
    assert [v.stock for v in plan.variants] == [None, None]


def test_a_made_to_order_product_brings_its_options_and_rules():
    gloss = ns(id=uuid.uuid4(), label="Gloss", price_delta=0, price_mode="flat", enabled=True, position=0, is_default=True,
               swatch_hex=None, image_url=None, sku_suffix="GL")
    foil = ns(id=uuid.uuid4(), label="Foil", price_delta=Decimal("0.025"), price_mode="per_unit", enabled=True, position=0,
              is_default=False, swatch_hex="#C0C0C0", image_url=None, sku_suffix=None)
    paper = ns(id=uuid.uuid4(), name="Paper", input_type="radio", required=True, is_active=True, help_text="Pick one",
               in_price_matrix=True, position=0, values=[gloss])
    finish = ns(id=uuid.uuid4(), name="Finish", input_type="swatch", required=False, is_active=True, help_text=None,
                in_price_matrix=False, position=1, values=[foil])
    rule = ns(when_value_id=gloss.id, action="disable_value", target_option_id=None, target_value_id=foil.id, note="No foil on gloss")
    product = tee(name="Cards", slug="cards", base_price=Decimal("0.12"), weight="300", options=[paper, finish],
                  qty_tiers=[ns(min_qty=100, unit_price=Decimal("0.12")), ns(min_qty=500, unit_price=Decimal("0.06"))])
    present, groups = exported(product, kind="made", rules=[rule])

    plan = pi.plan_product("cards", groups["cards"], present)
    assert (plan.action, plan.kind, plan.errors) == ("create", "made", [])
    assert (plan.fields["base_price"], plan.fields["weight"]) == (Decimal("0.12"), "300")
    assert plan.tiers == [(100, Decimal("0.12")), (500, Decimal("0.06"))]
    opts = plan.options["options"]
    assert [(o["name"], o["type"], o["required"], o["help"], o["matrix"]) for o in opts] == [
        ("Paper", "radio", True, "Pick one", True), ("Finish", "swatch", False, None, False)]
    assert opts[0]["values"][0] == {"label": "Gloss", "price": "0", "mode": "flat", "enabled": True, "default": True,
                                    "swatch": None, "image": None, "sku": "GL"}
    assert opts[1]["values"][0]["price"] == "0.025" and opts[1]["values"][0]["swatch"] == "#C0C0C0"
    assert plan.options["rules"] == [{"when": ["Paper", "Gloss"], "action": "disable_value", "option": "Finish",
                                      "value": "Foil", "note": "No foil on gloss"}]

    have = tee(slug="cards", pricing_mode="configurable", variants=[], images=[])
    plan = pi.plan_product("cards", groups["cards"], present, existing=have, update_existing=True)
    assert plan.action == "update" and plan.options is None and plan.tiers is not None
    assert any(n.startswith("Options kept as they are") for n in plan.notes)


def test_gang_sheets_are_made_in_gang_sheet_setup():
    present, rows = pi.read_file("URL handle,Title,Kind\ndtf,DTF Gang Sheet,Gang sheet\n")
    group = pi.group_rows(rows)[0]["dtf"]
    plan = pi.plan_product("dtf", group, present)
    assert plan.action == "error" and "Gang sheet setup" in plan.errors[0]

    have = tee(slug="dtf", gang_sheet_enabled=True, variants=[], images=[])
    plan = pi.plan_product("dtf", group, present, existing=have, update_existing=True)
    assert plan.action == "update" and plan.fields["name"] == "DTF Gang Sheet"
    assert any("Gang sheet setup" in n for n in plan.notes)


def test_a_kind_or_status_the_file_cannot_mean_is_named():
    present, rows = pi.read_file("URL handle,Title,Kind,Status\nx,X,Shirt,live\n")
    plan = pi.plan_product("x", pi.group_rows(rows)[0]["x"], present)
    assert plan.action == "error" and len(plan.errors) == 2


def test_quantity_price_breaks():
    assert pi.parse_tiers("12+: $5.00; 24+: $4.50") == [(12, Decimal("5.00")), (24, Decimal("4.50"))]
    assert pi.parse_tiers("") == []
    with pytest.raises(ValueError):
        pi.parse_tiers("twelve: 5")


def test_rows_with_no_handle_are_named():
    present, rows = pi.read_file("URL handle,Title\n,Lost\ntee,Tee\n")
    groups, problems = pi.group_rows(rows)
    assert list(groups) == ["tee"] and problems == ["Line 2: no URL handle, so it belongs to no product."]
