"""A card on file starts the brand's plan (billing_service.start_params).

The billing portal saves a card and starts nothing, so a brand with a card on
file was never charged. The subscription it now gets: charged to that card,
off session; the first charge in the request so a decline makes nothing; held
until the trial's end while the trial runs; started once however many workers
try at the same moment. The whole path was run against Stripe's test mode.
"""
from datetime import UTC, datetime, timedelta

from app.services.billing_service import start_params

NOW = datetime(2026, 10, 13, 12, 0, tzinfo=UTC)


def params(trial_ends_at):
    return start_params(customer_id="cus_1", price_id="price_starter", payment_method="pm_1",
                        tenant_id="t-1", plan_key="starter", trial_ends_at=trial_ends_at, now=NOW)


def test_charged_to_the_card_on_file_and_nothing_made_if_it_is_declined():
    p, _ = params(None)
    assert p["customer"] == "cus_1" and p["items"] == [{"price": "price_starter"}]
    assert p["default_payment_method"] == "pm_1" and p["off_session"] is True
    assert p["payment_behavior"] == "error_if_incomplete"
    assert p["metadata"] == {"tenant_id": "t-1", "plan_key": "starter", "started_by": "card_on_file"}
    assert "trial_end" not in p


def test_a_running_trial_holds_the_first_charge_until_it_ends():
    ends = NOW + timedelta(days=5)
    p, _ = params(ends)
    assert p["trial_end"] == int(ends.timestamp())
    # A trial stored without a timezone is UTC, as the database keeps it.
    p2, _ = params(ends.replace(tzinfo=None))
    assert p2["trial_end"] == int(ends.timestamp())


def test_a_trial_that_is_over_or_ending_within_the_hour_charges_now():
    assert "trial_end" not in params(NOW - timedelta(days=3))[0]
    assert "trial_end" not in params(NOW + timedelta(minutes=30))[0]


def test_one_start_per_brand_card_and_day():
    _, key = params(None)
    assert key == "at360-start-t-1-starter-pm_1-20261013"
    _, other_card = start_params(customer_id="cus_1", price_id="price_starter", payment_method="pm_2",
                                 tenant_id="t-1", plan_key="starter", trial_ends_at=None, now=NOW)
    assert other_card != key
