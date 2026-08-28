import os
import json
import logging
import shippo
from shippo.models import components

logger = logging.getLogger(__name__)

GRAMS_PER_OZ = 28.3495


def grams_to_oz(grams: float) -> float:
    """Convert grams to ounces for Shippo API calls."""
    return grams / GRAMS_PER_OZ


# Platform-level FALLBACK ship-from — used only when a brand hasn't set its own
# warehouse address. Each tenant should configure its own (see get_ship_from).
WAREHOUSE_ADDRESS = {
    "name": "AF Apparels",
    "street1": "10719 Turbeville Rd",
    "city": "Dallas",
    "state": "TX",
    "zip": "75243",
    "country": "US",
    "phone": "2145550100",
    "email": "shipping@afapparels.com",
}

async def get_ship_from(db, tenant_id) -> dict:
    """Return THIS brand's ship-from (origin) address, or the platform default.

    Resolution order (first hit wins), so a brand in NY no longer ships "from
    Dallas" and shipping never hard-fails:
      1. The `ship_from` address the brand set on its Shipping settings page
         (a per-tenant setting — see app.core.tenant_settings).
      2. The brand's first active Warehouse that has a usable street + ZIP + state.
      3. WAREHOUSE_ADDRESS — the platform-wide fallback.

    Both Warehouse and the settings lookup are tenant-scoped to the current
    request; `tenant_id` short-circuits contexts with no resolved tenant.
    """
    if not tenant_id:
        return dict(WAREHOUSE_ADDRESS)

    # 1. Explicit ship-from address configured in the brand's shipping settings.
    try:
        import json as _json
        from app.core.tenant_settings import get_setting
        raw = await get_setting(db, "ship_from", tenant_id=tenant_id)
        if raw:
            cfg = _json.loads(raw)
            if cfg.get("street1") and cfg.get("zip") and cfg.get("state"):
                return {
                    "name": cfg.get("name") or "Warehouse",
                    "street1": cfg["street1"],
                    "city": cfg.get("city", ""),
                    "state": cfg["state"],
                    "zip": cfg["zip"],
                    "country": cfg.get("country") or "US",
                    "phone": cfg.get("phone") or WAREHOUSE_ADDRESS["phone"],
                    "email": cfg.get("email") or WAREHOUSE_ADDRESS["email"],
                }
    except Exception as exc:
        logger.warning("get_ship_from: ship_from setting lookup failed (%s)", exc)

    # 2. Otherwise fall back to the brand's primary active Warehouse address.
    try:
        from sqlalchemy import select
        from app.models.inventory import Warehouse

        rows = (await db.execute(
            select(Warehouse)
            .where(Warehouse.is_active.is_(True))
            .order_by(Warehouse.created_at.asc())
        )).scalars().all()
        wh = next(
            (w for w in rows if w.address_line1 and w.postal_code and w.state),
            None,
        )
    except Exception as exc:  # never block a checkout on a ship-from lookup
        logger.warning("get_ship_from fell back to default (%s)", exc)
        return dict(WAREHOUSE_ADDRESS)

    if wh is None:
        return dict(WAREHOUSE_ADDRESS)  # 3. platform default
    return {
        "name": wh.name or "Warehouse",
        "street1": wh.address_line1,
        "city": wh.city or "",
        "state": wh.state,
        "zip": wh.postal_code,
        "country": wh.country or "US",
        # Warehouse has no phone/email columns — use the platform contact so
        # carriers that require them (UPS/FedEx) still get valid values.
        "phone": WAREHOUSE_ADDRESS["phone"],
        "email": WAREHOUSE_ADDRESS["email"],
    }

# Maps carrier key → Shippo service-level token fragment used for rate selection
CARRIER_TOKENS = {
    "usps": "usps_priority",
    "ups": "ups_ground",
    "fedex": "fedex_ground",
}


def get_client():
    api_key = os.getenv("SHIPPO_API_KEY", "")
    if not api_key:
        raise ValueError("SHIPPO_API_KEY not set")
    return shippo.Shippo(api_key_header=api_key)


async def create_label(
    order_id: str,
    to_address: dict,
    carrier_token: str,
    weight_oz: float = 16.0,
    address_from: dict | None = None,
) -> dict:
    # Ship FROM the brand's own warehouse when provided; fall back to the
    # platform default only if a caller couldn't resolve a tenant address.
    ship_from = address_from or WAREHOUSE_ADDRESS
    try:
        client = get_client()

        # For UPS, validate that city/state/zip match before creating shipment
        if "ups" in carrier_token.lower():
            try:
                validated_addr = client.addresses.create(
                    components.AddressCreateRequest(
                        name=to_address.get("name", "Customer"),
                        street1=to_address.get("street1", ""),
                        city=to_address.get("city", ""),
                        state=to_address.get("state", ""),
                        zip=to_address.get("zip", ""),
                        country=to_address.get("country", "US"),
                        validate=True,
                    )
                )
                vr = getattr(validated_addr, "validation_results", None)
                if vr and not getattr(vr, "is_valid", True):
                    return {
                        "success": False,
                        "error": "Please verify the shipping address - city, state and ZIP code must match",
                    }
            except Exception as val_exc:
                logger.warning("UPS address validation error: %s", val_exc)

        shipment = client.shipments.create(
            components.ShipmentCreateRequest(
                address_from=components.AddressCreateRequest(
                    name=ship_from["name"],
                    street1=ship_from["street1"],
                    city=ship_from["city"],
                    state=ship_from["state"],
                    zip=ship_from["zip"],
                    country=ship_from.get("country", "US"),
                    phone=ship_from.get("phone", "0000000000"),
                    email=ship_from.get("email", "shipping@example.com"),
                ),
                address_to=components.AddressCreateRequest(
                    name=to_address.get("name", ""),
                    street1=to_address.get("street1", ""),
                    city=to_address.get("city", ""),
                    state=to_address.get("state", ""),
                    zip=to_address.get("zip", ""),
                    country=to_address.get("country", "US"),
                ),
                parcels=[components.ParcelCreateRequest(
                    length="12",
                    width="10",
                    height="6",
                    distance_unit=components.DistanceUnitEnum.IN,
                    weight=str(round(weight_oz, 2)),
                    mass_unit=components.WeightUnitEnum.OZ,
                )],
                async_=False,
            )
        )

        # Find matching rate
        selected_rate = None
        for rate in (shipment.rates or []):
            token = rate.servicelevel.token.lower() if rate.servicelevel else ""
            if carrier_token.lower() in token:
                selected_rate = rate
                break

        if not selected_rate and shipment.rates:
            selected_rate = shipment.rates[0]

        if not selected_rate:
            return {"success": False, "error": "No rates available"}

        # Generate label
        transaction = client.transactions.create(
            components.TransactionCreateRequest(
                rate=selected_rate.object_id,
                label_file_type=components.LabelFileTypeEnum.PDF,
                async_=False,
            )
        )

        if transaction.status == components.TransactionStatusEnum.SUCCESS:
            return {
                "success": True,
                "tracking_number": transaction.tracking_number,
                "tracking_url": transaction.tracking_url_provider,
                "label_url": transaction.label_url,
                "carrier": selected_rate.provider,
                "service": selected_rate.servicelevel.name,
                "rate": float(selected_rate.amount),
            }
        else:
            if transaction.messages:
                error_text = " | ".join([m.text for m in transaction.messages if hasattr(m, "text")])
                return {"success": False, "error": error_text}
            return {"success": False, "error": "Label creation failed"}

    except Exception as e:
        logger.error(f"Shippo label error: {e}")
        return {"success": False, "error": str(e)}


async def create_shippo_label(order, carrier: str, db=None) -> dict:
    """Wrapper used by admin/orders.py — extracts address from order snapshot.

    Ships FROM the order's own brand warehouse: when a db session is passed we
    resolve this tenant's ship-from address, so a NY brand's label prints its NY
    origin (not the platform default).
    """
    try:
        addr = json.loads(order.shipping_address_snapshot or "{}")
    except Exception:
        addr = {}

    to_address = {
        "name": addr.get("full_name") or addr.get("label") or "Customer",
        "street1": addr.get("address_line1") or addr.get("line1") or "",
        "city": addr.get("city") or "",
        "state": addr.get("state") or "",
        "zip": addr.get("postal_code") or addr.get("zip_code") or "",
        "country": addr.get("country") or "US",
    }

    if not all([to_address["street1"], to_address["city"], to_address["state"], to_address["zip"]]):
        return {"success": False, "error": "Incomplete shipping address on order"}

    # Compute total shipment weight in oz from order items (weight stored in grams per product).
    # Falls back to 16 oz (~453 g) when product weights are not set.
    weight_oz = 16.0
    items = getattr(order, "items", None) or []
    if items:
        total_g = 0.0
        for item in items:
            prod = getattr(item, "product", None)
            w_str = getattr(prod, "weight", None) if prod else None
            if w_str:
                try:
                    total_g += float(w_str) * (item.quantity or 1)
                except (ValueError, TypeError):
                    total_g = 0.0
                    break
        if total_g > 0:
            weight_oz = grams_to_oz(total_g)

    # Resolve THIS brand's ship-from (falls back to platform default inside helper).
    ship_from = None
    if db is not None:
        ship_from = await get_ship_from(db, getattr(order, "tenant_id", None))

    carrier_token = CARRIER_TOKENS.get(carrier, "usps_priority")
    return await create_label(
        str(order.id), to_address, carrier_token, weight_oz=weight_oz, address_from=ship_from
    )


async def track_package(tracking_number: str, carrier: str) -> dict:
    try:
        client = get_client()
        tracking = client.tracking_status.get(
            carrier=carrier.lower(),
            tracking_number=tracking_number,
        )
        return {
            "status": tracking.tracking_status.status.value if tracking.tracking_status else "UNKNOWN",
            "detail": tracking.tracking_status.status_details if tracking.tracking_status else "",
            "eta": str(tracking.eta) if tracking.eta else None,
        }
    except Exception as e:
        logger.error(f"Shippo tracking error: {e}")
        return {"status": "UNKNOWN", "error": str(e)}
