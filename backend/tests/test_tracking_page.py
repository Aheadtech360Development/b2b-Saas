"""The buyer's tracking page (services/tracking_page) and the courier names the
tracking loop can ask Shippo about. What the page may show is the point: never
a street, a name or a phone, whoever asks."""
import json
from types import SimpleNamespace

from app.core.features import PLAN_FEATURES, feature_for_path
from app.services import mails, tracking_page as tp
from app.services.shippo_service import shippo_carrier

ADDRESS = json.dumps({"full_name": "Maya Ruiz", "line1": "12 Elm St", "line2": "Apt 4", "city": "Austin",
                      "state": "TX", "postal_code": "78701", "phone": "512-555-0100"})


def order(**kw):
    base = dict(order_number="1042", status="shipped", payment_status="paid", amount_paid=48,
                shipping_address_snapshot=ADDRESS, created_at=None, tenant_id="t", id="o",
                guest_email="maya@example.com", placed_by_id=None, tracking_number="1Z", tracking_url=None,
                courier="UPS", carrier="UPS", courier_service="Ground", total=48)
    base.update(kw)
    return SimpleNamespace(**base)


def test_the_page_says_where_it_goes_as_city_state_and_postcode_only():
    shown = tp.place(order())
    assert shown == {"city": "Austin", "state": "TX", "postal_code": "78701", "country": "US"}
    text = json.dumps(shown)
    for secret in ("Maya", "Elm", "Apt", "555"):
        assert secret not in text


def test_an_order_without_parcels_still_shows_how_far_it_is():
    done = lambda o: [s["key"] for s in tp.order_steps(o) if s["done"]]  # noqa: E731
    assert done(order(status="confirmed")) == ["paid"]
    assert done(order(status="processing")) == ["paid"]
    assert done(order(status="shipped")) == ["paid", "packed", "shipped"]
    assert done(order(status="delivered")) == ["paid", "packed", "shipped", "out_for_delivery", "delivered"]
    assert done(order(status="pending", payment_status="unpaid", amount_paid=0)) == []


def test_settings_are_on_by_default_and_the_message_is_kept_short():
    assert tp.clean_settings(None) == {"enabled": True, "message": ""}
    got = tp.clean_settings({"enabled": False, "message": "  Ships Mon-Fri. " + "x" * 500, "other": 1})
    assert got["enabled"] is False and len(got["message"]) == tp.MESSAGE_MAX and "other" not in got
    assert tp.clean_settings({"enabled": "no"})["enabled"] is True


def test_every_plan_has_the_page_and_its_public_route_is_gated_by_it():
    for plan in ("retail", "starter", "wholesale", "scale"):
        assert "order_tracking" in PLAN_FEATURES[plan], plan
    assert feature_for_path("/api/v1/storefront/track", public=True) == "order_tracking"
    assert feature_for_path("/api/v1/storefront/track/1042", public=True) == "order_tracking"


def test_courier_names_shippo_can_track():
    assert shippo_carrier("USPS") == "usps" and shippo_carrier("usps_priority") == "usps"
    assert shippo_carrier("UPS Ground") == "ups"
    assert shippo_carrier("FedEx 2Day") == "fedex"
    assert shippo_carrier("DHL Express") == "dhl_express"
    assert shippo_carrier("Our own van") is None and shippo_carrier(None) is None


def test_the_shipped_and_delivered_mails_point_at_the_tracking_page():
    track = "https://shop.printcopilot.co/track/1042#k=abc"
    _, html = mails.order_shipped(order(), order_url="https://x/o", track_url=track)
    assert track in html and "Track your order" in html
    _, html = mails.order_update(order(status="delivered"), status="delivered", label="Delivered",
                                 order_url="https://x/o", track_url=track)
    assert track in html
    # Without the page (turned off), the courier's link as before.
    _, html = mails.order_shipped(order(tracking_url="https://ups/1Z"), order_url="https://x/o")
    assert "https://ups/1Z" in html and "Track your package" in html
