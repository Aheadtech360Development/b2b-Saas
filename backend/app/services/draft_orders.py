"""Orders the shop takes itself, by phone or at the counter (design 32, the New
order wizard).

The draft is made at the wizard's first step, so every later step reads and
writes the server's own copy:
- each line is charged what this customer would pay online (their tier and
  their discount group; a guest pays the guest price);
- a pasted list of SKUs is matched here;
- the totals are worked out here the way checkout works them, tax included
  (resolve_tax on the ship-to address, or on the shop's pickup place).

A draft is an Order with status "pending" and a DRAFT- number; confirming it
gives it the shop's next order number (admin/orders.update_admin_order).
"""
from __future__ import annotations

import json
import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

CENT = Decimal("0.01")
PICKUP = "will_call"


def money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


# ── What this customer pays ─────────────────────────────────────────────────

async def buyer_pricing(db: AsyncSession, company_id: Any) -> dict:
    """The tier discount, discount group and tier name a company buys at,
    found as the storefront finds them (core/database._apply_pricing_context)."""
    from app.models.company import Company

    answer: dict[str, Any] = {"discount_percent": Decimal("0"), "group_id": None, "tier": None}
    if not company_id:
        return answer
    row = (await db.execute(
        select(Company.pricing_tier_id, Company.tags).where(Company.id == company_id)
    )).first()
    if not row:
        return answer
    tier_id, tags = row
    if tier_id:
        from app.models.pricing import PricingTier

        tier = (await db.execute(
            select(PricingTier.name, PricingTier.discount_percent).where(PricingTier.id == tier_id)
        )).first()
        if tier:
            answer["tier"] = tier[0]
            answer["discount_percent"] = Decimal(str(tier[1] or 0))
    if tags:
        from app.models.discount_group import DiscountGroup

        group = (await db.execute(
            select(DiscountGroup.id).where(DiscountGroup.customer_tag.in_(tags), DiscountGroup.status == "enabled").limit(1)
        )).scalar_one_or_none()
        answer["group_id"] = str(group) if group else None
    return answer


async def variant_price(db: AsyncSession, order: Any, variant: Any) -> Decimal:
    """What this order's customer pays for one of `variant`: an account's tier
    and discount group, as its cart prices it; a guest the guest price (MSRP,
    else retail), as guest checkout prices it."""
    if getattr(order, "company_id", None):
        from app.services.cart_service import CartService

        pricing = await buyer_pricing(db, order.company_id)
        return money(await CartService(db)._effective_price(variant, pricing["discount_percent"], pricing["group_id"]))
    return money(getattr(variant, "msrp", None) or variant.retail_price or 0)


# ── Pasted SKUs ─────────────────────────────────────────────────────────────

_PASTE_LINE = re.compile(r"^\s*([^\s,;:\t]+)\s*(?:[,;:\t]|\s)\s*(?:x|qty|×)?\s*(\d+)\s*$", re.IGNORECASE)


def parse_skus(text: str) -> list[tuple[str, int]]:
    """Lines of "SKU quantity" as people paste them: "TEE-BLK-L 12",
    "TEE-BLK-L, 12", "TEE-BLK-L x12", or a SKU alone for one. The same SKU
    twice adds up."""
    wanted: dict[str, int] = {}
    order: list[str] = []
    for raw in re.split(r"[\r\n]+", text or ""):
        line = raw.strip()
        if not line:
            continue
        m = _PASTE_LINE.match(line)
        if m:
            sku, qty = m.group(1), int(m.group(2))
        elif re.fullmatch(r"[^\s,;:\t]+", line):
            sku, qty = line, 1
        else:
            sku, qty = line, 0  # not a line we can read; reported back as not found
        key = sku.upper()
        if key not in wanted:
            order.append(key)
            wanted[key] = 0
        wanted[key] += qty
    return [(sku, wanted[sku]) for sku in order]


# ── Totals ──────────────────────────────────────────────────────────────────

def address_of(order: Any) -> dict:
    try:
        data = json.loads(getattr(order, "shipping_address_snapshot", None) or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


async def pickup_place(db: AsyncSession, tenant_id: Any) -> dict:
    """The shop's pickup place as saved (its own, else its ship-from address),
    with state and ZIP for tax."""
    from sqlalchemy import text

    from app.core.tenant_settings import scoped_key
    from app.services.pickup import _saved

    if not tenant_id:
        return {}
    keys = {"p": scoped_key("pickup_location", tenant_id), "s": scoped_key("ship_from", tenant_id)}
    rows = dict((await db.execute(text("SELECT key, value FROM settings WHERE key IN (:p, :s)"), keys)).all())
    own, ship_from = _saved(rows.get(keys["p"])), _saved(rows.get(keys["s"]))
    return own if str(own.get("street1") or "").strip() else ship_from


async def reprice(db: AsyncSession, order: Any) -> None:
    """Subtotal from the lines, shipping as set (none for pickup), and tax as
    checkout charges it: on the ship-to address, or on the shop's pickup place;
    none for a tax-exempt account."""
    from app.models.order import OrderItem
    from app.services.tax_service import resolve_tax

    lines = (await db.execute(select(OrderItem.line_total).where(OrderItem.order_id == order.id))).scalars().all()
    subtotal = money(sum((Decimal(str(x or 0)) for x in lines), Decimal("0")))
    pickup = (order.shipping_method or "") == PICKUP
    shipping = Decimal("0.00") if pickup else money(order.shipping_cost)

    tax = Decimal("0.00")
    rate, region = 0.0, None
    exempt = False
    if order.company_id:
        from app.models.company import Company

        exempt = bool((await db.execute(select(Company.tax_exempt).where(Company.id == order.company_id))).scalar())
    if subtotal > 0 and not exempt:
        if pickup:
            place = await pickup_place(db, getattr(order, "tenant_id", None))
            state, zip_, city = place.get("state"), place.get("zip"), place.get("city")
        else:
            addr = address_of(order)
            state, zip_, city = addr.get("state"), addr.get("postal_code"), addr.get("city")
        if state:
            found = await resolve_tax(db, str(state), str(zip_ or ""), str(city or ""), float(subtotal))
            tax = money(found.get("tax_amount"))
            rate, region = float(found.get("rate") or 0), found.get("region")

    order.subtotal = subtotal
    order.shipping_cost = shipping
    order.tax_amount = tax
    try:
        order.tax_rate = rate
        order.tax_region = region
    except Exception:
        pass
    order.total = subtotal + shipping + tax


# ── What the wizard reads ───────────────────────────────────────────────────

async def wizard_state(db: AsyncSession, order: Any) -> dict:
    """Everything the New order wizard shows for one draft."""
    from app.models.company import Company, UserAddress
    from app.models.order import OrderItem
    from app.models.user import User

    customer: dict[str, Any]
    if order.company_id:
        company = (await db.execute(select(Company).where(Company.id == order.company_id))).scalar_one_or_none()
        pricing = await buyer_pricing(db, order.company_id)
        email = None
        if order.placed_by_id:
            email = (await db.execute(select(User.email).where(User.id == order.placed_by_id))).scalar()
        saved = (await db.execute(
            select(UserAddress).where(UserAddress.company_id == order.company_id)
            .order_by(UserAddress.is_default.desc(), UserAddress.created_at)
        )).scalars().first()
        if saved is not None:
            suggested = {"full_name": saved.full_name or (company.name if company else ""), "line1": saved.address_line1,
                         "line2": saved.address_line2 or "", "city": saved.city, "state": saved.state,
                         "postal_code": saved.postal_code, "country": saved.country or "US", "phone": saved.phone or ""}
        elif company is not None and company.address_line1:
            suggested = {"full_name": company.name, "line1": company.address_line1, "line2": company.address_line2 or "",
                         "city": company.city or "", "state": company.state_province or "",
                         "postal_code": company.postal_code or "", "country": company.country or "US",
                         "phone": company.phone or ""}
        else:
            suggested = None
        customer = {
            "kind": "account", "company_id": str(order.company_id),
            "name": company.name if company else "", "email": email or (company.company_email if company else None),
            "phone": company.phone if company else None,
            "tier": pricing["tier"], "discount_percent": float(pricing["discount_percent"]),
            "tax_exempt": bool(company.tax_exempt) if company else False,
            "suggested_address": suggested,
        }
    else:
        customer = {
            "kind": "guest", "company_id": None, "name": order.guest_name or "", "email": order.guest_email,
            "phone": order.guest_phone, "tier": None, "discount_percent": 0.0, "tax_exempt": False,
            "suggested_address": None,
        }

    items = (await db.execute(
        select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.created_at)
    )).scalars().all()

    def options_of(item: Any) -> str:
        if item.variant_id:
            return " / ".join(x for x in (item.color, item.size) if x)
        breakdown = (item.configuration or {}).get("breakdown") or []
        return " · ".join(f'{b.get("option")}: {b.get("value")}' for b in breakdown[:6] if isinstance(b, dict))

    return {
        "id": str(order.id),
        "order_number": order.order_number,
        "draft": order.status == "pending" and (order.order_number or "").startswith("DRAFT-"),
        "status": order.status,
        "payment_status": order.payment_status,
        "customer": customer,
        "delivery": {
            "method": PICKUP if (order.shipping_method or "") == PICKUP else "ship",
            "address": address_of(order) or None,
        },
        "items": [
            {
                "id": str(i.id), "product": (i.product_name or "").split(" — ")[0], "label": i.product_name,
                "sku": i.sku, "options": options_of(i), "quantity": int(i.quantity or 0),
                "unit_price": float(i.unit_price or 0), "line_total": float(i.line_total or 0),
                "configured": i.variant_id is None,
            }
            for i in items
        ],
        "subtotal": float(order.subtotal or 0),
        "shipping": float(order.shipping_cost or 0),
        "tax": float(order.tax_amount or 0),
        "total": float(order.total or 0),
        "po_number": order.po_number,
        "notes": order.notes,
        "payment_terms": order.payment_terms,
    }
