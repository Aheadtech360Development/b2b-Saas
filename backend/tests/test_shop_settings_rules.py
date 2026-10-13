"""What a shop may set for itself, and what each means when it has not: the
countries it sells to, whether it offers pickup, and its own time zone.
No database or network."""
import json

import pytest

from app.services import markets, pickup
from app.services import production_board as pb


def test_a_shop_that_never_chose_sells_where_it_always_did():
    assert markets.clean(None) == ["US", "CA"]
    assert markets.clean("") == ["US", "CA"]
    assert markets.clean("not json") == ["US", "CA"]
    assert markets.clean({"nothing": 1}) == ["US", "CA"]


def test_canada_can_be_switched_off_and_the_home_market_cannot():
    assert markets.clean('{"countries": ["US"]}') == ["US"]
    assert markets.clean({"countries": []}) == ["US"]
    assert markets.clean({"countries": ["ca"]}) == ["US", "CA"]


def test_a_country_nobody_can_ship_to_is_dropped():
    assert markets.clean({"countries": ["US", "MX", "CA", "FR"]}) == ["US", "CA"]
    assert json.loads(markets.dumps(["MX", "CA"])) == {"countries": ["US", "CA"]}


def test_an_address_is_allowed_or_refused_by_name():
    assert markets.allows(["US"], "us")
    assert markets.allows(["US"], None)          # no country given means the home market
    assert not markets.allows(["US"], "CA")
    assert markets.refusal("CA") == "This shop doesn't ship to Canada."
    assert "MX" in markets.refusal("mx")


def test_pickup_is_offered_until_a_shop_says_no():
    assert pickup.offered(None) is True
    assert pickup.offered("") is True
    assert pickup.offered("true") is True
    for off in ("false", "False", " off ", "0", "no"):
        assert pickup.offered(off) is False


def test_a_time_zone_is_a_name_or_nothing():
    assert pb.clean_timezone(None) == ""
    assert pb.clean_timezone("  ") == ""
    assert pb.clean_timezone("America/Chicago") == "America/Chicago"
    assert pb.clean_timezone("UTC") == "UTC"
    for bad in ("12:00", "Central Time", "America/Chicago; DROP", "../etc/passwd", "x" * 80):
        with pytest.raises(ValueError):
            pb.clean_timezone(bad)
