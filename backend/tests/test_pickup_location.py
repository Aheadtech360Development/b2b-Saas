"""Where a will-call order is collected: each shop's own answer.

The checkout showed the shop's ship-from address with nothing in the admin
saying so, and the "ready for pickup" mail carried one shop's street and
opening hours printed in the template. A shop now sets its pickup location,
hours and note; until it does, its ship-from address stands, as before.
No database or network.
"""
import inspect
import json
from pathlib import Path

from app.core import tenant_settings
from app.services import pickup

SHIP_FROM = json.dumps({"name": "Acme Warehouse", "street1": "10 Dock Rd", "city": "Dallas", "state": "TX",
                        "zip": "75243", "phone": "2145550100"})


def test_a_shop_that_set_nothing_keeps_its_ship_from_address():
    place = pickup.resolve(None, SHIP_FROM)
    assert place == {"name": "Acme Warehouse", "address": "10 Dock Rd, Dallas, TX 75243", "hours": "", "note": ""}
    # The carrier's phone number is not for the checkout.
    assert "2145550100" not in json.dumps(place)


def test_its_own_pickup_location_replaces_it():
    own = json.dumps({"name": "Acme Shop Counter", "street1": "5 Main St", "city": "Garland", "state": "TX",
                      "zip": "75040", "hours": "Mon to Fri, 9 AM to 5 PM", "note": "Bring a photo ID"})
    assert pickup.resolve(own, SHIP_FROM) == {
        "name": "Acme Shop Counter", "address": "5 Main St, Garland, TX 75040",
        "hours": "Mon to Fri, 9 AM to 5 PM", "note": "Bring a photo ID",
    }


def test_hours_alone_go_with_the_ship_from_address_not_instead_of_it():
    place = pickup.resolve(json.dumps({"hours": "Sat only, 10 to 2", "note": ""}), SHIP_FROM)
    assert place["address"] == "10 Dock Rd, Dallas, TX 75243"
    assert place["name"] == "Acme Warehouse"
    assert place["hours"] == "Sat only, 10 to 2"


def test_nothing_saved_or_something_unreadable_says_nothing():
    empty = {"name": "", "address": "", "hours": "", "note": ""}
    assert pickup.resolve(None, None) == empty
    assert pickup.resolve("not json", "[1, 2]") == empty
    assert pickup.email_block(empty) == ""


def test_the_mail_block_carries_the_shops_words_safely():
    block = pickup.email_block({"name": "Acme <b>Shop</b>", "address": "5 Main St, Garland, TX 75040",
                                "hours": "Mon to Fri, 9 AM to 5 PM", "note": ""})
    assert "5 Main St, Garland, TX 75040" in block and "Mon to Fri, 9 AM to 5 PM" in block
    assert "<b>Shop</b>" not in block and "&lt;b&gt;Shop&lt;/b&gt;" in block


def test_the_setting_is_each_shops_own_and_the_admin_may_save_it():
    assert "pickup_location" in tenant_settings.TENANT_SCOPED_KEYS
    shop = "11111111-1111-1111-1111-111111111111"
    assert tenant_settings.scoped_key("pickup_location", shop) == f"pickup_location@{shop}"

    from app.api.v1.admin import settings as admin_settings

    assert '"pickup_location"' in inspect.getsource(admin_settings.update_platform_settings)


def test_no_shops_address_or_hours_are_printed_in_the_mail_any_more():
    template = (Path(__file__).resolve().parents[1] / "app" / "templates" / "emails" / "ready_for_pickup.html").read_text(encoding="utf-8")
    assert "Luna Rd" not in template and "9:00 AM" not in template
    assert "{{ pickup_address }}" in template and "{{ pickup_hours }}" in template

    # The mail that is actually sent when an order is marked ready says where to come.
    from app.api.v1.admin import orders as admin_orders

    src = inspect.getsource(admin_orders._send_order_status_email)
    assert 'new_status == "ready_for_pickup"' in src
    assert src.count("{pickup_block}") == 2   # a guest's mail and an account's
