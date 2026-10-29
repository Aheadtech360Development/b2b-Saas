"""The returns and exchanges portal (Retail launch, package 4): the shop's
settings, a guest's key to one order, what is final sale, what a refund may
come to, the buyer's emails and who may do what. The flows themselves (lookup,
start, approve, receive, refund, exchange) are checked against the local
database through the API separately."""
import asyncio
import time
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import returns_portal as rp


def test_settings_start_off_and_keep_what_makes_sense():
    assert rp.clean_settings(None)["enabled"] is False
    s = rp.clean_settings({"enabled": True, "window_days": 14, "reasons": ["Too big", "Too big", " ", "Other"],
                           "methods": ["exchange", "bitcoin"], "shipping_payer": "shop", "instructions": "  Post it  "})
    assert s["window_days"] == 14 and s["reasons"] == ["Too big", "Other"]
    assert s["methods"] == ["exchange"] and s["shipping_payer"] == "shop" and s["instructions"] == "Post it"
    assert rp.clean_settings({"window_days": 0})["window_days"] == 30
    assert rp.clean_settings({"methods": ["nope"]})["methods"] == ["original", "exchange"]


@pytest.mark.parametrize("changes", [{"window_days": 0}, {"window_days": 400}, {"window_days": True},
                                     {"methods": []}, {"methods": ["cash"]}, {"reasons": ["  "]}])
def test_settings_that_would_be_dropped_are_refused(changes):
    with pytest.raises(rp.ReturnError):
        rp.check_settings(changes)


def test_a_guests_key_opens_one_order_for_30_minutes():
    order = uuid.uuid4()
    token = rp.guest_token(order)
    assert rp.token_order(token) == str(order)
    assert rp.token_order(rp.guest_token(order, now=time.time() - 31 * 60)) is None
    other = uuid.uuid4()
    forged = f"{other}.{token.split('.')[1]}.{token.split('.')[2]}"
    assert rp.token_order(forged) is None
    for bad in (None, "", "x", "a.b.c", f"{order}.notanumber.sig"):
        assert rp.token_order(bad) is None


def _line(**kw):
    base = dict(variant_id=uuid.uuid4(), product_id=uuid.uuid4(), sku="TEE-L", configuration=None, item_type=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_what_is_final_sale():
    conf = rp.clean_settings({"made_to_order_final_sale": True})
    assert rp.final_sale_reason(_line(), conf) is None
    assert "Gift cards" in rp.final_sale_reason(_line(sku="GIFT-CARD", variant_id=None,
                                                      configuration={"gift_card": {"amount": "50"}}), conf)
    assert "Made to order" in rp.final_sale_reason(_line(variant_id=None, sku="CONFIGURED"), conf)
    assert rp.final_sale_reason(_line(variant_id=None, sku="CONFIGURED"),
                                rp.clean_settings({"made_to_order_final_sale": False})) is None
    pid = uuid.uuid4()
    assert rp.final_sale_reason(_line(product_id=pid), rp.clean_settings({"final_sale_product_ids": [str(pid)]})) == "Final sale."


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _DB:
    def __init__(self, rows):
        self.rows = rows

    async def execute(self, *_a, **_k):
        return _Rows(self.rows)


def _cap(rows, **order):
    o = SimpleNamespace(**{"subtotal": 100, "total": 100, "shipping_cost": 0, "tax_amount": 0, **order})
    return asyncio.run(rp.refund_cap(_DB(rows), SimpleNamespace(id="r"), o))


def test_a_refund_is_what_was_paid_for_the_items():
    # 1 of 2 tees at $8 on a $16 order: $8.
    assert _cap([(1, Decimal("8"), 2, Decimal("16"))], subtotal=16, total=16) == Decimal("8.00")
    # With 10% tax: its share of the tax too.
    assert _cap([(1, Decimal("8"), 2, Decimal("16"))], subtotal=16, tax_amount=Decimal("1.60"), total=Decimal("17.60")) == Decimal("8.80")
    # A $4 discount on a $16 order: the tee carries half of it.
    assert _cap([(1, Decimal("8"), 2, Decimal("16"))], subtotal=16, total=12) == Decimal("6.00")
    # Shipping is not part of it.
    assert _cap([(2, Decimal("8"), 2, Decimal("16"))], subtotal=16, shipping_cost=6, total=22) == Decimal("16.00")
    assert _cap([], subtotal=16, total=16) == Decimal("0.00")


def test_the_buyers_emails_escape_the_shops_words(monkeypatch):
    from app.services import mail_layout, mails

    monkeypatch.setattr(mail_layout, "shop_identity", lambda: ("Shop", "", "#0F766E", ""))
    subject, html = mails.return_update(rma_number="RMA-1", kind="return", status="approved", status_words="Approved",
                                        order_number="1051", note="<script>x</script>", instructions="<b>Post</b> it",
                                        shipping_payer="shop", returns_url="https://s.example/returns")
    assert subject == "Your return is approved (RMA-1)"
    assert "<script>" not in html and "&lt;script&gt;" in html and "&lt;b&gt;Post" in html
    assert "Return shipping is on us." in html
    _, html = mails.return_update(rma_number="RMA-2", kind="exchange", status="exchanged", status_words="Exchanged",
                                  order_number="1051", exchange_order_number="1052", difference=4,
                                  pay_url="https://s.example/pay")
    assert "Pay the difference" in html and "$4.00" in html
    _, html = mails.return_update(rma_number="RMA-3", kind="return", status="refunded", status_words="Refunded",
                                  order_number="1051", amount=8, store_credit_last4="06QX")
    assert "store credit" in html and "06QX" in html


def test_only_the_next_step_is_allowed():
    assert rp.NEXT["refund"][0] == {"approved", "received"}
    assert "pending" not in rp.NEXT["exchange"][0] and "closed" not in rp.NEXT["close"][0]


def test_who_may_do_what():
    from app.core.features import PLAN_FEATURES, feature_for_path
    from app.core.permissions import can_access

    assert all("returns_portal" in f for f in PLAN_FEATURES.values())
    assert feature_for_path("/api/v1/storefront/returns/lookup", public=True) == "returns_portal"
    assert feature_for_path("/api/v1/account/returns/eligible/x", public=True) == "returns_portal"
    orders_only = {"orders": "write"}
    assert can_access("custom", "/api/v1/admin/returns/x/approve", "POST", orders_only)
    assert can_access("custom", "/api/v1/admin/returns/x/receive", "POST", orders_only)
    for money_path in ("/api/v1/admin/returns/x/refund-items", "/api/v1/admin/returns/x/exchange"):
        assert not can_access("custom", money_path, "POST", orders_only)
        assert can_access("custom", money_path, "POST", {"orders": "write", "billing": "write"})
