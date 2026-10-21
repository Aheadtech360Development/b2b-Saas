"""The Platform Console's live faults, fixed (2026-10-21).

What each test holds, in the owner's terms:
* A plan change from the console goes through Stripe for a paying brand, so it
  is billed and does not undo itself; a brand paying nothing is simply moved.
* A key that is not a plan ("standard") never means 0% Gang Sheet commission.
* The Stripe test/live switch answers: its route is no longer taken by /{slug}.
* A shop the platform closed stays closed: a Stripe event does not reopen it,
  and its people cannot sign in or keep working. A shop whose plan lapsed still
  lets its staff in, to pay.
* Open console is a short support session, marked as support's and logged
  against the brand with its reason.
* Trial reminders run inside the server (live has no Celery beat), and a trial
  that ended long ago is not told about it now.
* Console changes are written to the activity log against their brand.
No database or network.
"""
import asyncio
import inspect
import time
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.api.v1.platform import tenants
from app.services import brand_status


def run(coro):
    return asyncio.run(coro)


class _Result:
    def __init__(self, row=None, mapping=None, scalar=None):
        self.row, self.mapping, self._scalar = row, mapping, scalar

    def first(self):
        return self.mapping if self.mapping is not None else self.row

    def mappings(self):
        return self

    def scalar(self):
        return self._scalar


class _Db:
    """Answers the few queries each path makes, and keeps every statement."""

    def __init__(self, answers=None):
        self.answers = answers or {}
        self.sql: list[tuple[str, dict]] = []
        self.committed = False

    async def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        self.sql.append((sql, params or {}))
        for needle, answer in self.answers.items():
            if needle in sql:
                return answer
        return _Result()

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass

    def ran(self, needle: str) -> bool:
        return any(needle in sql for sql, _ in self.sql)


def _request(user_id: str | None = None):
    return SimpleNamespace(
        state=SimpleNamespace(is_platform_admin=True, user_id=user_id or str(uuid.uuid4())),
        headers={}, client=None,
    )


# ── Plans and commission ────────────────────────────────────────────────────

def test_a_key_that_is_not_a_plan_pays_the_rate_of_the_plan_it_is_treated_as():
    from app.core.billing_plans import effective_plan, plan_summary
    from app.services import commission

    assert (commission.plan_bps("starter"), commission.plan_bps("wholesale"), commission.plan_bps("scale")) == (280, 190, 130)
    # The console's old "standard", the legacy names, and nothing at all.
    assert commission.plan_bps("standard") == 280
    assert commission.plan_bps("growth") == 190
    assert commission.plan_bps(None) == 280
    assert effective_plan(" Scale ") == "scale"

    not_a_plan = plan_summary("standard")
    assert not_a_plan["known"] is False and not_a_plan["treated_as"] == "starter"
    assert plan_summary("wholesale")["known"] is True


def test_the_console_refuses_what_is_not_a_plan_or_an_address():
    assert tenants._plan_problem("wholesale") is None
    problem = tenants._plan_problem("standard")
    assert "Starter" in problem and "Wholesale" in problem and "Scale" in problem
    assert tenants.clean_slug("My Shop!") == "my-shop"
    with pytest.raises(ValueError):
        tenants.clean_slug("a")


class _Stripe:
    """Stands in for Stripe's Subscription calls and remembers them."""

    def __init__(self, price="price_starter"):
        self.modified = []
        current = {"id": "sub_1", "items": {"data": [{"id": "si_1", "price": {"id": price}}]}}

        class Subscription:
            @staticmethod
            def retrieve(_id):
                return _Sub(current)

            @staticmethod
            def modify(sub_id, **kw):
                self.modified.append((sub_id, kw))
                current["items"]["data"][0]["price"]["id"] = kw["items"][0]["price"]

        self.Subscription = Subscription


class _Sub(dict):
    @property
    def id(self):
        return self["id"]


TENANT = {"id": "t1", "slug": "shop", "name": "Shop", "email": "o@shop.co", "status": "active",
          "plan": "starter", "custom_domain": None}


@pytest.mark.parametrize("sub_status", ["active", "trialing", "past_due"])
def test_a_paying_brand_is_switched_in_stripe_not_just_in_our_table(monkeypatch, sub_status):
    from app.services import billing_service

    fake = _Stripe()
    synced = []

    async def stripe_for(db):
        return fake

    async def price_for(self, plan_key):
        return f"price_{plan_key}"

    async def sync(self, subscription):
        synced.append(subscription)

    monkeypatch.setattr(billing_service, "_stripe_for", stripe_for)
    monkeypatch.setattr(billing_service.BillingService, "price_id_for_plan", price_for)
    monkeypatch.setattr(billing_service.BillingService, "sync_subscription", sync)
    db = _Db({"FROM tenants WHERE slug": _Result(mapping=TENANT),
              "SELECT stripe_subscription_id, status FROM tenant_subscriptions": _Result(row=("sub_1", sub_status))})

    out = run(billing_service.BillingService(db).switch_plan("shop", "wholesale"))

    assert out == {"plan": "wholesale", "billing": "switched"}
    (sub_id, kw), = fake.modified
    assert sub_id == "sub_1" and kw["items"] == [{"id": "si_1", "price": "price_wholesale"}]
    assert kw["proration_behavior"] == "create_prorations" and kw["metadata"]["plan_key"] == "wholesale"
    # The plan follows from what Stripe then says, not from a write of our own.
    assert synced and not db.ran("UPDATE tenants SET plan")


def test_a_brand_paying_nothing_is_moved_without_stripe(monkeypatch):
    from app.services import billing_service

    async def no_stripe(db):
        raise AssertionError("Stripe must not be asked")

    monkeypatch.setattr(billing_service, "_stripe_for", no_stripe)
    db = _Db({"FROM tenants WHERE slug": _Result(mapping=TENANT),
              "SELECT stripe_subscription_id, status FROM tenant_subscriptions": _Result(row=(None, "inactive"))})

    out = run(billing_service.BillingService(db).switch_plan("shop", "scale"))

    assert out == {"plan": "scale", "billing": "not_subscribed"}
    assert db.ran("UPDATE tenants SET plan") and db.ran("UPDATE tenant_subscriptions SET plan")
    with pytest.raises(ValueError):
        run(billing_service.BillingService(db).switch_plan("shop", "standard"))


def test_the_console_plan_change_goes_through_the_stripe_switch(monkeypatch):
    from app.services import billing_service

    called = []

    async def switch(self, slug, plan):
        called.append((slug, plan))
        return {"plan": plan, "billing": "switched"}

    audited = []

    async def audit(db, request, **kw):
        audited.append(kw)

    monkeypatch.setattr(billing_service.BillingService, "switch_plan", switch)
    monkeypatch.setattr(tenants, "_audit", audit)
    db = _Db({"SELECT id, name, slug, status, plan, custom_domain FROM tenants": _Result(mapping={
        "id": "t1", "name": "Shop", "slug": "shop", "status": "active", "plan": "starter", "custom_domain": None})})

    out = run(tenants.update_tenant("shop", tenants.TenantUpdate(plan="wholesale"), _request(), db))

    assert called == [("shop", "wholesale")] and out["plan_billing"] == "switched"
    assert not db.ran("UPDATE tenants SET plan")  # Stripe's sync writes it
    assert audited[0]["tenant_id"] == "t1" and "Stripe switched" in audited[0]["summary"]
    with pytest.raises(Exception) as refused:
        run(tenants.update_tenant("shop", tenants.TenantUpdate(plan="standard"), _request(), db))
    assert getattr(refused.value, "status_code", None) == 400


# ── Stripe test and live ────────────────────────────────────────────────────

def test_the_stripe_mode_switch_is_not_taken_for_a_brand_address(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from starlette.middleware.base import BaseHTTPMiddleware

    from app.core.database import get_db
    from app.services import stripe_mode

    async def status(db):
        return {"mode": "test"}

    monkeypatch.setattr(stripe_mode, "status", status)

    class Console(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.is_platform_admin = True
            request.state.user_id = None
            return await call_next(request)

    async def no_db():
        yield None

    mini = FastAPI()
    mini.add_middleware(Console)
    mini.include_router(tenants.router, prefix="/api/v1")
    mini.dependency_overrides[get_db] = no_db
    res = TestClient(mini).get("/api/v1/platform/tenants/stripe-mode")
    assert res.status_code == 200 and res.json() == {"mode": "test"}


# ── A closed shop ───────────────────────────────────────────────────────────

def test_who_gets_into_a_closed_shop():
    d = brand_status.decide
    assert d("active", None, False, False) == brand_status.OPEN
    # Closed by hand (its plan has not lapsed), or held by the platform: nobody.
    assert d("suspended", "active", False, True) == brand_status.CLOSED
    assert d("suspended", "canceled", True, True) == brand_status.CLOSED
    assert d("cancelled", None, False, True) == brand_status.CLOSED
    # Its plan lapsed: staff in, to pay; its buyers not.
    assert d("suspended", "canceled", False, True) == brand_status.BILLING_ONLY
    assert d("suspended", "unpaid", False, False) == brand_status.CLOSED


@pytest.mark.parametrize("held, reopened", [(True, False), (False, True)])
def test_a_stripe_event_does_not_reopen_a_shop_the_platform_closed(monkeypatch, held, reopened):
    from app.services.billing_service import BillingService

    async def is_held(db, tenant_id):
        return held

    monkeypatch.setattr(brand_status, "is_held", is_held)
    db = _Db()
    run(BillingService(db)._reconcile_access("t1", "starter", "active"))
    assert db.ran("SET status") is reopened


def test_suspending_holds_the_shop_and_activating_releases_it(monkeypatch):
    calls = []

    async def hold(db, tenant_id, **kw):
        calls.append(("hold", tenant_id, kw["status"], kw["reason"]))

    async def release(db, tenant_id):
        calls.append(("release", tenant_id))

    audited = []

    async def audit(db, request, **kw):
        audited.append(kw)

    monkeypatch.setattr(brand_status, "hold", hold)
    monkeypatch.setattr(brand_status, "release", release)
    monkeypatch.setattr(tenants, "_audit", audit)

    def db(status):
        return _Db({"SELECT id, name, slug, status, plan, custom_domain FROM tenants": _Result(mapping={
            "id": "t1", "name": "Shop", "slug": "shop", "status": status, "plan": "starter", "custom_domain": None})})

    run(tenants.update_tenant("shop", tenants.TenantUpdate(status="suspended", reason="Chargebacks"), _request(), db("active")))
    run(tenants.update_tenant("shop", tenants.TenantUpdate(status="active"), _request(), db("suspended")))
    assert calls == [("hold", "t1", "suspended", "Chargebacks"), ("release", "t1")]
    assert audited[0]["tenant_id"] == "t1" and "Chargebacks" in audited[0]["summary"]


def test_sign_in_refuses_a_shop_the_platform_closed(monkeypatch):
    from app.services import tenant_auth_service

    async def closed(tenant_id, *, is_staff):
        return brand_status.CLOSED

    async def broken(tenant_id, *, is_staff):
        raise RuntimeError("database down")

    monkeypatch.setattr(brand_status, "gate", closed)
    assert run(tenant_auth_service._shop_closed({"tenant_id": "t1", "is_admin": True})) is True
    assert run(tenant_auth_service._shop_closed({"tenant_id": None, "is_platform_admin": True})) is False
    monkeypatch.setattr(brand_status, "gate", broken)
    assert run(tenant_auth_service._shop_closed({"tenant_id": "t1"})) is False  # fails open


def test_a_closed_shops_sessions_are_refused_but_support_gets_in(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.core.security import create_access_token
    from app.middleware import auth_middleware

    async def not_revoked(key):
        return False

    async def no_gate(request, path, *, public):
        return None

    async def gate(tenant_id, *, is_staff):
        return brand_status.CLOSED if tenant_id == "t-closed" else brand_status.OPEN

    monkeypatch.setattr(auth_middleware, "redis_exists", not_revoked)
    monkeypatch.setattr(auth_middleware, "_feature_gate", no_gate)
    monkeypatch.setattr(brand_status, "gate", gate)

    mini = FastAPI()
    mini.add_middleware(auth_middleware.AuthMiddleware)

    @mini.get("/api/v1/account/thing")
    async def thing():
        return {"ok": True}

    client = TestClient(mini)

    def call(**claims):
        token = create_access_token("u1", {"is_admin": True, **claims})
        return client.get("/api/v1/account/thing", headers={"Authorization": f"Bearer {token}"})

    refused = call(tenant_id="t-closed")
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "SHOP_CLOSED"
    assert call(tenant_id="t-closed", impersonated=True).status_code == 200
    assert call(tenant_id="t-open").status_code == 200


# ── Open console ────────────────────────────────────────────────────────────

def test_open_console_is_a_short_support_session_logged_with_its_reason(monkeypatch):
    from app.core.security import decode_token

    audited = []

    async def audit(db, request, **kw):
        audited.append(kw)

    monkeypatch.setattr(tenants, "_audit", audit)
    support = str(uuid.uuid4())
    db = _Db({
        "SELECT id, name FROM tenants": _Result(row=("t1", "Shop")),
        "SELECT id, email, role FROM users": _Result(mapping={"id": "u-owner", "email": "owner@shop.co", "role": "tenant_admin"}),
        "SELECT email FROM users WHERE id": _Result(scalar="support@printcopilot.co"),
    })

    out = run(tenants.impersonate_tenant("shop", _request(support), tenants.ImpersonateIn(reason="Order 1005", minutes=30), db))

    claims = decode_token(out["access_token"])
    assert claims["sub"] == "u-owner" and claims["tenant_id"] == "t1" and claims["tenant_slug"] == "shop"
    assert claims["impersonated"] is True and claims["impersonated_by"] == support
    assert claims["impersonator_email"] == "support@printcopilot.co"
    assert 29 * 60 <= claims["exp"] - int(time.time()) <= 30 * 60 + 5
    assert audited[0]["tenant_id"] == "t1" and audited[0]["new_values"]["reason"] == "Order 1005"

    # Asked with nothing (the old console), it still opens, for the default hour.
    out = run(tenants.impersonate_tenant("shop", _request(support), None, db))
    assert out["minutes"] == tenants.SUPPORT_MINUTES_DEFAULT
    # And never for less than a quarter of an hour, or more than four.
    out = run(tenants.impersonate_tenant("shop", _request(support), tenants.ImpersonateIn(minutes=1), db))
    assert out["minutes"] == 15


def test_support_work_inside_a_brand_is_logged_against_support():
    from app.middleware import audit_middleware

    source = inspect.getsource(audit_middleware.AuditMiddleware.dispatch)
    assert "impersonated_by" in source and "Platform support: " in source


# ── Trial reminders ─────────────────────────────────────────────────────────

def test_trial_reminders_run_in_the_server_and_old_endings_are_not_announced(monkeypatch):
    from app import main
    from app.services import trial_notices

    now = datetime.now(UTC)
    assert trial_notices.stale_end(now - timedelta(days=3)) is True
    assert trial_notices.stale_end(now - timedelta(hours=1)) is False
    assert trial_notices.stale_end(None) is False

    async def one_run():
        return {"sent": 1, "failed": 0}

    monkeypatch.setattr(trial_notices, "run", one_run)
    assert run(trial_notices.tick(use_lock=False)) == {"sent": 1, "failed": 0}
    assert "trial_notices" in inspect.getsource(main.lifespan)


# ── A brand's staff reset ───────────────────────────────────────────────────

def test_a_staff_reset_goes_to_this_brands_own_account():
    from app.api.v1.admin import users

    assert "send_password_reset(user.email, user.tenant_id)" in inspect.getsource(users.reset_user_password)
