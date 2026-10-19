"""The postcode a tax rate is looked up by.

A buyer whose address carried the long form of a ZIP (75243-1234) was shown no
tax and charged none: the provider reads the five-digit form only, and its
refusal came out as zero. No database and no network here: the provider is
replaced by something that records what it was asked.
"""
import asyncio

from app.services import tax_service


def test_the_long_form_of_a_zip_is_looked_up_by_its_first_five_digits():
    assert tax_service.zip5("75243-1234") == "75243"
    assert tax_service.zip5("75243 1234") == "75243"
    assert tax_service.zip5("752431234") == "75243"
    assert tax_service.zip5(" 75243-1234 ") == "75243"


def test_a_five_digit_zip_is_left_as_it_is():
    assert tax_service.zip5("75243") == "75243"
    assert tax_service.zip5(" 75243 ") == "75243"


def test_a_zip_that_lost_its_leading_zero_gets_it_back():
    # Boston's 02108 typed, or stored as a number, as 2108.
    assert tax_service.zip5("2108") == "02108"
    assert tax_service.zip5(2108) == "02108"


def test_nothing_else_is_rewritten():
    # Not a US postcode: handed over as it is and refused, as before, rather
    # than cut down to five digits that belong to somewhere else.
    assert tax_service.zip5("M5V 2T6") == "M5V 2T6"
    assert tax_service.zip5("75243-12") == "75243-12"
    assert tax_service.zip5("") == ""
    assert tax_service.zip5(None) == ""


class _Answer:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {"rCode": 100, "results": [{"taxSales": 0.0825}]}


def _ask(monkeypatch, postcode: str):
    """What calculate_tax asks the provider for, and what it answers."""
    asked: list[dict] = []
    saved: list[str] = []

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None, headers=None):
            asked.append(dict(params or {}))
            return _Answer()

    async def no_cache(key):
        return None

    async def remember(key, value, expire=None):
        saved.append(key)

    monkeypatch.setenv("ZIPTAX_API_KEY", "test-key-not-a-real-one")
    monkeypatch.setattr(tax_service.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(tax_service, "redis_get", no_cache)
    monkeypatch.setattr(tax_service, "redis_set", remember)
    result = asyncio.run(tax_service.calculate_tax("TX", postcode, "", 68.0, 0))
    return asked, saved, result


def test_an_address_with_the_long_zip_is_charged_tax(monkeypatch):
    asked, saved, result = _ask(monkeypatch, "75243-1234")
    assert asked[0]["postalcode"] == "75243"
    assert result["source"] == "ziptax"
    assert result["rate"] == 8.25
    assert result["tax_amount"] == 5.61
    # Remembered under the five-digit postcode, so both forms share one lookup.
    assert saved == ["ziptax:rate:75243"]


def test_a_five_digit_zip_is_asked_for_as_before(monkeypatch):
    asked, _saved, result = _ask(monkeypatch, "75243")
    assert asked[0]["postalcode"] == "75243"
    assert result["tax_amount"] == 5.61
