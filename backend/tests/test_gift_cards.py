"""Gift cards (Retail launch, package 3): codes, settings, how a total is
split between gift cards and a card, refunds, the emails and who may do what.
Ledger writes, holds and races are checked against the local database
separately (they need row locks)."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import gift_card_checkout as gcc
from app.services import gift_cards as gc

D = Decimal
T1, T2 = uuid.uuid4(), uuid.uuid4()


# ── Codes ──────────────────────────────────────────────────────────────────

def test_a_code_is_16_crockford_characters_and_never_the_same():
    codes = {gc.new_code() for _ in range(2000)}
    assert len(codes) == 2000
    for c in list(codes)[:200]:
        assert len(c) == 16 and set(c) <= set(gc.ALPHABET)
        assert not set(c) & set("ILOU")


def test_a_code_reads_however_it_is_typed():
    code = "7K3M9QX24PZ8T1VB"
    assert gc.normalize("7k3m-9qx2-4pz8-t1vb") == code
    assert gc.normalize(" 7K3M 9QX2 4PZ8 T1VB ") == code
    # O for 0 and I or L for 1, as people type them.
    assert gc.normalize("7K3M-9QX2-4PZ8-TIVB") == code
    assert gc.normalize("7K3M-9QX2-4PZ8-TLVB") == code
    assert gc.normalize("O000-0000-0000-0000") == "0" * 16
    assert gc.display(code) == "7K3M-9QX2-4PZ8-T1VB"


@pytest.mark.parametrize("raw", ["", "SHORT", "7K3M9QX24PZ8T1VBX", "7K3M9QX24PZ8T1V!", "U" * 16, None, 12345,
                                 "x" * 100])
def test_what_cannot_be_a_code_is_refused_before_any_lookup(raw):
    assert gc.normalize(raw) is None


def test_the_same_code_hashes_differently_in_two_shops_and_is_never_kept_plain():
    code = gc.new_code()
    h1, h2 = gc.code_hash(T1, code), gc.code_hash(T2, code)
    assert h1 != h2 and len(h1) == 64 and code not in h1
    assert gc.code_hash(T1, code) == h1
    assert gc.masked("T1VB") == "•••• T1VB"


# ── Settings ───────────────────────────────────────────────────────────────

def test_settings_start_off_and_keep_only_what_makes_sense():
    assert gc.clean_settings(None)["enabled"] is False
    s = gc.clean_settings({"enabled": True, "amounts": [100, "25", 25, 0, 5000, "x", 50.5],
                           "custom": True, "custom_min": 5, "custom_max": 300, "expiry_months": 12,
                           "message": "  Hi  "})
    assert s["amounts"] == [25, 50.5, 100]
    assert (s["custom_min"], s["custom_max"]) == (5.0, 300.0)
    assert s["expiry_months"] == 0          # under 5 years: not allowed, stays "never"
    assert s["message"] == "Hi"
    assert gc.clean_settings({"expiry_months": 60})["expiry_months"] == 60
    assert gc.clean_settings({"custom_min": 300, "custom_max": 5})["custom_min"] == 10   # wrong way round: default


@pytest.mark.parametrize("changes", [
    {"amounts": [0]}, {"amounts": [2500]}, {"amounts": list(range(1, 11))},
    {"custom_min": 50, "custom_max": 10}, {"expiry_months": 24}, {"expiry_months": True},
])
def test_settings_that_would_be_dropped_are_refused_in_words(changes):
    with pytest.raises(gc.GiftCardError):
        gc.check_settings(changes)


def test_a_bought_card_is_one_of_the_shops_amounts_or_in_its_range():
    conf = gc.clean_settings({"enabled": True, "amounts": [25, 50], "custom": False})
    assert gc.check_amount(conf, "50") == D("50.00")
    with pytest.raises(gc.GiftCardError):
        gc.check_amount(conf, 30)
    conf = gc.clean_settings({"enabled": True, "amounts": [25], "custom": True, "custom_min": 10, "custom_max": 200})
    assert gc.check_amount(conf, "37.5") == D("37.50")
    for bad in (5, 250, "abc", None):
        with pytest.raises(gc.GiftCardError):
            gc.check_amount(conf, bad)


def test_expiry_is_never_or_years_away():
    now = datetime(2026, 10, 29, tzinfo=timezone.utc)
    assert gc.expiry_from({"expiry_months": 0}, now) is None
    five = gc.expiry_from({"expiry_months": 60}, now)
    assert timedelta(days=1825) <= five - now <= timedelta(days=1827)


def test_a_card_that_cannot_pay_says_why_and_hides_whether_it_exists():
    now = datetime.now(timezone.utc)
    card = SimpleNamespace(status="active", expires_at=None, balance=D("10"))
    assert gc.usable_problem(card, now) is None
    assert gc.usable_problem(None, now) == gc.NOT_VALID
    for status in ("disabled", "voided", "expired"):
        assert gc.usable_problem(SimpleNamespace(status=status, expires_at=None, balance=D("10")), now) == gc.NOT_VALID
    assert gc.usable_problem(SimpleNamespace(status="active", expires_at=now - timedelta(seconds=1),
                                             balance=D("10")), now) == gc.NOT_VALID
    assert gc.usable_problem(SimpleNamespace(status="active", expires_at=None, balance=D("0")), now) == gc.NO_BALANCE


# ── Splitting a total ──────────────────────────────────────────────────────

def _cards(*balances):
    return [(f"c{i}", f"L{i:03d}", D(str(b))) for i, b in enumerate(balances)]


def _paid(taken):
    return [(t.card_id, t.amount) for t in taken]


def test_a_50_card_on_a_30_order_pays_it_all():
    taken = gcc._split(D("30.00"), _cards(50))
    assert _paid(taken) == [("c0", D("30.00"))]


def test_a_50_card_on_an_80_order_leaves_30_for_the_card():
    tender = gcc.Tender(total=D("80.00"), taken=gcc._split(D("80.00"), _cards(50)))
    assert tender.gift_total == D("50.00") and tender.remainder == D("30.00")
    assert tender.view()["gift_only"] is False and tender.view()["card_amount"] == 30.0


def test_cards_are_spent_in_the_order_entered_and_one_not_needed_is_not_touched():
    taken = gcc._split(D("60.00"), _cards(40, 50, 10))
    assert _paid(taken) == [("c0", D("40.00")), ("c1", D("20.00"))]


def test_the_card_charge_is_never_under_stripes_minimum():
    # $50.30 on a $50 card would leave 30 cents for the card: the gift card
    # pays 20 cents less, the card pays 50 cents.
    taken = gcc._split(D("50.30"), _cards(50))
    assert _paid(taken) == [("c0", D("49.80"))]
    assert D("50.30") - taken[0].amount == D("0.50")
    # A card that would be left with nothing is dropped.
    taken = gcc._split(D("50.40"), _cards(50, D("0.20")))
    assert sum(t.amount for t in taken) == D("49.90")
    assert [t.card_id for t in taken] == ["c0"]


def test_an_order_too_small_to_split_is_refused():
    with pytest.raises(gc.GiftCardError):
        gcc._split(D("0.40"), _cards(D("0.10")))


def test_the_payment_intent_carries_the_split_and_gives_it_back():
    tender = gcc.Tender(total=D("80"), taken=[gcc.Taken("a", "AAAA", D("50.00")), gcc.Taken("b", "BBBB", D("10.00"))],
                        checkout_ref="ref-12345678")
    meta = gcc.intent_meta(tender)
    assert meta["gift_card_total"] == "60.00" and meta["checkout_ref"] == "ref-12345678"
    assert gcc.planned(meta) == [("a", D("50.00")), ("b", D("10.00"))]
    assert gcc.intent_meta(gcc.Tender(total=D("5"))) == {}
    assert gcc.planned({}) == [] and gcc.planned({"gift_cards": "junk;x:y"}) == []


def test_codes_entered_are_kept_once_and_at_most_five():
    code = gc.new_code()
    assert gcc.clean_codes([code, gc.display(code).lower(), " "]) == [code]
    with pytest.raises(gc.GiftCardError):
        gcc.clean_codes([gc.new_code() for _ in range(6)])
    with pytest.raises(gc.GiftCardError):
        gcc.clean_codes("not a list")


@pytest.mark.parametrize("ref", ["", "short", "has space in it", "x" * 101, "<script>alert</script>"])
def test_a_checkout_reference_must_look_like_one(ref):
    with pytest.raises(gc.GiftCardError):
        gcc.clean_ref(ref)
    assert gcc.clean_ref(str(uuid.uuid4()))


def test_a_gift_card_cannot_buy_a_gift_card():
    with pytest.raises(gc.GiftCardError, match="another gift card"):
        asyncio.run(gcc.take(None, tenant_id=T1, codes=[gc.new_code()], total=D("50"),
                             checkout_ref=str(uuid.uuid4()), visitor="1.2.3.4", buying_gift_cards=True))


# ── Buying one ─────────────────────────────────────────────────────────────

def test_a_gift_card_line_checks_who_it_goes_to():
    d = gcc.line_details(amount=D("50.00"), recipient_email=" Ann@Example.com ", recipient_name=" Ann ",
                         message="Happy\nbirthday", sender_name="Bo")
    assert d == {"amount": "50.00", "recipient_email": "ann@example.com", "recipient_name": "Ann",
                 "message": "Happy\nbirthday", "sender_name": "Bo"}
    line = gcc.order_line(d)
    assert line["sku"] == gcc.GIFT_SKU and line["variant_id"] is None and line["quantity"] == 1
    assert line["line_total"] == D("50.00") and line["configuration"]["gift_card"] == d
    assert gcc.is_gift_line(SimpleNamespace(sku="GIFT-CARD", configuration={"gift_card": d}))
    assert not gcc.is_gift_line(SimpleNamespace(sku="GIFT-CARD", configuration={}))
    assert gcc.label_for(d) == "Gift card 50.00 for Ann"


@pytest.mark.parametrize("email", ["", "nope", "a@b", "a b@c.com", "x@y.com\r\nBcc: z@q.com", "<a@b.com>",
                                   "a@b.com,c@d.com"])
def test_a_recipient_email_that_could_go_elsewhere_is_refused(email):
    with pytest.raises(gc.GiftCardError):
        gcc.line_details(amount=D("10"), recipient_email=email)


def test_a_long_message_is_refused_and_control_characters_dropped():
    with pytest.raises(gc.GiftCardError):
        gcc.line_details(amount=D("10"), recipient_email="a@b.co", message="x" * 501)
    d = gcc.line_details(amount=D("10"), recipient_email="a@b.co", message="hi\x00\x07 there", sender_name="B\x1bo")
    assert d["message"] == "hi there" and d["sender_name"] == "Bo"


def test_the_recipients_email_carries_the_code_and_escapes_what_the_buyer_typed(monkeypatch):
    from app.services import mail_layout, mails

    monkeypatch.setattr(mail_layout, "shop_identity", lambda: ("Shop", "", "#0F766E", ""))
    subject, html = mails.gift_card_received(
        amount=D("50"), code="7K3M-9QX2-4PZ8-T1VB", recipient_name="<b>Ann</b>",
        sender_name="Bo", message="<script>x()</script>", shop_url="https://s.example/",
        balance_url="https://s.example/gift-cards/balance", expires_on=None,
    )
    assert subject == "Bo sent you a $50.00 gift card"
    assert "7K3M-9QX2-4PZ8-T1VB" in html
    assert "<script>" not in html and "&lt;script&gt;" in html and "<b>Ann</b>" not in html
    subject, html = mails.gift_card_sent(amount=D("50"), recipient_email="ann@example.com", last4="T1VB",
                                         order_number="1042", order_url="https://s.example/o")
    assert "7K3M" not in html and "T1VB" in html


# ── Refunds ────────────────────────────────────────────────────────────────

def _order(total, *, pi="pi_1"):
    return SimpleNamespace(id=uuid.uuid4(), total=D(str(total)), stripe_payment_intent_id=pi, order_number="1001")


def _fake(monkeypatch, *, gift_paid=0, gift_back=0, card_back=0, sold=()):
    async def payments(db, order_id):
        return {"cards": [{"card_id": "g", "last4": "GGGG", "amount": float(gift_paid), "refunded": float(gift_back)}]
                if gift_paid else [], "paid": float(gift_paid), "refunded": float(gift_back)}

    async def sold_on(db, order_id):
        return list(sold)

    async def stripe_back(db, order_id):
        return D(str(card_back))

    async def lock(db, card_id):
        return next(c for c in sold if c.id == card_id)

    monkeypatch.setattr(gcc, "order_payments", payments)
    monkeypatch.setattr(gcc, "sold_on_order", sold_on)
    monkeypatch.setattr(gcc, "_stripe_refunded", stripe_back)
    monkeypatch.setattr(gc, "_lock", lock)


def test_a_refund_goes_to_the_card_first_then_the_gift_card(monkeypatch):
    _fake(monkeypatch, gift_paid=50)
    plan = asyncio.run(gcc.split_refund(None, _order(80), D("20")))
    assert (plan.card, plan.gift) == (D("20.00"), D("0.00"))
    plan = asyncio.run(gcc.split_refund(None, _order(80), D("80")))
    assert (plan.card, plan.gift) == (D("30.00"), D("50.00"))


def test_after_the_card_is_refunded_the_rest_goes_to_the_gift_card(monkeypatch):
    _fake(monkeypatch, gift_paid=50, card_back=30)
    plan = asyncio.run(gcc.split_refund(None, _order(80), D("10")))
    assert (plan.card, plan.gift) == (D("0.00"), D("10.00"))


def test_an_order_paid_by_gift_card_alone_refunds_to_the_gift_card(monkeypatch):
    _fake(monkeypatch, gift_paid=30)
    plan = asyncio.run(gcc.split_refund(None, _order(30, pi=None), D("30")))
    assert (plan.card, plan.gift) == (D("0.00"), D("30.00"))


def _sold(value, *, balance=None, status="active"):
    return SimpleNamespace(id=uuid.uuid4(), initial_amount=D(str(value)),
                           balance=D(str(value if balance is None else balance)), status=status,
                           status_reason=None, code_last4="SOLD")


def test_a_sold_card_is_refunded_whole_and_only_unused(monkeypatch):
    card = _sold(50)
    _fake(monkeypatch, sold=[card])
    # $30 of goods and a $50 gift card on one order.
    plan = asyncio.run(gcc.split_refund(None, _order(80), D("30")))
    assert plan.void_cards == [] and plan.card == D("30.00")
    plan = asyncio.run(gcc.split_refund(None, _order(80), D("80")))
    assert plan.void_cards == [card]
    with pytest.raises(gc.GiftCardError, match="refunded whole"):
        asyncio.run(gcc.split_refund(None, _order(80), D("40")))


def test_a_used_sold_card_is_not_refundable(monkeypatch):
    _fake(monkeypatch, sold=[_sold(50, balance=20)])
    with pytest.raises(gc.GiftCardError, match="used or closed"):
        asyncio.run(gcc.split_refund(None, _order(80), D("80")))
    # The goods still are.
    plan = asyncio.run(gcc.split_refund(None, _order(80), D("30")))
    assert plan.card == D("30.00") and plan.void_cards == []


# ── Who may do what ────────────────────────────────────────────────────────

def test_gift_cards_are_in_every_plan_and_gated_where_used():
    from app.core.features import PLAN_FEATURES, feature_for_path

    assert all("gift_cards" in feats for feats in PLAN_FEATURES.values())
    assert feature_for_path("/api/v1/admin/gift-cards") == "gift_cards"
    assert feature_for_path("/api/v1/storefront/gift-cards/balance", public=True) == "gift_cards"
    assert feature_for_path("/api/v1/cart/gift-card", public=True) == "gift_cards"
    # Paying with one is checkout's own check, not a path gate.
    assert feature_for_path("/api/v1/checkout/intent", public=True) is None


def test_issuing_or_changing_a_card_needs_billing_as_well_as_marketing():
    from app.core.permissions import can_access

    marketing = {"discounts": "write"}
    both = {"discounts": "write", "billing": "write"}
    assert can_access("custom", "/api/v1/admin/gift-cards", "GET", marketing)
    assert can_access("custom", "/api/v1/admin/gift-cards/settings", "PUT", marketing)
    for path in ("/api/v1/admin/gift-cards", "/api/v1/admin/gift-cards/x/adjust",
                 "/api/v1/admin/gift-cards/x/status", "/api/v1/admin/gift-cards/x/resend"):
        assert not can_access("custom", path, "POST", marketing), path
        assert can_access("custom", path, "POST", both), path


def test_the_shops_gift_card_setting_is_kept_per_shop():
    from app.core.tenant_settings import TENANT_SCOPED_KEYS

    assert gc.SETTINGS_KEY in TENANT_SCOPED_KEYS
