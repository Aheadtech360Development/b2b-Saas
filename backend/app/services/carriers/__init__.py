"""Direct carrier integrations — UPS, FedEx and USPS.

Each brand connects its own carrier accounts, so rates are quoted and labels are
bought on that brand's account and the postage bills to it. This replaces the
single shared aggregator account, where every brand's postage landed on ours.

All three carriers speak OAuth2 client-credentials over REST, so `base.py` holds
the token handling and each module is just that carrier's request/response shape.

Every module exposes the same three functions, which is what lets
`shipping_service` treat them interchangeably:

    verify(creds)                      -> {ok, message}
    rates(creds, ship_from, ship_to, parcel)  -> [RateQuote, ...]
    label(creds, ship_from, ship_to, parcel, service_code) -> LabelResult
"""
from app.services.carriers.base import (  # noqa: F401
    CarrierError,
    LabelResult,
    RateQuote,
)

CARRIERS = ("ups", "fedex", "usps")
