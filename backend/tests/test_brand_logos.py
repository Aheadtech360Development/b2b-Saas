"""Brands on product cards (services/brand_logos): the brand's logo, or its name,
beside a card's price. Logos come from S&S (styles imported or synced, and its
Brands list) or the shop itself, and S&S never writes over the shop's own word.
The setting is kept in memory here; reading the shop's vendors is checked
against the local database separately."""
import asyncio
from types import SimpleNamespace

import pytest

from app.services import brand_logos as bl

SHOP = "shop-1"
GILDAN = "https://cdn.ssactivewear.com/Images/Brand/35_fm.jpg"


@pytest.fixture
def store(monkeypatch):
    """The brand_logos setting, in memory."""
    kept: dict = {"conf": None, "writes": 0}

    async def settings_for(db, tenant_id):
        return bl.clean(kept["conf"])

    async def write(db, tenant_id, conf):
        kept["conf"] = conf
        kept["writes"] += 1

    monkeypatch.setattr(bl, "settings_for", settings_for)
    monkeypatch.setattr(bl, "_write", write)
    bl._known.clear()
    return kept


def run(coro):
    return asyncio.run(coro)


def test_one_brand_however_it_is_written():
    assert bl.key_of("BELLA + CANVAS") == bl.key_of("Bella+Canvas") == bl.key_of(" bella  canvas ") == "bella canvas"
    assert bl.key_of(None) == "" and bl.key_of("  ") == ""


def test_the_setting_keeps_only_what_it_can_use():
    conf = bl.clean({"show": False, "brands": {
        "Gildan": {"name": "Gildan", "logo": GILDAN, "source": "ss"},
        "next level": {"name": "Next Level", "logo": "javascript:alert(1)", "source": "elsewhere", "hide": 1},
        "": {"name": "nothing"}, "bad": "not a brand",
    }})
    assert conf["show"] is False
    assert conf["brands"] == {
        "gildan": {"name": "Gildan", "logo": GILDAN, "source": "ss", "hide": False},
        "next level": {"name": "Next Level", "logo": "", "source": "own", "hide": True},
    }
    assert bl.clean("junk") == {"show": True, "brands": {}}


def test_what_a_card_shows():
    conf = bl.clean({"brands": {"gildan": {"name": "Gildan", "logo": GILDAN},
                                "lyfe": {"name": "LYFE", "logo": ""},
                                "house": {"name": "House", "hide": True}}})
    assert bl.card_brand(conf, "GILDAN") == {"brand": "Gildan", "brand_logo": GILDAN}
    assert bl.card_brand(conf, "Lyfe") == {"brand": "LYFE", "brand_logo": ""}  # no logo: the name
    assert bl.card_brand(conf, "Comfort Colors") == {"brand": "Comfort Colors", "brand_logo": ""}
    assert bl.card_brand(conf, "House") == {"brand": "", "brand_logo": ""}  # hidden by the shop
    assert bl.card_brand(conf, "") == {"brand": "", "brand_logo": ""}
    assert bl.card_brand(None, "Gildan") == {"brand": "", "brand_logo": ""}
    assert bl.card_brand({**conf, "show": False}, "Gildan") == {"brand": "", "brand_logo": ""}


def test_an_imported_style_keeps_its_brands_logo_once(store):
    assert run(bl.remember(None, SHOP, "Gildan", GILDAN)) is True
    assert store["conf"]["brands"]["gildan"] == {"name": "Gildan", "logo": GILDAN, "source": "ss", "hide": False}
    # The same brand again: nothing written, and not even read for a while.
    assert run(bl.remember(None, SHOP, "GILDAN", "https://cdn.ssactivewear.com/other.jpg")) is False
    assert store["writes"] == 1 and store["conf"]["brands"]["gildan"]["logo"] == GILDAN
    assert run(bl.remember(None, SHOP, "Gildan", "ftp://nope")) is False
    assert run(bl.remember(None, SHOP, "", GILDAN)) is False


def test_s_and_s_never_writes_over_the_shops_own_word(store):
    store["conf"] = {"brands": {"gildan": {"name": "Gildan", "logo": "", "source": "own"}}}
    assert run(bl.remember(None, SHOP, "Gildan", GILDAN)) is False
    assert store["writes"] == 0


def test_saving_marks_a_changed_logo_as_the_shops_own(store, monkeypatch):
    async def overview(db, tenant_id):
        return {"show": store["conf"]["show"], "brands": store["conf"]["brands"]}

    monkeypatch.setattr(bl, "overview", overview)
    store["conf"] = {"brands": {"gildan": {"name": "Gildan", "logo": GILDAN, "source": "ss"},
                                "next level": {"name": "Next Level", "logo": "https://x/nl.png", "source": "ss"}}}
    out = run(bl.save(None, SHOP, show=False, brands=[
        {"key": "gildan", "name": "Gildan", "logo": GILDAN, "hide": True},          # same logo: still S&S's
        {"key": "next level", "name": "Next Level", "logo": "", "hide": False},     # removed: the shop's word
        {"name": "LYFE", "logo": "https://ik.imagekit.io/shop/lyfe.png"},           # its own brand
    ]))
    assert out["show"] is False
    assert out["brands"]["gildan"] == {"name": "Gildan", "logo": GILDAN, "source": "ss", "hide": True}
    assert out["brands"]["next level"]["source"] == "own" and out["brands"]["next level"]["logo"] == ""
    assert out["brands"]["lyfe"] == {"name": "LYFE", "logo": "https://ik.imagekit.io/shop/lyfe.png", "source": "own", "hide": False}
    with pytest.raises(ValueError):
        run(bl.save(None, SHOP, show=None, brands=[{"name": "Bad", "logo": "javascript:alert(1)"}]))
    with pytest.raises(ValueError):
        run(bl.save(None, SHOP, show=None, brands=[{"name": "  "}]))


def test_logos_from_the_s_and_s_brand_list(store, monkeypatch):
    rows = [
        {"key": "gildan", "name": "Gildan", "products": 12},
        {"key": "bella canvas", "name": "BELLA + CANVAS", "products": 4},
        {"key": "comfort colors", "name": "Comfort Colors", "products": 2},   # the shop removed its logo
        {"key": "lyfe", "name": "LYFE", "products": 3},                       # not an S&S brand
        {"key": "old", "name": "Old", "products": 0},                         # no products: left alone
    ]

    async def overview(db, tenant_id):
        return {"show": True, "brands": rows}

    monkeypatch.setattr(bl, "overview", overview)
    store["conf"] = {"brands": {"comfort colors": {"name": "Comfort Colors", "logo": "", "source": "own"}}}
    svc = SimpleNamespace(fetch_brands=lambda: _brands())

    out = run(bl.from_ss(None, SHOP, svc))
    assert out["filled"] == ["Gildan", "BELLA + CANVAS"] and out["missing"] == ["LYFE"]
    brands = store["conf"]["brands"]
    assert brands["gildan"]["logo"] == "https://cdn.ssactivewear.com/Images/Brand/35_fm.jpg"
    assert brands["bella canvas"] == {"name": "BELLA + CANVAS", "logo": "https://cdn.ssactivewear.com/Images/Brand/14_fm.png",
                                      "source": "ss", "hide": False}
    assert brands["comfort colors"]["logo"] == "" and "old" not in brands


async def _brands():
    return [{"brandID": 35, "name": "Gildan", "image": "Images/Brand/35_fm.jpg"},
            {"brandID": 14, "name": "Bella+Canvas", "image": "Images/Brand/14_fm.png"},
            {"brandID": 9, "name": "Comfort Colors", "image": "Images/Brand/9_fm.jpg"},
            {"brandID": 1, "name": "No Image"}]


def test_a_styles_logo_address():
    assert bl.logo_of_style({"brandImage": "Images/Brand/35_fl.jpg"}).startswith("https://cdn.ssactivewear.com/Images/Brand/35_f")
    assert bl.logo_of_style({"brandImage": "Images/Brand/35_fm.jpg"}) == GILDAN
    # A catalogue style keeps the small one; cards want the medium.
    assert bl.logo_of_style({"brand_image": "https://cdn.ssactivewear.com/Images/Brand/35_fs.jpg"}) == GILDAN
    assert bl.logo_of_style({}) is None


def test_cards_carry_their_brand(monkeypatch):
    from app.core import tenant_context
    from app.services import theme_data

    async def settings_for(db, tenant_id):
        return bl.clean({"brands": {"gildan": {"name": "Gildan", "logo": GILDAN}}})

    monkeypatch.setattr(bl, "settings_for", settings_for)
    monkeypatch.setattr(tenant_context, "get_current_tenant_id", lambda: SHOP)
    tee = SimpleNamespace(name="Gildan 5000", slug="g5000", vendor="Gildan", variants=[], images=[], base_price=2.75,
                          short_description="", gang_sheet_enabled=False, id="p1")
    plain = SimpleNamespace(name="Gang Sheet", slug="gs", vendor=None, variants=[], images=[], base_price=9,
                            short_description="", gang_sheet_enabled=False, id="p2")
    cards = run(theme_data._cards(None, [tee, plain]))
    assert (cards[0]["brand"], cards[0]["brand_logo"], cards[0]["price"]) == ("Gildan", GILDAN, "From $2.75")
    assert (cards[1]["brand"], cards[1]["brand_logo"]) == ("", "")
