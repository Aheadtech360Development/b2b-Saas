"""The t-shirt designer connected to the shop (services/tshirt_designer).

What each test holds, in the owner's terms:
* A product switched on is drawn in its own colours and sizes, at each
  colour and size's own price; one with nothing on sale is not offered.
* A design costs: the shirt's own price, plus the shop's price per printed
  side at the quantity break the whole design reaches, plus names and numbers.
  The server works it out; what the browser said is not taken.
* Nothing can be ordered while a problem stands (no art, no sizes, a size not
  on sale, embroidery below its minimum or on a shirt not embroidered).
* The shop's prices are checked before they are saved, and are the shop's own.
* Each side is priced by what is on it: uploaded artwork, text and graphics
  each have their own price; a side with several is one print at the dearest;
  names and numbers alone add nothing to a side. A service the shop switched
  off cannot be ordered (owner, 2026-11-17).
No database or network.
"""
from types import SimpleNamespace as NS

import pytest

from app.core.tenant_settings import TENANT_SCOPED_KEYS
from app.services import tshirt_designer as td

TEE = "6f1c1e0a-1111-4c4c-9a9a-000000000001"
TANK = "6f1c1e0a-2222-4c4c-9a9a-000000000002"


def variant(colour, size, price, status="active", hexcode=None):
    return NS(id=f"v-{colour}-{size}", color=colour, size=size, retail_price=price, status=status, color_hex=hexcode)


def product(pid=TEE, name="Gildan 5000", variants=(), cfg=None, **kw):
    return NS(id=pid, slug=name.lower().replace(" ", "-"), name=name, product_code="G500", vendor="Gildan",
              short_description="<p>Heavy   cotton tee</p>", description=None, fabric="5.3 oz",
              designer_config=cfg, variants=list(variants), **kw)


def garments():
    tee = td.garment_of(product(variants=[
        variant("Black", "M", 6.5), variant("Black", "2XL", 8.5), variant("Black", "S", 6.5),
        variant("Sport Grey", "M", 7), variant("Sport Grey", "L", 7, status="archived"),
    ], cfg={"silhouette": "tee", "embroidery": True}))
    tank = td.garment_of(product(TANK, "Tank", variants=[variant("White", "M", 5)]))
    return {tee["id"]: tee, tank["id"]: tank}


def doc(**over):
    base = {
        "method": "print",
        "products": [{"garmentId": TEE, "colorIds": ["black", "sport-grey"]}],
        "designs": {f"{TEE}:black": {"front": [{"type": "text"}], "back": [{"type": "image"}], "left": [], "right": []},
                    f"{TEE}:sport-grey": {"front": [{"type": "text"}], "back": [], "left": [], "right": []}},
        "quantities": {f"{TEE}:black": {"S": 4, "M": 4, "2XL": 2}, f"{TEE}:sport-grey": {"M": 2}},
        "roster": [],
    }
    base.update(over)
    return base


# ── The product, as the designer draws it ───────────────────────────────────

def test_a_product_is_drawn_in_its_own_colours_sizes_and_prices():
    tee = garments()[TEE]
    assert [c["id"] for c in tee["colors"]] == ["black", "sport-grey"]
    assert tee["sizes"] == ["S", "M", "2XL"]                      # size order; the archived L is not on sale
    assert tee["prices"] == {"black|M": 6.5, "black|2XL": 8.5, "black|S": 6.5, "sport-grey|M": 7.0}
    assert tee["variants"]["black|2XL"] == "v-Black-2XL"
    assert (tee["basePrice"], tee["silhouette"], tee["embroidery"]) == (6.5, "tee", True)
    assert tee["description"] == "Heavy cotton tee"


def test_a_product_with_nothing_on_sale_is_not_offered_and_shapes_fall_back():
    assert td.garment_of(product(variants=[variant("Black", "M", 6, status="archived")])) is None
    assert td.clean_config({"silhouette": "hoodie", "embroidery": "yes"}) == {"silhouette": "tee", "embroidery": False}
    assert [td.colour_id(n) for n in ("Sport Grey", "  Heather/Navy ", "", "Ash #2")] == \
        ["sport-grey", "heather-navy", "colour", "ash-2"]


# ── What a design costs ─────────────────────────────────────────────────────

def test_a_design_costs_the_shirt_plus_each_printed_side_at_the_break_it_reaches():
    q = td.quote(doc(), garments(), td.DEFAULT_RATES)
    # 12 pieces reach the 12 break: $5.50 a side. Black has front and back, grey the front.
    assert (q["total_qty"], q["per_side"], q["problems"]) == (12, 5.5, [])
    units = {(x["color_id"], x["size"]): x["unit"] for x in q["lines"]}
    assert units == {("black", "S"): 17.5, ("black", "M"): 17.5, ("black", "2XL"): 19.5, ("sport-grey", "M"): 12.5}
    assert q["total"] == 4 * 17.5 + 4 * 17.5 + 2 * 19.5 + 2 * 12.5
    assert q["next_break"] == {"qty": 24}


def test_names_and_numbers_are_per_shirt_and_count_as_pieces():
    roster = [{"line": f"{TEE}:black", "size": "M", "name": "SMITH", "number": "7"},
              {"line": f"{TEE}:black", "size": "L", "name": "", "number": "9"}]
    q = td.quote(doc(roster=roster, quantities={f"{TEE}:black": {"M": 1}}), garments(), td.DEFAULT_RATES)
    # The L on the roster is not on sale: refused, not ordered at a made-up price.
    assert any("size L" in p for p in q["problems"]) and q["total"] == 0
    roster[1]["size"] = "S"
    q = td.quote(doc(roster=roster, quantities={f"{TEE}:black": {"M": 1}}), garments(), td.DEFAULT_RATES)
    assert q["problems"] == [] and q["total_qty"] == 2 and q["personalization"] == 4 + 3 + 3
    assert q["total"] == 2 * (6.5 + 2 * 8) + 10


@pytest.mark.parametrize("change, problem", [
    ({"designs": {}}, "Add artwork to at least one side."),
    ({"quantities": {}}, "Add at least one size and quantity."),
    ({"method": "embroidery"}, "Embroidery starts at 12 pieces"),
])
def test_nothing_is_ordered_while_a_problem_stands(change, problem):
    d = doc(**change)
    if change.get("method"):
        d["quantities"] = {f"{TEE}:black": {"M": 3}}
    q = td.quote(d, garments(), td.DEFAULT_RATES)
    assert any(problem in p for p in q["problems"]) and q["total"] == 0


def test_a_shirt_not_embroidered_here_and_a_shirt_left_bare_are_refused():
    d = doc(method="embroidery", products=[{"garmentId": TANK, "colorIds": ["white"]}],
            designs={f"{TANK}:white": {"front": [{"type": "text"}], "back": [], "left": [], "right": []}},
            quantities={f"{TANK}:white": {"M": 20}})
    assert any("not embroidered here" in p for p in td.quote(d, garments(), td.DEFAULT_RATES)["problems"])
    d = doc(designs={f"{TEE}:black": {"front": [{"type": "text"}], "back": [], "left": [], "right": []}})
    assert any("Add artwork to the Gildan 5000 in Sport Grey" in p for p in td.quote(d, garments(), td.DEFAULT_RATES)["problems"])


def test_a_product_no_longer_offered_cannot_be_ordered():
    d = doc(quantities={"6f1c1e0a-9999-4c4c-9a9a-000000000009:black": {"M": 5}})
    assert any("no longer offered" in p for p in td.quote(d, garments(), td.DEFAULT_RATES)["problems"])


# ── The shop's prices ───────────────────────────────────────────────────────

def test_the_shops_prices_are_checked_before_they_are_saved():
    # A row saved before each kind had its own price gives all three that price.
    good = td.check_rates({**td.DEFAULT_RATES, "print": [{"min": 12, "per_side": 5}, {"min": 1, "per_side": 9}]})
    assert good["print"] == [{"min": 1, "upload": 9.0, "text": 9.0, "graphics": 9.0, "per_side": 9.0},
                             {"min": 12, "upload": 5.0, "text": 5.0, "graphics": 5.0, "per_side": 5.0}]
    own = td.check_rates({**td.DEFAULT_RATES, "print": [{"min": 1, "upload": 8, "text": 4, "graphics": 6}]})
    assert own["print"] == [{"min": 1, "upload": 8.0, "text": 4.0, "graphics": 6.0, "per_side": 8.0}]
    for bad, words in (
        ({"print": [{"min": 6, "per_side": 5}]}, "start at 1 piece"),
        ({"print": [{"min": 1, "per_side": 5}, {"min": 1, "per_side": 4}]}, "once"),
        ({"print": [{"min": 1, "per_side": -1}]}, "$0 to $1,000"),
        ({"print": [{"min": 1, "upload": 8, "text": None, "graphics": 6}]}, "artwork, text and graphics"),
        ({"print": [{"min": 1, "upload": 8, "text": 4, "graphics": 1001}]}, "$0 to $1,000"),
        ({"embroidery_minimum": 6}, "at or below the embroidery minimum"),
        ({"name": "lots"}, "need numbers"),
    ):
        with pytest.raises(td.DesignerError) as e:
            td.check_rates({**td.DEFAULT_RATES, **bad})
        assert words in str(e.value)


def test_a_shop_starts_on_the_starting_prices_until_it_saves_its_own_and_they_are_its_own():
    assert td.settings_from(None) == {"rates": td.DEFAULT_RATES, "saved": False,
                                      "services": {"upload": True, "text": True, "graphics": True, "names": True}}
    own = {**td.DEFAULT_RATES, "name": 5}
    assert td.settings_from({"rates": own, "saved": True})["rates"]["name"] == 5.0
    assert td.SETTINGS_KEY in TENANT_SCOPED_KEYS


# ── A price for each kind of artwork, and which the shop offers ─────────────

EACH = {**td.DEFAULT_RATES, "print": [{"min": 1, "upload": 8, "text": 4, "graphics": 6},
                                      {"min": 12, "upload": 5, "text": 2, "graphics": 3}]}
EACH = td.check_rates(EACH)
TEXT = {"kind": "text", "type": "Textbox"}
PICTURE = {"kind": "image", "type": "Image"}
GRAPHIC = {"kind": "graphic", "type": "Path"}
NAME = {"kind": "text", "nn": "name", "type": "IText"}


def one(front=(), back=(), **over):
    base = {"products": [{"garmentId": TEE, "colorIds": ["black"]}],
            "designs": {f"{TEE}:black": {"front": list(front), "back": list(back), "left": [], "right": []}},
            "quantities": {f"{TEE}:black": {"M": 1}}}
    return doc(**{**base, **over})


def test_each_side_is_priced_by_what_is_on_it():
    assert td.quote(one(front=[TEXT]), garments(), EACH)["lines"][0]["unit"] == 6.5 + 4
    assert td.quote(one(front=[PICTURE]), garments(), EACH)["lines"][0]["unit"] == 6.5 + 8
    q = td.quote(one(front=[GRAPHIC], back=[TEXT]), garments(), EACH)
    assert q["lines"][0]["unit"] == 6.5 + 6 + 4
    assert q["lines"][0]["side_prices"] == [{"view": "front", "service": "graphics", "price": 6.0},
                                           {"view": "back", "service": "text", "price": 4.0}]


def test_a_side_with_several_kinds_is_one_print_at_the_dearest():
    q = td.quote(one(front=[PICTURE, TEXT], back=[TEXT, GRAPHIC]), garments(), EACH)
    assert q["lines"][0]["unit"] == 6.5 + 8 + 6          # not 8 + 4 and 4 + 6
    assert q["lines"][0]["decoration"] == 14.0


def test_names_and_numbers_alone_add_nothing_to_a_side():
    roster = [{"id": "r1", "line": f"{TEE}:black", "size": "M", "name": "SMITH", "number": "7"}]
    q = td.quote(one(front=[TEXT], back=[NAME], roster=roster), garments(), EACH)
    assert q["problems"] == []
    assert q["lines"][0]["unit"] == 6.5 + 4 and q["personalization"] == 4 + 3


def test_the_break_applies_to_each_kind_its_own_price():
    q = td.quote(one(front=[TEXT], quantities={f"{TEE}:black": {"M": 12}}), garments(), EACH)
    assert q["lines"][0]["unit"] == 6.5 + 2


def test_a_kind_the_shop_switched_off_cannot_be_ordered():
    off = {"upload": True, "text": False, "graphics": True, "names": True}
    q = td.quote(one(front=[TEXT]), garments(), EACH, off)
    assert "Text is not offered on this shop's shirts. Remove it from your design to order." in q["problems"]
    assert q["total"] == 0
    assert td.quote(one(front=[PICTURE]), garments(), EACH, off)["problems"] == []
    roster = [{"id": "r1", "line": f"{TEE}:black", "size": "M", "name": "SMITH", "number": ""}]
    no_names = {**off, "text": True, "names": False}
    assert any("Names and numbers is not offered" in p
               for p in td.quote(one(front=[PICTURE], roster=roster), garments(), EACH, no_names)["problems"])


def test_which_kind_an_object_is():
    assert [td.service_of(o) for o in (TEXT, PICTURE, GRAPHIC, NAME)] == ["text", "upload", "graphics", "names"]
    assert [td.service_of({"type": t}) for t in ("Textbox", "image", "Group")] == ["text", "upload", "graphics"]
    assert td.side_services([TEXT, NAME, PICTURE]) == ["upload", "text", "names"]


def test_the_shop_keeps_one_service_on_at_least():
    assert td.check_services({"upload": True, "text": False}) == \
        {"upload": True, "text": False, "graphics": True, "names": True}
    with pytest.raises(td.DesignerError):
        td.check_services({"upload": False, "text": False, "graphics": False, "names": False})
    assert td.services_from("junk") == {"upload": True, "text": True, "graphics": True, "names": True}


@pytest.mark.asyncio
async def test_saving_the_services_keeps_the_prices_and_their_saved_mark(monkeypatch):
    import json

    from app.core import tenant_settings

    store = {"v": json.dumps({"rates": EACH, "saved": True})}

    async def get(db, key, tenant_id=None):
        return store["v"]

    async def put(db, key, value, tenant_id=None):
        store["v"] = value

    monkeypatch.setattr(tenant_settings, "get_setting", get)
    monkeypatch.setattr(tenant_settings, "set_setting", put)
    out = await td.save_settings(None, "t1", services={"graphics": False})
    assert out["rates"] == EACH and out["saved"] is True
    assert json.loads(store["v"])["services"] == {"upload": True, "text": True, "graphics": False, "names": True}
    out = await td.save_settings(None, "t1", rates=td.DEFAULT_RATES)
    assert out["services"]["graphics"] is False      # prices saved later keep the choice
