"""FedEx — rating and labels on the brand's own FedEx account.

Uses the FedEx REST APIs (developer.fedex.com): OAuth2 for the token, Rate v1
for quotes and Ship v1 for labels. The account number the brand supplies is both
the shipper account and the one billed.
"""
from __future__ import annotations

import logging

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
    "production": "https://apis.fedex.com",
    "test": "https://apis-sandbox.fedex.com",
}

SERVICES = {
    "FEDEX_GROUND": "FedEx Ground",
    "GROUND_HOME_DELIVERY": "FedEx Home Delivery",
    "FEDEX_EXPRESS_SAVER": "FedEx Express Saver",
    "FEDEX_2_DAY": "FedEx 2Day",
    "FEDEX_2_DAY_AM": "FedEx 2Day A.M.",
    "STANDARD_OVERNIGHT": "FedEx Standard Overnight",
    "PRIORITY_OVERNIGHT": "FedEx Priority Overnight",
    "FIRST_OVERNIGHT": "FedEx First Overnight",
}


def _host(creds: dict) -> str:
    return _HOSTS.get((creds.get("environment") or "production").lower(), _HOSTS["production"])


async def _token(creds: dict) -> str:
    return await oauth_token(
        carrier="fedex",
        token_url=f"{_host(creds)}/oauth/token",
        client_id=creds.get("api_key") or "",
        client_secret=creds.get("secret_key") or "",
        environment=creds.get("environment") or "production",
        basic_auth=False,                     # FedEx wants credentials in the body
    )


async def verify(creds: dict) -> dict:
    """Get a token, then rate a sample parcel: FedEx validates the account
    number on a rate request, so this is what proves it."""
    if not creds.get("account_number"):
        return {"ok": False, "message": "Enter your FedEx account number. Postage bills to it."}
    try:
        await _token(creds)
        quotes = await rates(creds, SAMPLE_FROM, SAMPLE_TO, SAMPLE_PARCEL)
    except CarrierError as exc:
        return {"ok": False, "message": str(exc)}
    if not quotes:
        return {"ok": False, "message": "FedEx accepted the credentials but returned no rates for a test parcel."}
    return {"ok": True, "message": f"Connected to FedEx: {len(quotes)} services priced on your account."}


def _address(a: dict, *, residential: bool = False) -> dict:
    return {
        "address": {
            "streetLines": [x for x in [a.get("street1") or a.get("address_line1"), a.get("street2")] if x][:2],
            "city": a.get("city") or "",
            "stateOrProvinceCode": (a.get("state") or "")[:2],
            "postalCode": (a.get("zip") or a.get("postal_code") or "").replace(" ", ""),
            "countryCode": (a.get("country") or "US")[:2],
            "residential": bool(residential),
        }
    }


def _contact(a: dict, *, residential: bool = False) -> dict:
    return {
        "contact": {
            "personName": (a.get("name") or "Shipper")[:70],
            "companyName": (a.get("company") or a.get("name") or "")[:35],
            "phoneNumber": "".join(ch for ch in str(a.get("phone") or "") if ch.isdigit())[:15] or "0000000000",
        },
        **_address(a, residential=residential),
    }


def _package(parcel: dict) -> dict:
    weight, length, width, height = lbs_and_inches(parcel)
    return {
        "weight": {"units": "LB", "value": round(weight, 2)},
        "dimensions": {
            "length": int(round(length)), "width": int(round(width)),
            "height": int(round(height)), "units": "IN",
        },
    }


async def rates(creds: dict, ship_from: dict, ship_to: dict, parcel: dict) -> list[RateQuote]:
    """All FedEx services for this parcel, priced."""
    token = await _token(creds)
    account = creds.get("account_number") or ""

    body = {
        "accountNumber": {"value": account},
        "requestedShipment": {
            "shipper": _address(ship_from),
            "recipient": _address(ship_to, residential=bool(ship_to.get("residential"))),
            "pickupType": "DROPOFF_AT_FEDEX_LOCATION",
            "rateRequestType": ["ACCOUNT", "LIST"],
            "requestedPackageLineItems": [_package(parcel)],
        },
    }

    data = await request_json(
        "fedex", "POST", f"{_host(creds)}/rate/v1/rates/quotes",
        token=token, json_body=body,
        extra_headers={"X-locale": "en_US"},
    )

    out: list[RateQuote] = []
    for opt in ((data.get("output") or {}).get("rateReplyDetails") or []):
        code = opt.get("serviceType") or ""
        details = opt.get("ratedShipmentDetails") or []
        # ACCOUNT rates are what this brand actually pays; fall back to LIST.
        chosen = next((d for d in details if d.get("rateType") == "ACCOUNT"), None) or (details[0] if details else None)
        if not chosen:
            continue
        try:
            amount = float((chosen.get("totalNetCharge")
                            if chosen.get("totalNetCharge") is not None
                            else (chosen.get("shipmentRateDetail") or {}).get("totalNetCharge")))
        except (TypeError, ValueError):
            continue
        # FedEx spells transit time out ("THREE_DAYS"); express services carry
        # a commit date instead and are left without a day count.
        words = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5, "SIX": 6, "SEVEN": 7, "EIGHT": 8, "NINE": 9, "TEN": 10}
        days = words.get(str(opt.get("transitTime") or (opt.get("commit") or {}).get("transitDays", {}).get("description") or "").split("_")[0].upper())
        out.append(RateQuote(
            carrier="fedex",
            service_code=code,
            service_name=SERVICES.get(code, opt.get("serviceName") or code.replace("_", " ").title()),
            amount=amount,
            currency=(chosen.get("currency") or "USD"),
            estimated_days=days,
        ))

    out.sort(key=lambda r: r.amount)
    return out


async def label(creds: dict, ship_from: dict, ship_to: dict, parcel: dict, service_code: str) -> LabelResult:
    """Buy a FedEx label. Postage bills to the brand's account."""
    token = await _token(creds)
    account = creds.get("account_number") or ""
    if not account:
        raise CarrierError("A FedEx account number is required to buy a label.")

    body = {
        # The label itself, not a link: FedEx label links expire, and the
        # store needs to reprint it later.
        "labelResponseOptions": "LABEL",
        "accountNumber": {"value": account},
        "requestedShipment": {
            "shipper": _contact(ship_from),
            "recipients": [_contact(ship_to, residential=bool(ship_to.get("residential")))],
            "shipDatestamp": None,
            "serviceType": service_code,
            "packagingType": "YOUR_PACKAGING",
            "pickupType": "DROPOFF_AT_FEDEX_LOCATION",
            "blockInsightVisibility": False,
            "shippingChargesPayment": {
                "paymentType": "SENDER",
                "payor": {"responsibleParty": {"accountNumber": {"value": account}}},
            },
            "labelSpecification": {
                "imageType": "PDF",
                "labelStockType": "PAPER_4X6",
            },
            "requestedPackageLineItems": [_package(parcel)],
        },
    }
    # FedEx rejects an explicit null ship date; omit it and it uses today.
    body["requestedShipment"].pop("shipDatestamp", None)

    data = await request_json(
        "fedex", "POST", f"{_host(creds)}/ship/v1/shipments",
        token=token, json_body=body,
        extra_headers={"X-locale": "en_US"},
    )

    output = data.get("output") or {}
    transactions = output.get("transactionShipments") or []
    if not transactions:
        raise CarrierError("FedEx accepted the request but returned no shipment.")
    shipment = transactions[0]
    tracking = shipment.get("masterTrackingNumber") or ""

    label_url, label_b64 = None, None
    pieces = shipment.get("pieceResponses") or []
    if pieces:
        docs = pieces[0].get("packageDocuments") or []
        if docs:
            label_url = docs[0].get("url")
            label_b64 = docs[0].get("encodedLabel")

    amount = None
    try:
        amount = float((shipment.get("shipmentAdvisoryDetails") or {}).get("totalNetCharge")
                       or (shipment.get("completedShipmentDetail") or {})
                       .get("shipmentRating", {})
                       .get("shipmentRateDetails", [{}])[0]
                       .get("totalNetCharge"))
    except (TypeError, ValueError, IndexError, AttributeError):
        pass

    if not tracking:
        raise CarrierError("FedEx returned no tracking number.")

    return LabelResult(
        carrier="fedex",
        tracking_number=tracking,
        label_url=label_url,
        label_base64=label_b64,
        label_format="PDF",
        amount=amount,
        meta={"service_code": service_code, "service_name": SERVICES.get(service_code, service_code),
              "tracking_url": tracking_url("fedex", tracking)},
    )
