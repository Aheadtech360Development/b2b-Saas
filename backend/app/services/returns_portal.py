"""The returns and exchanges portal (Retail launch, package 4).

Buyers start a return or an exchange themselves, from their account or as a
guest (order number and the email it was placed with), for a delivered order
inside the shop's window. The shop decides in its Returns list: approve,
decline, mark what came back (back on the shelf or not), refund, or make the
exchange order. Every change is an `rma_events` row and an email to the buyer
in the shop's name.

Built on the returns the shop already had (rma_requests / rma_items, and
services/returns for reprints): one list, one refund path
(admin/orders.issue_refund, card first then gift cards).

Rules that matter:
- a line can be returned only up to what was ordered less what other returns
  (not declined) already asked for;
- gift cards are never returned here; made-to-order lines (configured
  products, gang sheets) are final sale unless the shop says otherwise;
- a refund never exceeds what was paid for the returned items (their price,
  less their share of any discount, plus their share of the tax), nor what is
  left to refund on the order;
- an exchange is for another size or colour of the same product, in stock;
  a dearer replacement leaves the difference on the exchange order to pay
  (its invoice link), a cheaper one refunds the difference.

The portal is off until the shop turns it on (Settings on the Returns page);
while it is off, an account's return form works as it always has.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import random
import time
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select, update

from app.models.order import Order, OrderItem
from app.models.product import Product, ProductVariant
from app.models.rma import RMAEvent, RMAItem, RMARequest

logger = logging.getLogger(__name__)

CENTS = Decimal("0.01")
SETTINGS_KEY = "returns_portal"
DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "window_days": 30,
    "reasons": ["Doesn't fit", "Not as described", "Arrived damaged", "Wrong item sent", "Changed my mind", "Other"],
    "made_to_order_final_sale": True,
    "final_sale_product_ids": [],
    "shipping_payer": "buyer",       # buyer | shop
    "instructions": "",
    "methods": ["original", "exchange"],   # original | store_credit | exchange
}
METHODS = ("original", "store_credit", "exchange")
STATUS_WORDS = {
    "pending": "Requested", "approved": "Approved", "rejected": "Declined", "received": "Received",
    "refunded": "Refunded", "exchanged": "Exchanged", "closed": "Closed", "completed": "Completed",
}
# What can follow what. A return is decided once; what came back is noted
# once; it ends refunded, exchanged, declined or closed.
NEXT = {
    "approve": ({"pending"}, "approved"),
    "decline": ({"pending", "approved"}, "rejected"),
    "receive": ({"pending", "approved"}, "received"),
    "refund": ({"approved", "received"}, "refunded"),
    "exchange": ({"approved", "received"}, "exchanged"),
    "close": ({"pending", "approved", "received", "refunded", "exchanged", "completed"}, "closed"),
}
TOKEN_MINUTES = 30


class ReturnError(Exception):
    """Something the buyer or the shop can be told, in these words."""


# ── Settings ───────────────────────────────────────────────────────────────

def clean_settings(raw: Any) -> dict[str, Any]:
    out = json.loads(json.dumps(DEFAULTS))
    if not isinstance(raw, dict):
        return out
    if isinstance(raw.get("enabled"), bool):
        out["enabled"] = raw["enabled"]
    days = raw.get("window_days")
    if isinstance(days, int) and not isinstance(days, bool) and 1 <= days <= 365:
        out["window_days"] = days
    if isinstance(raw.get("reasons"), list):
        reasons = [str(r).strip()[:80] for r in raw["reasons"][:12] if str(r or "").strip()]
        if reasons:
            out["reasons"] = list(dict.fromkeys(reasons))
    if isinstance(raw.get("made_to_order_final_sale"), bool):
        out["made_to_order_final_sale"] = raw["made_to_order_final_sale"]
    if isinstance(raw.get("final_sale_product_ids"), list):
        out["final_sale_product_ids"] = [str(p) for p in raw["final_sale_product_ids"][:500] if p]
    if raw.get("shipping_payer") in ("buyer", "shop"):
        out["shipping_payer"] = raw["shipping_payer"]
    if isinstance(raw.get("instructions"), str):
        out["instructions"] = raw["instructions"].strip()[:1500]
    if isinstance(raw.get("methods"), list):
        methods = [m for m in METHODS if m in raw["methods"]]
        if methods:
            out["methods"] = methods
    return out


def check_settings(changes: dict) -> None:
    days = changes.get("window_days")
    if "window_days" in changes and not (isinstance(days, int) and not isinstance(days, bool) and 1 <= days <= 365):
        raise ReturnError("The return window is 1 to 365 days after delivery.")
    if "methods" in changes:
        if not isinstance(changes["methods"], list) or not [m for m in METHODS if m in changes["methods"]]:
            raise ReturnError("Offer at least one way to put a return right.")
    if "reasons" in changes:
        if not isinstance(changes["reasons"], list) or not [r for r in changes["reasons"] if str(r or "").strip()]:
            raise ReturnError("Give buyers at least one reason to choose.")


async def settings_for(db, tenant_id) -> dict[str, Any]:
    from app.core.tenant_settings import get_setting

    raw = await get_setting(db, SETTINGS_KEY, tenant_id=tenant_id)
    try:
        return clean_settings(json.loads(raw) if raw else None)
    except (TypeError, ValueError):
        return clean_settings(None)


async def save_settings(db, tenant_id, changes: dict) -> dict[str, Any]:
    from app.core.tenant_settings import set_setting

    check_settings(changes)
    merged = clean_settings({**(await settings_for(db, tenant_id)), **changes})
    await set_setting(db, SETTINGS_KEY, json.dumps(merged), tenant_id=tenant_id)
    return merged


async def portal_on(db, tenant_id) -> bool:
    from app.services import entitlements

    try:
        if not await entitlements.enabled(db, tenant_id, "returns_portal"):
            return False
    except Exception:  # noqa: BLE001
        return False
    return bool((await settings_for(db, tenant_id))["enabled"])


# ── A guest's key to one order ─────────────────────────────────────────────

def _sign(order_id: Any, exp: int) -> str:
    from app.core.config import settings

    key = f"{settings.APP_SECRET_KEY}\x00{settings.JWT_SECRET_KEY}".encode()
    return hmac.new(key, f"return:{order_id}:{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def guest_token(order_id: Any, *, now: float | None = None) -> str:
    """A key to start a return on one order, for 30 minutes, after the guest
    proved the order number and email."""
    exp = int((now or time.time()) + TOKEN_MINUTES * 60)
    return f"{order_id}.{exp}.{_sign(order_id, exp)}"


def token_order(token: str | None, *, now: float | None = None) -> str | None:
    """The order a token opens, or None when it is forged, malformed or old."""
    try:
        order_id, exp_s, sig = str(token or "").split(".")
        exp = int(exp_s)
    except ValueError:
        return None
    if exp < (now or time.time()):
        return None
    if not hmac.compare_digest(_sign(order_id, exp).encode(), sig.encode()):
        return None
    return order_id


# ── What can be returned ───────────────────────────────────────────────────

async def delivered_at(db, order: Order) -> datetime | None:
    if order.status != "delivered":
        return None
    from app.models.shipment import Shipment

    latest = (await db.execute(
        select(func.max(Shipment.delivered_at)).where(Shipment.order_id == order.id)
    )).scalar_one_or_none()
    return latest or order.updated_at


async def already_asked(db, order_id) -> dict[str, int]:
    """Per order line: what returns that were not declined already asked for."""
    rows = (await db.execute(
        select(RMAItem.order_item_id, func.coalesce(func.sum(RMAItem.quantity), 0))
        .join(RMARequest, RMARequest.id == RMAItem.rma_id)
        .where(RMARequest.order_id == order_id, RMARequest.status != "rejected")
        .group_by(RMAItem.order_item_id)
    )).all()
    return {str(k): int(v) for k, v in rows}


def final_sale_reason(item: OrderItem, conf: dict) -> str | None:
    from app.services.gift_card_checkout import is_gift_line

    if is_gift_line(item):
        return "Gift cards can't be returned."
    if item.variant_id is None and conf.get("made_to_order_final_sale", True):
        return "Made to order, so final sale."
    if item.product_id and str(item.product_id) in set(conf.get("final_sale_product_ids") or []):
        return "Final sale."
    return None


def _price(variant: ProductVariant) -> Decimal:
    return Decimal(str(variant.msrp or variant.retail_price or 0)).quantize(CENTS)


async def exchange_options(db, item: OrderItem) -> list[dict]:
    """Other sizes and colours of the same product a line can be swapped for,
    in stock (or not counted)."""
    if item.variant_id is None:
        return []
    from app.services.inventory_service import sellable_stock

    variant = await db.get(ProductVariant, item.variant_id)
    if variant is None:
        return []
    product = await db.get(Product, variant.product_id)
    if product is None or product.status != "active":
        return []
    rows = (await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id, ProductVariant.status == "active")
    )).scalars().all()
    out = []
    for v in rows:
        stock = await sellable_stock(db, v, tracked=product.track_inventory)
        if stock is not None and stock <= 0:
            continue
        out.append({"variant_id": str(v.id), "label": " / ".join(x for x in (v.color, v.size) if x) or v.sku,
                    "sku": v.sku, "price": float(_price(v)), "in_stock": stock})
    return out


async def eligibility(db, order: Order, conf: dict, *, now: datetime | None = None) -> dict[str, Any]:
    """Whether a return can start on this order, and what each line allows."""
    now = now or datetime.now(timezone.utc)
    items = (await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
    asked = await already_asked(db, order.id)
    when = await delivered_at(db, order)
    ends = (when + timedelta(days=int(conf["window_days"]))) if when else None
    why = None
    if not conf.get("enabled"):
        why = "This shop does not take returns online. Contact the shop."
    elif order.payment_status != "paid" or order.status in ("cancelled", "refunded"):
        why = "This order can't be returned online. Contact the shop."
    elif when is None:
        why = "A return can start once your order has been delivered."
    elif ends < now:
        why = f"The {conf['window_days']}-day return window for this order ended on {ends:%B} {ends.day}, {ends.year}."
    lines = []
    for it in items:
        left = max(0, int(it.quantity) - asked.get(str(it.id), 0))
        final = final_sale_reason(it, conf)
        lines.append({
            "order_item_id": str(it.id), "product_name": it.product_name, "sku": it.sku,
            "color": it.color, "size": it.size, "quantity": int(it.quantity), "returnable": 0 if final else left,
            "unit_price": float(it.unit_price or 0), "final_sale": final,
            "exchange_options": (await exchange_options(db, it)) if (not final and left and "exchange" in conf["methods"]) else [],
        })
    if why is None and not any(l["returnable"] for l in lines):
        why = "Nothing on this order can be returned online."
    return {
        "open": why is None, "why": why, "order_id": str(order.id), "order_number": order.order_number,
        "delivered_at": when.isoformat() if when else None, "window_ends": ends.isoformat() if ends else None,
        "lines": lines, "reasons": conf["reasons"], "methods": conf["methods"],
        "shipping_payer": conf["shipping_payer"], "instructions": conf["instructions"],
    }


# ── Starting one ───────────────────────────────────────────────────────────

async def _new_number(db) -> str:
    for _ in range(20):
        number = f"RMA-{random.randint(100000, 999999)}"
        if not (await db.execute(select(RMARequest.id).where(RMARequest.rma_number == number))).first():
            return number
    raise ReturnError("Could not number the return. Try again.")


async def start(db, order: Order, conf: dict, *, channel: str, kind: str, items: list[dict],
                refund_method: str | None, note: str | None, user_id=None, guest_email: str | None = None,
                actor_name: str | None = None) -> RMARequest:
    """A buyer's return or exchange, checked against the order and the shop's
    rules. Does not commit."""
    if kind not in ("return", "exchange"):
        raise ReturnError("Choose a return or an exchange.")
    if kind == "exchange":
        if "exchange" not in conf["methods"]:
            raise ReturnError("This shop doesn't do exchanges online.")
        refund_method = "exchange"
    else:
        if refund_method not in ("original", "store_credit") or refund_method not in conf["methods"]:
            raise ReturnError("Choose how you would like your money back.")
    info = await eligibility(db, order, conf)
    if not info["open"]:
        raise ReturnError(info["why"])
    by_id = {l["order_item_id"]: l for l in info["lines"]}
    if not items:
        raise ReturnError("Choose at least one item.")
    seen: set[str] = set()
    picked = []
    for raw in items[:50]:
        line = by_id.get(str(raw.get("order_item_id")))
        if line is None or str(raw.get("order_item_id")) in seen:
            raise ReturnError("Some of those items are not on this order.")
        seen.add(line["order_item_id"])
        qty = raw.get("quantity")
        if line["final_sale"]:
            raise ReturnError(f"{line['product_name']}: {line['final_sale']}")
        if line["returnable"] <= 0:
            raise ReturnError(f"{line['product_name']}: already on another return.")
        if not isinstance(qty, int) or isinstance(qty, bool) or not (1 <= qty <= line["returnable"]):
            raise ReturnError(f"{line['product_name']}: choose 1 to {line['returnable']}.")
        reason = str(raw.get("reason") or "").strip()
        if reason not in conf["reasons"]:
            raise ReturnError("Choose a reason for each item.")
        replacement = None
        if kind == "exchange":
            options = {o["variant_id"]: o for o in line["exchange_options"]}
            replacement = str(raw.get("replacement_variant_id") or "")
            if replacement not in options:
                raise ReturnError(f"{line['product_name']}: choose what you would like instead, from what is in stock.")
            stock = options[replacement]["in_stock"]
            if stock is not None and stock < qty:
                raise ReturnError(f"{line['product_name']}: only {stock} of that left.")
        picked.append((line, qty, reason, replacement))

    rma = RMARequest(
        order_id=order.id, submitted_by_id=user_id, rma_number=await _new_number(db),
        reason="; ".join(dict.fromkeys(r for _, _, r, _ in picked))[:500],
        notes=(note or "").strip()[:2000] or None, status="pending", kind=kind, refund_method=refund_method,
        channel=channel, guest_email=(guest_email or "").strip().lower()[:255] or None,
    )
    db.add(rma)
    await db.flush()
    for line, qty, reason, replacement in picked:
        db.add(RMAItem(rma_id=rma.id, order_item_id=line["order_item_id"], quantity=qty, reason=reason[:500],
                       replacement_variant_id=replacement or None))
    db.add(RMAEvent(rma_id=rma.id, status="pending", actor_kind="buyer", actor_user_id=user_id,
                    actor_name=actor_name, note=rma.notes))
    from app.services import order_events

    await order_events.record(
        db, order, "return_requested",
        f"{'Exchange' if kind == 'exchange' else 'Return'} {rma.rma_number} requested: {rma.reason}",
        actor_type="customer", actor_id=user_id, actor_name=actor_name,
        meta={"rma_id": str(rma.id), "rma_number": rma.rma_number, "kind": kind,
              "items": len(picked), "channel": channel},
    )
    await db.flush()
    return rma


# ── Money ──────────────────────────────────────────────────────────────────

async def refund_cap(db, rma: RMARequest, order: Order) -> Decimal:
    """What was paid for the returned items: their price, less their share
    of the order's discount, plus their share of its tax. Shipping is not
    part of it."""
    lines = (await db.execute(
        select(RMAItem.quantity, OrderItem.unit_price, OrderItem.quantity, OrderItem.line_total)
        .join(OrderItem, OrderItem.id == RMAItem.order_item_id).where(RMAItem.rma_id == rma.id)
    )).all()
    value = Decimal("0")
    for qty, unit, ordered, line_total in lines:
        per = (Decimal(str(line_total or 0)) / Decimal(int(ordered or 1))) if ordered else Decimal(str(unit or 0))
        value += per * int(qty)
    subtotal = Decimal(str(order.subtotal or 0))
    if subtotal <= 0 or value <= 0:
        return Decimal("0.00")
    total = Decimal(str(order.total or 0))
    shipping = Decimal(str(order.shipping_cost or 0))
    tax = Decimal(str(order.tax_amount or 0))
    discount = max(Decimal("0"), subtotal + shipping + tax - total)
    share = min(Decimal("1"), value / subtotal)
    return (value - discount * share + tax * share).quantize(CENTS, rounding=ROUND_HALF_UP)


async def buyer_email(db, rma: RMARequest, order: Order) -> str | None:
    if rma.guest_email:
        return rma.guest_email
    if rma.submitted_by_id:
        from app.models.user import User

        email = (await db.execute(select(User.email).where(User.id == rma.submitted_by_id))).scalar_one_or_none()
        if email:
            return email
    return order.guest_email


# ── The shop's decisions ───────────────────────────────────────────────────

async def _restock(db, variant_id, qty: int, *, user_id, note: str) -> None:
    from app.models.inventory import InventoryAdjustment, InventoryRecord
    from app.services.inventory_service import default_warehouse

    record = (await db.execute(
        select(InventoryRecord).where(InventoryRecord.variant_id == variant_id)
        .order_by(InventoryRecord.quantity.desc()).limit(1).with_for_update()
    )).scalar_one_or_none()
    if record is None:
        warehouse = await default_warehouse(db)
        record = InventoryRecord(variant_id=variant_id, warehouse_id=warehouse.id, quantity=0)
        db.add(record)
        await db.flush()
    before = int(record.quantity)
    record.quantity = before + int(qty)
    db.add(InventoryAdjustment(inventory_record_id=record.id, adjusted_by_id=user_id, quantity_before=before,
                               quantity_after=before + int(qty), reason="returned", notes=note[:500]))
    await db.flush()


async def _take_stock(db, variant_id, qty: int) -> None:
    from app.models.inventory import InventoryRecord

    left = int(qty)
    records = (await db.execute(
        select(InventoryRecord).where(InventoryRecord.variant_id == variant_id)
        .order_by(InventoryRecord.quantity.desc()).with_for_update()
    )).scalars().all()
    for rec in records:
        if left <= 0:
            break
        take = min(int(rec.quantity), left)
        if take > 0:
            await db.execute(update(InventoryRecord).where(InventoryRecord.id == rec.id)
                             .values(quantity=int(rec.quantity) - take))
            left -= take


async def _exchange_order(db, request, rma: RMARequest, order: Order) -> tuple[Order, Decimal]:
    """The replacement order: the new sizes or colours at the price paid for
    the old; a dearer replacement's difference stays on it to pay. Returns the
    order and the price difference (negative: the buyer is owed it)."""
    from app.services import order_events
    from app.services.inventory_service import sellable_stock
    from app.services.order_service import OrderService

    rows = (await db.execute(
        select(RMAItem, OrderItem).join(OrderItem, OrderItem.id == RMAItem.order_item_id).where(RMAItem.rma_id == rma.id)
    )).all()
    difference = Decimal("0")
    lines = []
    for ri, oi in rows:
        if ri.replacement_variant_id is None:
            continue
        variant = await db.get(ProductVariant, ri.replacement_variant_id)
        product = await db.get(Product, variant.product_id) if variant else None
        if variant is None or product is None or variant.status != "active":
            raise ReturnError(f"{oi.product_name}: the replacement is no longer sold.")
        stock = await sellable_stock(db, variant, tracked=product.track_inventory)
        if stock is not None and stock < int(ri.quantity):
            raise ReturnError(f"{oi.product_name}: only {stock} of the replacement left.")
        paid_each = (Decimal(str(oi.line_total or 0)) / Decimal(int(oi.quantity or 1))).quantize(CENTS)
        difference += (_price(variant) - paid_each) * int(ri.quantity)
        lines.append((ri, oi, variant, product))
    if not lines:
        raise ReturnError("Nothing on this exchange has a replacement.")
    owed = max(Decimal("0"), difference).quantize(CENTS)
    now = datetime.now(timezone.utc)
    new = Order(
        order_number=await OrderService(db)._generate_order_number(),
        company_id=order.company_id, placed_by_id=order.placed_by_id, guest_email=order.guest_email,
        guest_name=order.guest_name, guest_phone=order.guest_phone, is_guest_order=order.is_guest_order,
        status="confirmed", payment_status="unpaid" if owed > 0 else "paid",
        payment_method="card" if owed > 0 else "no_charge",
        notes=f"Exchange for order {order.order_number} (return {rma.rma_number}).",
        shipping_address_id=order.shipping_address_id, shipping_address_snapshot=order.shipping_address_snapshot,
        shipping_method=order.shipping_method, subtotal=owed, shipping_cost=0, tax_amount=0, total=owed,
        amount_paid=0, **({} if owed > 0 else {"marked_paid_at": now, "marked_paid_by": "No charge (exchange)"}),
    )
    db.add(new)
    await db.flush()
    for ri, oi, variant, product in lines:
        db.add(OrderItem(order_id=new.id, variant_id=variant.id, product_id=product.id, quantity=int(ri.quantity),
                         unit_price=0, line_total=0, product_name=product.name[:255], sku=variant.sku,
                         color=variant.color, size=variant.size))
        await _take_stock(db, variant.id, int(ri.quantity))
    await db.flush()
    await order_events.record_admin(
        db, request, new, "order_created",
        f"Exchange for order {order.order_number} (return {rma.rma_number})"
        + (f": ${owed:.2f} difference to pay" if owed > 0 else ", no charge"),
        meta={"channel": "exchange", "exchange_of": order.order_number, "exchange_of_id": str(order.id),
              "rma_id": str(rma.id), "difference": float(difference)},
    )
    return new, difference.quantize(CENTS)


async def act(db, request, rma_id, action: str, *, note: str | None = None, amount: Any = None,
              method: str | None = None, received: list[dict] | None = None) -> dict[str, Any]:
    """One decision on a return, recorded and emailed. Commits."""
    from app.services import order_events

    if action not in NEXT:
        raise ReturnError("Unknown action.")
    rma = (await db.execute(
        select(RMARequest).where(RMARequest.id == rma_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if rma is None:
        raise ReturnError("That return was not found.")
    allowed, to = NEXT[action]
    if rma.status not in allowed:
        raise ReturnError(f"Return {rma.rma_number} is {STATUS_WORDS.get(rma.status, rma.status).lower()}; "
                          f"it can't be {to.replace('rejected', 'declined')} now.")
    order = await db.get(Order, rma.order_id)
    if order is None:
        raise ReturnError("The return's order was not found.")
    actor_id, actor_name = await order_events.admin_actor(db, request)
    note = (note or "").strip()[:2000] or None
    extra: dict[str, Any] = {}

    if action == "receive":
        items = {str(i.id): i for i in (await db.execute(select(RMAItem).where(RMAItem.rma_id == rma.id))).scalars().all()}
        given = {str(r.get("rma_item_id")): r for r in (received or [])}
        for item_id, item in items.items():
            got = given.get(item_id, {})
            qty = got.get("quantity", item.quantity)
            if not isinstance(qty, int) or isinstance(qty, bool) or not (0 <= qty <= item.quantity):
                raise ReturnError(f"What came back must be 0 to {item.quantity}.")
            item.received_quantity = qty
            item.restock = bool(got.get("restock", False)) and qty > 0
            if item.restock:
                oi = await db.get(OrderItem, item.order_item_id)
                if oi is not None and oi.variant_id is not None:
                    await _restock(db, oi.variant_id, qty, user_id=actor_id,
                                   note=f"Return {rma.rma_number} of order {order.order_number}")
                else:
                    item.restock = False
        extra["restocked"] = sum((i.received_quantity or 0) for i in items.values() if i.restock)

    elif action == "refund":
        cap = await refund_cap(db, rma, order)
        already = Decimal(str(rma.refunded_amount or 0))
        left = max(Decimal("0"), cap - already)
        value = left if amount in (None, "") else Decimal(str(amount)).quantize(CENTS)
        if value <= 0:
            raise ReturnError("Nothing is left to refund on this return.")
        if value > left:
            raise ReturnError(f"A refund for these items can be up to ${left:.2f}: what was paid for them.")
        method = method or rma.refund_method or "original"
        if method == "store_credit":
            from app.services import gift_card_checkout as gcc
            from app.services import gift_cards as gc

            to_email = await buyer_email(db, rma, order)
            card, code = await gc.issue(
                db, tenant_id=order.tenant_id, amount=value, source="store_credit",
                key=f"store-credit:{rma.id}:{value}", recipient_email=to_email,
                recipient_name=order.guest_name, actor=(actor_id, actor_name),
                reason=f"Store credit for return {rma.rma_number}",
            )
            rma.store_credit_card_id = card.id
            if code:
                await gcc.send_one(db, card, code)
            extra["store_credit_last4"] = card.code_last4
        elif method == "original":
            from fastapi import HTTPException

            from app.api.v1.admin.orders import issue_refund

            try:
                result = await issue_refund(db, request, order, amount=float(value), reason="requested_by_customer",
                                            note=note or f"Return {rma.rma_number}",
                                            request_id=f"rma:{rma.id}:{value}:{already}")
            except HTTPException as exc:
                raise ReturnError(str(exc.detail))
            extra["refund"] = {k: result.get(k) for k in ("amount", "card_amount", "gift_card_amount")}
        else:
            raise ReturnError("Refund to the original payment or as store credit.")
        rma.refunded_amount = float(already + value)
        rma.refund_method = method
        extra["amount"] = float(value)

    owed_back = Decimal("0")
    if action == "exchange":
        new, difference = await _exchange_order(db, request, rma, order)
        rma.exchange_order_id = new.id
        extra.update(exchange_order_id=str(new.id), exchange_order_number=new.order_number,
                     difference=float(difference))
        # A cheaper replacement: the difference goes back after the exchange
        # itself is saved (the refund commits on its own).
        if difference < 0:
            owed_back = min(-difference, await refund_cap(db, rma, order))

    if note and action in ("approve", "decline", "close"):
        rma.admin_notes = note
    before = rma.status
    rma.status = to
    db.add(RMAEvent(rma_id=rma.id, status=to, actor_kind="staff", actor_user_id=actor_id,
                    actor_name=actor_name, note=note))
    await order_events.record_admin(
        db, request, order, "return_updated",
        f"{'Exchange' if rma.kind == 'exchange' else 'Return'} {rma.rma_number}: {STATUS_WORDS[to].lower()}"
        + (f", ${extra['amount']:.2f}" if "amount" in extra else "")
        + (f" — {note}" if note else ""),
        meta={"rma_id": str(rma.id), "rma_number": rma.rma_number, "from": before, "to": to, **{
            k: v for k, v in extra.items() if isinstance(v, (str, int, float, bool)) or v is None}},
    )
    await db.commit()
    if owed_back > 0:
        from fastapi import HTTPException

        from app.api.v1.admin.orders import issue_refund

        try:
            await issue_refund(db, request, order, amount=float(owed_back), reason="requested_by_customer",
                               note=f"Price difference, exchange {rma.rma_number}",
                               request_id=f"rma-exchange:{rma.id}")
            rma.refunded_amount = float(Decimal(str(rma.refunded_amount or 0)) + owed_back)
            await db.commit()
            extra["refunded_difference"] = float(owed_back)
        except HTTPException as exc:
            await db.rollback()
            extra["difference_refund_failed"] = str(exc.detail)
    try:
        await tell_buyer(db, rma, order, to, note=note, extra=extra)
        await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Return %s: email to the buyer failed", rma.rma_number)
    return {"id": str(rma.id), "status": to, "status_words": STATUS_WORDS[to], **extra}


# ── Telling the buyer ──────────────────────────────────────────────────────

async def tell_buyer(db, rma: RMARequest, order: Order, status: str, *, note: str | None = None,
                     extra: dict | None = None) -> bool:
    """The buyer hears every step, in the shop's name (the request's brand
    identity; the timed paths set it themselves)."""
    from app.services import brand_urls, mails, order_view
    from app.services.email_service import EmailService

    to = await buyer_email(db, rma, order)
    if not to:
        return False
    conf = await settings_for(db, order.tenant_id)
    extra = extra or {}
    pay_url = None
    if status == "exchanged" and extra.get("exchange_order_number") and extra.get("difference", 0) > 0:
        new = await db.get(Order, extra["exchange_order_id"])
        pay_url = (await brand_urls.for_tenant(db, order.tenant_id, f"/checkout/invoice/{new.order_number}")
                   + f"#k={order_view.view_key(new.id, new.tenant_id)}") if new else None
    subject, html = mails.return_update(
        rma_number=rma.rma_number, kind=rma.kind, status=status, status_words=STATUS_WORDS.get(status, status),
        order_number=order.order_number, note=note, instructions=conf.get("instructions") or None,
        shipping_payer=conf.get("shipping_payer"), amount=extra.get("amount"),
        store_credit_last4=extra.get("store_credit_last4"), exchange_order_number=extra.get("exchange_order_number"),
        difference=extra.get("difference"), pay_url=pay_url,
        returns_url=await brand_urls.for_tenant(db, order.tenant_id, "/returns"),
    )
    return bool(EmailService(db).send_raw(to_email=to, subject=subject, body_html=html))


def view(rma: RMARequest, items: list, events: list, order: Order | None) -> dict[str, Any]:
    return {
        "id": str(rma.id), "rma_number": rma.rma_number, "status": rma.status,
        "status_words": STATUS_WORDS.get(rma.status, rma.status), "kind": rma.kind,
        "refund_method": rma.refund_method, "channel": rma.channel, "reason": rma.reason, "notes": rma.notes,
        "admin_notes": rma.admin_notes, "refunded_amount": float(rma.refunded_amount or 0),
        "exchange_order_id": str(rma.exchange_order_id) if rma.exchange_order_id else None,
        "order_id": str(rma.order_id), "order_number": order.order_number if order else None,
        "created_at": rma.created_at.isoformat() if rma.created_at else None,
        "items": items, "events": events,
    }
