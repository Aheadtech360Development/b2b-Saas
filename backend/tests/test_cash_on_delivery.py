"""Cash on delivery: a shop's own switch, asked again when the order is placed.

A customer of a shop that takes it can place an order now and pay when it
arrives; the order comes in unpaid. A shop that has not turned it on never
takes it, whatever the page sends. No database or network.
"""
import inspect
from types import SimpleNamespace

from app.api.v1 import checkout
from app.core import tenant_settings


async def test_a_shop_takes_cash_on_delivery_only_when_it_said_so(monkeypatch):
    answers = {"on": "true", "loud": " YES ", "off": "false", "never-set": None, "odd": "maybe"}

    async def get_setting(db, key, *, tenant_id=None, default=None):
        assert key == "cod_enabled"
        return answers[tenant_id]

    monkeypatch.setattr(tenant_settings, "get_setting", get_setting)
    assert await checkout.cod_offered(None, "on") is True
    assert await checkout.cod_offered(None, "loud") is True
    for shop in ("off", "never-set", "odd"):
        assert await checkout.cod_offered(None, shop) is False, shop
    # No shop on the request: nothing is offered.
    assert await checkout.cod_offered(None, None) is False


def test_the_switch_is_each_shops_own():
    """A plain settings key is one value for every shop on the platform; this
    one has to be namespaced, or one shop turning it on turns it on for all."""
    assert "cod_enabled" in tenant_settings.TENANT_SCOPED_KEYS
    shop = "11111111-1111-1111-1111-111111111111"
    assert tenant_settings.scoped_key("cod_enabled", shop) == f"cod_enabled@{shop}"

    from app.api.v1.admin import settings as admin_settings

    assert '"cod_enabled"' in inspect.getsource(admin_settings.update_platform_settings)


async def test_checkout_is_told_whether_the_shop_takes_it(monkeypatch):
    from app.services import connect_service

    class Connect:
        def __init__(self, db):
            pass

        async def get_status(self, tenant_id):
            return {"charges_enabled": True}

    async def offered(db, tenant_id):
        return tenant_id == "shop-with-cod"

    monkeypatch.setattr(connect_service, "ConnectService", Connect)
    monkeypatch.setattr(checkout, "cod_offered", offered)
    yes = await checkout.payment_options(SimpleNamespace(state=SimpleNamespace(tenant_id="shop-with-cod")), db=None)
    no = await checkout.payment_options(SimpleNamespace(state=SimpleNamespace(tenant_id="another-shop")), db=None)
    assert (yes["card"], yes["cod"]) == (True, True)
    assert (no["card"], no["cod"]) == (True, False)


def test_both_checkouts_ask_the_shop_before_taking_an_unpaid_order():
    """The page hiding the choice is not what stops somebody placing an order
    without paying. Each place an order is made asks the shop's switch first,
    and a card that did pay is never recorded as cash owed."""
    from app.api.v1 import guest

    signed_in = inspect.getsource(checkout._confirm_checkout_inner)
    assert 'payload.payment_method == "cod" and not has_stripe' in signed_in
    assert signed_in.index("await cod_offered(") < signed_in.index("order_svc.create_order(")

    as_guest = inspect.getsource(guest)
    branch = as_guest.index('payload.payment_method == "cod" and not payload.payment_intent_id')
    assert as_guest.index("await cod_offered(", branch) < as_guest.index("order = Order(", branch)
    assert '_payment_status = "unpaid"' in as_guest[branch:branch + 900]


def test_an_order_paid_on_delivery_comes_in_unpaid():
    from app.services import order_service

    src = inspect.getsource(order_service.OrderService.create_order)
    rule = src.index('_pm == "cod" and not confirm.payment_intent_id')
    assert '_payment_status = "unpaid"' in src[rule:rule + 120]
