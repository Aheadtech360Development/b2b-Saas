"""The rewards program in the website builder (services/builder/resolve._loyalty).

What each test holds, in the owner's terms:
* A page showing the rewards program is handed the program's own numbers:
  its name, points per dollar, rewards, expiry and the referral offer.
* With the program off (or not in the plan) the page is told only that.
* Nothing of a buyer's is in it: their points and their link are their own.
* The three elements are known to the server, the product one only on a
  product template.
No database or network.
"""
import asyncio

from app.services import loyalty
from app.services.builder import resolve
from app.services.builder.schema import COMPONENTS


def run(coro):
    return asyncio.run(coro)


def test_the_page_gets_the_programs_own_numbers(monkeypatch):
    conf = {**loyalty.DEFAULTS, "enabled": True, "program_name": "Tee Club", "points_name": "stars",
            "points_per_dollar": 2, "referral_enabled": True, "referrer_points": 120, "friend_points": 60}

    async def active(db, tenant_id):
        return conf

    monkeypatch.setattr(loyalty, "active", active)
    out = run(resolve._loyalty(None, "t1"))
    assert out == {
        "on": True, "program_name": "Tee Club", "points_name": "stars", "points_per_dollar": 2,
        "expiry_months": 12, "tiers": loyalty.DEFAULTS["tiers"],
        "referral": {"you_get": 120, "friend_gets": 60},
    }

    conf["referral_enabled"] = False
    assert run(resolve._loyalty(None, "t1"))["referral"] is None


def test_a_program_that_is_off_says_only_that(monkeypatch):
    async def off(db, tenant_id):
        return None

    monkeypatch.setattr(loyalty, "active", off)
    assert run(resolve._loyalty(None, "t1")) == {"on": False}


def test_the_server_knows_the_three_elements():
    assert {"loyalty_program", "loyalty_referral", "loyalty_points"} <= set(COMPONENTS)
    assert COMPONENTS["loyalty_points"].context == ("product",)
    assert COMPONENTS["loyalty_program"].context == () and COMPONENTS["loyalty_referral"].context == ()
