"""An order's thank-you page: who may open it, and what it shows.

The page after a checkout has an address of its own,
/checkout/thank-you/<order number>, and reads the order back from the server,
so a reload or a new tab still shows it. Before, every order landed on the same
/checkout/confirmed, drawn from what the browser had kept, and a reload sent the
buyer to an empty cart.

A signed-in buyer is let in by their sign-in, by the rule their account's
order page uses. A guest has nothing to sign in with, so the guest checkout
answers with a view key and the page keeps it in that browser. The key is
signed, not stored: an HMAC of the order and the shop, so it needs no column
and cannot be worked out from an order number, which runs in sequence. It is
never put in the page's address, where the shop's tracking tools would collect
it with the rest of the URL.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

GANG_SHEET_SKU = "GANG-SHEET"


def view_key(order_id: Any, tenant_id: Any) -> str:
    """The key that opens one order's thank-you page."""
    # Keyed with both secrets, like the gang sheet file links
    # (gang_sheets._file_sig): APP_SECRET_KEY has a default in the code that a
    # deployment may never have changed, and the sign-in key cannot be left at
    # its default without sign-in itself being forgeable.
    key = f"{settings.APP_SECRET_KEY}\x00{settings.JWT_SECRET_KEY}".encode()
    msg = f"order-view:{order_id}:{tenant_id or ''}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:40]


def key_opens(order: Any, key: str | None) -> bool:
    if not key:
        return False
    # As bytes: compare_digest refuses a str with anything but ASCII in it,
    # and a 500 for a real order beside a 404 for a made-up one would say
    # which numbers exist.
    return hmac.compare_digest(view_key(order.id, order.tenant_id).encode(), key.strip().encode())


def owned_by(order: Any, *, user_id: Any, company_id: Any, account_type: str | None) -> bool:
    """The signed-in buyer's own order: one they placed as a retail customer, or
    their company's as a wholesale one (orders._load_order_for_auth's rule)."""
    if account_type == "retail" and user_id:
        return str(order.placed_by_id or "") == str(user_id)
    if company_id:
        return str(order.company_id or "") == str(company_id)
    return False


def _ship_to(snapshot: str | None) -> dict[str, str] | None:
    """The address the order goes to, from the copy kept on it. Copies were
    written with two sets of keys over time, line1 / postal_code at checkout
    and address_line1 / zip_code on older paths (as
    carrier_service.ship_to_from_snapshot reads them); one from the address
    book has no name or phone."""
    try:
        saved = json.loads(snapshot) if snapshot else None
    except (TypeError, ValueError):
        return None
    if not isinstance(saved, dict):
        return None

    def pick(*keys: str) -> str:
        for key in keys:
            if saved.get(key):
                return str(saved[key]).strip()
        return ""

    line1 = pick("line1", "address_line1", "street1")
    if not line1:
        return None
    return {
        "full_name": pick("full_name", "name"),
        "line1": line1,
        "line2": pick("line2", "address_line2", "street2"),
        "city": pick("city"),
        "state": pick("state", "state_province"),
        "postal_code": pick("postal_code", "zip_code", "zip"),
        "country": pick("country") or "US",
        "phone": pick("phone"),
    }


def _first_pictures(rows: Any) -> dict[str, str]:
    """One picture per product, from (product id, url) rows that come main
    picture first."""
    pictures: dict[str, str] = {}
    for pid, url in rows:
        if url:
            pictures.setdefault(str(pid), url)
    return pictures


def _money(value: Any) -> float:
    return float(value or 0)


async def summary(db: AsyncSession, order: Any) -> dict[str, Any]:
    """What the thank-you page shows. `order` comes with its items, placed_by
    and company loaded."""
    from app.api.v1.gang_sheets import GangSheetOrder
    from app.models.product import ProductImage, ProductVariant
    from app.services import order_money
    from app.services.pickup import pickup_location

    buyer = order.placed_by
    name = (order.guest_name or "").strip()
    if not name and buyer is not None:
        name = " ".join(filter(None, [buyer.first_name, buyer.last_name])).strip()
    email = order.guest_email or (buyer.email if buyer is not None else None)

    # One picture per product: its main one, else its first. A stocked line
    # names its variant only, so its product is found through that.
    variants = {i.variant_id for i in order.items if i.variant_id and not i.product_id}
    product_of: dict[str, Any] = {}
    if variants:
        product_of = {str(v): p for v, p in (await db.execute(
            select(ProductVariant.id, ProductVariant.product_id).where(ProductVariant.id.in_(variants))
        )).all()}

    def line_product(line: Any) -> Any:
        return line.product_id or product_of.get(str(line.variant_id))

    product_ids = {pid for pid in (line_product(i) for i in order.items) if pid}
    pictures: dict[str, str] = {}
    if product_ids:
        pictures = _first_pictures((await db.execute(
            select(ProductImage.product_id, ProductImage.url_thumbnail)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.is_primary.desc(), ProductImage.sort_order)
        )).all())

    sheets = (await db.execute(
        select(func.count()).select_from(GangSheetOrder).where(GangSheetOrder.order_id == order.id)
    )).scalar() or 0
    pickup = await pickup_location(db, order.tenant_id) if order.shipping_method == "will_call" else None

    return {
        "order_number": order.order_number,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "first_name": name.split()[0] if name else None,
        "email": email,
        "company_name": order.company.name if order.company is not None else None,
        "po_number": order.po_number,
        "items": [
            {
                "name": i.product_name,
                "color": i.color,
                "size": i.size,
                "quantity": i.quantity,
                "unit_price": _money(i.unit_price),
                "line_total": _money(i.line_total),
                "configuration": i.configuration,
                "image_url": pictures.get(str(line_product(i))),
                "gang_sheet": i.sku == GANG_SHEET_SKU,
            }
            for i in order.items
        ],
        "subtotal": _money(order.subtotal),
        "discounts": await order_money.discount_lines(db, order),
        "shipping_cost": _money(order.shipping_cost),
        "tax_amount": _money(order.tax_amount),
        "tax_label": order_money.tax_label(order),
        "convenience_fee": _money(getattr(order, "convenience_fee", 0)),
        "total": _money(order.total),
        "shipping_method": order.shipping_method,
        "carrier": order.carrier or order.courier,
        "courier_service": order.courier_service,
        "ship_to": None if order.shipping_method == "will_call" else _ship_to(order.shipping_address_snapshot),
        "pickup": pickup if pickup and (pickup.get("address") or pickup.get("name")) else None,
        "has_gang_sheet": bool(sheets),
    }
