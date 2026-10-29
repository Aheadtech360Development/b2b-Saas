"""Loyalty points and buyer referrals (Retail launch, package 5): the shop's
rules, what an order earns, who can be referred, the emails and who may do
what. The ledger (earn, reverse in proportion, redeem, adjust, expire,
referrals settled or blocked) is checked against the local database through
the API separately: it needs row locks."""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import loyalty as lo


def test_settings_start_off_and_keep_what_makes_sense():
    assert lo.clean_settings(None)["enabled"] is False
    s = lo.clean_settings({"enabled": True, "points_per_dollar": 3, "expiry_months": 0, "program_name": " VIP ",
                           "tiers": [{"points": 500, "reward": "35"}, {"points": 100, "reward": 5.5},
                                     {"points": 100, "reward": 9}, {"points": -1, "reward": 5}, "junk"]})
    assert s["points_per_dollar"] == 3 and s["expiry_months"] == 0 and s["program_name"] == "VIP"
    assert s["tiers"] == [{"points": 100, "reward": 9}, {"points": 500, "reward": 35}]
    assert lo.clean_settings({"points_per_dollar": 0})["points_per_dollar"] == 1
    assert lo.clean_settings({"points_per_dollar": 2.5})["points_per_dollar"] == 1


@pytest.mark.parametrize("changes", [{"points_per_dollar": 0}, {"points_per_dollar": 101}, {"expiry_months": 61},
                                     {"tiers": [{"points": 100, "reward": 0}]}, {"tiers": "no"},
                                     {"tiers": [{"points": 100, "reward": 5}, {"points": 100, "reward": 6}]}])
def test_rules_that_would_be_dropped_are_refused(changes):
    with pytest.raises(lo.LoyaltyError):
        lo.check_settings(changes)


def _order(**kw):
    base = dict(total=Decimal("30"), shipping_cost=Decimal("6"), tax_amount=Decimal("0"), payment_status="paid",
                status="pending", placed_by_id="u1", payment_method="card", order_number="1051")
    base.update(kw)
    return SimpleNamespace(**base)


def test_an_order_earns_on_the_goods_only():
    conf = lo.clean_settings({"points_per_dollar": 2})
    assert lo.points_for(_order(), conf) == 48
    assert lo.points_for(_order(tax_amount=Decimal("2.40"), total=Decimal("32.40")), conf) == 48
    # Gift cards bought on the order earn nothing.
    assert lo.points_for(_order(total=Decimal("80")), conf, gift_cards_bought=Decimal("50")) == 48
    assert lo.points_for(_order(total=Decimal("5"), shipping_cost=Decimal("6")), conf) == 0
    assert lo.points_for(_order(total=Decimal("10.99"), shipping_cost=0), lo.clean_settings({})) == 10


@pytest.mark.parametrize("change", [{"payment_status": "unpaid"}, {"status": "cancelled"}, {"status": "refunded"},
                                    {"placed_by_id": None}, {"payment_method": "no_charge"},
                                    {"order_number": "DRAFT-12"}])
def test_unpaid_cancelled_guest_and_no_charge_orders_earn_nothing(change):
    assert lo.earns(_order()) is True
    assert lo.earns(_order(**change)) is False


def test_the_same_person_by_email():
    assert lo.same_email("Sam.Lee+shop@gmail.com", "samlee@googlemail.com")
    assert lo.same_email("SAM@example.com", "sam+x@example.com")
    assert not lo.same_email("sam.lee@example.com", "samlee@example.com")
    assert not lo.same_email(None, "a@b.co")


def test_the_same_delivery_address():
    a = '{"line1": "1 Main St.", "postal_code": "75201-1234"}'
    b = {"line1": "1 main st", "postal_code": "75201"}
    assert lo._place(a) == lo._place(b)
    assert lo._place({"line1": "2 Main St", "postal_code": "75201"}) != lo._place(a)
    assert lo._place("not json") is None and lo._place({"line1": "x"}) is None


def test_the_points_emails(monkeypatch):
    from app.services import mail_layout, mails

    monkeypatch.setattr(mail_layout, "shop_identity", lambda: ("Shop", "", "#0F766E", ""))
    subject, html = mails.points_earned(points=48, balance=128, points_name="stars", program="<b>VIP</b>",
                                        order_number="1051", rewards_url="https://s.example/account/rewards")
    assert subject == "You earned 48 stars" and "128" in html and "<b>VIP</b>" not in html
    subject, html = mails.points_expiring(points=20, expires_on="2026-11-12", points_name="points",
                                          program="Rewards", rewards_url="https://s.example/account/rewards")
    assert "November 12, 2026" in subject and "20" in html


def test_who_may_do_what():
    from app.core.features import PLAN_FEATURES, feature_for_path
    from app.core.permissions import can_access

    assert all("loyalty" in f for f in PLAN_FEATURES.values())
    assert feature_for_path("/api/v1/account/rewards/redeem", public=True) == "loyalty"
    assert feature_for_path("/api/v1/admin/loyalty/accounts") == "loyalty"
    marketing = {"discounts": "write"}
    assert can_access("custom", "/api/v1/admin/loyalty/settings", "PUT", marketing)
    assert not can_access("custom", "/api/v1/admin/loyalty/accounts/x/adjust", "POST", marketing)
    assert can_access("custom", "/api/v1/admin/loyalty/accounts/x/adjust", "POST", {**marketing, "billing": "write"})


def test_a_reward_code_is_its_buyers_own():
    import inspect

    from app.api.v1 import discounts

    src = inspect.getsource(discounts.validate_discount_code)
    assert "owner_user_id" in src and "another account" in src
