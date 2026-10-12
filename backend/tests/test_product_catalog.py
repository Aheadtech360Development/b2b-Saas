"""The admin's product list: the kind of each product, what it sells from, its
stock and what needs a look (services/product_catalog)."""
from types import SimpleNamespace

from app.services.product_catalog import Facts, attention, kind_of, page, price_from, row, stock


def test_the_five_kinds_come_from_the_fields_that_already_decide_how_a_product_sells():
    assert kind_of("variant", False, None) == "stocked"
    assert kind_of("configurable", False, None) == "made"
    assert kind_of("variant", True, None) == "gang_sheet"          # the old default for a builder product
    assert kind_of("variant", True, "gang_sheet") == "gang_sheet"
    assert kind_of("configurable", True, "upload_by_size") == "upload_by_size"
    assert kind_of("variant", True, "upload_own") == "upload_own"
    # A type left behind on a product whose builder was switched off does not count.
    assert kind_of("variant", False, "upload_own") == "stocked"


def test_price_from_is_per_what_the_kind_sells():
    assert price_from(Facts("stocked", "active", min_variant_price=12.5)) == {"amount": 12.5, "per": "item"}
    assert price_from(Facts("made", "active", base_price=0.12)) == {"amount": 0.12, "per": "item"}
    assert price_from(Facts("gang_sheet", "active", sizes=3, min_size_price=9)) == {"amount": 9, "per": "sheet"}
    assert price_from(Facts("upload_by_size", "active", tiers=2, min_tier_price=0.03)) == {"amount": 0.03, "per": "sq in"}
    assert price_from(Facts("made", "active")) is None


def test_stock_is_counted_for_stocked_items_only():
    assert stock(Facts("stocked", "active", variants=4, stock=120)) == {"label": "120 in stock", "tone": ""}
    assert stock(Facts("stocked", "active", variants=4, stock=0))["label"] == "Out of stock"
    assert stock(Facts("stocked", "active"))["label"] == "No variants"
    assert stock(Facts("gang_sheet", "active", sizes=2))["label"] == "Not tracked"


def test_what_needs_a_look():
    ready = Facts("stocked", "active", images=2, variants=4, min_variant_price=10, stock=40)
    assert attention(ready) == []
    assert attention(Facts("stocked", "draft", images=1, variants=2, min_variant_price=10, stock=5)) == ["Draft"]
    assert attention(Facts("stocked", "active", images=1, variants=2, min_variant_price=10, stock=0)) == ["Out of stock"]
    # One reason per fault: no variants says there is no price as well.
    assert attention(Facts("stocked", "active")) == ["No variants", "No image"]
    assert attention(Facts("gang_sheet", "active", images=1)) == ["No sheet sizes"]
    assert attention(Facts("upload_by_size", "active", images=1)) == ["No pricing"]
    assert attention(Facts("made", "active", images=1)) == ["No price"]
    assert attention(Facts("upload_own", "active", images=1, sizes=2, min_size_price=20)) == []


def _p(**over):
    base = dict(id="p1", slug="tee", name="Tee", status="active", product_code="G500", updated_at=None)
    return SimpleNamespace(**{**base, **over})


def test_the_page_counts_what_it_shows():
    rows = [
        row(_p(id="a"), Facts("stocked", "active", images=1, variants=2, min_variant_price=10, stock=4), None),
        row(_p(id="b", status="draft"), Facts("made", "draft", images=1, base_price=5), None),
        row(_p(id="c", status="draft"), Facts("gang_sheet", "draft"), None),
        row(_p(id="d", status="archived"), Facts("stocked", "archived", images=1, variants=1, min_variant_price=3, stock=1), None),
    ]
    out = page(rows)
    assert out["counts"] == {"all": 4, "active": 1, "draft": 2, "archived": 1}
    assert out["attention"] == 2 and out["kinds"]["stocked"] == 2 and out["kinds"]["made"] == 1
    drafts = page(rows, status="draft")
    assert [r["id"] for r in drafts["rows"]] == ["b", "c"] and drafts["total"] == 2
    # The status counts stay the same whichever status is shown.
    assert drafts["counts"] == out["counts"]
    look = page(rows, attention_only=True)
    assert [r["id"] for r in look["rows"]] == ["b", "c"] and look["counts"]["all"] == 2
    assert page(rows, page_no=2, page_size=3)["rows"][0]["id"] == "d"
