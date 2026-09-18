"""Rates and labels across whichever carriers a brand has connected.

The checkout asks one question — "what can this cost?" — and gets back every
service from every connected carrier, priced on that brand's own accounts. A
carrier that errors is left out of the list rather than failing the whole quote,
because one misconfigured account shouldn't stop a sale.

`rate_id` on a quote is "<carrier>:<service_code>", which is how the label call
later knows which carrier and service to buy without storing anything.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.carriers import fedex, ups, usps
from app.services.carriers.base import CarrierError, LabelResult, RateQuote, tracking_url
from app.services.integrations_service import get_connection

logger = logging.getLogger(__name__)

_MODULES = {"ups": ups, "fedex": fedex, "usps": usps}


async def connected_carriers(db: AsyncSession, tenant_id=None) -> dict[str, dict]:
    """The carriers this brand has connected, keyed by carrier."""
    out: dict[str, dict] = {}
    for name in _MODULES:
        creds = await get_connection(db, name, tenant_id=tenant_id)
        if creds:
            out[name] = creds
    return out


async def get_rates(
    db: AsyncSession,
    ship_from: dict,
    ship_to: dict,
    parcel: dict,
    tenant_id=None,
) -> dict:
    """Live rates from every connected carrier, cheapest first.

    Carriers are queried concurrently — three sequential round trips would be
    felt at checkout.
    """
    creds_by_carrier = await connected_carriers(db, tenant_id)
    if not creds_by_carrier:
        return {
            "rates": [],
            "errors": [],
            "connected": [],
            "message": "No shipping carrier is connected yet.",
        }

    async def _one(name: str, creds: dict):
        try:
            return name, await _MODULES[name].rates(creds, ship_from, ship_to, parcel), None
        except CarrierError as exc:
            return name, [], str(exc)
        except Exception as exc:                       # a carrier outage is not our crash
            logger.warning("%s rating failed: %s", name, exc)
            return name, [], f"{name.upper()} is not responding right now."

    results = await asyncio.gather(*(_one(n, c) for n, c in creds_by_carrier.items()))

    rates: list[RateQuote] = []
    errors: list[dict] = []
    for name, quotes, err in results:
        rates.extend(quotes)
        if err:
            errors.append({"carrier": name, "message": err})

    rates.sort(key=lambda r: r.amount)
    return {
        "rates": [r.to_dict() for r in rates],
        "errors": errors,
        "connected": list(creds_by_carrier),
    }


async def buy_label(
    db: AsyncSession,
    rate_id: str,
    ship_from: dict,
    ship_to: dict,
    parcel: dict,
    tenant_id=None,
) -> LabelResult:
    """Buy the label for a quoted rate, on the brand's own carrier account."""
    try:
        carrier, service_code = rate_id.split(":", 1)
    except ValueError:
        raise CarrierError("That shipping rate is not one this store can buy.")

    module = _MODULES.get(carrier)
    if module is None:
        raise CarrierError(f"Unknown carrier '{carrier}'.")

    creds = await get_connection(db, carrier, tenant_id=tenant_id)
    if not creds:
        raise CarrierError(f"{carrier.upper()} is not connected for this store.")

    return await module.label(creds, ship_from, ship_to, parcel, service_code)


def ship_to_from_snapshot(snapshot: str | None) -> dict:
    """An order's saved shipping address in the shape the carriers take.

    Snapshots have been written with two sets of keys over time (line1 /
    postal_code from checkout, address_line1 / zip_code from older paths)."""
    import json

    try:
        a = json.loads(snapshot or "{}")
    except ValueError:
        a = {}
    return {
        "name": a.get("full_name") or a.get("name") or a.get("label") or "Customer",
        "company": a.get("company") or "",
        "street1": a.get("line1") or a.get("address_line1") or a.get("street1") or "",
        "street2": a.get("line2") or a.get("address_line2") or a.get("street2") or "",
        "city": a.get("city") or "",
        "state": a.get("state") or a.get("state_province") or "",
        "zip": a.get("postal_code") or a.get("zip_code") or a.get("zip") or "",
        "country": a.get("country") or "US",
        "phone": a.get("phone") or "",
        # Most wholesale and retail buyers here ship to homes; carriers price
        # (and FedEx picks Home Delivery) on this.
        "residential": bool(a.get("residential", True)),
    }


def label_result(order, label: LabelResult) -> dict:
    """Put a bought label on the order and describe it for the order page.

    A label that came back as a file is kept on the order and served from the
    admin API; a lasting link is used as is."""
    media = {"PDF": "pdf", "GIF": "gif", "PNG": "png", "ZPL": "zpl"}
    fmt = (label.label_format or "PDF").upper()
    if label.label_base64:
        order.label_data = label.label_base64
        order.label_format = fmt
        url = f"/api/v1/admin/orders/{order.id}/label"
    else:
        order.label_data = None
        order.label_format = fmt if label.label_url else None
        url = label.label_url
    return {
        "success": True,
        "tracking_number": label.tracking_number,
        "tracking_url": label.meta.get("tracking_url") or tracking_url(label.carrier, label.tracking_number),
        "label_url": url,
        "label_format": media.get(fmt, "pdf"),
        "carrier": label.carrier.upper(),
        "service": label.meta.get("service_name") or label.meta.get("service_code", ""),
        "rate": label.amount,
        "source": "carrier",
    }

