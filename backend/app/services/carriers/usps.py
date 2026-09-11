"""USPS — rating and labels on the brand's own USPS Business account.

Uses the USPS APIs at developer.usps.com (the v3 REST platform that replaced Web
Tools): OAuth2 for the token, Prices for quotes and Labels for printing. Postage
is drawn from the brand's Enterprise Payment System (EPS) account.
"""
from __future__ import annotations

import logging
from datetime import date

from app.services.carriers.base import (
    CarrierError,
    LabelResult,
    RateQuote,
    lbs_and_inches,
    oauth_token,
    request_json,
)

logger = logging.getLogger(__name__)

_HOSTS = {
    "production": "https://apis.usps.com",
    "test": "https://apis-tem.usps.com",
}

SERVICES = {
    "USPS_GROUND_ADVANTAGE": "USPS Ground Advantage",
    "PRIORITY_MAIL": "USPS Priority Mail",
    "PRIORITY_MAIL_EXPRESS": "USPS Priority Mail Express",
}


def _host(creds: dict) -> str:
    return _HOSTS.get((creds.get("environment") or "production").lower(), _HOSTS["production"])


async def _token(creds: dict) -> str:
    return await oauth_token(
        carrier="usps",
        token_url=f"{_host(creds)}/oauth2/v3/token",
        client_id=creds.get("client_id") or "",
        client_secret=creds.get("client_secret") or "",
        environment=creds.get("environment") or "production",
        basic_auth=False,
    )


async def verify(creds: dict) -> dict:
    try:
        await _token(creds)
    except CarrierError as exc:
        return {"ok": False, "message": str(exc)}
    msg = "Connected to USPS."
    if not creds.get("account_number"):
        msg += " Add your EPS account number when you're ready to buy labels."
    return {"ok": True, "message": msg}


def _zip5(a: dict) -> str:
    raw = str(a.get("zip") or a.get("postal_code") or "").replace(" ", "").replace("-", "")
    return raw[:5]


async def rates(creds: dict, ship_from: dict, ship_to: dict, parcel: dict) -> list[RateQuote]:
    """Price each USPS service for this parcel.

    USPS prices one service per call, so each is requested in turn; a service the
    parcel doesn't qualify for is skipped rather than failing the whole quote.
    """
    token = await _token(creds)
    weight, length, width, height = lbs_and_inches(parcel)

    origin, destination = _zip5(ship_from), _zip5(ship_to)
    if not origin or not destination:
        raise CarrierError("USPS needs both a ship-from and a ship-to ZIP code.")

    out: list[RateQuote] = []
    for code, name in SERVICES.items():
        body = {
            "originZIPCode": origin,
            "destinationZIPCode": destination,
            "weight": round(weight, 2),
            "length": round(length, 2),
            "width": round(width, 2),
            "height": round(height, 2),
            "mailClass": code,
            "processingCategory": "MACHINABLE",
            "rateIndicator": "SP",              # single piece
            "destinationEntryFacilityType": "NONE",
            "priceType": "COMMERCIAL",
            "mailingDate": date.today().isoformat(),
        }
        try:
            data = await request_json(
                "usps", "POST", f"{_host(creds)}/prices/v3/base-rates/search",
                token=token, json_body=body,
            )
        except CarrierError as exc:
            logger.info("USPS %s not available for this parcel: %s", code, exc)
            continue

        try:
            amount = float(data.get("totalBasePrice") if data.get("totalBasePrice") is not None
                           else (data.get("rates") or [{}])[0].get("price"))
        except (TypeError, ValueError, IndexError, AttributeError):
            continue

        out.append(RateQuote(
            carrier="usps",
            service_code=code,
            service_name=name,
            amount=amount,
            estimated_days=None,
        ))

    if not out:
        raise CarrierError("USPS returned no prices for this parcel. Check the weight, size and ZIP codes.")

    out.sort(key=lambda r: r.amount)
    return out


def _address(a: dict) -> dict:
    return {
        "streetAddress": (a.get("street1") or a.get("address_line1") or "")[:50],
        "secondaryAddress": (a.get("street2") or "")[:50],
        "city": a.get("city") or "",
        "state": (a.get("state") or "")[:2],
        "ZIPCode": _zip5(a),
        "firstName": (a.get("name") or "Shipper").split(" ")[0][:30],
        "lastName": " ".join((a.get("name") or "Shipper").split(" ")[1:])[:30] or "-",
        "firm": (a.get("company") or "")[:50],
    }


async def label(creds: dict, ship_from: dict, ship_to: dict, parcel: dict, service_code: str) -> LabelResult:
    """Buy a USPS label, drawn against the brand's EPS account."""
    token = await _token(creds)
    eps = creds.get("account_number")
    if not eps:
        raise CarrierError("A USPS EPS account number is required to buy a label.")

    weight, length, width, height = lbs_and_inches(parcel)
    body = {
        "imageInfo": {"imageType": "PDF", "labelType": "4X6LABEL"},
        "toAddress": _address(ship_to),
        "fromAddress": _address(ship_from),
        "packageDescription": {
            "weight": round(weight, 2),
            "length": round(length, 2),
            "width": round(width, 2),
            "height": round(height, 2),
            "mailClass": service_code,
            "rateIndicator": "SP",
            "processingCategory": "MACHINABLE",
            "destinationEntryFacilityType": "NONE",
            "mailingDate": date.today().isoformat(),
        },
        "paymentInfo": {"accountType": "EPS", "accountNumber": str(eps)},
    }

    data = await request_json(
        "usps", "POST", f"{_host(creds)}/labels/v3/label",
        token=token, json_body=body,
    )

    tracking = data.get("trackingNumber") or ""
    if not tracking:
        raise CarrierError("USPS returned no tracking number.")

    amount = None
    try:
        amount = float((data.get("postage") or {}).get("totalPrice") or data.get("totalPrice"))
    except (TypeError, ValueError, AttributeError):
        pass

    return LabelResult(
        carrier="usps",
        tracking_number=tracking,
        label_base64=data.get("labelImage"),
        label_format="PDF",
        amount=amount,
        meta={"service_code": service_code},
    )
