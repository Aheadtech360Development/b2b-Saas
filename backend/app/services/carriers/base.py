"""Shared pieces for the direct carrier integrations.

The three carriers differ in their payloads but agree on the shape of the
conversation: get an OAuth2 token with the brand's client credentials, then call
a rating or shipping endpoint with it. That token exchange and the common result
types live here so each carrier module stays about that carrier.
"""
from __future__ import annotations

import base64
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = 30.0

# A token is cached per (carrier, client id, environment) until shortly before it
# expires, so a page of rates doesn't re-authenticate on every quote.
_TOKENS: dict[tuple, tuple[str, float]] = {}
_EXPIRY_SKEW = 60.0


class CarrierError(Exception):
    """A carrier refused the request. The message is safe to show an admin."""


@dataclass
class RateQuote:
    """One shippable service and its price, as the checkout shows it."""

    carrier: str
    service_code: str
    service_name: str
    amount: float
    currency: str = "USD"
    estimated_days: int | None = None
    # Enough to buy this exact rate later without re-quoting.
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "carrier": self.carrier,
            "service_code": self.service_code,
            "service_name": self.service_name,
            "amount": round(float(self.amount), 2),
            "currency": self.currency,
            "estimated_days": self.estimated_days,
            "provider": self.carrier,
            # `rate_id` keeps the existing checkout contract, which selects a
            # quote by id; for direct carriers the id encodes the service.
            "rate_id": f"{self.carrier}:{self.service_code}",
            "meta": self.meta,
        }


@dataclass
class LabelResult:
    """A bought label."""

    carrier: str
    tracking_number: str
    label_url: str | None = None
    label_base64: str | None = None
    label_format: str = "PDF"
    amount: float | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "carrier": self.carrier,
            "tracking_number": self.tracking_number,
            "label_url": self.label_url,
            "label_base64": self.label_base64,
            "label_format": self.label_format,
            "amount": self.amount,
            "meta": self.meta,
        }


async def oauth_token(
    *,
    carrier: str,
    token_url: str,
    client_id: str,
    client_secret: str,
    environment: str = "production",
    basic_auth: bool = False,
    extra_data: dict | None = None,
) -> str:
    """Fetch (and cache) an OAuth2 client-credentials token.

    `basic_auth` selects where the credentials go: UPS wants them in an
    Authorization header, FedEx and USPS want them in the form body.
    """
    cache_key = (carrier, client_id, environment)
    cached = _TOKENS.get(cache_key)
    if cached and cached[1] - _EXPIRY_SKEW > time.monotonic():
        return cached[0]

    data: dict[str, str] = {"grant_type": "client_credentials", **(extra_data or {})}
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if basic_auth:
        raw = f"{client_id}:{client_secret}".encode()
        headers["Authorization"] = "Basic " + base64.b64encode(raw).decode()
    else:
        data["client_id"] = client_id
        data["client_secret"] = client_secret

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(token_url, data=data, headers=headers)

    if resp.status_code >= 400:
        raise CarrierError(_explain(carrier, resp))

    payload = resp.json()
    token = payload.get("access_token")
    if not token:
        raise CarrierError(f"{carrier.upper()} did not return an access token.")

    expires_in = float(payload.get("expires_in") or 3600)
    _TOKENS[cache_key] = (token, time.monotonic() + expires_in)
    return token


def _explain(carrier: str, resp: httpx.Response) -> str:
    """Turn a carrier's error body into one line an admin can act on."""
    name = carrier.upper()
    if resp.status_code in (401, 403):
        return f"{name} rejected these credentials. Check the client id/secret and that the app is enabled."
    try:
        body = resp.json()
    except Exception:
        return f"{name} returned {resp.status_code}: {resp.text[:200]}"

    # Each carrier nests its message differently; try the known shapes, then fall
    # back to the raw body so nothing is silently swallowed.
    for path in (
        ("response", "errors", 0, "message"),
        ("errors", 0, "message"),
        ("error_description",),
        ("error", "message"),
        ("message",),
    ):
        cur: Any = body
        try:
            for step in path:
                cur = cur[step]
            if isinstance(cur, str) and cur.strip():
                return f"{name}: {cur.strip()[:250]}"
        except Exception:
            continue
    return f"{name} returned {resp.status_code}: {str(body)[:200]}"


async def request_json(
    carrier: str,
    method: str,
    url: str,
    *,
    token: str,
    json_body: dict | None = None,
    params: dict | None = None,
    extra_headers: dict | None = None,
) -> dict:
    """Call a carrier endpoint with a bearer token, raising CarrierError on failure."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        **(extra_headers or {}),
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.request(method, url, json=json_body, params=params, headers=headers)

    if resp.status_code >= 400:
        raise CarrierError(_explain(carrier, resp))
    try:
        return resp.json()
    except Exception:
        raise CarrierError(f"{carrier.upper()} returned a response that wasn't JSON.")


def lbs_and_inches(parcel: dict) -> tuple[float, float, float, float]:
    """Normalise a parcel to (weight_lb, length_in, width_in, height_in).

    Callers hand us whatever the order page has; a missing dimension falls back
    to a small box rather than failing the quote.
    """
    weight = float(parcel.get("weight_lb") or parcel.get("weight") or 1.0)
    length = float(parcel.get("length_in") or parcel.get("length") or 12.0)
    width = float(parcel.get("width_in") or parcel.get("width") or 9.0)
    height = float(parcel.get("height_in") or parcel.get("height") or 3.0)
    return max(weight, 0.1), max(length, 1.0), max(width, 1.0), max(height, 1.0)
