"""An order's thank-you page: the key that opens it, who else it opens for,
and the address it shows.

Every order used to land on one /checkout/confirmed, drawn from what the
browser had kept, and a reload in a new tab sent the buyer to an empty cart.
Each order has its own page now, read back from the server: by the view key
its checkout answered with, or by the signed-in buyer's own sign-in.
No database or network.
"""
import json
import uuid
from types import SimpleNamespace

from app.services import order_view

SHOP_A, SHOP_B = uuid.uuid4(), uuid.uuid4()


def _order(**fields):
    base = {"id": uuid.uuid4(), "tenant_id": SHOP_A, "placed_by_id": None, "company_id": None}
    base.update(fields)
    return SimpleNamespace(**base)


def test_the_key_opens_its_own_order_and_no_other():
    mine, another = _order(), _order()
    key = order_view.view_key(mine.id, mine.tenant_id)
    assert order_view.key_opens(mine, key)
    assert not order_view.key_opens(another, key)


def test_the_key_belongs_to_one_shop():
    # Order numbers repeat from shop to shop; the key does not carry across.
    mine = _order()
    same_id_other_shop = _order(id=mine.id, tenant_id=SHOP_B)
    assert not order_view.key_opens(same_id_other_shop, order_view.view_key(mine.id, mine.tenant_id))


def test_no_key_or_a_wrong_one_opens_nothing():
    mine = _order()
    right = order_view.view_key(mine.id, mine.tenant_id)
    for key in (None, "", "0" * 40, right[:-1] + ("0" if right[-1] != "0" else "1"), right[:20]):
        assert not order_view.key_opens(mine, key)


def test_the_key_is_worked_out_again_not_stored():
    mine = _order()
    key = order_view.view_key(mine.id, mine.tenant_id)
    assert key == order_view.view_key(mine.id, mine.tenant_id)
    assert len(key) == 40
    # Pasted with a stray space, it still opens the page.
    assert order_view.key_opens(mine, f" {key} ")


def test_the_key_is_signed_with_the_sign_in_secret_too(monkeypatch):
    # APP_SECRET_KEY has a default in the code; the key must not rest on it alone.
    mine = _order()
    before = order_view.view_key(mine.id, mine.tenant_id)
    monkeypatch.setattr(order_view.settings, "JWT_SECRET_KEY", "another-sign-in-secret")
    assert order_view.view_key(mine.id, mine.tenant_id) != before


def test_a_signed_in_buyer_opens_their_own_orders_only():
    me, someone_else, my_company = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    retail = _order(placed_by_id=me)
    assert order_view.owned_by(retail, user_id=str(me), company_id=None, account_type="retail")
    assert not order_view.owned_by(retail, user_id=str(someone_else), company_id=None, account_type="retail")

    wholesale = _order(company_id=my_company)
    assert order_view.owned_by(wholesale, user_id=str(someone_else), company_id=str(my_company), account_type="wholesale")
    assert not order_view.owned_by(wholesale, user_id=str(me), company_id=str(uuid.uuid4()), account_type="wholesale")

    # Nobody signed in.
    assert not order_view.owned_by(retail, user_id=None, company_id=None, account_type=None)


def test_the_address_is_read_from_either_shape_of_the_saved_copy():
    at_checkout = json.dumps({"full_name": "Sara Khan", "line1": "5 Main St", "line2": "Suite 2", "city": "Dallas",
                              "state": "TX", "postal_code": "75201", "country": "US", "phone": "2145550100"})
    assert order_view._ship_to(at_checkout) == {
        "full_name": "Sara Khan", "line1": "5 Main St", "line2": "Suite 2", "city": "Dallas", "state": "TX",
        "postal_code": "75201", "country": "US", "phone": "2145550100",
    }
    older = json.dumps({"label": "Shipping", "address_line1": "9 Elm Ave", "city": "Plano", "state": "TX",
                        "zip_code": "75024"})
    copy = order_view._ship_to(older)
    assert (copy["line1"], copy["postal_code"], copy["country"]) == ("9 Elm Ave", "75024", "US")
    # "Shipping" names the address in the book, not the person.
    assert copy["full_name"] == ""


def test_no_address_rather_than_a_broken_one():
    for snapshot in (None, "", "not json", json.dumps({"city": "Dallas"}), json.dumps(["5 Main St"])):
        assert order_view._ship_to(snapshot) is None
