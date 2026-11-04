"""SanMar, read from its files and fed through the S&S pipeline.

SanMar shares its catalogue as files (services/sanmar_service): one row per
SKU in SanMar_SDL_N, the same SKUs with stock in SanMar_EPDD (once per
category). These build small files of the same shape and check that a style,
its SKUs and its stock come out the way ss_products and the supplier screens
read S&S's, and that the switch between the two suppliers holds.
"""
from __future__ import annotations

import csv
import io
import uuid
import zipfile
from types import SimpleNamespace

import pytest

from app.services import sanmar_service as sm
from app.services.ss_activewear_service import ss_image_url
from app.services.suppliers import mapping, sources, ss_catalog, ss_products

SDL_COLUMNS = [
    "UNIQUE_KEY", "PRODUCT_TITLE", "PRODUCT_DESCRIPTION", "STYLE#", "CATEGORY_NAME", "COLOR_NAME", "SIZE",
    "PIECE_WEIGHT", "PIECE_PRICE", "DOZENS_PRICE", "CASE_PRICE", "CASE_SIZE", "INVENTORY_KEY", "SIZE_INDEX",
    "SANMAR_MAINFRAME_COLOR", "MILL", "PRODUCT_STATUS", "MSRP", "SUGGESTED_PRICE", "MAP_PRICING",
    "FRONT_MODEL_IMAGE_URL", "BACK_MODEL_IMAGE_URL", "FRONT_FLAT_IMAGE_URL", "BACK_FLAT_IMAGE_URL", "GTIN",
]
IMG = "https://cdnm.sanmar.com/imglib/mresjpg/2024/f12/"


def sdl_row(key, style, color, size, *, mainframe=None, status="Regular", price="4.12", index="2",
            title="Jerzees -  Dri-Power 50/50 Cotton/Poly T-Shirt.  29M", category="T-Shirts ;Women's"):
    slug = color.lower().replace(" ", "")
    return {
        "UNIQUE_KEY": key, "PRODUCT_TITLE": title,
        "PRODUCT_DESCRIPTION": "5.4-ounce 50/50 cotton/poly (Oxford)Advanced moisture management",
        "STYLE#": style, "CATEGORY_NAME": category, "COLOR_NAME": color, "SIZE": size,
        "PIECE_WEIGHT": "0.3300", "PIECE_PRICE": price, "DOZENS_PRICE": price, "CASE_PRICE": "3.12",
        "CASE_SIZE": "72", "INVENTORY_KEY": "864", "SIZE_INDEX": index,
        "SANMAR_MAINFRAME_COLOR": mainframe or color.replace(" ", ""), "MILL": "Jerzees", "PRODUCT_STATUS": status,
        "MSRP": "6.24", "SUGGESTED_PRICE": "6.24", "MAP_PRICING": "",
        "FRONT_MODEL_IMAGE_URL": f"{IMG}{style}_{slug}_model_front.jpg",
        "BACK_MODEL_IMAGE_URL": f"{IMG}{style}_{slug}_model_back.jpg",
        "FRONT_FLAT_IMAGE_URL": f"{IMG}{style}_{slug}_flat_front.jpg ",       # SanMar leaves a space
        "BACK_FLAT_IMAGE_URL": f"{IMG}{style}_{slug}_flat_back.jpg ",
        "GTIN": "00042463028870",
    }


def write_zip(path, name, columns, rows):
    text = io.StringIO()
    writer = csv.DictWriter(text, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(name, "﻿" + text.getvalue())
    return path


@pytest.fixture
def files(tmp_path):
    sdl = [
        sdl_row("8642", "29M", "White", "S"),
        sdl_row("8643", "29M", "White", "M", index="3"),
        sdl_row("8680", "29M", "White", "2XL", index="2"),         # SanMar's own index repeats across groups
        sdl_row("8740", "29M", "Athletic Heather", "S", mainframe="AthleticHthr"),
        sdl_row("8790", "29M", "Old Gold", "S", status="Discontinued"),
        sdl_row("9001", "112", "Amber Gold", "OSFA", mainframe="AmberGold", title="Richardson Trucker Cap 112",
                category="Caps"),
        sdl_row("9500", "OLD1", "Black", "S", status="Discontinued", title="Jerzees Gone Tee. OLD1"),
    ]
    epdd_cols = SDL_COLUMNS + ["QTY"]
    stock = []
    for r in sdl:
        q = {"8642": "4500", "8643": "1200", "8680": "0", "8740": "37", "9001": "1892"}.get(r["UNIQUE_KEY"], "0")
        line = {**r, "QTY": q,
                "PRODUCT_DESCRIPTION": "Soft and light.  |  5.4-ounce, 50/50 cotton/poly    47/53 cotton/poly (Oxford)  "
                                       "Tear-away label    Ash (formerly Birch)"
                if r["STYLE#"] == "29M" else "The standard by which all trucker caps are measured, built to last a long "
                                             "season.     60/40 cotton/polyester front    Structured"}
        # The stock file lists a SKU once for each category it is in.
        for category in ("T-Shirts", "Women's"):
            stock.append({**line, "CATEGORY_NAME": category})
    return (write_zip(tmp_path / "SanMar_SDL_N.zip", "SanMar_SDL_N.csv", SDL_COLUMNS, sdl),
            write_zip(tmp_path / "SanMar_EPDD_csv.zip", "SanMar_EPDD.csv", epdd_cols, stock))


# ── SanMar's cells ───────────────────────────────────────────────────────────

def test_titles_read_like_s_and_s_titles():
    assert sm.title("Jerzees -  Dri-Power 50/50 Cotton/Poly T-Shirt.  29M", "Jerzees", "29M") == \
        "Dri-Power 50/50 Cotton/Poly T-Shirt"
    assert sm.title("Port & Co &#174;  Core Cotton Tee. PC54", "Port & Co", "PC54") == "Core Cotton Tee"
    assert sm.title("Richardson Trucker Cap 112", "Richardson", "112") == "Trucker Cap"
    assert sm.title("Nike Dri-FIT Micro Pique 2.0 Polo NKDC1963", "Nike", "NKDC1963") == "Dri-FIT Micro Pique 2.0 Polo"


def test_descriptions_keep_one_point_per_feature():
    html = sm.description("An indispensable t-shirt in our classic silhouette&mdash;with a very friendly price.|      "
                          "5.4-ounce, 100% cotton    98/2 cotton/poly (Ash)  ")
    assert html == ("<p>An indispensable t-shirt in our classic silhouette—with a very friendly price.</p>"
                    "<ul><li>5.4-ounce, 100% cotton</li><li>98/2 cotton/poly (Ash)</li></ul>")
    assert sm.description("") == ""
    assert sm.description("<script>x</script>  Tear-away label") == \
        "<ul><li>&lt;script&gt;x&lt;/script&gt;</li><li>Tear-away label</li></ul>"


def test_categories_and_skus():
    assert sm.categories("T-Shirts ;Women's") == ["T-Shirts", "Women's"]
    assert sm.sku_of({"STYLE#": "29M", "SANMAR_MAINFRAME_COLOR": "AthleticHthr", "SIZE": "2XL"}) == "29M-ATHLETICHTHR-2XL"
    # Without SanMar's own colour name, the catalogue's.
    assert sm.sku_of({"STYLE#": "112", "COLOR_NAME": "Black/Charcoal", "SIZE": "S/M"}) == "112-BLACKCHARCOAL-SM"


# ── The files ────────────────────────────────────────────────────────────────

def test_the_style_list_leaves_out_what_sanmar_no_longer_sells(files):
    styles = {s["style_id"]: s for s in sm.build_styles(*files)}
    assert set(styles) == {"29M", "112"}
    tee = styles["29M"]
    assert tee["brand"] == "Jerzees" and tee["title"] == "Dri-Power 50/50 Cotton/Poly T-Shirt"
    assert tee["category"] == "T-Shirts, Women's"
    assert tee["stats"] == {"variants": 4, "sizes": ["S", "M", "2XL"], "colors": 2}
    assert tee["description"].startswith("<ul><li>Soft and light.</li><li>5.4-ounce, 50/50 cotton/poly</li>")
    assert tee["image"] == f"{IMG}29M_white_model_front.jpg"
    assert styles["112"]["description"].startswith("<p>The standard by which all trucker caps are measured")


def test_sku_rows_carry_sanmar_prices_stock_and_pictures(files):
    rows = sm.sku_rows(*files, {"29M"})
    assert [r["sku"] for r in rows] == ["29M-WHITE-S", "29M-WHITE-M", "29M-WHITE-2XL", "29M-ATHLETICHTHR-S"]
    white_s = rows[0]
    assert white_s["customerPrice"] == 4.12 and white_s["retailPrice"] == 6.24 and white_s["casePrice"] == 3.12
    assert [r["qty"] for r in rows] == [4500, 1200, 0, 37]
    assert white_s["colorFrontImage"] == f"{IMG}29M_white_flat_front.jpg"
    assert white_s["colorOnModelBackImage"] == f"{IMG}29M_white_model_back.jpg"
    assert white_s["mainframeColor"] == "White" and white_s["uniqueKey"] == "8642"


def test_stock_rows_count_a_sku_once_whatever_its_categories(files):
    rows = sm.inventory_rows(files[1], {"29M", "112"})
    assert sorted((r["sku"], r["qty"]) for r in rows) == [
        ("112-AMBERGOLD-OSFA", 1892), ("29M-ATHLETICHTHR-S", 37), ("29M-WHITE-2XL", 0),
        ("29M-WHITE-M", 1200), ("29M-WHITE-S", 4500)]


# ── The client, without SanMar ───────────────────────────────────────────────

@pytest.fixture
def client(files, monkeypatch):
    products, stock = files
    reads = []

    async def fetch(self, remote, ttl):
        reads.append(remote)
        return products if remote == sm.PRODUCTS_FILE else stock

    async def no_cache(*a, **k):
        return None

    monkeypatch.setattr(sm.SanMarService, "_fetch", fetch)
    monkeypatch.setattr(sm, "redis_get", no_cache)
    monkeypatch.setattr(sm, "redis_set", no_cache)
    sm._memo.clear()
    svc = sm.SanMarService("189999", "pw", tenant_id=uuid.uuid4())
    svc.reads = reads
    return svc


@pytest.mark.asyncio
async def test_the_client_answers_as_the_s_and_s_client_does(client):
    styles = await client.all_styles()
    assert {s["style_id"] for s in styles} == {"29M", "112"}
    stats = await client.style_stats(styles)
    assert stats["112"] == {"variants": 1, "sizes": ["OSFA"], "colors": 1}

    await client.prefetch(["29M", "112"])
    reads = len(client.reads)
    assert [r["sku"] for r in await client.fetch_products_for_parts(["112"])] == ["112-AMBERGOLD-OSFA"]
    assert len(await client.fetch_products_for_parts(["29M"])) == 4
    assert len(client.reads) == reads              # read once for the whole job, not per batch
    inventory = await client.fetch_inventory_for_parts(["29M"])
    assert {r["sku"]: r["qty"] for r in inventory}["29M-WHITE-S"] == 4500


@pytest.mark.asyncio
async def test_the_style_list_is_read_once_per_account(client):
    first = await client.all_styles()
    reads = len(client.reads)
    assert await client.all_styles() is first
    assert len(client.reads) == reads


# ── Through the S&S pipeline ─────────────────────────────────────────────────

def test_a_sanmar_row_becomes_a_variant_by_the_brand_s_rules(files):
    style = ss_catalog.as_ss(next(s for s in sm.build_styles(*files) if s["style_id"] == "29M"))
    row = sm.sku_rows(*files, {"29M"})[0]
    cfg = {"pricing": {"rules": [{"scope": "brand", "value": "Jerzees", "markup_pct": 100, "markup_fixed": 0}],
                       "round_to": None}}
    values = ss_products._variant_values(mapping.DEFAULT_FIELDS, style, row, ss_products.pricer(cfg, style))
    assert values["sku"] == "29M-WHITE-S"
    assert values["color"] == "White" and values["size"] == "S"
    assert values["retail_price"] == 8.24                       # $4.12 cost, Jerzees +100%
    assert values["cost_per_item"] == 4.12 and values["msrp"] == 6.24
    assert values["weight_grams"] == 149.69
    product = mapping.apply(mapping.DEFAULT_FIELDS, style, row, level="product", price_fn=lambda c: c)
    assert product["name"] == "Jerzees 29M" and product["vendor"] == "Jerzees"
    assert product["short_description"] == "Dri-Power 50/50 Cotton/Poly T-Shirt"


def test_sanmar_pictures_keep_their_own_links(files):
    assert ss_image_url(f"{IMG}29M_white_flat_front.jpg", "small") == f"{IMG}29M_white_flat_front.jpg"
    assert ss_image_url("Images/Color/17130_f_fm.jpg", "large") == "https://cdn.ssactivewear.com/Images/Color/17130_f_fl.jpg"
    rows = sm.sku_rows(*files, {"29M"})
    images = ss_products._image_rows(SimpleNamespace(id=uuid.uuid4()), rows, "Jerzees 29M")
    assert [i.url_large for i in images[:4]] == [
        f"{IMG}29M_white_flat_front.jpg", f"{IMG}29M_white_flat_back.jpg",
        f"{IMG}29M_white_model_front.jpg", f"{IMG}29M_white_model_back.jpg"]
    assert images[0].alt_text == "Jerzees 29M - White" and images[0].is_primary
    assert images[4].alt_text == "Jerzees 29M - Athletic Heather"


# ── The switch ───────────────────────────────────────────────────────────────

def test_each_supplier_gets_its_own_client():
    sanmar = sources.client("sanmar", {"ftp_username": "189999", "ftp_password": "pw"}, tenant_id="t1")
    assert isinstance(sanmar, sm.SanMarService) and sanmar.has_credentials
    ss = sources.client("ss_activewear", {"account_number": "1", "api_key": "k"})
    assert type(ss).__name__ == "SSActivewearService"
    assert sources.sends_orders("ss_activewear") and not sources.sends_orders("sanmar")
    assert sources.label("sanmar") == "SanMar"


def test_the_login_never_names_the_account_on_disk():
    a = sm.SanMarService("189999", "pw", tenant_id="t1")
    b = sm.SanMarService("189999", "pw", tenant_id="t2")
    assert "189999" not in a.account and a.account != b.account


def test_brands_connect_sanmar_with_its_ftp_login():
    from app.services.integrations_service import PROVIDERS

    fields = {f["name"]: f["kind"] for f in PROVIDERS["sanmar"]["fields"]}
    assert fields == {"ftp_username": "text", "ftp_password": "secret"}
    assert PROVIDERS["sanmar"]["category"] == "supplier"
