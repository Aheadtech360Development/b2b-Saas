"""Cart upsells (services/upsells): the offer's price, when an offer holds,
which cart lines keep their offer price, and what can be offered at all.
A full run against the local database is in the PHR (offer → cart → order).
"""
import asyncio
from decimal import Decimal
from types import SimpleNamespace

from app.services import upsells
from app.services.upsells import Line


def run(coro):
    return asyncio.run(coro)


def offer(**kw):
    base = dict(id="o1", product_id="hoodie", discount_type="none", discount_value=Decimal("0"),
                trigger_kind="any", trigger_ids=[], min_subtotal=None, max_subtotal=None, is_active=True)
    return SimpleNamespace(**{**base, **kw})


def line(key, product, total, qty=1, offer_id=None):
    return Line(key=key, product_id=product, quantity=qty, line_total=Decimal(str(total)), offer_id=offer_id)


def test_the_offer_price():
    assert upsells.price_after(offer(discount_type="percent", discount_value=Decimal("10")), Decimal("58")) == Decimal("52.20")
    assert upsells.price_after(offer(discount_type="amount", discount_value=Decimal("5")), Decimal("58")) == Decimal("53.00")
    assert upsells.price_after(offer(discount_type="amount", discount_value=Decimal("80")), Decimal("58")) == Decimal("0.00")
    assert upsells.price_after(offer(discount_type="percent", discount_value=Decimal("150")), Decimal("58")) == Decimal("0.00")
    assert upsells.price_after(offer(), Decimal("58")) == Decimal("58.00")
    assert upsells.discount_words(offer(discount_type="percent", discount_value=Decimal("10"))) == "10% off"
    assert upsells.discount_words(offer(discount_type="amount", discount_value=Decimal("5"))) == "$5.00 off"
    assert upsells.discount_words(offer()) is None


def test_when_an_offer_holds():
    tee = [line("a", "tee", 100)]
    assert run(upsells.holds(None, offer(), tee))
    assert not run(upsells.holds(None, offer(), []))  # nothing else in the cart
    follows = offer(trigger_kind="products", trigger_ids=["tee"])
    assert run(upsells.holds(None, follows, tee))
    assert not run(upsells.holds(None, follows, [line("b", "mug", 100)]))
    ranged = offer(min_subtotal=Decimal("50"), max_subtotal=Decimal("120"))
    assert run(upsells.holds(None, ranged, tee))
    assert not run(upsells.holds(None, ranged, [line("a", "tee", 40)]))
    assert not run(upsells.holds(None, ranged, [line("a", "tee", 130)]))


class Db:
    """Answers the offers query with the offers given."""

    def __init__(self, offers):
        self.offers = offers

    async def execute(self, statement, params=None):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: list(self.offers)))


def test_a_line_keeps_its_offer_price_only_while_the_offer_applies():
    o = offer(id="3f1c0f43-41a7-4b0e-9f3c-2b5b8a1f0001", product_id="hoodie",
              discount_type="percent", discount_value=Decimal("10"), trigger_kind="products", trigger_ids=["tee"])
    oid = str(o.id)
    db = Db([o])
    cart = [line("t", "tee", 100), line("h", "hoodie", 58, offer_id=oid)]
    assert set(run(upsells.applying_lines(db, cart))) == {"h"}
    # The tee taken out: the hoodie is back at its usual price.
    assert run(upsells.applying_lines(db, [line("h", "hoodie", 58, offer_id=oid)])) == {}
    # An offer id pinned on another product prices nothing.
    assert run(upsells.applying_lines(db, [line("t", "tee", 100), line("m", "mug", 9, offer_id=oid)])) == {}
    # No offer lines: nothing to look up.
    assert run(upsells.applying_lines(db, [line("t", "tee", 100)])) == {}


def test_only_a_ready_made_product_is_added_in_one_click():
    ready = SimpleNamespace(pricing_mode="variant", gang_sheet_enabled=False, allow_design_upload=False, bulk_order=False)
    assert upsells.is_ready_made(ready)
    for change in ({"gang_sheet_enabled": True}, {"allow_design_upload": True}, {"pricing_mode": "configurable"},
                   {"bulk_order": True}):
        assert not upsells.is_ready_made(SimpleNamespace(**{**vars(ready), **change}))


class BracketDb:
    """Answers the free-bracket query; the standard shipping setting is unset."""

    def __init__(self, values):
        self.values = values

    async def execute(self, statement, params=None):
        sql = str(statement)
        if "shipping_brackets" in sql:
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: list(self.values)))
        return SimpleNamespace(scalar_one_or_none=lambda: None)


def test_the_free_shipping_line_is_one_the_buyers_shipping_really_has(monkeypatch):
    async def no_setting(db, key, **kw):
        return None

    import app.core.tenant_settings as ts
    monkeypatch.setattr(ts, "get_setting", no_setting)

    async def shipping(units, subtotal):  # free from $500 for this buyer
        return Decimal("0") if subtotal >= 500 else Decimal("12")

    out = run(upsells.free_shipping(BracketDb([Decimal("250"), Decimal("500")]), 3, Decimal("471"), shipping))
    # $250 is another tier's line, not this buyer's: skipped, because their shipping there is not free.
    assert out == {"threshold": "500.00", "reached": False}
    assert run(upsells.free_shipping(BracketDb([Decimal("500")]), 3, Decimal("520"), shipping)) == {"threshold": "500.00", "reached": True}
    assert run(upsells.free_shipping(BracketDb([]), 3, Decimal("10"), shipping)) is None
