"""Home's Sessions and Conversion rate (services/visits).

Conversion rate is visits that placed an order out of all visits, the way
Shopify counts it: 100 visits and 5 of them ordered is 5%.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import report_view, visits

CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"


class FakeDb:
    """Records each statement; every write touches one row."""

    def __init__(self):
        self.calls = []

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return SimpleNamespace(rowcount=1)

    def begin_nested(self):
        db = self

        class _Savepoint:
            async def __aenter__(self):
                return db

            async def __aexit__(self, *exc):
                return False

        return _Savepoint()


def test_five_of_a_hundred_is_five_percent():
    assert visits.rate(5, 100) == 5.0
    assert visits.rate(1, 3) == 33.33
    assert visits.rate(0, 40) == 0.0
    assert visits.rate(0, 0) is None


def test_crawlers_and_test_browsers_are_not_visits():
    for agent in (
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        "AdsBot-Google (+http://www.google.com/adsbot.html)",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0 Safari/537.36",
        "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 Chrome-Lighthouse",
        "python-requests/2.32", "", None,
    ):
        assert visits.is_bot(agent), agent
    for agent in (
        CHROME,
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0",
        "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
    ):
        assert not visits.is_bot(agent), agent


def test_a_visit_is_kept_with_its_source_and_only_the_page_path():
    db = FakeDb()
    vid = str(uuid.uuid4())
    kept = asyncio.run(visits.record(db, "t-1", {
        "id": vid, "landing_page": "https://shop.example/products/tee?email=someone@example.com",
        "referrer": "https://www.bing.com/", "utm_source": "Google", "utm_medium": "CPC",
        "utm_campaign": "Fall", "click": "gclid", "device": "mobile",
    }, CHROME))
    assert kept
    sql, p = db.calls[0]
    assert "ON CONFLICT (id) DO NOTHING" in sql
    assert p["id"] == vid and p["t"] == "t-1"
    assert (p["kind"], p["source"]) == ("paid_search", "Google")
    assert (p["us"], p["um"], p["uc"]) == ("google", "cpc", "Fall")
    assert p["path"] == "/products/tee" and p["device"] == "mobile"


def test_a_direct_visit_is_kept_as_direct():
    db = FakeDb()
    assert asyncio.run(visits.record(db, "t-1", {"id": str(uuid.uuid4()), "landing_page": "https://shop.example/"}, CHROME))
    assert db.calls[0][1]["kind"] == "direct"


def test_no_id_or_a_crawler_keeps_nothing():
    db = FakeDb()
    assert not asyncio.run(visits.record(db, "t-1", {"id": "not-an-id"}, CHROME))
    assert not asyncio.run(visits.record(db, "t-1", {"id": str(uuid.uuid4())}, "Googlebot/2.1"))
    assert db.calls == []


def test_the_last_visit_listed_is_the_one_marked_converted():
    db = FakeDb()
    first, last = str(uuid.uuid4()), str(uuid.uuid4())
    order = SimpleNamespace(id=uuid.uuid4(), tenant_id=uuid.uuid4())
    asyncio.run(visits.mark_converted(db, order, {"sessions": [
        {"id": last, "at": "2026-10-27T09:00:00Z"},
        {"id": first, "at": "2026-10-23T16:02:00Z"},
    ]}))
    sql, p = db.calls[0]
    assert "order_id IS NULL" in sql
    assert p["id"] == last and p["o"] == str(order.id) and p["t"] == str(order.tenant_id)


def test_marking_never_stops_an_order():
    class Broken(FakeDb):
        async def execute(self, statement, params=None):
            raise RuntimeError("table missing")

    order = SimpleNamespace(id=uuid.uuid4(), tenant_id=uuid.uuid4())
    asyncio.run(visits.mark_converted(Broken(), order, {"sessions": [{"id": str(uuid.uuid4()), "at": "2026-10-27T09:00:00Z"}]}))
    # Nothing listed, or no ids: nothing to mark, nothing asked of the database.
    db = FakeDb()
    asyncio.run(visits.mark_converted(db, order, None))
    asyncio.run(visits.mark_converted(db, order, {"sessions": [{"at": "2026-10-27T09:00:00Z"}]}))
    assert db.calls == []


def test_all_time_runs_from_before_any_shop_to_today():
    now = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)
    s = report_view.span("all", offset_minutes=-300, now=now)
    assert s.first == report_view.ALL_TIME_FROM
    assert s.last.isoformat() == "2026-10-27"
    assert s.end == datetime(2026, 10, 28, 5, 0, tzinfo=timezone.utc)
