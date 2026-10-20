"""Sign-up and the owner's setup steps (design screens 6 to 12).

The database is faked: these check the rules — what a sign-up needs, where the
owner's place is kept and how it moves, what counts as done, that an owner who
signs in on printcopilot.co gets their own profile, and that the two-step setup
hands back a code to scan. The flow end to end is walked against the local API.
"""
import asyncio
import json
from types import SimpleNamespace

import pytest

from app.core import tenant_settings
from app.core.billing_plans import is_valid_plan
from app.services import onboarding as ob


def run(coro):
    return asyncio.run(coro)


# ── Where the owner is ──────────────────────────────────────────────────────

@pytest.fixture
def saved(monkeypatch):
    """One shop's "onboarding" setting, in memory."""
    box: dict = {}

    async def read_progress(db, tenant_id):
        raw = box.get("onboarding")
        return json.loads(raw) if raw else None

    async def set_setting(db, key, value, *, tenant_id=None):
        assert tenant_id, "progress is kept per shop"
        box[key] = value

    monkeypatch.setattr(ob, "read_progress", read_progress)
    monkeypatch.setattr(ob, "set_setting", set_setting)
    return box


def test_progress_is_kept_per_shop():
    assert ob.KEY in tenant_settings.TENANT_SCOPED_KEYS


def test_a_new_shop_starts_on_the_second_step_with_its_answers_cleaned():
    p = ob.initial("DTF_Operator", "us")
    assert (p["step"], p["reached"], p["business_type"], p["country"]) == (2, 2, "dtf_operator", "US")
    assert p["finished_at"] is None and p["started_at"]
    junk = ob.initial("rocket shop", "USA")
    assert junk["business_type"] is None and junk["country"] is None


def test_steps_are_clamped_and_reached_never_goes_back(saved):
    run(ob.save_progress(None, "t1", {"step": 4}))
    p = run(ob.save_progress(None, "t1", {"step": 2}))
    assert (p["step"], p["reached"]) == (2, 4)
    p = run(ob.save_progress(None, "t1", {"step": 99}))
    assert (p["step"], p["reached"]) == (5, 5)


def test_answers_and_finishing_are_kept_once(saved):
    p = run(ob.save_progress(None, "t1", {"business_type": "embroiderer", "country": "ca"}))
    assert (p["business_type"], p["country"]) == ("embroiderer", "CA")
    first = run(ob.save_progress(None, "t1", {"finished": True}))["finished_at"]
    again = run(ob.save_progress(None, "t1", {"finished": True}))["finished_at"]
    assert first and first == again
    asked = run(ob.save_progress(None, "t1", {"sanmar_notify": True}))["sanmar_notify"]
    assert asked and run(ob.save_progress(None, "t1", {"sanmar_notify": True}))["sanmar_notify"] == asked


# ── What counts as done ─────────────────────────────────────────────────────

def found(**over):
    base = {
        "branding": {"store_name": None, "company_name": "Torres Print", "logo_url": None, "primary_color": "#1C3557"},
        "products": {"count": 0, "gang_sheet": 0},
        "stripe": {"connected": False, "charges_enabled": False},
        "carriers": [],
        "pickup": {"set": False},
    }
    base.update(over)
    return base


def test_nothing_is_done_on_a_new_shop_that_skipped_everything():
    done = ob.summarise(found(), {"business_type": None})
    assert not any(done.values())


def test_each_item_is_read_from_where_it_is_kept():
    assert ob.summarise(found(), {"business_type": "print_shop"})["business"]
    # The column's default colour is not a choice; another colour or a logo is.
    assert not ob.summarise(found(), {})["branded"]
    assert ob.summarise(found(branding={"company_name": "x", "primary_color": "#0F766E"}), {})["branded"]
    assert ob.summarise(found(branding={"company_name": "x", "logo_url": "https://ik/logo.png"}), {})["branded"]
    assert ob.summarise(found(products={"count": 3}), {})["product"]
    # Connected is not enough to take a card: charges must be on.
    assert not ob.summarise(found(stripe={"connected": True, "charges_enabled": False}), {})["payments"]
    assert ob.summarise(found(stripe={"charges_enabled": True}), {})["payments"]
    assert ob.summarise(found(carriers=["UPS"]), {})["shipping"]
    assert ob.summarise(found(pickup={"set": True}), {})["shipping"]


# ── Signing up ──────────────────────────────────────────────────────────────

def test_a_sign_up_is_an_email_a_password_and_a_name():
    from app.api.v1.signup import DEFAULT_PLAN, SignupIn

    s = SignupIn(email="owner@torresprint.com", password="Partner2026!", shop_name="Torres Print")
    assert s.plan is None and s.first_name == "" and s.business_type is None
    assert is_valid_plan(DEFAULT_PLAN)


class _Result:
    def __init__(self, row):
        self.row = row

    def first(self):
        return self.row

    def mappings(self):
        return self


class _Session:
    def __init__(self, row):
        self.row = row
        self.sql: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, statement, params=None):
        self.sql.append(str(statement))
        return _Result(self.row)


def test_an_email_that_already_has_an_account_is_sent_to_sign_in(monkeypatch):
    from fastapi import HTTPException

    from app.api.v1 import signup
    from app.core import database

    async def no_limit(*a, **k):
        return None

    monkeypatch.setattr(signup, "enforce_rate_limit", no_limit)
    req = SimpleNamespace(client=SimpleNamespace(host="1.2.3.4"), headers={})

    free = _Session(row=None)
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: free)
    assert run(signup.check_email(signup.CheckIn(email="new@shop.com"), req)) == {"ok": True}
    # Owners and staff only: a shop's buyers are not looked up here.
    assert "is_admin" in free.sql[0]

    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: _Session(row=(1,)))
    with pytest.raises(HTTPException) as e:
        run(signup.check_email(signup.CheckIn(email="Owner@Shop.com"), req))
    assert e.value.status_code == 409 and "Sign in" in e.value.detail


class _Platform(_Session):
    """Every account on the platform, as the sign-up's own lookups read them."""

    def __init__(self, accounts):
        super().__init__(row=None)
        self.accounts = accounts
        self.committed = False

    async def execute(self, statement, params=None):
        sql = str(statement)
        self.sql.append(sql)
        if "FROM users" in sql:
            owners_only = "is_admin OR is_platform_admin" in sql
            hit = any(a["email"] == params["e"] and (a["owner"] or not owners_only)
                      for a in self.accounts)
            return _Result((1,) if hit else None)
        return _Result(None)

    async def commit(self):
        self.committed = True


def test_a_shops_buyer_can_open_a_shop_with_the_same_email(monkeypatch):
    """A manager's test address was a buyer at one shop, and step 1 said it
    already had an account: the sign-up refused every account, while /check
    (the screen before) asked only about owners and staff."""
    from fastapi import BackgroundTasks, HTTPException

    from app.api.v1 import signup
    from app.core import database

    async def no_limit(*a, **k):
        return None

    async def set_setting(db, key, value, *, tenant_id=None):
        return None

    monkeypatch.setattr(signup, "enforce_rate_limit", no_limit)
    monkeypatch.setattr(tenant_settings, "set_setting", set_setting)
    req = SimpleNamespace(client=SimpleNamespace(host="1.2.3.4"), headers={})

    def sign_up(email, accounts):
        shop = _Platform(accounts)
        monkeypatch.setattr(database, "AsyncSessionLocal", lambda: shop)
        payload = signup.SignupIn(email=email, password="Partner2026!", shop_name="Torres Print")
        return shop, run(signup.sign_up(payload, req, BackgroundTasks(), None))

    shop, out = sign_up("Buyer@Shop.com", [{"email": "buyer@shop.com", "owner": False}])
    assert out["slug"] == "torres-print" and out["next"] == "/onboarding"
    assert shop.committed and any("INSERT INTO users" in s for s in shop.sql)

    with pytest.raises(HTTPException) as e:
        sign_up("owner@shop.com", [{"email": "owner@shop.com", "owner": True}])
    assert e.value.status_code == 409 and "Sign in" in e.value.detail


def test_the_welcome_mail_has_a_greeting_without_a_name(monkeypatch):
    from app.api.v1 import signup
    from app.services import email_service

    sent = {}
    monkeypatch.setattr(email_service, "platform_inbox", lambda: None)
    monkeypatch.setattr(email_service, "send_as_platform", lambda to, subject, body: sent.update(body=body))
    signup._welcome("Torres Print", "", "owner@torresprint.com", "wholesale", "https://torres-print.printcopilot.co/")
    assert "Your shop is open.</h1>" in sent["body"] and ", .</h1>" not in sent["body"]


# ── Signing in on printcopilot.co ───────────────────────────────────────────

def test_the_profile_is_read_by_the_tokens_own_id_on_any_address(monkeypatch):
    from app.core import database
    from app.core.exceptions import UnauthorizedError
    from app.core.tenant_context import is_scoping_bypassed
    from app.services.tenant_auth_service import TenantAuthService

    seen = {}

    class Session(_Session):
        async def execute(self, statement, params=None):
            seen["bypassed"] = is_scoping_bypassed()
            seen["params"] = params
            return _Result(self.row)

    row = {"id": "u1", "tenant_id": "t1", "email": "owner@shop.com", "first_name": "", "last_name": "",
           "role": "tenant_admin", "is_platform_admin": False, "is_active": True}
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: Session(row))
    assert run(TenantAuthService(None).get_profile("u1"))["email"] == "owner@shop.com"
    # Unscoped while it reads, and only the token's own id, and the scope is put back.
    assert seen == {"bypassed": True, "params": {"id": "u1"}} and not is_scoping_bypassed()

    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: Session(None))
    with pytest.raises(UnauthorizedError):
        run(TenantAuthService(None).get_profile("gone"))


# ── Two-step sign-in ────────────────────────────────────────────────────────

def test_setup_hands_back_a_code_to_scan_under_the_platforms_name(monkeypatch):
    from app.api.v1 import two_factor

    user = SimpleNamespace(two_factor_enabled=False, two_factor_secret=None, email="owner@shop.com")

    async def current_user(request, db):
        return user

    class Db:
        async def flush(self):
            return None

    monkeypatch.setattr(two_factor, "_current_user", current_user)
    out = run(two_factor.setup_2fa(SimpleNamespace(state=SimpleNamespace()), Db()))
    assert out["secret"] == user.two_factor_secret
    assert "issuer=PrintCoPilot" in out["otpauth_uri"]
    assert out["qr_svg"].startswith("data:image/svg+xml")

    shop = SimpleNamespace(state=SimpleNamespace(tenant_slug=None, tenant_slug_claim="torres-print"))
    assert "issuer=torres-print" in run(two_factor.setup_2fa(shop, Db()))["otpauth_uri"]


# ── Home asks only a shop that left the steps part way ──────────────────────

class _FailingDb:
    async def execute(self, *a, **k):
        raise RuntimeError("no database here")

    async def rollback(self):
        return None


def test_home_asks_to_finish_setting_up_only_when_unfinished(monkeypatch):
    from app.services import admin_home

    async def unfinished(db, tenant_id):
        return True

    monkeypatch.setattr(ob, "unfinished", unfinished)
    steps = run(admin_home._checklist(_FailingDb(), "t1", "u1"))
    assert steps[0]["key"] == "setup" and steps[0]["href"] == "/onboarding" and not steps[0]["done"]

    async def finished(db, tenant_id):
        return False

    monkeypatch.setattr(ob, "unfinished", finished)
    assert "setup" not in [s["key"] for s in run(admin_home._checklist(_FailingDb(), "t1", "u1"))]


# ── Back from Stripe to where the owner started ─────────────────────────────

def test_stripe_brings_the_owner_back_only_to_one_of_the_shops_own_addresses(monkeypatch):
    from app.core import config
    from app.services.connect_service import ConnectService

    class Db:
        async def execute(self, statement, params=None):
            return SimpleNamespace(first=lambda: ("torres-tees", "shop.torrestees.com"))

    monkeypatch.setattr(config.get_settings(), "PLATFORM_DOMAIN", "printcopilot.co", raising=False)
    svc = ConnectService(Db())
    known = lambda origin: run(svc._known_origin("t1", origin))  # noqa: E731
    assert known("https://printcopilot.co") == "https://printcopilot.co"
    assert known("https://www.printcopilot.co") == "https://www.printcopilot.co"
    assert known("https://torres-tees.printcopilot.co") == "https://torres-tees.printcopilot.co"
    assert known("https://www.shop.torrestees.com") == "https://www.shop.torrestees.com"
    assert known("http://localhost:3000") == "http://localhost:3000"
    for bad in ("https://evil.com", "https://other-shop.printcopilot.co", "javascript:alert(1)", "", None,
                "https://printcopilot.co.evil.com"):
        assert known(bad) is None, bad
