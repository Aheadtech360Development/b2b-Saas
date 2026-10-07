"""The "Open payouts dashboard" button, for each kind of payment account.

It used to ask Stripe for a login link whatever the account. A login link
opens only the Express Dashboard, and a brand set up as a standard account
(STRIPE_CONNECT_STYLE=standard, which a platform whose Stripe profile carries
no negative balances must use) has the full Stripe Dashboard instead — so the
button answered "Cannot create an edit link for the account …, which does not
have access to the Express Dashboard." Now it opens whichever dashboard the
account has.

No database and no Stripe: `python -m pytest tests/test_connect_dashboard_link.py`.
"""
import pytest
import stripe

from app.services import connect_service, stripe_mode
from app.services.connect_service import ConnectService


class FakeStripe:
    def __init__(self, account):
        self.links = []
        outer = self

        class Account:
            @staticmethod
            def retrieve(account_id):
                assert account_id == "acct_brand"
                return stripe.Account.construct_from({"id": account_id, **account}, "sk_test")

            @staticmethod
            def create_login_link(account_id):
                if account.get("controller", {}).get("stripe_dashboard", {}).get("type", "express") != "express" \
                        and account.get("type") != "express":
                    raise stripe.InvalidRequestError(
                        f"Cannot create an edit link for the account {account_id}, which does not have "
                        "access to the Express Dashboard.", None)
                outer.links.append(account_id)
                return stripe.StripeObject.construct_from({"url": "https://connect.stripe.com/express/abc"}, "sk_test")

        self.Account = Account


@pytest.fixture
def brand(monkeypatch):
    def setup(account, mode=stripe_mode.LIVE):
        fake = FakeStripe(account)

        async def get_tenant(self, tenant_id):
            return {"id": tenant_id, "stripe_connect_account_id": "acct_brand"}

        async def keyed(db):
            return fake

        async def current(db):
            return mode

        monkeypatch.setattr(ConnectService, "_get_tenant", get_tenant)
        monkeypatch.setattr(connect_service, "_stripe_for", keyed)
        monkeypatch.setattr(stripe_mode, "current", current)
        return fake

    return setup


STANDARD = {"type": "none", "controller": {"stripe_dashboard": {"type": "full"}}}
EXPRESS = {"type": "none", "controller": {"stripe_dashboard": {"type": "express"}}}


async def test_a_standard_account_opens_the_full_stripe_dashboard(brand):
    fake = brand(STANDARD)
    out = await ConnectService(None).create_dashboard_link("t1")
    assert out == {"dashboard_url": "https://dashboard.stripe.com/payouts", "kind": "full"}
    assert fake.links == []  # no login link asked for: Stripe would refuse it


async def test_in_test_mode_it_opens_the_dashboards_test_data(brand):
    brand(STANDARD, mode=stripe_mode.TEST)
    out = await ConnectService(None).create_dashboard_link("t1")
    assert out["dashboard_url"] == "https://dashboard.stripe.com/test/payouts"


async def test_an_express_account_still_gets_its_login_link(brand):
    fake = brand(EXPRESS)
    out = await ConnectService(None).create_dashboard_link("t1")
    assert out == {"dashboard_url": "https://connect.stripe.com/express/abc", "kind": "express"}
    assert fake.links == ["acct_brand"]


async def test_accounts_from_before_controller_properties_say_it_by_type(brand):
    brand({"type": "standard"})
    assert (await ConnectService(None).create_dashboard_link("t1"))["kind"] == "full"
    fake = brand({"type": "express"})
    assert (await ConnectService(None).create_dashboard_link("t1"))["kind"] == "express" and fake.links


async def test_an_account_with_no_dashboard_says_so_plainly(brand):
    brand({"type": "custom", "controller": {"stripe_dashboard": {"type": "none"}}})
    with pytest.raises(ValueError, match="no Stripe dashboard of its own"):
        await ConnectService(None).create_dashboard_link("t1")
