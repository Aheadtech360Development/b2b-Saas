"""Every number of the partner deal is a setting the super admin changes, and
each one's default keeps the deal as it was before it was a setting.

The program's own code runs here against a stand-in for the database: each
query is answered from a small table of canned rows, matched by a piece of
its SQL, so no database is needed and a query a test did not expect fails it.
"""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.partners import actions, admin_views, commissions, ledger, mail, portal, program, referrals


class Rows:
    """Enough of a SQLAlchemy result for the program's queries."""

    def __init__(self, rows=()):
        self.rows = list(rows)
        self.rowcount = len(self.rows)

    def first(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return list(self.rows)

    def mappings(self):
        return self

    def scalar(self):
        row = self.first()
        if row is None:
            return None
        return next(iter(row.values())) if isinstance(row, dict) else row[0]

    def scalars(self):
        return Rows([next(iter(r.values())) if isinstance(r, dict) else r[0] for r in self.rows])


class FakeDB:
    """Answers each query from the first (piece of its SQL, rows) pair that
    matches; the rows may be a function of the query's parameters. The
    program's settings row is always there."""

    def __init__(self, settings=None, answers=()):
        self.answers = [("FROM app_settings WHERE key = :k", [(json.dumps(settings or {}),)]), *answers]
        self.ran = []

    async def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        params = params or {}
        self.ran.append((sql, params))
        for piece, rows in self.answers:
            if piece in sql:
                return Rows(rows(params) if callable(rows) else rows)
        raise AssertionError(f"a query the test did not expect: {sql[:160]}")

    def sent(self, piece):
        """The parameters of every query whose SQL has `piece`."""
        return [p for sql, p in self.ran if piece in sql]


MARIA = {"id": "11111111-1111-4111-8111-111111111111", "code": "MARIA", "name": "Maria Torres",
         "email": "maria@torres.com", "website": None, "status": "active"}
LINH = {"id": "22222222-2222-4222-8222-222222222222", "code": "LINH", "name": "Linh Tran",
        "email": "linh@tran.com", "website": None, "status": "active"}
SHOP = "33333333-3333-4333-8333-333333333333"
ADMIN = actions.Actor(name="Platform admin")
UTC = timezone.utc


# ── The settings ──────────────────────────────────────────────────────────────

def test_every_new_number_defaults_to_the_deal_as_it_was():
    got = program.clean({})
    assert (got["earning_months"], got["clawback_window_days"], got["w9_required_from_cents"],
            got["form_1099_threshold_cents"]) == (0, 0, 0, 0)
    assert (got["application_response_days"], got["rate_change_notice_days"]) == (2, 30)
    changes = {"earning_months": 12, "clawback_window_days": 180, "w9_required_from_cents": 60000,
               "form_1099_threshold_cents": 60000, "application_response_days": 5, "rate_change_notice_days": 0}
    assert program.validate(changes) == changes
    assert program.clean(changes) == {**got, **changes}


def test_each_new_number_refuses_what_it_cannot_mean():
    for bad in ({"earning_months": 121}, {"earning_months": -1}, {"clawback_window_days": 731},
                {"application_response_days": 0}, {"application_response_days": 31},
                {"w9_required_from_cents": 10_000_001}, {"form_1099_threshold_cents": "600"},
                {"rate_change_notice_days": 366}, {"rate_change_notice_days": True}):
        with pytest.raises(program.SettingError):
            program.validate(bad)


# ── How long a referral earns ─────────────────────────────────────────────────

def test_a_referral_earns_for_calendar_months_from_its_sign_up():
    at = datetime(2026, 10, 15, 9, 30, tzinfo=UTC)
    assert program.earn_until(at, 0) is None                     # the default: for as long as the shop pays
    assert program.earn_until(at, 12) == datetime(2027, 10, 15, 9, 30, tzinfo=UTC)
    assert program.earn_until(at, 3) == datetime(2027, 1, 15, 9, 30, tzinfo=UTC)
    # A day the later month does not have is its last day.
    assert program.earn_until(datetime(2027, 1, 31, tzinfo=UTC), 1) == datetime(2027, 2, 28, tzinfo=UTC)
    assert program.earn_until(datetime(2027, 12, 31, tzinfo=UTC), 2) == datetime(2028, 2, 29, tzinfo=UTC)


def signup_db(settings, *, click_valid):
    known = {"MARIA": MARIA, "LINH": LINH}
    return FakeDB(settings, [
        ("FROM partners WHERE upper(code)", lambda p: [known[p["c"]]] if p["c"] in known else []),
        ("FROM partner_clicks", [{"id": 7, "src": "instagram"}] if click_valid else []),
        ("INSERT INTO partner_referrals", [("44444444-4444-4444-8444-444444444444",)]),
        ("INSERT INTO partner_activity", []),
    ])


async def signup(db, *, typed_code=None, cookie="MARIA.7"):
    return await referrals.attribute_signup(db, tenant_id=SHOP, shop_name="Torres Print",
                                            owner_email="owner@torresprint.com", typed_code=typed_code,
                                            cookie=cookie)


async def test_a_referral_keeps_the_earning_period_it_was_made_under():
    db = signup_db({"earning_months": 12}, click_valid=True)
    await signup(db)
    row = db.sent("INSERT INTO partner_referrals")[0]
    assert row["until"] == program.earn_until(row["at"], 12) and row["until"] > row["at"]
    # The default sets no end, as every referral before the setting had.
    db = signup_db({}, click_valid=True)
    await signup(db)
    assert db.sent("INSERT INTO partner_referrals")[0]["until"] is None


async def test_a_shop_added_by_hand_earns_for_the_same_period():
    db = FakeDB({"earning_months": 6}, [
        ("SELECT * FROM partners WHERE id", [MARIA]),
        ("FROM tenants t WHERE t.id", [{"id": SHOP, "name": "Torres Print", "email": "owner@torresprint.com"}]),
        ("SELECT 1 FROM partner_referrals WHERE shop_tenant_id", []),
        ("INSERT INTO partner_referrals", [("44444444-4444-4444-8444-444444444444",)]),
        ("INSERT INTO partner_activity", []),
    ])
    await actions.add_referral(db, ADMIN, MARIA["id"], SHOP, "The link was missed")
    row = db.sent("INSERT INTO partner_referrals")[0]
    assert row["until"] == program.earn_until(row["at"], 6)


def invoice_db(referral):
    return FakeDB({}, [
        ("FROM tenant_subscriptions WHERE stripe_subscription_id", [(SHOP,)]),
        ("FROM partner_referrals r", [referral]),
        ("WHERE key LIKE 'stripe_price_%'", [("stripe_price_starter", "price_starter")]),
        ("FROM partner_terms_versions", [{"version": 1, "clauses": [], "changes": None,
                                          "published_at": datetime(2026, 1, 1, tzinfo=UTC)}]),
        ("INSERT INTO partner_commission_lines", [("55555555-5555-4555-8555-555555555555",)]),
        ("INSERT INTO partner_activity", []),
    ])


def paid_invoice(paid_at):
    ts = int(paid_at.timestamp())
    return {"id": "evt_1", "type": "invoice.paid", "created": ts, "livemode": False, "data": {"object": {
        "id": "in_1", "subscription": "sub_1", "customer": "cus_1", "amount_paid": 9700,
        "status_transitions": {"paid_at": ts},
        "lines": {"data": [{"amount": 9700, "price": {"id": "price_starter", "lookup_key": None}}]}}}}


async def test_an_invoice_paid_after_the_earning_period_earns_nothing():
    until = datetime(2027, 10, 15, 12, 0, tzinfo=UTC)
    referral = {"id": "r1", "partner_id": MARIA["id"], "status": "active", "flags": [],
                "attributed_at": datetime(2026, 10, 15, 12, 0, tzinfo=UTC), "ended_at": None, "earn_until": until,
                "shop_name": "Torres Print", "partner_status": "active", "partner_name": "Maria Torres",
                "custom_rate_bps": None, "custom_rate_ends_on": None, "partner_terms": 1, "plan_rate_bps": 2000}
    db = invoice_db(referral)
    got = await commissions._invoice_paid(db, paid_invoice(until + timedelta(days=1)), True)
    assert got.result == "ignored"
    assert got.detail == "Paid after the referral's earning period ended on Oct 15, 2027"
    assert not db.sent("INSERT INTO partner_commission_lines")
    # Paid within the period it earns, and so does every invoice of a referral with no end.
    for end in (until, None):
        db = invoice_db({**referral, "earn_until": end})
        got = await commissions._invoice_paid(db, paid_invoice(until - timedelta(hours=1)), True)
        assert got.result == "line_created"
        assert db.sent("INSERT INTO partner_commission_lines")[0]["amount"] == 1940


def test_a_shop_past_its_earning_period_shows_no_monthly_commission():
    now = datetime.now(UTC)
    row = {"id": "r1", "shop_name": "Torres Print", "plan": "starter", "sub_status": "active",
           "attributed_at": now - timedelta(days=400), "earn_until": now - timedelta(days=1)}
    assert portal._shop(row, 2000)["monthly_cents"] is None
    expected = ledger.commission_cents(program.plan_price_cents("starter"), 2000)
    assert portal._shop({**row, "earn_until": now + timedelta(days=30)}, 2000)["monthly_cents"] == expected
    assert portal._shop({**row, "earn_until": None}, 2000)["monthly_cents"] == expected


# ── How late a refund still takes commission back ─────────────────────────────

EARNED = datetime(2026, 1, 10, 15, 0, tzinfo=UTC)
PAID_LINE = {"id": "l1", "partner_id": MARIA["id"], "referral_id": "r1", "shop_tenant_id": SHOP,
             "stripe_invoice_id": "in_1", "plan_key": "starter", "base_cents": 9700, "rate_bps": 2000,
             "amount_cents": 1940, "status": "paid", "hold_reason": None, "livemode": False, "earned_at": EARNED}


async def take_back(db, at):
    return await commissions._take_back(db, PAID_LINE, reversed_total=9700, paid=9700,
                                        source_ref="refund:ch_1:9700", what="Refund", payment_ref="pi_1",
                                        same_world=True, at=at)


async def test_a_refund_past_the_clawback_window_takes_nothing_back():
    db = FakeDB({"clawback_window_days": 90})        # nothing but the settings may be read
    got = await take_back(db, EARNED + timedelta(days=90, minutes=1))
    assert got.result == "ignored"
    assert got.detail == ("Refund more than 90 days after the commission was earned, past the clawback "
                          "window; nothing is taken back")
    # Inside the window it is taken back, and with no window (the default) however late it comes.
    for settings, at in (({"clawback_window_days": 90}, EARNED + timedelta(days=90)),
                         ({}, EARNED + timedelta(days=700))):
        db = FakeDB(settings, [
            ("WHERE reverses_line_id", [(0, 0)]),
            ("INSERT INTO partner_commission_lines", [("66666666-6666-4666-8666-666666666666",)]),
            ("INSERT INTO partner_activity", []),
        ])
        got = await take_back(db, at)
        assert got.result == "clawback_created"
        assert db.sent("INSERT INTO partner_commission_lines")[0]["amount"] == -1940


def test_a_refund_is_judged_by_the_day_it_happened_not_the_day_it_was_read():
    event = {"created": int(EARNED.timestamp())}
    assert commissions._happened_at(event) == EARNED


# ── When applications are answered ────────────────────────────────────────────

def overview_db(settings):
    return FakeDB(settings, [
        ("FROM partner_applications", [{"open": 3, "old": 1,
                                        "oldest": datetime.now(UTC) - timedelta(days=6)}]),
        ("FROM partners p JOIN partner_rate_plans rp", []),
        ("FROM partner_referrals r JOIN tenant_subscriptions", [(0,)]),
        ("FROM partner_commission_lines l", []),
        ("FROM partner_documents", []),
        ("SELECT partner_id, COALESCE(SUM(amount_cents), 0) FROM partner_payouts", []),
        ("SELECT COUNT(*), COALESCE(SUM(amount_cents), 0) FROM partner_payouts", [(0, 0)]),
        ("FROM partner_referrals WHERE status = 'review'", [(0,)]),
        ("FROM partner_stripe_events WHERE result = 'failed'", [{"n": 0, "kind": None, "tries": None}]),
        ("MAX(received_at)", [{"last": None, "processed": 0, "lines": 0, "replays": 0, "failed": 0,
                               "tries": None}]),
    ])


async def test_waiting_long_is_past_the_answer_time_the_program_promises():
    db = overview_db({"application_response_days": 5})
    got = await admin_views.overview(db)
    assert db.sent("FROM partner_applications")[0] == {"days": 5}
    assert got["applications"] == {"open": 3, "old": 1, "days": 5}
    assert got["attention"][0]["title"] == "1 application waiting over 5 days"
    got = await admin_views.overview(overview_db({}))
    assert got["attention"][0]["title"] == "1 application waiting over 2 days"


def test_partner_mail_keeps_the_promise_and_the_programs_support_address(monkeypatch):
    from app.services import email_service

    sent = []

    class Outbox:
        def __init__(self, _db):
            pass

        def send_raw(self, **kw):
            sent.append(kw)
            return True

    monkeypatch.setattr(email_service, "EmailService", Outbox)
    monkeypatch.setattr(email_service, "platform_inbox", lambda: "team@platform.test")
    # As before the settings: two working days, the platform's inbox, no reply-to of its own.
    assert mail.application_received("Ana Reyes", "ana@shop.test", 2)
    assert "usually answer within two working days" in sent[-1]["body_html"]
    assert sent[-1]["reply_to"] is None and "team@platform.test" in sent[-1]["body_html"]
    assert mail.application_received("Ana Reyes", "ana@shop.test", 5, support="partners@pc.test")
    assert "usually answer within five working days" in sent[-1]["body_html"]
    assert sent[-1]["reply_to"] == "partners@pc.test"
    assert "partners@pc.test" in sent[-1]["body_html"] and "team@platform.test" not in sent[-1]["body_html"]
    assert mail.status_changed("Ana Reyes", "ana@shop.test", "paused", support="partners@pc.test")
    assert sent[-1]["reply_to"] == "partners@pc.test"
    assert mail.working_days(1) == "one working day" and mail.working_days(14) == "14 working days"


# ── Payouts: the W-9, the 1099 marker and an ended partnership ────────────────

def test_a_w9_is_asked_for_once_the_years_payouts_reach_the_amount():
    assert ledger.w9_needed(paid_this_year=0, payout=1, required_from=0)       # 0: before every payout
    assert not ledger.w9_needed(paid_this_year=30000, payout=29999, required_from=60000)
    assert ledger.w9_needed(paid_this_year=30000, payout=30000, required_from=60000)   # this payout included
    no_w9 = dict(partner_status="active", payable=8730, minimum=5000, has_w9=False)
    assert ledger.payout_readiness(**no_w9) == ("blocked", "Blocked, no W-9")
    assert ledger.payout_readiness(**no_w9, paid_this_year=0, w9_from=60000) == ("ready", "Ready")
    assert ledger.payout_readiness(**no_w9, paid_this_year=55000, w9_from=60000)[0] == "blocked"


def record_db(settings, paid_this_year=0):
    return FakeDB(settings, [
        ("SELECT * FROM partner_payout_batches WHERE id", [{"id": "b1", "name": "B-2026-10", "status": "open"}]),
        ("SELECT * FROM partners WHERE id", [MARIA]),
        ("SELECT id, amount_cents FROM partner_commission_lines WHERE batch_id", [{"id": "l1", "amount_cents": 8730}]),
        ("FROM partner_documents", []),
        ("FROM partner_payouts WHERE paid_on", [(MARIA["id"], paid_this_year)] if paid_this_year else []),
        ("INSERT INTO partner_payouts", [("77777777-7777-4777-8777-777777777777",)]),
        ("UPDATE partner_commission_lines SET status = 'paid'", []),
        ("SELECT 1 FROM partner_commission_lines WHERE batch_id", []),
        ("UPDATE partner_payout_batches", []),
        ("INSERT INTO partner_activity", []),
    ])


async def record(db, override=None):
    return await actions.record_payout(db, ADMIN, "b1", MARIA["id"], paid_on=ledger.utc_today(), method="paypal",
                                       reference=None, w9_override_reason=override)


async def test_a_payout_under_the_w9_amount_is_recorded_without_one():
    db = record_db({"w9_required_from_cents": 60000})
    assert (await record(db))["amount_cents"] == 8730
    assert db.sent("INSERT INTO partner_payouts")[0]["override"] is None
    # Past the amount, and with the default (0), it needs a W-9 or an override, as before.
    for db in (record_db({"w9_required_from_cents": 60000}, paid_this_year=55000), record_db({})):
        with pytest.raises(actions.ActionError):
            await record(db)
    db = record_db({})
    await record(db, override="Collected on paper")
    assert db.sent("INSERT INTO partner_payouts")[0]["override"] == "Collected on paper"


async def test_yearly_totals_mark_who_reached_the_1099_amount():
    rows = [{"year": 2026, "id": "p1", "name": "Maria Torres", "email": "maria@torres.com", "cents": 72000,
             "payouts": 3, "has_w9": True},
            {"year": 2026, "id": "p2", "name": "Linh Tran", "email": "linh@tran.com", "cents": 59999,
             "payouts": 2, "has_w9": False}]
    got = await admin_views.yearly_totals(FakeDB({"form_1099_threshold_cents": 60000},
                                                 [("FROM partner_payouts po", rows)]))
    assert [r["form_1099"] for r in got] == [True, False]
    got = await admin_views.yearly_totals(FakeDB({}, [("FROM partner_payouts po", rows)]))
    assert not any(r["form_1099"] for r in got)        # 0: nobody is marked, as before


def test_an_ended_partnership_is_paid_its_last_balance_whatever_the_minimum():
    ended = dict(partner_status="terminated", minimum=5000, has_w9=True)
    assert ledger.payout_readiness(payable=1940, **ended) == ("ready", "Final payout")
    assert ledger.payout_readiness(payable=0, **ended) == ("under_min", "Nothing payable")
    assert ledger.payout_readiness(payable=-500, **ended)[0] == "under_min"
    assert ledger.payout_readiness(partner_status="terminated", payable=1940, minimum=5000,
                                   has_w9=False)[0] == "blocked"
    # A partner still in the program rolls over, and a suspended one is held.
    assert ledger.payout_readiness(partner_status="active", payable=1940, minimum=5000, has_w9=True)[0] == "under_min"
    assert ledger.payout_readiness(partner_status="suspended", payable=99999, minimum=5000, has_w9=True)[0] == "held"


async def test_an_ended_partners_earned_commission_goes_into_a_batch():
    db = FakeDB({}, [
        ("FROM partner_payout_batches WHERE name", []),
        ("INSERT INTO partner_payout_batches", [("88888888-8888-4888-8888-888888888888",)]),
        ("SELECT * FROM partners WHERE id", [{**MARIA, "status": "terminated"}]),
        ("FROM partner_documents", [(1,)]),
        ("FROM partner_payouts WHERE paid_on", []),
        ("SELECT id, amount_cents FROM partner_commission_lines", [{"id": "l1", "amount_cents": 1940}]),
        ("UPDATE partner_commission_lines SET batch_id", []),
        ("INSERT INTO partner_activity", []),
    ])
    got = await actions.create_batch(db, ADMIN, [MARIA["id"]], name="B-2026-10", note=None)
    assert (got["total_cents"], got["lines"]) == (1940, 1)
    assert db.sent("UPDATE partner_commission_lines SET batch_id")[0]["ids"] == ["l1"]


# ── Sign-up: a typed code when the cookie's click no longer counts ────────────

async def test_a_typed_code_counts_when_the_cookies_click_no_longer_does():
    # The window was shortened: the browser still has MARIA's cookie, its click is too old.
    got = await signup(signup_db({"cookie_days": 30}, click_valid=False), typed_code="LINH")
    assert (got["partner_id"], got["source"]) == (LINH["id"], "code")
    # A valid click still beats a typed code.
    got = await signup(signup_db({}, click_valid=True), typed_code="LINH")
    assert (got["partner_id"], got["source"]) == (MARIA["id"], "cookie")
    # With neither, the shop is nobody's.
    assert await signup(signup_db({}, click_valid=False)) is None


# ── The default rate plan ─────────────────────────────────────────────────────

async def test_one_rate_plan_is_the_default_changed_in_one_statement_and_logged():
    from app.api.v1.platform import affiliates

    request = SimpleNamespace(state=SimpleNamespace(user_id=None))
    db = FakeDB({}, [
        ("SELECT id, name, is_default FROM partner_rate_plans", [{"id": "rp2", "name": "Preferred",
                                                                  "is_default": False}]),
        ("SELECT name FROM partner_rate_plans WHERE is_default", [("Standard",)]),
        ("UPDATE partner_rate_plans", []),
        ("INSERT INTO partner_activity", []),
    ])
    reason = affiliates.ReasonIn(reason="Preferred for everyone new")
    assert await affiliates.make_default_rate_plan("rp2", reason, request, db) == {"ok": True}
    updates = [sql for sql, _ in db.ran if sql.startswith("UPDATE partner_rate_plans")]
    assert len(updates) == 1 and "SET is_default = (id = CAST(:id AS uuid))" in updates[0]
    log = db.sent("INSERT INTO partner_activity")[0]
    assert log["action"] == "rate_plan_changed" and log["reason"] == "Preferred for everyone new"
    assert (json.loads(log["before"]), json.loads(log["after"])) == ({"default": "Standard"}, {"default": "Preferred"})
    # The default already: nothing changes and nothing is logged.
    db = FakeDB({}, [("SELECT id, name, is_default FROM partner_rate_plans",
                      [{"id": "rp1", "name": "Standard", "is_default": True}])])
    assert await affiliates.make_default_rate_plan("rp1", reason, request, db) == {"ok": True}
    assert len(db.ran) == 1
