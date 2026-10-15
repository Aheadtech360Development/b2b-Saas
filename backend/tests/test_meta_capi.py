"""A brand's sales, sent to its own Meta pixel from the server (services/meta_capi)."""
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest

from app.services import integrations_service, meta_capi

PIXEL = "1131707639791414"
TOKEN = "EAAtest-token-value"


def analytics(**over) -> dict:
    base = {
        "enabled": True,
        "track_checkout": True,
        "tools": {"meta_pixel": {"id": PIXEL, "enabled": True}},
    }
    base.update(over)
    return base


def order(**over) -> SimpleNamespace:
    base = dict(
        id="0f0f0f0f-0000-4000-8000-000000000001",
        tenant_id=None,
        order_number="AF-1001",
        total=129.5,
        created_at=datetime.now(UTC) - timedelta(minutes=1),
        guest_email="  Buyer@Example.COM ",
        guest_name="Jane Q Doe",
        guest_phone="(214) 555-0199",
        placed_by=None,
        placed_by_id=None,
        company_id=None,
        shipping_address_snapshot=json.dumps({
            "full_name": "Jane Q Doe", "city": "Garland", "state": "TX",
            "postal_code": "75040-1234", "country": "US",
        }),
        items=[
            SimpleNamespace(id="i1", sku="TEE-BLK-L", variant_id="v1", quantity=2, unit_price=25),
            SimpleNamespace(id="i2", sku="DTF-22x24", variant_id=None, quantity=1, unit_price=79.5),
        ],
    )
    base.update(over)
    return SimpleNamespace(**base)


VISIT = meta_capi.Visit(
    client_ip="203.0.113.7", user_agent="Mozilla/5.0 test",
    fbp="fb.1.1700000000000.1234567890", fbc="fb.1.1700000000000.IwAR0abc",
    page_url="https://innterflow.com/checkout/review",
)


# ── Who sends ────────────────────────────────────────────────────────────────

def test_sends_only_with_tracking_pixel_purchases_and_a_token_all_on():
    conn = {"access_token": TOKEN}
    target = meta_capi.target_from(analytics(), conn)
    assert target == meta_capi.Target(pixel_id=PIXEL, access_token=TOKEN)

    assert meta_capi.target_from(analytics(enabled=False), conn) is None
    assert meta_capi.target_from(analytics(track_checkout=False), conn) is None
    assert meta_capi.target_from(analytics(tools={"meta_pixel": {"id": PIXEL, "enabled": False}}), conn) is None
    assert meta_capi.target_from(analytics(tools={}), conn) is None
    assert meta_capi.target_from(analytics(), None) is None
    assert meta_capi.target_from(analytics(), {"access_token": "  "}) is None


def test_the_token_never_shows_in_a_repr_or_log_line():
    target = meta_capi.Target(pixel_id=PIXEL, access_token=TOKEN)
    assert TOKEN not in repr(target)


def test_test_event_code_rides_along_when_saved():
    target = meta_capi.target_from(analytics(), {"access_token": TOKEN, "test_event_code": " TEST123 "})
    assert target.test_event_code == "TEST123"


# ── Normalising ──────────────────────────────────────────────────────────────

def test_normalisation_follows_meta_rules():
    assert meta_capi.norm_email("  John_Smith@Gmail.com ") == "john_smith@gmail.com"
    assert meta_capi.norm_email("not an email") is None
    assert meta_capi.norm_phone("(650) 555-1212", "us") == "16505551212"
    assert meta_capi.norm_phone("+44 20 7946 0958", "gb") == "442079460958"
    assert meta_capi.norm_phone("0044 20 7946 0958", "gb") == "442079460958"
    assert meta_capi.norm_phone("12", "us") is None
    assert meta_capi.norm_zip("94103-1234", "us") == "94103"
    assert meta_capi.norm_zip("SW1A 1AA", "gb") == "sw1a1aa"
    assert meta_capi.norm_city("New York") == "newyork"
    assert meta_capi.norm_state("TX") == "tx"
    assert meta_capi.norm_country("United States") == "us"
    assert meta_capi.norm_country("CA") == "ca"
    assert meta_capi.norm_country("Narnia") is None


# ── The event ────────────────────────────────────────────────────────────────

def test_purchase_carries_the_same_id_the_browser_used():
    event = meta_capi.purchase_event(order(), VISIT)
    assert event["event_name"] == "Purchase"
    assert event["event_id"] == "AF-1001"          # lib/tracking.ts: eventID = order number
    assert event["action_source"] == "website"
    assert event["event_source_url"] == "https://innterflow.com/checkout/review"
    data = event["custom_data"]
    assert data["value"] == 129.5 and data["currency"] == "USD"
    assert data["content_ids"] == ["TEE-BLK-L", "DTF-22x24"]
    assert data["num_items"] == 3
    assert data["contents"][0] == {"id": "TEE-BLK-L", "quantity": 2, "item_price": 25.0}


def test_customer_details_leave_hashed_and_browser_ids_as_they_are():
    event = meta_capi.purchase_event(order(), VISIT)
    user = event["user_data"]
    assert user["em"] == [meta_capi.sha256("buyer@example.com")]
    assert user["ph"] == [meta_capi.sha256("12145550199")]
    assert user["fn"] == meta_capi.sha256("jane")
    assert user["ln"] == meta_capi.sha256("doe")
    assert user["ct"] == meta_capi.sha256("garland")
    assert user["st"] == meta_capi.sha256("tx")
    assert user["zp"] == meta_capi.sha256("75040")
    assert user["country"] == meta_capi.sha256("us")
    assert user["fbp"] == VISIT.fbp and user["fbc"] == VISIT.fbc
    assert user["client_ip_address"] == "203.0.113.7"
    assert user["client_user_agent"] == "Mozilla/5.0 test"

    raw = json.dumps(event).lower()
    for plain in ("buyer@example.com", "2145550199", "garland", "75040"):
        assert plain not in raw


def test_a_signed_in_buyer_is_matched_by_their_account():
    buyer = SimpleNamespace(email="Pat@Shop.com", first_name="Pat", last_name="Lee", phone="2145550100")
    event = meta_capi.purchase_event(
        order(guest_email=None, guest_name=None, guest_phone=None, placed_by=buyer,
              placed_by_id="user-1", shipping_address_snapshot=None),
        meta_capi.Visit(),
    )
    user = event["user_data"]
    assert user["em"] == [meta_capi.sha256("pat@shop.com")]
    assert user["fn"] == meta_capi.sha256("pat")
    assert user["ph"] == [meta_capi.sha256("12145550100")]
    assert user["external_id"] == meta_capi.sha256("user-1")
    assert "country" not in user and "fbp" not in user


def test_event_time_is_never_in_the_future():
    now = datetime.now(UTC)
    event = meta_capi.purchase_event(order(created_at=now + timedelta(hours=2)), VISIT, now=now)
    assert event["event_time"] == int(now.timestamp())


# ── The visit ────────────────────────────────────────────────────────────────

def request(headers: dict) -> SimpleNamespace:
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host="10.0.0.1"))


def test_visit_takes_the_real_client_ip_and_drops_junk():
    visit = meta_capi.visit_from(
        request({"x-forwarded-for": "198.51.100.4, 10.0.0.2", "user-agent": "UA",
                 "origin": "https://innterflow.com"}),
        {"fbp": "fb.1.1700000000000.42", "fbc": "<script>", "page_url": "javascript:alert(1)"},
    )
    assert visit.client_ip == "198.51.100.4"
    assert visit.fbp == "fb.1.1700000000000.42"
    assert visit.fbc is None
    assert visit.page_url == "https://innterflow.com/checkout"
    assert visit.user_agent == "UA"


def test_visit_survives_a_browser_that_sent_nothing():
    visit = meta_capi.visit_from(request({}), None)
    assert visit == meta_capi.Visit(client_ip="10.0.0.1")


# ── Talking to Meta ──────────────────────────────────────────────────────────

def mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_events_post_with_the_token_in_a_header_not_the_url():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["auth"] = req.headers.get("authorization")
        seen["form"] = dict(httpx.QueryParams(req.content.decode()))
        return httpx.Response(200, json={"events_received": 1, "fbtrace_id": "abc"})

    target = meta_capi.Target(pixel_id=PIXEL, access_token=TOKEN, test_event_code="TEST1")
    async with mock_client(handler) as client:
        answer = await meta_capi.send_events(target, [{"event_name": "Purchase"}], client=client)

    assert answer["events_received"] == 1
    assert seen["url"] == f"https://graph.facebook.com/{meta_capi.GRAPH_VERSION}/{PIXEL}/events"
    assert TOKEN not in seen["url"]
    assert seen["auth"] == f"Bearer {TOKEN}"
    assert json.loads(seen["form"]["data"]) == [{"event_name": "Purchase"}]
    assert seen["form"]["test_event_code"] == "TEST1"


async def test_a_refusal_comes_back_in_metas_own_words():
    def handler(req):
        return httpx.Response(400, json={"error": {"message": "Invalid parameter", "code": 100,
                                                   "error_user_msg": "event_time is too old"}})

    async with mock_client(handler) as client:
        with pytest.raises(meta_capi.MetaError, match="event_time is too old"):
            await meta_capi.send_events(meta_capi.Target(PIXEL, TOKEN), [{}], client=client)


async def test_check_names_a_bad_token_plainly():
    def handler(req):
        return httpx.Response(401, json={"error": {"message": "Invalid OAuth access token", "code": 190}})

    async with mock_client(handler) as client:
        result = await meta_capi.check_target(meta_capi.Target(PIXEL, TOKEN), client=client)
    assert result["ok"] is False and "rejected this access token" in result["message"]


async def test_check_names_a_token_for_another_pixel():
    def handler(req):
        return httpx.Response(400, json={"error": {"message": "Unsupported get request", "code": 100,
                                                   "error_subcode": 33}})

    async with mock_client(handler) as client:
        result = await meta_capi.check_target(meta_capi.Target(PIXEL, TOKEN), client=client)
    assert result["ok"] is False and PIXEL in result["message"]


async def test_check_with_a_test_code_sends_one_test_event():
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req.method)
        if req.method == "GET":
            return httpx.Response(200, json={"id": PIXEL, "name": "Innterflow Pixel"})
        return httpx.Response(200, json={"events_received": 1})

    async with mock_client(handler) as client:
        ok = await meta_capi.check_target(meta_capi.Target(PIXEL, TOKEN), client=client)
        assert ok["ok"] and "Innterflow Pixel" in ok["message"] and calls == ["GET"]
        tested = await meta_capi.check_target(meta_capi.Target(PIXEL, TOKEN, "TEST9"), client=client)
    assert tested["ok"] and "Test events" in tested["message"]
    assert calls == ["GET", "GET", "POST"]


# ── After a sale ─────────────────────────────────────────────────────────────

async def test_nothing_is_queued_for_a_brand_without_the_api(monkeypatch):
    async def no_target(db, tenant_id):
        return None

    monkeypatch.setattr(meta_capi, "target_for", no_target)
    await meta_capi.purchase_placed(None, order(), request({}), {})
    assert not meta_capi._tasks


async def test_a_broken_lookup_never_fails_the_checkout(monkeypatch):
    async def boom(db, tenant_id):
        raise RuntimeError("settings table on fire")

    monkeypatch.setattr(meta_capi, "target_for", boom)
    await meta_capi.purchase_placed(None, order(), request({}), {})   # does not raise


# ── The brand's connection ───────────────────────────────────────────────────

def test_the_token_is_a_masked_secret_on_the_tracking_page():
    provider = integrations_service.PROVIDERS["meta_capi"]
    assert provider["category"] == "tracking"
    kinds = {f["name"]: f["kind"] for f in provider["fields"]}
    assert kinds == {"access_token": "secret", "test_event_code": "text"}

    shown = integrations_service.mask("meta_capi", {"access_token": TOKEN, "test_event_code": "T1"})
    assert shown["access_token"] == "" and shown["access_token_set"] is True
    assert TOKEN not in json.dumps(shown)


class FakeSession:
    """Just enough of an AsyncSession for the background sender."""

    def __init__(self, found=None):
        self.found = found
        self.committed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: self.found)

    async def commit(self):
        self.committed = True


@pytest.fixture
def history(monkeypatch):
    """The order events the sender writes, instead of a database."""
    from app.services import order_events

    written = []

    async def record(db, o, event_type, message=None, **kwargs):
        written.append((event_type, message, kwargs.get("meta")))

    monkeypatch.setattr(order_events, "record", record)
    return written


async def test_a_sent_sale_is_written_on_the_order(monkeypatch, history):
    import app.core.database as database

    session = FakeSession(order())
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: session)
    sent = []

    async def fake_send(target, events, client=None):
        sent.append(events)
        return {"events_received": 1, "fbtrace_id": "trace1"}

    monkeypatch.setattr(meta_capi, "send_events", fake_send)
    await meta_capi._deliver(order().id, None, meta_capi.Target(PIXEL, TOKEN), VISIT)

    assert sent[0][0]["event_id"] == "AF-1001"
    assert history == [("meta_capi_sent", "Purchase sent to Meta (Conversions API)",
                        {"events_received": 1, "fbtrace_id": "trace1", "test": False})]
    assert session.committed


async def test_a_refused_sale_says_why_on_the_order(monkeypatch, history):
    import app.core.database as database

    session = FakeSession(order())
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: session)

    async def refuse(target, events, client=None):
        raise meta_capi.MetaError("Invalid OAuth access token", 190)

    monkeypatch.setattr(meta_capi, "send_events", refuse)
    await meta_capi._deliver(order().id, None, meta_capi.Target(PIXEL, TOKEN), VISIT)

    assert history[0][0] == "meta_capi_failed"
    assert "Invalid OAuth access token" in history[0][1]
    assert session.committed


async def test_connecting_needs_the_pixel_id_first(monkeypatch):
    import app.core.database as database
    from app.services import analytics_config

    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: FakeSession())

    async def load(db, tenant_id=None):
        return analytics_config.blank()

    monkeypatch.setattr(analytics_config, "load", load)
    result = await integrations_service.verify("meta_capi", {"access_token": TOKEN})
    assert result["ok"] is False and "Pixel ID" in result["message"]
