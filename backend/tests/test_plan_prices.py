"""Plan prices the super admin sets from the console (services/plan_prices).

What each test holds, in the owner's terms:
* A price set in the console is the plan's price everywhere: sign-up, Billing,
  the pricing pages and Stripe. Set back to the default, the plan follows the
  code again; one plan's change leaves the others' alone.
* Nothing that is not a plan or not a sensible price is saved.
* Stripe gets a new Price for the new amount; a brand already paying keeps the
  Price it started on, and the console counts what that brand really pays.
No database or network.
"""
import asyncio
import json
from types import SimpleNamespace

import pytest

from app.core.billing_plans import BILLING_PLANS, plan_summary, price_text, public_pricing_table
from app.services import plan_prices


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _defaults_after():
    yield
    plan_prices.apply({})


class _Result:
    def __init__(self, row=None, rows=None):
        self.row, self.rows = row, rows or []

    def first(self):
        return self.row

    def all(self):
        return self.rows


class _Db:
    """The app_settings row the prices live in, and every statement run."""

    def __init__(self, stored: dict | None = None, answers: dict | None = None):
        self.value = json.dumps(stored) if stored is not None else None
        self.answers = answers or {}
        self.sql: list[tuple[str, dict]] = []
        self.commits = 0

    async def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        self.sql.append((sql, params or {}))
        if sql.startswith("INSERT INTO app_settings") and (params or {}).get("k") == plan_prices.KEY:
            self.value = params["v"]
            return _Result()
        if "FROM app_settings WHERE key = :k" in sql and (params or {}).get("k") == plan_prices.KEY:
            return _Result(row=(self.value,) if self.value is not None else None)
        for needle, answer in self.answers.items():
            if needle in sql:
                return answer
        return _Result()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


# ── The price itself ─────────────────────────────────────────────────────────

def test_a_price_reads_like_the_website_shows_it():
    assert price_text(9700) == "$97"
    assert price_text(9950) == "$99.50"
    assert price_text(100000) == "$1,000"


def test_a_set_price_is_the_plans_price_everywhere_and_the_rest_keep_theirs():
    db = _Db()
    changed = run(plan_prices.save(db, {"starter": 9900}))

    assert changed == {"starter": 9900}
    assert json.loads(db.value) == {"starter": 9900}
    # Charged once stored: the caller commits, then refreshes.
    assert BILLING_PLANS["starter"]["amount_cents"] == plan_prices.DEFAULTS["starter"]
    run(plan_prices.refresh(db))
    assert BILLING_PLANS["starter"]["amount_cents"] == 9900
    assert BILLING_PLANS["wholesale"]["amount_cents"] == plan_prices.DEFAULTS["wholesale"]
    # The console, sign-up and the website read the same plan list.
    assert plan_summary("starter")["price_display"] == "$99/mo"
    assert next(p for p in public_pricing_table() if p["key"] == "starter")["amount_cents"] == 9900

    # Another plan later: the first one's price stays.
    changed = run(plan_prices.save(db, {"scale": 59700}))
    assert changed == {"scale": 59700}
    assert json.loads(db.value) == {"scale": 59700, "starter": 9900}


def test_back_at_its_default_a_plan_follows_the_code_again():
    db = _Db(stored={"starter": 9900, "retail": 8900})
    run(plan_prices.refresh(db))
    assert BILLING_PLANS["retail"]["amount_cents"] == 8900

    changed = run(plan_prices.save(db, {"starter": plan_prices.DEFAULTS["starter"]}))
    assert changed == {"starter": plan_prices.DEFAULTS["starter"]}
    assert json.loads(db.value) == {"retail": 8900}


def test_the_same_price_again_changes_nothing():
    db = _Db(stored={"starter": 9900})
    assert run(plan_prices.save(db, {"starter": 9900})) == {}


@pytest.mark.parametrize("prices", [
    {"gold": 9900},                 # not a plan
    {"starter": 50},                # under $1
    {"starter": 1_000_001},         # over $10,000
    {"starter": True},              # not a number
])
def test_what_is_not_a_plan_or_a_sensible_price_is_refused(prices):
    db = _Db()
    with pytest.raises(plan_prices.PriceError):
        run(plan_prices.save(db, prices))
    assert db.value is None


def test_a_stored_row_with_junk_in_it_is_read_for_what_is_valid():
    db = _Db()
    db.value = json.dumps({"starter": 9900, "gold": 5, "scale": "lots", "retail": 10})
    assert run(plan_prices.load(db)) == {"starter": 9900}
    db.value = "not json"
    assert run(plan_prices.load(db)) == {}


# ── Stripe ───────────────────────────────────────────────────────────────────

class _Stripe:
    """Stripe's Price calls: one Price per amount, the lookup key on the newest."""

    def __init__(self, prices: dict[str, dict]):
        self.prices = prices
        self.created: list[dict] = []
        outer = self

        class Price:
            @staticmethod
            def retrieve(price_id):
                p = outer.prices[price_id]
                return SimpleNamespace(**p, get=lambda k, d=None: p.get(k, d))

            @staticmethod
            def list(lookup_keys, limit, active):
                found = [SimpleNamespace(**p) for p in outer.prices.values()
                         if p.get("lookup_key") in lookup_keys and p.get("active", True)]
                return SimpleNamespace(data=found[:limit])

            @staticmethod
            def create(**kw):
                outer.created.append(kw)
                new_id = f"price_{len(outer.prices) + 1}"
                if kw.get("transfer_lookup_key"):
                    for p in outer.prices.values():
                        if p.get("lookup_key") == kw["lookup_key"]:
                            p["lookup_key"] = None
                outer.prices[new_id] = {"id": new_id, "unit_amount": kw["unit_amount"], "active": True,
                                        "lookup_key": kw["lookup_key"], "product": kw["product"],
                                        "metadata": kw["metadata"]}
                return SimpleNamespace(**outer.prices[new_id])

        self.Price = Price


def _stripe_db(price_id="price_1"):
    return _Db(answers={"WHERE key = :k": _Result(row=(price_id,))})


def test_a_new_price_is_a_new_stripe_price_and_the_old_one_keeps_its_subscribers(monkeypatch):
    from app.services import billing_service

    fake = _Stripe({"price_1": {"id": "price_1", "unit_amount": 9700, "active": True,
                                "lookup_key": "printcopilot_starter_monthly", "product": "prod_1",
                                "metadata": {"plan_key": "starter"}}})

    async def stripe_for(db):
        return fake

    monkeypatch.setattr(billing_service, "_stripe_for", stripe_for)

    # At the price in force, the stored Price is the one.
    assert run(billing_service.BillingService(_stripe_db()).price_id_for_plan("starter")) == "price_1"
    assert fake.created == []

    plan_prices.apply({"starter": 9900})
    db = _stripe_db()
    new_id = run(billing_service.BillingService(db).price_id_for_plan("starter"))

    assert new_id == "price_2"
    (made,) = fake.created
    assert made["unit_amount"] == 9900 and made["product"] == "prod_1" and made["transfer_lookup_key"] is True
    assert made["metadata"] == {"plan_key": "starter"}
    # Remembered for the next sign-up; the old Price is untouched (still active).
    assert any(p.get("v") == "price_2" for _, p in db.sql)
    assert fake.prices["price_1"]["active"] is True and fake.prices["price_1"]["unit_amount"] == 9700


def test_a_subscription_on_the_old_price_is_still_known_as_its_plan(monkeypatch):
    from app.services import billing_service

    fake = _Stripe({"price_1": {"id": "price_1", "unit_amount": 9700, "active": True, "lookup_key": None,
                                "product": "prod_1", "metadata": {"plan_key": "starter"}}})

    async def stripe_for(db):
        return fake

    monkeypatch.setattr(billing_service, "_stripe_for", stripe_for)
    # app_settings names the new Price now, so the old one is found by its metadata.
    db = _Db(answers={"SELECT key FROM app_settings": _Result(row=None)})
    assert run(billing_service.BillingService(db).plan_for_price_id("price_1")) == "starter"


def test_what_a_subscription_bills_is_its_plan_line_times_its_quantity():
    from app.services.billing_service import BillingService, _amount_of

    assert _amount_of({"price": {"unit_amount": 9700}}) == 9700
    assert _amount_of({"price": {"unit_amount": 9700}, "quantity": 2}) == 19400
    assert _amount_of({"price": {}}) is None

    svc = BillingService(_Db())

    async def plan_for(price_id):
        return None

    svc.plan_for_price_id = plan_for
    plan_line = {"price": {"id": "p1", "lookup_key": "printcopilot_starter_monthly", "unit_amount": 9700}}
    add_on = {"price": {"id": "p2", "lookup_key": "printcopilot_mobile_app", "unit_amount": 2000}}
    assert run(svc._plan_amount({"items": {"data": [add_on, plan_line]}})) == 9700
    assert run(svc._plan_amount({"items": {"data": []}})) is None


def test_subscriptions_synced_before_are_read_from_stripe_once(monkeypatch):
    from app.services import billing_service

    subs = {"sub_1": {"items": {"data": [{"price": {"id": "price_1", "unit_amount": 9700}}]}}}

    async def stripe_for(db):
        return SimpleNamespace(Subscription=SimpleNamespace(retrieve=lambda sub_id: subs[sub_id]))

    monkeypatch.setattr(billing_service, "_stripe_for", stripe_for)
    db = _Db(answers={"WHERE stripe_subscription_id IS NOT NULL AND amount_cents IS NULL": _Result(rows=[("sub_1",)])})
    assert run(billing_service.BillingService(db).fill_paid_amounts()) == 1
    (sql, params), = [(s, p) for s, p in db.sql if s.startswith("UPDATE tenant_subscriptions")]
    assert params == {"a": 9700, "s": "sub_1"} and "amount_cents IS NULL" in sql

    # Nothing left to read: Stripe is not asked.
    async def no_stripe(db):
        raise AssertionError("Stripe must not be asked")

    monkeypatch.setattr(billing_service, "_stripe_for", no_stripe)
    assert run(billing_service.BillingService(_Db()).fill_paid_amounts()) == 0


# ── The console ──────────────────────────────────────────────────────────────

def _row(**kw):
    row = {"id": "t1", "slug": "shop", "name": "Shop", "email": "o@shop.co", "status": "active",
           "plan": "starter", "custom_domain": None, "created_at": None, "billing_status": "active",
           "trial_ends_at": None, "stripe_subscription_id": "sub_1", "current_period_end": None,
           "cancel_at_period_end": False, "paid_cents": None, "users": 1, "staff": 1, "products": 0,
           "orders": 0, "orders_month": 0, "owner_email": "o@shop.co", "last_activity": None, "hold": None}
    row.update(kw)
    return row


def test_a_brand_on_the_old_price_shows_what_it_pays_not_the_new_price():
    from app.api.v1.platform.console import _brand

    plan_prices.apply({"starter": 9900})
    # Started at $97: the console (brand list, plan tab, revenue) shows $97.
    old = _brand(_row(paid_cents=9700))["plan_detail"]
    assert (old["amount_cents"], old["price_display"]) == (9700, "$97/mo")
    # Not synced since the amount was kept, or not paying: the plan's price.
    assert _brand(_row())["plan_detail"]["amount_cents"] == 9900
    assert _brand(_row(stripe_subscription_id=None, billing_status=None, paid_cents=9700))["plan_detail"]["amount_cents"] == 9900


def _request(admin=True):
    return SimpleNamespace(state=SimpleNamespace(is_platform_admin=admin, user_id=None), headers={}, client=None)


def test_only_a_super_admin_sets_prices():
    from fastapi import HTTPException

    from app.api.v1.platform import billing

    with pytest.raises(HTTPException) as e:
        run(billing.set_plan_prices(billing.PricesIn(prices={"starter": 9900}), _request(admin=False), _Db()))
    assert e.value.status_code == 403


def test_a_bad_price_is_refused_with_the_reason():
    from fastapi import HTTPException

    from app.api.v1.platform import billing

    with pytest.raises(HTTPException) as e:
        run(billing.set_plan_prices(billing.PricesIn(prices={"starter": 0}), _request(), _Db()))
    assert e.value.status_code == 422 and "$1" in e.value.detail


def test_setting_a_price_is_logged_and_stripe_is_readied(monkeypatch):
    from app.api.v1.platform import billing, tenants
    from app.services import billing_service

    audits, readied = [], []

    async def audit(db, request, **kw):
        audits.append(kw)

    async def price_for(self, plan_key):
        readied.append(plan_key)
        return "price_new"

    async def fill(self):
        return 0

    monkeypatch.setattr(tenants, "_audit", audit)
    monkeypatch.setattr(billing_service.BillingService, "price_id_for_plan", price_for)
    monkeypatch.setattr(billing_service.BillingService, "fill_paid_amounts", fill)
    db = _Db()

    out = run(billing.set_plan_prices(billing.PricesIn(prices={"starter": 9900, "scale": 49700}), _request(), db))

    assert out["changed"] == ["starter"] and out["stripe"] == {"starter": "ready"} and readied == ["starter"]
    assert next(p for p in out["plans"] if p["key"] == "starter")["amount_cents"] == 9900
    assert next(p for p in out["plans"] if p["key"] == "starter")["default_amount_cents"] == 9700
    (logged,) = audits
    # The activity log's action names are upper case (audit_action enum).
    assert logged["action"] == "UPDATE" and logged["entity_type"] == "plan_prices"
    assert logged["summary"] == "Plan prices: Starter $97 to $99"
    assert logged["old_values"] == {"starter": 9700} and logged["new_values"] == {"starter": 9900}
    assert db.commits >= 1
