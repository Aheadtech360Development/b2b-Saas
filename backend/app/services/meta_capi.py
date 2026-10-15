"""Meta Conversions API — each brand's sales, sent from our server to its pixel.

The browser pixel misses a share of real sales: ad blockers, Safari's tracking
limits, a buyer who closes the tab before the thank-you page loads. Meta's
answer is to send the same event from the server as well, and drop the copy it
already has. This module is that server copy.

Whose is it
-----------
Every brand brings its own: the pixel is the Meta Pixel ID on its Tracking page
(services/analytics_config), and the access token is a secret it saves under
the `meta_capi` connection (services/integrations_service), masked like every
other credential. Nothing here is platform-wide, so one brand's sales can never
reach another brand's pixel, and a brand that has not connected sends nothing.

Counted once
------------
The browser sends Purchase with `eventID` = the order number (lib/tracking.ts).
The server sends the same event name with `event_id` = the same order number,
so Meta keeps one of the two. Both go out under the same switches — tracking
on, Meta Pixel on, "Checkout and purchases" on — so the server never reports a
sale the brand asked not to track.

Never in the way
----------------
A sale is sent after the order is committed, from a background task with its
own session. Nothing in here can slow a checkout down or fail it: every error
is logged and written onto the order's history, where the brand can see it.

The customer's details are normalised and SHA-256 hashed before they leave, as
Meta requires; the browser identifiers (`fbp`, `fbc`), IP address and user
agent are sent as they are, also as Meta requires.
"""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

PROVIDER = "meta_capi"
GRAPH = "https://graph.facebook.com"
# Graph API versions live about two years. Overridable so a new one can be
# taken without a release.
GRAPH_VERSION = os.getenv("META_GRAPH_API_VERSION", "v25.0")
TIMEOUT = 10.0

_tasks: set[asyncio.Task] = set()   # strong refs, or the loop may collect a running task


# ── Who sends ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Target:
    """Where a brand's server events go."""
    pixel_id: str
    access_token: str = field(repr=False)
    test_event_code: str | None = None


def target_from(analytics: dict | None, connection: dict | None) -> Target | None:
    """The brand's Conversions API target, or None when it should send nothing.

    Mirrors what the storefront does with the browser pixel: tracking on, the
    Meta Pixel switched on with an ID, and purchases tracked.
    """
    analytics = analytics or {}
    if not analytics.get("enabled") or not analytics.get("track_checkout", True):
        return None
    pixel = (analytics.get("tools") or {}).get("meta_pixel") or {}
    pixel_id = str(pixel.get("id") or "").strip()
    if not pixel.get("enabled") or not re.fullmatch(r"\d{10,20}", pixel_id):
        return None
    token = str((connection or {}).get("access_token") or "").strip()
    if not token:
        return None
    code = str((connection or {}).get("test_event_code") or "").strip() or None
    return Target(pixel_id=pixel_id, access_token=token, test_event_code=code)


async def target_for(db, tenant_id) -> Target | None:
    from app.services import analytics_config
    from app.services.integrations_service import get_connection

    analytics = await analytics_config.load(db, tenant_id=tenant_id)
    connection = await get_connection(db, PROVIDER, tenant_id=tenant_id)
    return target_from(analytics, connection)


# ── Normalising and hashing ──────────────────────────────────────────────────

def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hashed(value: str | None) -> str | None:
    return sha256(value) if value else None


def norm_email(value: Any) -> str | None:
    s = str(value or "").strip().lower()
    return s if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", s) else None


_COUNTRIES = {
    "us": "us", "usa": "us", "unitedstates": "us", "unitedstatesofamerica": "us",
    "ca": "ca", "canada": "ca", "mx": "mx", "mexico": "mx",
    "gb": "gb", "uk": "gb", "unitedkingdom": "gb",
}


def norm_country(value: Any) -> str | None:
    s = re.sub(r"[^a-z]", "", str(value or "").lower())
    if not s:
        return None
    if s in _COUNTRIES:
        return _COUNTRIES[s]
    return s if len(s) == 2 else None


def norm_phone(value: Any, country: str | None = None) -> str | None:
    """Digits only, with the country code: (650) 555-1212 in the US → 16505551212."""
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("00"):
        digits = digits[2:]
    digits = digits.lstrip("0")
    if not digits:
        return None
    # A ten-digit North American number written without its country code.
    if len(digits) == 10 and not raw.startswith("+") and (country or "us") in ("us", "ca"):
        digits = "1" + digits
    return digits if 7 <= len(digits) <= 15 else None


def norm_name(value: Any) -> str | None:
    s = re.sub(r"[\s.,'\"`]+", "", str(value or "").strip().lower())
    return s or None


def norm_city(value: Any) -> str | None:
    s = re.sub(r"[\W_]+", "", str(value or "").lower())
    return s or None


def norm_state(value: Any) -> str | None:
    s = re.sub(r"[\W_]+", "", str(value or "").lower())
    return s or None


def norm_zip(value: Any, country: str | None = None) -> str | None:
    s = re.sub(r"[\s-]+", "", str(value or "").lower())
    if not s:
        return None
    if (country or "us") == "us":
        m = re.match(r"\d{5}", s)
        return m.group(0) if m else None
    return s


def _browser_id(value: Any) -> str | None:
    """An `_fbp` / `_fbc` value as the pixel writes it, or None."""
    s = str(value or "").strip()
    return s if len(s) <= 500 and re.fullmatch(r"fb\.\d\.\d{10,13}\.\S+", s) else None


def _ip(value: Any) -> str | None:
    try:
        return str(ipaddress.ip_address(str(value or "").strip()))
    except ValueError:
        return None


def _url(value: Any) -> str | None:
    s = str(value or "").strip()
    return s[:1000] if re.match(r"https?://[^\s/]+", s) else None


# ── What the browser was ─────────────────────────────────────────────────────

@dataclass(frozen=True)
class Visit:
    """The parts of the buyer's visit only the checkout request knows."""
    client_ip: str | None = None
    user_agent: str | None = None
    fbp: str | None = None
    fbc: str | None = None
    page_url: str | None = None


def visit_from(request: Any, tracking: Any) -> Visit:
    """Read the visit from the checkout request and the `tracking` it sent.

    `tracking` is whatever the browser posted, so every value is checked: a
    malformed one is dropped rather than forwarded to Meta.
    """
    from app.core.rate_limit import client_ip

    tracking = tracking if isinstance(tracking, dict) else {}
    headers = getattr(request, "headers", None) or {}
    page = _url(tracking.get("page_url"))
    if not page:
        origin = _url(headers.get("origin"))
        page = f"{origin.rstrip('/')}/checkout" if origin else None
    try:
        ip = client_ip(request)
    except Exception:
        ip = None
    return Visit(
        client_ip=_ip(ip),
        user_agent=(str(headers.get("user-agent") or "").strip()[:512] or None),
        fbp=_browser_id(tracking.get("fbp")),
        fbc=_browser_id(tracking.get("fbc")),
        page_url=page,
    )


# ── The event ────────────────────────────────────────────────────────────────

def _address(order: Any) -> dict:
    try:
        data = json.loads(getattr(order, "shipping_address_snapshot", None) or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def purchase_event(order: Any, visit: Visit, *, now: datetime | None = None) -> dict:
    """The Purchase event for one order, ready for Meta."""
    addr = _address(order)
    buyer = getattr(order, "placed_by", None)
    country = norm_country(addr.get("country")) or "us"

    full_name = (addr.get("full_name") or getattr(order, "guest_name", None) or "").split()
    first = full_name[0] if full_name else getattr(buyer, "first_name", None)
    last = full_name[-1] if len(full_name) > 1 else getattr(buyer, "last_name", None)
    email = norm_email(getattr(order, "guest_email", None)) or norm_email(getattr(buyer, "email", None))
    phone = norm_phone(
        getattr(order, "guest_phone", None) or addr.get("phone") or getattr(buyer, "phone", None), country,
    )
    who = getattr(order, "placed_by_id", None) or getattr(order, "company_id", None)

    user_data: dict[str, Any] = {
        "em": [_hashed(email)] if email else None,
        "ph": [_hashed(phone)] if phone else None,
        "fn": _hashed(norm_name(first)),
        "ln": _hashed(norm_name(last)),
        "ct": _hashed(norm_city(addr.get("city"))),
        "st": _hashed(norm_state(addr.get("state"))),
        "zp": _hashed(norm_zip(addr.get("postal_code"), country)),
        "country": _hashed(country) if addr else None,
        "external_id": _hashed(str(who)) if who else None,
        "client_ip_address": visit.client_ip,
        "client_user_agent": visit.user_agent,
        "fbp": visit.fbp,
        "fbc": visit.fbc,
    }

    items = list(getattr(order, "items", None) or [])
    contents = [
        {"id": str(i.sku or i.variant_id or i.id), "quantity": int(i.quantity or 0),
         "item_price": round(float(i.unit_price or 0), 2)}
        for i in items
    ]
    custom_data = {
        "currency": "USD",
        "value": round(float(getattr(order, "total", 0) or 0), 2),
        "order_id": order.order_number,
        "content_type": "product",
        "content_ids": [c["id"] for c in contents],
        "contents": contents,
        "num_items": sum(c["quantity"] for c in contents),
    }

    # When the sale happened — but Meta refuses an event_time in the future or
    # more than seven days back, so a clock-skewed one is pulled into range.
    now = now or datetime.now(UTC)
    placed = getattr(order, "created_at", None) or now
    if placed.tzinfo is None:
        placed = placed.replace(tzinfo=UTC)
    when = min(int(placed.timestamp()), int(now.timestamp()))

    event: dict[str, Any] = {
        "event_name": "Purchase",
        "event_time": when,
        # The same id the browser gave its Purchase: Meta keeps one of the two.
        "event_id": order.order_number,
        "action_source": "website",
        "event_source_url": visit.page_url,
        "user_data": {k: v for k, v in user_data.items() if v},
        "custom_data": custom_data,
    }
    return {k: v for k, v in event.items() if v is not None}


# ── Talking to Meta ──────────────────────────────────────────────────────────

class MetaError(Exception):
    def __init__(self, message: str, code: int | None = None, subcode: int | None = None):
        super().__init__(message)
        self.code = code
        self.subcode = subcode


def _error(resp: httpx.Response) -> MetaError:
    try:
        err = (resp.json() or {}).get("error") or {}
    except ValueError:
        err = {}
    msg = err.get("error_user_msg") or err.get("message") or f"Meta answered {resp.status_code}"
    return MetaError(str(msg)[:300], err.get("code"), err.get("error_subcode"))


def _headers(token: str) -> dict:
    # In a header, never in the URL, so the token cannot end up in a log line.
    return {"Authorization": f"Bearer {token}"}


async def send_events(target: Target, events: list[dict], *, client: httpx.AsyncClient | None = None) -> dict:
    """POST events to the brand's pixel. Returns Meta's answer; raises MetaError."""
    form = {"data": json.dumps(events)}
    if target.test_event_code:
        form["test_event_code"] = target.test_event_code
    url = f"{GRAPH}/{GRAPH_VERSION}/{target.pixel_id}/events"
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        resp = await client.post(url, data=form, headers=_headers(target.access_token))
    except httpx.HTTPError as exc:
        raise MetaError(f"Could not reach Meta: {type(exc).__name__}") from exc
    finally:
        if own:
            await client.aclose()
    if resp.status_code >= 400:
        raise _error(resp)
    try:
        return resp.json() or {}
    except ValueError:
        return {}


async def check_target(target: Target, *, client: httpx.AsyncClient | None = None) -> dict:
    """Prove a token can reach its pixel: {ok, message}.

    Reads the pixel's name. With a test event code saved, also sends one test
    PageView, which shows up in Events Manager → Test events.
    """
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        try:
            resp = await client.get(
                f"{GRAPH}/{GRAPH_VERSION}/{target.pixel_id}",
                params={"fields": "id,name"}, headers=_headers(target.access_token),
            )
        except httpx.HTTPError as exc:
            return {"ok": False, "message": f"Could not reach Meta: {type(exc).__name__}"}
        if resp.status_code >= 400:
            err = _error(resp)
            if err.code == 190:
                return {"ok": False, "message": "Meta rejected this access token. Generate a new one in "
                                                "Events Manager → your pixel → Settings → Conversions API."}
            if err.code == 100 and err.subcode == 33:
                return {"ok": False, "message": f"This token has no access to pixel {target.pixel_id}. "
                                                "Generate it from that pixel's own settings in Events Manager."}
            return {"ok": False, "message": f"Meta said: {err}"}
        name = (resp.json() or {}).get("name") or target.pixel_id

        if not target.test_event_code:
            return {"ok": True, "message": f"Connected to pixel “{name}”. Sales will be sent from the server too."}
        try:
            await send_events(target, [{
                "event_name": "PageView",
                "event_time": int(datetime.now(UTC).timestamp()),
                "event_id": f"test-{uuid.uuid4().hex[:12]}",
                "action_source": "website",
                "user_data": {"client_user_agent": "Conversions API connection test"},
            }], client=client)
        except MetaError as exc:
            return {"ok": False, "message": f"Token works, but the test event was refused: {exc}"}
        return {"ok": True, "message": f"Connected to pixel “{name}”. A test event was sent — "
                                       "open Events Manager → Test events to see it."}
    finally:
        if own:
            await client.aclose()


# ── After a sale ─────────────────────────────────────────────────────────────

async def purchase_placed(db, order: Any, request: Any, tracking: Any) -> None:
    """Called by checkout once an order is committed. Sends its Purchase in the
    background when the brand has connected the Conversions API.

    Never raises: a checkout must not care whether Meta heard about it.
    """
    try:
        tenant_id = getattr(order, "tenant_id", None)
        target = await target_for(db, tenant_id)
        if target is None:
            return
        visit = visit_from(request, tracking)
        task = asyncio.create_task(_deliver(order.id, tenant_id, target, visit))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    except Exception:
        logger.exception("Conversions API: could not queue the Purchase for order %s", getattr(order, "id", None))


async def _deliver(order_id: uuid.UUID, tenant_id: Any, target: Target, visit: Visit) -> None:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_current_tenant
    from app.models.order import Order
    from app.services import order_events

    set_current_tenant(tenant_id)
    try:
        async with AsyncSessionLocal() as db:
            order = (await db.execute(
                select(Order)
                .options(selectinload(Order.items), selectinload(Order.placed_by))
                .where(Order.id == order_id)
            )).scalar_one_or_none()
            if order is None:
                return
            try:
                answer = await send_events(target, [purchase_event(order, visit)])
                test = " as a test event" if target.test_event_code else ""
                await order_events.record(
                    db, order, "meta_capi_sent",
                    f"Purchase sent to Meta{test} (Conversions API)",
                    meta={"events_received": answer.get("events_received"),
                          "fbtrace_id": answer.get("fbtrace_id"), "test": bool(target.test_event_code)},
                    mirror=False,
                )
            except MetaError as exc:
                logger.warning("Conversions API refused order %s: %s", order.order_number, exc)
                await order_events.record(
                    db, order, "meta_capi_failed",
                    f"Meta did not accept this sale: {exc}",
                    meta={"code": exc.code, "subcode": exc.subcode},
                    mirror=False,
                )
            await db.commit()
    except Exception:
        logger.exception("Conversions API: sending order %s failed", order_id)
