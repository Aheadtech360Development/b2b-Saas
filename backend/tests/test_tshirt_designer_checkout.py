"""A t-shirt design bought through the cart (services/tshirt_designer).

What each test holds, in the owner's terms:
* A design is one line in the cart at the server's price. On the order it is
  one line per shirt, colour and size, on that blank's own variant (so its
  stock comes off the shelf), and one for names and numbers; the lines add up
  to the design's total.
* If the design can no longer be ordered as it stands, the cart's snapshot is
  used only when a card has already paid; otherwise the buyer is told why.
* A design made signed in is its account's to buy; a guest's, whoever holds it.
* Paid for and sent back, a design may have its artwork changed and nothing
  else.
* Ordered designs join the Production queue like gang sheets; one nobody has
  ordered stays out.
* Ordering again never puts a design's blanks in the cart as plain blanks.
No database or network.
"""
import uuid
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest

from app.core.exceptions import InsufficientStockError
from app.services import production_board as pb
from app.services import tshirt_designer as td

TEE = "6f1c1e0a-1111-4c4c-9a9a-000000000001"
DESIGN = "7a2d2f1b-3333-4d4d-8b8b-000000000003"
V = {key: str(uuid.UUID(int=i + 1)) for i, key in enumerate(("Black|S", "Black|M", "Black|2XL", "Sport Grey|M"))}


def garments():
    variants = [NS(id=V[f"{c}|{z}"], color=c, size=z, retail_price=p, status="active", color_hex=None)
                for c, z, p in (("Black", "S", 6.5), ("Black", "M", 6.5), ("Black", "2XL", 8.5), ("Sport Grey", "M", 7))]
    tee = td.garment_of(NS(id=TEE, slug="gildan-5000", name="Gildan 5000", product_code="G500", vendor="Gildan",
                           short_description="", description=None, fabric="", variants=variants,
                           designer_config={"silhouette": "tee", "embroidery": True}))
    return {TEE: tee}


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


def design(**over):
    base = {"id": DESIGN, "reference": "TS-AB-2611-0007", "name": "Team tees", "document": doc(),
            "company_id": None, "user_id": None}
    base.update(over)
    return NS(**base)


class FakeDb:
    """Answers order_items' one query: each variant's SKU."""

    async def execute(self, _stmt):
        rows = [(uuid.UUID(v), f"SKU-{k.replace(' ', '').replace('|', '-')}") for k, v in V.items()]
        return NS(all=lambda: rows)

    async def flush(self):
        return None


def snap_of(d=None, **doc_over):
    q = td.quote(doc(**doc_over), garments(), td.DEFAULT_RATES)
    assert q["problems"] == []
    return td.snapshot(d or design(), q, garments())


# ── In the cart ─────────────────────────────────────────────────────────────

def test_a_priced_design_keeps_what_its_order_needs_and_its_lines_add_up():
    snap = snap_of()
    assert (snap["id"], snap["reference"], snap["name"], snap["pieces"], snap["method"]) == \
        (DESIGN, "TS-AB-2611-0007", "Team tees", 12, "print")
    black_s = next(x for x in snap["lines"] if (x["colour"], x["size"]) == ("Black", "S"))
    assert black_s == {"garment_id": TEE, "garment": "Gildan 5000", "variant_id": V["Black|S"], "colour": "Black",
                       "size": "S", "qty": 4, "unit": 17.5, "subtotal": 70.0, "sides": ["front", "back"]}
    assert snap["total"] == sum(x["subtotal"] for x in snap["lines"]) + snap["personalization"] == 204.0


def test_a_designs_cart_line_is_named_for_the_design_and_found_by_its_id():
    assert td.line_label(design()) == "Team tees"
    assert td.line_label(design(name="Untitled design")) == td.line_label(design(name="  ")) == "Custom design"
    assert td.design_info({"tshirt_design": {"id": DESIGN}}) == {"id": DESIGN}
    assert td.design_info({"selections": {}}) is None and td.design_info(None) is None


def test_a_design_made_signed_in_is_its_accounts_and_a_guests_is_whoever_holds_it():
    assert td.may_buy(design(), "c1", "u1") and td.may_buy(design(), None, None)
    mine = design(company_id="c1", user_id="u1")
    assert td.may_buy(mine, "c1", "u2")                 # anybody buying for the same company
    assert not td.may_buy(mine, "c2", "u1") and not td.may_buy(mine, None, None)
    alone = design(user_id="u1")
    assert td.may_buy(alone, None, "u1") and not td.may_buy(alone, "c9", "u2")


# ── On the order ────────────────────────────────────────────────────────────

async def test_the_order_gets_a_line_per_shirt_colour_and_size_on_its_blank_and_one_for_names():
    roster = [{"line": f"{TEE}:black", "size": "M", "name": "SMITH", "number": "7"}]
    snap = snap_of(roster=roster)
    items = await td.order_items(FakeDb(), snap)
    shirts, names = items[:-1], items[-1]
    assert [(x["color"], x["size"], x["quantity"]) for x in shirts] == \
        [("Black", "S", 4), ("Black", "M", 4), ("Black", "2XL", 2), ("Sport Grey", "M", 2)]
    first = shirts[0]
    assert first["variant_id"] == uuid.UUID(V["Black|S"]) and first["product_id"] == uuid.UUID(TEE)
    assert first["product_name"] == "Gildan 5000 · Custom design TS-AB-2611-0007" and first["sku"] == "SKU-Black-S"
    assert (first["unit_price"], first["line_total"]) == (Decimal("17.50"), Decimal("70.00"))
    assert first["configuration"]["tshirt_design"] == {"id": DESIGN, "reference": "TS-AB-2611-0007",
                                                       "name": "Team tees", "method": "print",
                                                       "sides": ["front", "back"], "per_side": 5.5}
    assert names["variant_id"] is None and names["sku"] == "TS-NAMES" and names["line_total"] == Decimal("7.00")
    assert sum(x["line_total"] for x in items) == Decimal(str(snap["total"]))


async def test_no_names_line_when_nobody_is_named():
    items = await td.order_items(FakeDb(), snap_of())
    assert all(x["sku"] != "TS-NAMES" for x in items) and len(items) == 4


async def test_the_carts_snapshot_stands_only_when_a_card_has_already_paid(monkeypatch):
    async def cannot(*_a, **_k):
        raise td.DesignerError("A product in this design is no longer offered. Remove it and choose another.")

    async def in_stock(*_a, **_k):
        return None

    monkeypatch.setattr(td, "for_cart", cannot)
    monkeypatch.setattr(td, "stock_problem", in_stock)
    kept = snap_of()
    with pytest.raises(td.DesignerError):
        await td.lines_for_order(FakeDb(), "t", design(), kept, charged=False)
    with pytest.raises(td.DesignerError):
        await td.lines_for_order(FakeDb(), "t", design(), None, charged=True)
    lines, used = await td.lines_for_order(FakeDb(), "t", design(), kept, charged=True)
    assert used is kept and sum(x["line_total"] for x in lines) == Decimal("204.00")


async def test_blanks_that_ran_out_stop_the_order_like_any_line(monkeypatch):
    async def priced(*_a, **_k):
        return snap_of()

    async def short(_db, _lines, *, lock=False):
        assert lock, "the rows are held until the order is made"
        return "Only 3 of Gildan 5000 in Black, size S left in stock."

    monkeypatch.setattr(td, "for_cart", priced)
    monkeypatch.setattr(td, "stock_problem", short)
    with pytest.raises(InsufficientStockError) as e:
        await td.lines_for_order(FakeDb(), "t", design(), None, charged=True)
    assert "Only 3" in str(e.value)


# ── Paid for: the artwork may change, nothing else ──────────────────────────

def test_a_paid_design_may_change_its_artwork_and_nothing_else():
    before = td.bought(doc())
    new_art = doc(designs={f"{TEE}:black": {"front": [{"type": "image", "src": "new"}], "back": [{"type": "text"}],
                                             "left": [], "right": []},
                           f"{TEE}:sport-grey": {"front": [{"type": "image"}], "back": [], "left": [], "right": []}})
    assert td.bought(new_art) == before
    assert td.bought(doc(quantities={f"{TEE}:black": {"S": 5, "M": 4, "2XL": 2}, f"{TEE}:sport-grey": {"M": 2}})) != before
    assert td.bought(doc(designs={**doc()["designs"], f"{TEE}:sport-grey": {
        "front": [{"type": "text"}], "back": [{"type": "text"}], "left": [], "right": []}})) != before
    assert td.bought(doc(method="embroidery")) != before
    assert td.bought(doc(roster=[{"line": f"{TEE}:black", "size": "M", "name": "A", "number": ""}])) != before
    # A size left at nought is no size at all.
    assert td.bought(doc(quantities={**doc()["quantities"], f"{TEE}:sport-grey": {"M": 2, "S": 0}})) == before


# ── In Production ───────────────────────────────────────────────────────────

def order(**over):
    base = {"id": "o1", "order_number": "1042", "status": "confirmed", "payment_status": "paid",
            "payment_method": "card", "shipping_method": "standard", "created_at": "2026-11-06T10:00:00+00:00"}
    base.update(over)
    return base


def row(status, the_order=None):
    d = NS(id=uuid.UUID(DESIGN), reference="TS-AB-2611-0007", status=status, name="Team tees", total_qty=12,
           quoted_total=Decimal("204.00"), contact_name=None, contact_email="a@b.co", revision_count=0,
           updated_at=None, method="print")
    return pb.design_row(d, the_order, company="Acme Sports")


@pytest.mark.parametrize("status, column, action", [
    ("in_review", "review", "review"), ("revision_requested", "review", "open"), ("approved", "approved", "start"),
    ("production", "production", "finish"), ("completed", "ready", "order"),
])
def test_an_ordered_design_moves_along_the_production_board_like_a_sheet(status, column, action):
    r = row(status, order())
    assert (r["kind"], r["column"], r["next"]["key"]) == ("tshirt_design", column, action)
    assert (r["quantity"], r["subtotal"], r["customer"], r["order_number"], r["paid"]) == \
        (12, 204.0, "Acme Sports", "1042", True)


def test_a_design_nobody_ordered_is_a_draft_and_off_the_board():
    r = row("submitted", None)
    assert (r["stage"], r["column"], r["paid"]) == ("draft", None, False)
    assert pb.board([r], 0, 0, None)["counts"]["queue"] == 0


# ── Ordering again ──────────────────────────────────────────────────────────

async def test_ordering_again_never_puts_a_designs_blanks_in_the_cart():
    from app.services.order_service import OrderService

    svc = OrderService(FakeDb())

    async def the_order(*_a, **_k):
        return NS(items=[NS(sku="SKU-Black-S", variant_id=uuid.UUID(V["Black|S"]), quantity=4,
                            configuration={"tshirt_design": {"id": DESIGN}})])

    svc.get_order = the_order
    out = await svc.reorder(uuid.uuid4(), uuid.uuid4())
    assert out == {"added": [], "skipped": [{"sku": "SKU-Black-S", "reason": "custom_design"}]}
