"""The partner program's money: what a paid invoice earns (in both of Stripe's
invoice shapes), clawbacks, balances and payout readiness; plus how a sign-up
is matched to a partner and what the program's settings accept."""
from datetime import date

import pytest

from app.services.partners import ledger, program, referrals

PRICES = {"price_starter": "starter", "price_wholesale": "wholesale", "price_scale": "scale"}
ALL = {"starter", "wholesale", "scale"}


def plan_for(pid, pobj):
    return PRICES.get(pid)


def old_line(price, amount, **extra):
    """An invoice line as webhooks made before Stripe's 2025 versions send it."""
    return {"amount": amount, "price": {"id": price, "lookup_key": None}, **extra}


def new_line(price, amount, **extra):
    """The same line in the 2025 shape: the price under pricing.price_details."""
    return {"amount": amount, "pricing": {"type": "price_details",
                                          "price_details": {"price": price, "product": "prod_x"}}, **extra}


def invoice(lines, paid, **extra):
    return {"id": "in_1", "amount_paid": paid, "lines": {"data": lines}, **extra}


# ── What an invoice earns ─────────────────────────────────────────────────────

@pytest.mark.parametrize("make", [old_line, new_line])
def test_a_plan_invoice_earns_on_its_base_fee_in_either_shape(make):
    inv = invoice([make("price_starter", 9700)], 9700)
    got = ledger.invoice_earning(inv, inv["lines"]["data"], plan_for, ALL)
    assert (got.base_cents, got.plan_key) == (9700, "starter")
    assert ledger.commission_cents(got.base_cents, 2000) == 1940          # $19.40 at 20%
    assert ledger.commission_cents(49700, 3000) == 14910                    # Scale at 30%


def test_a_promotion_code_lowers_the_base():
    line = new_line("price_wholesale", 29700, discount_amounts=[{"amount": 2970, "discount": "di_1"}])
    got = ledger.invoice_earning(invoice([line], 26730), [line], plan_for, ALL)
    assert got.base_cents == 26730 and ledger.commission_cents(got.base_cents, 2000) == 5346


def test_a_discount_given_only_as_a_pretax_credit_is_read_too():
    line = new_line("price_starter", 9700, pretax_credit_amounts=[
        {"type": "discount", "amount": 970}, {"type": "credit_balance_transaction", "amount": 100}])
    assert ledger.line_paid_base(line) == 8730


def test_a_plan_switch_adds_the_old_plans_credit_and_names_the_new_plan():
    lines = [new_line("price_starter", -4850), new_line("price_wholesale", 14850),
             new_line("price_wholesale", 29700)]
    got = ledger.invoice_earning(invoice(lines, 39700), lines, plan_for, ALL)
    assert (got.base_cents, got.plan_key) == (39700, "wholesale")


def test_an_invoice_with_no_plan_price_earns_nothing():
    lines = [new_line("price_addon", 1500)]
    got = ledger.invoice_earning(invoice(lines, 1500), lines, plan_for, ALL)
    assert (got.base_cents, got.reason) == (0, "Add-on only, not a plan price")


def test_a_plan_the_program_does_not_pay_on_says_so():
    lines = [old_line("price_scale", 49700)]
    got = ledger.invoice_earning(invoice(lines, 49700), lines, plan_for, {"starter", "wholesale"})
    assert (got.base_cents, got.reason) == (0, "This plan does not earn commission")


def test_a_zero_invoice_earns_nothing():
    lines = [old_line("price_starter", 9700, discount_amounts=[{"amount": 9700}])]
    got = ledger.invoice_earning(invoice(lines, 0), lines, plan_for, ALL)
    assert (got.base_cents, got.reason) == (0, "$0 invoice, nothing was paid")


def test_only_a_credit_for_unused_time_earns_nothing():
    lines = [new_line("price_scale", -20000)]
    got = ledger.invoice_earning(invoice(lines, 100), lines, plan_for, ALL)
    assert (got.base_cents, got.reason) == (0, "Plan credit only, nothing earned")


def test_the_base_is_never_more_than_was_actually_paid():
    lines = [old_line("price_starter", 9700)]
    # Part of it came off the shop's credit balance.
    assert ledger.invoice_earning(invoice(lines, 5000), lines, plan_for, ALL).base_cents == 5000


def test_tax_added_on_top_is_not_commission_and_tax_inside_is_taken_out():
    on_top = [old_line("price_starter", 9700)]
    inv = invoice(on_top, 10500, total_tax_amounts=[{"amount": 800, "inclusive": False}])
    assert ledger.invoice_earning(inv, on_top, plan_for, ALL).base_cents == 9700
    new_on_top = invoice(on_top, 10500, total_taxes=[{"amount": 800, "tax_behavior": "exclusive"}])
    assert ledger.invoice_earning(new_on_top, on_top, plan_for, ALL).base_cents == 9700
    inside_old = old_line("price_starter", 9700, tax_amounts=[{"amount": 700, "inclusive": True}])
    inside_new = new_line("price_starter", 9700, taxes=[{"amount": 700, "tax_behavior": "inclusive"}])
    assert ledger.line_paid_base(inside_old) == ledger.line_paid_base(inside_new) == 9000


def test_rounding_goes_half_a_cent_away_from_zero():
    assert ledger.commission_cents(9999, 2000) == 2000      # 1999.8
    assert ledger.commission_cents(-9999, 2000) == -2000
    assert ledger.commission_cents(1, 5000) == 1             # exactly half
    assert ledger.commission_cents(-1, 5000) == -1


# ── Reading the right ids out of an invoice ───────────────────────────────────

def test_the_subscription_and_payment_are_found_in_either_shape():
    assert ledger.subscription_id_of({"subscription": "sub_old"}) == "sub_old"
    assert ledger.subscription_id_of({"parent": {"type": "subscription_details",
                                                 "subscription_details": {"subscription": "sub_new"}}}) == "sub_new"
    assert ledger.subscription_id_of({"lines": {"data": [
        {"parent": {"subscription_item_details": {"subscription": "sub_line"}}}]}}) == "sub_line"
    assert ledger.payment_ref_of({"payment_intent": "pi_old"}) == "pi_old"
    assert ledger.payment_ref_of({"payments": {"data": [
        {"payment": {"type": "payment_intent", "payment_intent": "pi_new"}}]}}) == "pi_new"
    assert ledger.payment_ref_of({}) is None
    meta = {"parent": {"subscription_details": {"metadata": {"tenant_id": "t1"}}}}
    assert ledger.subscription_metadata_of(meta) == {"tenant_id": "t1"}


# ── Clawbacks ─────────────────────────────────────────────────────────────────

def test_a_refund_takes_back_its_share_and_a_replay_takes_nothing():
    full = ledger.clawback_due(line_amount=5940, line_base=29700, refunded=29700, paid=29700,
                               taken_amount=0, taken_base=0)
    assert full == (5940, 29700)
    half = ledger.clawback_due(line_amount=5940, line_base=29700, refunded=14850, paid=29700,
                               taken_amount=0, taken_base=0)
    assert half == (2970, 14850)
    # The second partial refund brings the total to everything: only the rest.
    rest = ledger.clawback_due(line_amount=5940, line_base=29700, refunded=29700, paid=29700,
                               taken_amount=2970, taken_base=14850)
    assert rest == (2970, 14850)
    again = ledger.clawback_due(line_amount=5940, line_base=29700, refunded=29700, paid=29700,
                                taken_amount=5940, taken_base=29700)
    assert again == (0, 0)
    more_than_paid = ledger.clawback_due(line_amount=1940, line_base=9700, refunded=99999, paid=9700,
                                         taken_amount=0, taken_base=0)
    assert more_than_paid == (1940, 9700)


# ── Balances and payouts ──────────────────────────────────────────────────────

TODAY = date(2026, 10, 14)


def line(amount, status="open", payable_on=TODAY, kind="commission", batch_id=None):
    return {"amount_cents": amount, "status": status, "payable_on": payable_on, "kind": kind,
            "batch_id": batch_id}


def test_balances_net_clawbacks_into_payable_and_keep_holds_apart():
    got = ledger.balances([
        line(9940, payable_on=date(2026, 9, 9)),            # payable
        line(5940, payable_on=date(2026, 9, 4)),            # payable
        line(-1940, kind="clawback"),                        # nets now
        line(17820, payable_on=date(2026, 11, 8)),          # still inside the hold
        line(1940, status="held"),
        line(1940, status="paid", payable_on=date(2026, 8, 1)),
        line(5000, payable_on=date(2026, 9, 1), batch_id="b1"),
    ], TODAY)
    assert got == {"pending": 17820, "payable": 13940, "payable_gross": 15880, "clawbacks": -1940,
                   "on_hold": 1940, "in_batch": 5000, "paid": 1940}


def test_line_states_are_the_words_the_screens_use():
    assert ledger.line_state("commission", "open", date(2026, 11, 8), TODAY) == "pending"
    assert ledger.line_state("commission", "open", TODAY, TODAY) == "payable"
    assert ledger.line_state("clawback", "open", TODAY, TODAY) == "clawback"
    assert ledger.line_state("commission", "held", TODAY, TODAY) == "on_hold"
    assert ledger.line_state("adjustment", "void", TODAY, TODAY) == "void"


def test_who_can_be_paid_in_the_next_batch():
    ready = dict(minimum=5000, has_w9=True)
    assert ledger.payout_readiness(partner_status="active", payable=24120, **ready) == ("ready", "Ready")
    assert ledger.payout_readiness(partner_status="paused", payable=5940, **ready) == ("ready", "Paused, still paid")
    assert ledger.payout_readiness(partner_status="suspended", payable=7960, **ready)[0] == "held"
    # Under the minimum rolls over, W-9 or not.
    assert ledger.payout_readiness(partner_status="active", payable=3880, minimum=5000,
                                   has_w9=False) == ("under_min", "Under $50, rolls over")
    assert ledger.payout_readiness(partner_status="active", payable=8730, minimum=5000,
                                   has_w9=False)[0] == "blocked"
    assert ledger.money(-1940) == "-$19.40" and ledger.money(158880) == "$1,588.80"


# ── Matching a sign-up to a partner ───────────────────────────────────────────

def test_codes_and_cookies_are_read_strictly():
    assert referrals.normalise_code(" maria ") == "MARIA"
    assert referrals.normalise_code("an-ar") == "ANAR"
    assert referrals.normalise_code("ab") is None
    assert referrals.parse_cookie("MARIA.123") == ("MARIA", 123)
    assert referrals.parse_cookie("MARIA") == (None, None)
    assert referrals.parse_cookie("MARIA.x") == (None, None)
    assert referrals.parse_cookie(None) == (None, None)
    assert referrals.clean_src(" Instagram Story! ") == "instagramstory"
    assert referrals.web_host("https://www.Torres-Print.com/about") == "torres-print.com"


def test_a_partner_referring_themselves_is_flagged():
    flags = referrals.self_referral_flags
    assert flags("maria@torres.com", "Maria@Torres.com", None) == ["self_referral"]
    assert flags("owner@torres.com", "maria@torres.com", None) == ["domain_match"]
    assert flags("owner@torresprint.com", "maria@gmail.com", "https://torresprint.com") == ["domain_match"]
    # Sharing a public mail provider says nothing.
    assert flags("someone@gmail.com", "maria@gmail.com", None) == []
    assert flags("owner@shop.com", "maria@torres.com", "torres.com") == []


# ── The program's settings ────────────────────────────────────────────────────

def test_settings_fall_back_to_the_designs_defaults():
    got = program.clean({})
    assert (got["hold_days"], got["minimum_payout_cents"], got["cookie_days"]) == (30, 5000, 90)
    assert got["commissionable_plans"] == ["starter", "wholesale", "scale"] and got["earning"] is True
    broken = program.clean({"hold_days": "thirty", "earning": "yes", "commissionable_plans": ["scale", "x"]})
    assert broken["hold_days"] == 30 and broken["earning"] is True
    assert broken["commissionable_plans"] == ["scale"]


def test_saving_refuses_what_it_cannot_keep():
    assert program.validate({"hold_days": 45, "earning": False}) == {"hold_days": 45, "earning": False}
    for bad in ({"hold_days": 400}, {"earning": "off"}, {"commissionable_plans": ["gold"]},
                {"support_email": "nope"}, {"nonsense": 1}):
        with pytest.raises(program.SettingError):
            program.validate(bad)


def test_an_override_rate_holds_through_its_last_day():
    assert program.effective_rate(2000, 2500, date(2026, 12, 31), date(2026, 12, 31)) == (2500, "override")
    assert program.effective_rate(2000, 2500, date(2026, 12, 31), date(2027, 1, 1)) == (2000, "plan")
    assert program.effective_rate(2000, 2500, None, date(2030, 1, 1)) == (2500, "override")
    assert program.effective_rate(3000, None, None, TODAY) == (3000, "plan")
    assert program.rate_words(2000) == "20%" and program.rate_words(2250) == "22.5%"
