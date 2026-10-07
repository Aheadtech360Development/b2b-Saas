"""Address suggestions at checkout: what the buyer is offered, and what it costs.

The street field asks the server as the buyer types; the server asks Geoapify
and turns its answer into the four fields the form has. Geoapify's free plan
is 3,000 requests a day for every shop together, so repeats come from a cache,
a visitor and a shop may only ask so fast, the day's budget stops short of the
plan's, and when Geoapify says the allowance is spent the server stops asking.
Whatever goes wrong, the answer is "no suggestions", never an error page: the
buyer can always type the address.

Geoapify is stood in for: the real service is not reached from a test. Needs
the local Redis; no database. `python -m pytest tests/test_address_suggest.py`.
"""
import logging
import uuid
from datetime import UTC, datetime

import httpx
import pytest

from app.api.v1 import address
from app.core.config import settings
from app.core.redis import get_redis_pool
from app.main import app

KEY = "test-geoapify-key-0000"
REAL_CLIENT = httpx.AsyncClient

# Geoapify's own shape (format=json): a named building, a street it knows
# without the typed house number, a city with no street, and the same
# address twice.
RESULTS = [
    {"name": "Sheridan Inn", "housenumber": "856", "street": "Broadway Street", "city": "Sheridan",
     "state": "Wyoming", "state_code": "WY", "postcode": "82801", "country_code": "us",
     "address_line1": "Sheridan Inn", "result_type": "amenity"},
    {"street": "North Gould Street", "city": "Sheridan", "state": "Wyoming", "postcode": "82801",
     "country_code": "us", "result_type": "street"},
    {"city": "Sheridan", "state": "Wyoming", "state_code": "WY", "country_code": "us", "result_type": "city"},
    {"housenumber": "856", "street": "Broadway Street", "city": "Sheridan", "state_code": "WY",
     "postcode": "82801", "country_code": "us", "result_type": "building"},
]


def test_results_become_the_four_fields_the_form_has():
    out = address.suggestions_from(RESULTS, "30 N Gould", "us")
    assert out == [
        # The street address, not the building's name.
        {"label": "856 Broadway Street, Sheridan, WY 82801", "line1": "856 Broadway Street", "city": "Sheridan",
         "state": "WY", "postal_code": "82801", "country": "US"},
        # A street the data knows without this house: the number typed is kept,
        # and a state given by name becomes its two letters.
        {"label": "30 North Gould Street, Sheridan, WY 82801", "line1": "30 North Gould Street",
         "city": "Sheridan", "state": "WY", "postal_code": "82801", "country": "US"},
    ]  # the city alone fills no street, and the repeat is shown once


def geoapify(handler):
    """httpx with Geoapify answered by `handler`."""

    class Client(REAL_CLIENT):
        def __init__(self, *a, **kw):
            kw["transport"] = httpx.MockTransport(handler)
            super().__init__(*a, **kw)

    return Client


@pytest.fixture
async def server(monkeypatch):
    monkeypatch.setattr(settings, "GEOAPIFY_API_KEY", KEY)
    r = get_redis_pool()
    day = datetime.now(UTC).strftime("%Y%m%d")
    for k in await r.keys("addr:budget:*") + await r.keys("addr:cooldown"):
        await r.delete(k)
    asked = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(dict(request.url.params))
        return httpx.Response(200, json={"results": RESULTS})

    monkeypatch.setattr(httpx, "AsyncClient", geoapify(handler))
    transport = httpx.ASGITransport(app=app)
    ip = f"10.9.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
    async with REAL_CLIENT(transport=transport, base_url="http://test", headers={"X-Forwarded-For": ip}) as client:
        yield client, asked, day
    for k in await r.keys("addr:budget:*") + await r.keys("addr:cooldown"):
        await r.delete(k)


def q(text=None):
    return f"30 N Gould {uuid.uuid4().hex[:6]}" if text is None else text


async def test_suggestions_are_asked_for_once_and_then_remembered(server):
    client, asked, _ = server
    text = q()
    r = await client.get("/api/v1/address/suggest", params={"q": text})
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True and body["attribution"] == "Powered by Geoapify"
    assert [s["line1"] for s in body["suggestions"]] == ["856 Broadway Street", "30 North Gould Street"]
    # Asked inside the US, as JSON, with the key — from the server, not the page.
    assert asked == [{"text": text, "filter": "countrycode:us", "format": "json", "limit": "5", "lang": "en",
                      "apiKey": KEY}]
    again = await client.get("/api/v1/address/suggest", params={"q": f"  {text.upper()} "})
    assert again.json()["suggestions"] == body["suggestions"] and len(asked) == 1


async def test_a_guest_may_ask_and_too_little_typed_asks_nothing(server):
    client, asked, _ = server
    r = await client.get("/api/v1/address/suggest", params={"q": "30"})
    assert r.status_code == 200 and r.json()["suggestions"] == [] and asked == []


async def test_without_a_key_suggestions_are_off(server, monkeypatch):
    client, asked, _ = server
    monkeypatch.setattr(settings, "GEOAPIFY_API_KEY", "")
    r = await client.get("/api/v1/address/suggest", params={"q": q()})
    assert r.json() == {"enabled": False, "suggestions": []} and asked == []


async def test_the_days_budget_stops_short_of_the_free_plan(server, monkeypatch):
    client, asked, day = server
    monkeypatch.setattr(address, "DAILY_BUDGET", 2)
    for _ in range(3):
        r = await client.get("/api/v1/address/suggest", params={"q": q()})
        assert r.status_code == 200
    assert len(asked) == 2 and r.json()["suggestions"] == []


async def test_one_shop_cannot_spend_every_shops_allowance(server, monkeypatch):
    client, asked, _ = server
    monkeypatch.setattr(address, "SHOP_DAILY_BUDGET", 1)
    a = {"X-Tenant-Slug": "shop-a"}
    await client.get("/api/v1/address/suggest", params={"q": q()}, headers=a)
    r = await client.get("/api/v1/address/suggest", params={"q": q()}, headers=a)
    assert r.json()["suggestions"] == [] and len(asked) == 1
    r = await client.get("/api/v1/address/suggest", params={"q": q()}, headers={"X-Tenant-Slug": "shop-b"})
    assert r.json()["suggestions"] and len(asked) == 2


async def test_one_visitor_may_only_ask_so_fast(server, monkeypatch):
    client, asked, _ = server
    monkeypatch.setattr(address, "VISITOR_PER_MINUTE", 2)
    codes = [(await client.get("/api/v1/address/suggest", params={"q": q()})).status_code for _ in range(3)]
    assert codes == [200, 200, 429] and len(asked) == 2


async def test_when_the_allowance_is_spent_it_stops_asking(server, monkeypatch):
    client, asked, _ = server
    calls = []

    def spent(request):
        calls.append(1)
        return httpx.Response(429, json={"message": "limit"})

    monkeypatch.setattr(httpx, "AsyncClient", geoapify(spent))
    for _ in range(3):
        r = await client.get("/api/v1/address/suggest", params={"q": q()})
        assert r.status_code == 200 and r.json()["suggestions"] == []
    assert len(calls) == 1  # then a cool-down, not a request per keystroke


async def test_a_failure_is_no_suggestions_and_never_logs_the_key(server, monkeypatch, caplog):
    client, asked, _ = server

    def broken(request):
        return httpx.Response(500, text=f"error for {request.url}")

    monkeypatch.setattr(httpx, "AsyncClient", geoapify(broken))
    with caplog.at_level(logging.WARNING):
        r = await client.get("/api/v1/address/suggest", params={"q": q()})
    assert r.status_code == 200 and r.json() == {"enabled": True, "suggestions": [], "attribution": "Powered by Geoapify"}
    assert "status 500" in caplog.text and KEY not in caplog.text
