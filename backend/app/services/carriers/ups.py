"""UPS — rating and labels on the brand's own UPS account.

Uses the UPS REST APIs (developer.ups.com): OAuth2 for the token, Rating v2205
for quotes and Shipping v2409 for labels. Postage bills to the account number
the brand supplies, which is the whole point of connecting per brand.
"""
from __future__ import annotations

import logging

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
    "production": "https://onlinetools.ups.com",
    "test": "https://wwwcie.ups.com",
}

# UPS returns codes; these are the domestic services worth offering a buyer.
SERVICES = {
    "03": "UPS Ground",
    "12": "UPS 3 Day Select",
    "02": "UPS 2nd Day Air",
    "59": "UPS 2nd Day Air A.M.",
    "13": "UPS Next Day Air Saver",
    "01": "UPS Next Day Air",
    "14": "UPS Next Day Air Early",
}


def _host(creds: dict) -> str:
    return _HOSTS.get((creds.get("environment") or "production").lower(), _HOSTS["production"])


async def _token(creds: dict) -> str:
    return await oauth_token(
        carrier="ups",
        token_url=f"{_host(creds)}/security/v1/oauth/token",
        client_id=creds.get("client_id") or "",
        client_secret=creds.get("client_secret") or "",
        environment=creds.get("environment") or "production",
        basic_auth=True,                      # UPS wants Basic auth on the token call
    )


async def verify(creds: dict) -> dict:
    """A token exchange is enough — it proves the app and secret are live."""
    try:
        await _token(creds)
    except CarrierError as exc:
        return {"ok": False, "message": str(exc)}
    if not creds.get("account_number"):
        return {"ok": False, "message": "UPS connected, but an account number is needed to bill postage."}
    return {"ok": True, "message": "Connected to UPS. Rates and labels will bill to your account."}


def _address(a: dict, *, residential: bool = False) -> dict:
    node = {
        "Name": (a.get("name") or a.get("company") or "Shipper")[:35],
        "Address": {
            "AddressLine": [x for x in [a.get("street1") or a.get("address_line1"), a.get("street2")] if x][:3],
            "City": a.get("city") or "",
            "StateProvinceCode": (a.get("state") or "")[:5],
            "PostalCode": (a.get("zip") or a.get("postal_code") or "").replace(" ", ""),
            "CountryCode": (a.get("country") or "US")[:2],
        },
    }
    if residential:
        node["Address"]["ResidentialAddressIndicator"] = "Y"
    if a.get("phone"):
        node["Phone"] = {"Number": "".join(ch for ch in str(a["phone"]) if ch.isdigit())[:15]}
    return node


def _package(parcel: dict) -> dict:
    weight, length, width, height = lbs_and_inches(parcel)
    return {
        "PackagingType": {"Code": "02"},          # customer-supplied packaging
        "Dimensions": {
            "UnitOfMeasurement": {"Code": "IN"},
            "Length": f"{length:.2f}", "Width": f"{width:.2f}", "Height": f"{height:.2f}",
        },
        "PackageWeight": {
            "UnitOfMeasurement": {"Code": "LBS"},
            "Weight": f"{weight:.2f}",
        },
    }


async def rates(creds: dict, ship_from: dict, ship_to: dict, parcel: dict) -> list[RateQuote]:
    """Every UPS service that can carry this parcel, priced.

    `Shop` asks UPS to price all services at once — one call instead of one per
    service.
    """
    token = await _token(creds)
    account = creds.get("account_number") or ""

    body = {
        "RateRequest": {
            "Request": {"RequestOption": "Shop", "TransactionReference": {"CustomerContext": "rating"}},
            "Shipment": {
                "Shipper": {**_address(ship_from), "ShipperNumber": account},
                "ShipFrom": _address(ship_from),
                "ShipTo": _address(ship_to, residential=bool(ship_to.get("residential"))),
                "Package": [_package(parcel)],
                # Negotiated rates when the account has them — that's what the
                # brand actually pays, so it's what the buyer should be quoted.
                "ShipmentRatingOptions": {"NegotiatedRatesIndicator": "Y"},
            },
        }
    }

    data = await request_json(
        "ups", "POST", f"{_host(creds)}/api/rating/v2205/Shop",
        token=token, json_body=body,
    )

    out: list[RateQuote] = []
    shipments = ((data.get("RateResponse") or {}).get("RatedShipment")) or []
    if isinstance(shipments, dict):
        shipments = [shipments]
    for s in shipments:
        code = ((s.get("Service") or {}).get("Code")) or ""
        negotiated = (((s.get("NegotiatedRateCharges") or {}).get("TotalCharge")) or {})
        published = (s.get("TotalCharges") or {})
        charge = negotiated or published
        try:
            amount = float(charge.get("MonetaryValue"))
        except (TypeError, ValueError):
            continue
        days = None
        try:
            days = int((s.get("GuaranteedDelivery") or {}).get("BusinessDaysInTransit"))
        except (TypeError, ValueError):
            pass
        out.append(RateQuote(
            carrier="ups",
            service_code=code,
            service_name=SERVICES.get(code, f"UPS {code}"),
            amount=amount,
            currency=charge.get("CurrencyCode") or "USD",
            estimated_days=days,
        ))

    out.sort(key=lambda r: r.amount)
    return out


async def label(creds: dict, ship_from: dict, ship_to: dict, parcel: dict, service_code: str) -> LabelResult:
    """Buy a UPS label for one service. Postage bills to the brand's account."""
    token = await _token(creds)
    account = creds.get("account_number") or ""
    if not account:
        raise CarrierError("A UPS account number is required to buy a label.")

    body = {
        "ShipmentRequest": {
            "Request": {"RequestOption": "nonvalidate"},
            "Shipment": {
                "Description": (parcel.get("description") or "Merchandise")[:50],
                "Shipper": {**_address(ship_from), "ShipperNumber": account},
                "ShipFrom": _address(ship_from),
                "ShipTo": _address(ship_to, residential=bool(ship_to.get("residential"))),
                "PaymentInformation": {
                    "ShipmentCharge": {
                        "Type": "01",                       # transportation charges
                        "BillShipper": {"AccountNumber": account},
                    }
                },
                "Service": {"Code": service_code},
                "Package": [_package(parcel)],
            },
            "LabelSpecification": {
                "LabelImageFormat": {"Code": "GIF"},
                "HTTPUserAgent": "AT360",
            },
        }
    }

    data = await request_json(
        "ups", "POST", f"{_host(creds)}/api/shipments/v2409/ship",
        token=token, json_body=body,
    )

    results = (data.get("ShipmentResponse") or {}).get("ShipmentResults") or {}
    tracking = results.get("ShipmentIdentificationNumber") or ""
    packages = results.get("PackageResults") or {}
    if isinstance(packages, list):
        packages = packages[0] if packages else {}
    image = (packages.get("ShippingLabel") or {}).get("GraphicImage")
    amount = None
    try:
        amount = float((results.get("ShipmentCharges") or {}).get("TotalCharges", {}).get("MonetaryValue"))
    except (TypeError, ValueError, AttributeError):
        pass

    if not tracking:
        raise CarrierError("UPS accepted the shipment but returned no tracking number.")

    return LabelResult(
        carrier="ups",
        tracking_number=tracking,
        label_base64=image,
        label_format="GIF",
        amount=amount,
        meta={"service_code": service_code},
    )
