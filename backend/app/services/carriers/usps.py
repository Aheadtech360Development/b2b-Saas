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
    SAMPLE_FROM,
    SAMPLE_PARCEL,
    SAMPLE_TO,
    lbs_and_inches,
    oauth_token,
    request_json,
    tracking_url,
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
    """Token, a sample price, and (when the label details are there) the
    payment authorisation labels will need, so a bad CRID/MID/EPS shows now
    rather than on the first label."""
    try:
        token = await _token(creds)
        quotes = await rates(creds, SAMPLE_FROM, SAMPLE_TO, SAMPLE_PARCEL)
    except CarrierError as exc:
        return {"ok": False, "message": str(exc)}
    missing = [n for n, k in (("EPS account number", "account_number"), ("CRID", "crid"), ("MID", "mid"))
               if not creds.get(k)]
    if missing:
        return {"ok": True, "message": f"Connected to USPS: {len(quotes)} services priced. "
                                       f"Add your {', '.join(missing)} to buy labels."}
    try:
        await _payment_token(creds, token)
    except CarrierError as exc:
        return {"ok": False, "message": f"Rates work, but labels won't: {exc}"}
    return {"ok": True, "message": f"Connected to USPS: {len(quotes)} services priced, labels bill to EPS {creds.get('account_number')}."}


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


async def _payment_token(creds: dict, token: str) -> str:
    """Exchange the brand's enrolment details for a payment authorisation token.

    USPS charges labels in two steps: the OAuth token proves who is calling, and
    this second token proves which Enterprise Payment account pays. The label
    call needs it in `X-Payment-Authorization-Token`, and rejects the label
    outright without it.
    """
    crid, mid, eps = creds.get("crid"), creds.get("mid"), creds.get("account_number")
    missing = [n for n, v in (("CRID", crid), ("MID", mid), ("EPS account number", eps)) if not v]
    if missing:
        raise CarrierError(
            f"USPS needs your {', '.join(missing)} to pay for labels. "
            "Add it on the USPS connection, from your Business Customer Gateway account."
        )

    role = {"CRID": str(crid), "MID": str(mid), "accountType": "EPS", "accountNumber": str(eps)}
    data = await request_json(
        "usps", "POST", f"{_host(creds)}/payments/v3/payment-authorization",
        token=token,
        json_body={"roles": [
            {"roleName": "PAYER", **role},
            # The label owner also names the MID its manifests go under.
            {"roleName": "LABEL_OWNER", **role, "manifestMID": str(mid)},
        ]},
    )
    payment_token = data.get("paymentAuthorizationToken")
    if not payment_token:
        raise CarrierError("USPS did not return a payment authorisation. Check your EPS enrolment.")
    return payment_token


async def label(creds: dict, ship_from: dict, ship_to: dict, parcel: dict, service_code: str) -> LabelResult:
    """Buy a USPS label, drawn against the brand's EPS account."""
    token = await _token(creds)
    payment_token = await _payment_token(creds, token)
    eps = creds.get("account_number")

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
        # Without this USPS answers multipart/mixed; this asks for JSON with
        # the label inside as base64.
        extra_headers={"X-Payment-Authorization-Token": payment_token,
                       "Accept": "application/vnd.usps.labels+json"},
    )

    # The details sit under labelMetadata; older answers had them at the top.
    meta = data.get("labelMetadata") or data
    tracking = meta.get("trackingNumber") or data.get("trackingNumber") or ""
    if not tracking:
        raise CarrierError("USPS returned no tracking number.")

    amount = None
    try:
        postage = meta.get("postage")
        amount = float(postage.get("totalPrice") if isinstance(postage, dict) else postage)
    except (TypeError, ValueError, AttributeError):
        pass

    return LabelResult(
        carrier="usps",
        tracking_number=tracking,
        label_base64=data.get("labelImage"),
        label_format="PDF",
        amount=amount,
        meta={"service_code": service_code, "service_name": SERVICES.get(service_code, service_code),
              "tracking_url": tracking_url("usps", tracking)},
    )
