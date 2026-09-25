"""Send store orders to S&S as purchase orders, and bring the tracking back.

Order Settings decide when an order goes (automatically once it is paid or
confirmed, once a day at a set hour, only by hand, or never), where it ships,
how it is paid for and when the store order is marked shipped.

Safety comes first, because a mistake here spends the brand's money:

* Only orders placed after sending was switched on are ever sent, never the
  store's history.
* A `supplier_orders` row is written as 'sending' BEFORE S&S is called, and a
  partial unique index allows one live row per order — a double click, two web
  workers or a retry racing the schedule cannot place the same order twice.
* A row stuck in 'sending' (the process died mid-call) is not retried
  automatically: nobody can know whether S&S placed it. It is marked failed with
  a note to check S&S first, and an admin decides.
* Test mode is on until the brand turns it off; S&S creates and cancels test
  orders.
"""
from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.suppliers import config as cfgmod
from app.services.suppliers import mapping

logger = logging.getLogger(__name__)

SUPPLIER = "ss_activewear"
LIVE = ("sending", "placed", "shipped")
STUCK_AFTER = timedelta(minutes=30)
TRACKING_EVERY = timedelta(minutes=30)
SKIP_STATUSES = ("cancelled", "refunded", "shipped", "delivered", "ready_for_pickup")


class OrderSendError(Exception):
    pass


# ── Which orders, which lines ────────────────────────────────────────────────

async def supplier_lines(db: AsyncSession, order_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[dict]]:
    """Per order, the lines that are S&S products."""
    from app.models.order import OrderItem
    from app.models.product import Product, ProductVariant

    if not order_ids:
        return {}
    rows = (await db.execute(
        select(OrderItem.order_id, OrderItem.quantity, OrderItem.product_name, OrderItem.color, OrderItem.size,
               ProductVariant.id, ProductVariant.sku, Product.supplier_ref)
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(OrderItem.order_id.in_(order_ids), Product.supplier == SUPPLIER)
    )).all()
    out: dict[uuid.UUID, list[dict]] = defaultdict(list)
    for oid, qty, name, color, size, vid, sku, ref in rows:
        out[oid].append({"variant_id": str(vid), "sku": sku, "style_id": ref, "qty": int(qty or 0),
                         "name": name, "color": color, "size": size})
    return out


def _eligible_filter(q, since: str | None):
    from sqlalchemy import or_

    from app.models.order import Order

    q = q.where(Order.status.notin_(SKIP_STATUSES),
                or_(Order.payment_status == "paid", Order.status.in_(("confirmed", "processing"))))
    if since:
        q = q.where(Order.created_at >= datetime.fromisoformat(since))
    return q


async def waiting(db: AsyncSession, cfg: dict, *, limit: int = 100) -> list[dict]:
    """Orders with S&S lines that have not been sent (or whose last try failed
    or was a test) — what "Send now" offers."""
    from app.models.order import Order
    from app.models.supplier import SupplierOrder

    o = cfg["orders"]
    q = _eligible_filter(select(Order), o.get("since") or None).order_by(Order.created_at.desc()).limit(400)
    orders = (await db.execute(q)).scalars().all()
    if not orders:
        return []
    lines = await supplier_lines(db, [x.id for x in orders])
    ids = [x.id for x in orders if lines.get(x.id)]
    sent = defaultdict(list)
    for so in (await db.execute(
        select(SupplierOrder).where(SupplierOrder.order_id.in_(ids or [uuid.uuid4()]), SupplierOrder.supplier == SUPPLIER)
        .order_by(SupplierOrder.created_at.desc())
    )).scalars().all():
        sent[so.order_id].append(so)
    out = []
    for x in orders:
        if not lines.get(x.id) or any(s.status in LIVE for s in sent[x.id]):
            continue
        last = sent[x.id][0] if sent[x.id] else None
        out.append({
            "order_id": str(x.id), "order_number": x.order_number, "created_at": x.created_at.isoformat(),
            "customer": _customer_name(x), "status": x.status, "payment_status": x.payment_status,
            "lines": lines[x.id], "pieces": sum(line["qty"] for line in lines[x.id]),
            "last_attempt": {"status": last.status, "error": last.error,
                             "at": last.created_at.isoformat()} if last else None,
        })
        if len(out) >= limit:
            break
    return out


def _customer_name(order) -> str:
    try:
        snap = json.loads(order.shipping_address_snapshot or "{}")
    except ValueError:
        snap = {}
    return (snap.get("full_name") or order.guest_name or "").strip()


# ── Building the S&S request ─────────────────────────────────────────────────

def _address(order, o: dict) -> dict:
    if o["ship_to"] == "store":
        a = o["store_address"]
        return {"customer": a.get("customer") or "", "attn": a.get("attn") or "", "address": a["address"],
                "city": a["city"], "state": a["state"], "zip": a["zip"], "residential": bool(a.get("residential"))}
    try:
        snap = json.loads(order.shipping_address_snapshot or "{}")
    except ValueError:
        snap = {}
    line = " ".join(p for p in (snap.get("line1"), snap.get("line2")) if p).strip()
    if not (line and snap.get("city") and snap.get("state") and snap.get("postal_code")):
        raise OrderSendError("The order has no complete shipping address.")
    zip_code = str(snap["postal_code"]).strip()
    if (snap.get("country") or "US").upper() in ("US", "USA"):
        zip_code = zip_code[:5]
    name = (snap.get("full_name") or order.guest_name or "").strip()
    return {"customer": name, "attn": name, "address": line, "city": snap["city"], "state": snap["state"],
            "zip": zip_code, "residential": True}


def po_number(template: str, orders: list) -> str:
    first = orders[0]
    ctx = {"order": {"order_number": first.order_number, "po_number": first.po_number or "",
                     "count": len(orders)}, "value": first.order_number}
    try:
        po = mapping._fmt(mapping.render(template or "{{ order.order_number }}", ctx)).strip()
    except mapping.MappingError:
        po = first.order_number
    if len(orders) > 1:
        po = f"{po}+{len(orders) - 1}"
    return (po or first.order_number)[:50]


async def _identifiers(svc, cfg: dict, lines: list[dict]) -> dict[str, str]:
    """Store SKU → S&S SKU. The same unless Match Fields reshape SKUs; then the
    style's S&S rows are fetched and matched back."""
    sku_map = next((f for f in cfgmod_fields(cfg) if f["target"] == "sku"), None)
    if not sku_map or (sku_map["source"] == "sku" and not sku_map.get("modify")):
        return {line["sku"]: line["sku"] for line in lines}
    from app.services.suppliers import ss_products

    out: dict[str, str] = {}
    for style_id in {line["style_id"] for line in lines}:
        rows = await svc.fetch_products_by_style(style_id)
        for r in rows:
            out[ss_products.mapped_sku(cfg, {"styleID": style_id}, r)] = str(r.get("sku") or "")
    missing = [line["sku"] for line in lines if not out.get(line["sku"])]
    if missing:
        raise OrderSendError(f"S&S no longer sells {', '.join(missing[:3])}.")
    return out


def cfgmod_fields(cfg: dict) -> list[dict]:
    return (cfg.get("product") or {}).get("fields") or mapping.DEFAULT_FIELDS


def build_request(orders: list, lines: list[dict], cfg: dict, identifiers: dict[str, str]) -> dict:
    o = cfg["orders"]
    qty: dict[str, int] = defaultdict(int)
    for line in lines:
        qty[identifiers[line["sku"]]] += line["qty"]
    body = {
        "shippingAddress": _address(orders[0], o),
        "shippingMethod": o["shipping_method"],
        "shipBlind": bool(o.get("ship_blind")),
        "poNumber": po_number(o["po_template"], orders),
        "emailConfirmation": o.get("email_confirmation") or "",
        "testOrder": bool(o.get("test_mode", True)),
        "autoselectWarehouse": True,
        "AutoSelectWarehouse_Preference": o.get("warehouse_preference") or "fewest",
        "rejectLineErrors": True,
        "lines": [{"identifier": ident, "qty": q} for ident, q in qty.items() if q > 0],
    }
    if o.get("warehouses") == "list" and o.get("warehouse_list"):
        body["autoselectWarehouse_Warehouses"] = ",".join(o["warehouse_list"])
    if o.get("payment") == "card":
        body["paymentProfile"] = {"email": o["payment_email"], "profileID": o["payment_profile_id"]}
    if not body["lines"]:
        raise OrderSendError("The order has no S&S items to send.")
    return body


# ── Sending ──────────────────────────────────────────────────────────────────

async def _timeline(db: AsyncSession, order, message: str, status: str | None = None,
                    *, event: str = "note", meta: dict | None = None,
                    occurred_at: datetime | None = None) -> None:
    """Put one supplier step on the order's history.

    Goes through the shared recorder so a supplier job and an admin acting on
    the same order at the same time can no longer overwrite each other — see
    services/order_events.py.
    """
    from app.services import order_events

    await order_events.record(
        db, order, event, message,
        actor_type="supplier", actor_name="S&S Activewear",
        meta=meta, occurred_at=occurred_at,
    )


async def send(db: AsyncSession, svc, cfg: dict, order_ids: list[uuid.UUID], *, trigger: str) -> list[dict]:
    """Send these orders (combined into one PO when the settings say so).
    Returns one result per order: {order_number, status, message}."""
    from app.models.order import Order
    from app.models.supplier import SupplierOrder
    from app.services.ss_activewear_service import SSOrderError

    o = cfg["orders"]
    orders = (await db.execute(select(Order).where(Order.id.in_(order_ids)))).scalars().all()
    lines = await supplier_lines(db, [x.id for x in orders])
    orders = [x for x in orders if lines.get(x.id)]
    groups = [orders] if (o.get("combine") and o["ship_to"] == "store" and len(orders) > 1) else [[x] for x in orders]
    results: list[dict] = []

    from app.core.database import AsyncSessionLocal

    for group in groups:
        batch = uuid.uuid4()
        # Claim first, each in its own short session: the unique index turns a
        # second, racing send into an IntegrityError here, and rolling that back
        # must not touch the objects this session is working with.
        claimed = []
        for x in group:
            async with AsyncSessionLocal() as claim_db:
                row = SupplierOrder(order_id=x.id, supplier=SUPPLIER, batch_id=batch, status="sending",
                                    test=bool(o.get("test_mode", True)), trigger=trigger, lines=lines[x.id])
                claim_db.add(row)
                try:
                    await claim_db.commit()
                    row_id = row.id
                except IntegrityError:
                    await claim_db.rollback()
                    row_id = None
            if row_id is None:
                results.append({"order_number": x.order_number, "status": "skipped",
                                "message": "Already sent (or being sent) to S&S."})
            else:
                claimed.append((x, await db.get(SupplierOrder, row_id)))
        if not claimed:
            continue
        group = [x for x, _ in claimed]
        group_lines = [line for x in group for line in lines[x.id]]
        status, message, response, numbers, body = "failed", "", None, "", None
        try:
            body = build_request(group, group_lines, cfg, await _identifiers(svc, cfg, group_lines))
            placed = await svc.place_order(body)
            numbers = ", ".join(str(p.get("orderNumber")) for p in placed if p.get("orderNumber"))
            response = placed
            status = "test" if body["testOrder"] else "placed"
            message = (f"Test order accepted by S&S{f' ({numbers})' if numbers else ''} — created and cancelled, nothing ships."
                       if status == "test" else f"Placed with S&S as {numbers or 'an order'} (PO {body['poNumber']}).")
        except OrderSendError as exc:
            message = str(exc)
        except SSOrderError as exc:
            message = f"S&S refused the order: {exc.message}"
        except Exception as exc:
            logger.exception("S&S order send failed")
            message = f"Couldn't reach S&S ({type(exc).__name__}). Check S&S before retrying — it may or may not have been placed."

        for x, row in claimed:
            row.status = status
            row.error = None if status in ("placed", "test") else message
            row.request = body
            row.response = response if isinstance(response, (list, dict)) else None
            row.po_number = body["poNumber"] if body else None
            row.supplier_order_numbers = numbers[:500] or None
            db.add(row)
            if status == "placed":
                await _timeline(db, x, message, event="supplier_po_sent",
                                meta={"po_number": body["poNumber"] if body else None,
                                      "supplier_order_numbers": numbers[:500] or None,
                                      # Whether this went to S&S as a test order.
                                      # `test` was never defined here, so every
                                      # successful send raised a NameError after
                                      # the order had already been placed with
                                      # the supplier — the worst possible moment.
                                      "test": bool(body["testOrder"]) if body else False})
                if o["fulfillment"] == "on_po":
                    await _mark_shipped(db, x, None, None, email=True)
                elif o["fulfillment"] == "on_ship" and x.status in ("pending", "confirmed"):
                    x.status = "processing"
            elif status == "failed":
                await _timeline(db, x, f"Not sent to S&S: {message}", event="supplier_po_failed",
                                meta={"error": message})
            results.append({"order_number": x.order_number, "status": status, "message": message})
        await db.commit()
    return results


async def _mark_shipped(db: AsyncSession, order, tracking: str | None, carrier: str | None, *, email: bool) -> None:
    if tracking:
        order.tracking_number = tracking[:255]
    if carrier:
        order.carrier = carrier[:100]
        order.courier = carrier[:100]
    if order.status not in ("shipped", "delivered"):
        order.status = "shipped"
        if not order.shipped_at:
            order.shipped_at = datetime.now(UTC)
        await _timeline(db, order, "Marked shipped — fulfilled by S&S"
                        + (f", tracking {tracking}" if tracking else ""), "shipped",
                        event="shipped", meta={"tracking_number": tracking, "carrier": carrier,
                                               "fulfilled_by": "S&S Activewear"})
        if email:
            await db.flush()
            try:
                from app.api.v1.admin.orders import _send_order_status_email
                await _send_order_status_email(order, "shipped", db)
            except Exception:
                logger.exception("shipped email failed for order %s", order.id)


# ── Tracking ─────────────────────────────────────────────────────────────────

async def refresh_tracking(db: AsyncSession, svc, cfg: dict) -> int:
    """Pick up shipments for placed POs. Returns how many orders shipped."""
    from app.models.order import Order
    from app.models.supplier import SupplierOrder

    rows = (await db.execute(
        select(SupplierOrder).where(SupplierOrder.supplier == SUPPLIER, SupplierOrder.status == "placed")
    )).scalars().all()
    if not rows:
        return 0
    recent = {str(r.get("orderNumber")): r for r in await svc.recent_orders()}
    fulfil = cfg["orders"]["fulfillment"]
    shipped = 0
    for row in rows:
        numbers = [n.strip() for n in (row.supplier_order_numbers or "").split(",") if n.strip()]
        found = [recent[n] for n in numbers if n in recent]
        if not numbers or len(found) < len(numbers):
            continue
        if any("cancel" in str(f.get("orderStatus") or "").lower() for f in found):
            row.status, row.error = "failed", "S&S cancelled this order."
            continue
        tracking = [t for f in found for t in _tracking_numbers(f)]
        if not all(_tracking_numbers(f) or "ship" in str(f.get("orderStatus") or "").lower() for f in found):
            continue
        row.status = "shipped"
        row.tracking_number = ", ".join(dict.fromkeys(tracking))[:255] or None
        row.carrier = str(found[0].get("shippingCarrier") or "")[:100] or None
        row.shipped_at = datetime.now(UTC)
        order = await db.get(Order, row.order_id)
        if order is None:
            continue
        if fulfil == "on_ship":
            await _mark_shipped(db, order, row.tracking_number, row.carrier, email=True)
        elif fulfil == "on_po":
            if row.tracking_number and not order.tracking_number:
                order.tracking_number = row.tracking_number
                order.carrier = order.carrier or row.carrier
            await _timeline(db, order, f"S&S shipped it{f' — tracking {row.tracking_number}' if row.tracking_number else ''}",
                            event="supplier_shipped",
                            meta={"tracking_number": row.tracking_number, "carrier": row.carrier},
                            occurred_at=row.shipped_at)
        else:
            await _timeline(db, order, f"S&S shipped it{f' — tracking {row.tracking_number}' if row.tracking_number else ''}",
                            event="supplier_shipped",
                            meta={"tracking_number": row.tracking_number, "carrier": row.carrier},
                            occurred_at=row.shipped_at)
        shipped += 1
    await db.commit()
    return shipped


def _tracking_numbers(o: dict) -> list[str]:
    out = []
    if o.get("trackingNumber"):
        out.append(str(o["trackingNumber"]))
    for b in o.get("boxes") or o.get("Boxes") or []:
        if isinstance(b, dict) and b.get("trackingNumber"):
            out.append(str(b["trackingNumber"]))
    return out


async def release_stuck(db: AsyncSession) -> None:
    from app.models.supplier import SupplierOrder

    cutoff = datetime.now(UTC) - STUCK_AFTER
    for row in (await db.execute(
        select(SupplierOrder).where(SupplierOrder.status == "sending", SupplierOrder.updated_at < cutoff)
    )).scalars().all():
        row.status = "failed"
        row.error = "The send was interrupted. Check your S&S account before retrying — it may have been placed."
    await db.commit()


# ── Scheduler hook ───────────────────────────────────────────────────────────

async def tick(tenant_id: str, cfg: dict) -> None:
    """Called every few minutes per brand with order sending on."""
    from app.core.database import AsyncSessionLocal
    from app.core.redis import get_redis_pool
    from app.services.integrations_service import get_connection
    from app.services.ss_activewear_service import from_connection

    from app.core.tenant_context import set_bypass_scoping, set_current_tenant

    o = cfg.get("orders") or {}
    if o.get("sync", "disabled") == "disabled":
        return
    # Everything below reads and writes one brand's orders; with no tenant set
    # the ORM would not filter at all.
    set_bypass_scoping(False)
    set_current_tenant(uuid.UUID(tenant_id))
    r = get_redis_pool()
    lock = f"supplier:orders:{tenant_id}"
    if not await r.set(lock, "1", nx=True, ex=600):
        return
    try:
        now = datetime.now(UTC)
        async with AsyncSessionLocal() as db:
            conn = await get_connection(db, SUPPLIER, tenant_id=tenant_id)
            if not conn:
                return
            svc = from_connection(conn)
            try:
                await release_stuck(db)
                due = False
                if o["sync"] == "automatic":
                    due = True
                elif o["sync"] == "scheduled" and now.hour == int(o.get("schedule_hour", 17)):
                    day_key = f"supplier:orders:day:{tenant_id}:{now.date().isoformat()}"
                    due = bool(await r.set(day_key, "1", nx=True, ex=26 * 3600))
                if due:
                    full = await cfgmod.load(db, SUPPLIER)
                    pending = [w for w in await waiting(db, full) if w["last_attempt"] is None]
                    if pending:
                        res = await send(db, svc, full, [uuid.UUID(w["order_id"]) for w in pending],
                                         trigger="automatic" if o["sync"] == "automatic" else "schedule")
                        logger.info("supplier orders for %s: %s", tenant_id, [x["status"] for x in res])
                if await r.set(f"supplier:orders:tracking:{tenant_id}", "1", nx=True,
                               ex=int(TRACKING_EVERY.total_seconds())):
                    await refresh_tracking(db, svc, await cfgmod.load(db, SUPPLIER))
            finally:
                await svc.close()
    except Exception:
        logger.exception("supplier order tick failed for %s", tenant_id)
    finally:
        try:
            await r.delete(lock)
        except Exception:
            pass


async def order_supplier_summary(db: AsyncSession, order_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """For each store order that contains S&S items: where its purchase order to
    S&S stands. Orders with no S&S items are left out.

    A store order and the PO sent to S&S for it are two records — the sale to
    the customer, and the purchase from the supplier. This is what lets the
    Orders screens show the one alongside the other."""
    from app.models.supplier import SupplierOrder

    if not order_ids:
        return {}
    lines = await supplier_lines(db, order_ids)
    ids = [oid for oid in order_ids if lines.get(oid)]
    if not ids:
        return {}
    rows = (await db.execute(
        select(SupplierOrder).where(SupplierOrder.order_id.in_(ids), SupplierOrder.supplier == SUPPLIER)
        .order_by(SupplierOrder.created_at.desc())
    )).scalars().all()
    latest: dict[uuid.UUID, object] = {}
    live: dict[uuid.UUID, object] = {}
    for r in rows:
        latest.setdefault(r.order_id, r)
        if r.status in LIVE:
            live.setdefault(r.order_id, r)
    out = {}
    for oid in ids:
        r = live.get(oid) or latest.get(oid)
        out[oid] = {
            "supplier": "S&S Activewear",
            "items": sum(line["qty"] for line in lines[oid]),
            "lines": len(lines[oid]),
            "status": r.status if r else "not_sent",
            "test": bool(r.test) if r else False,
            "po_number": r.po_number if r else None,
            "supplier_order_numbers": r.supplier_order_numbers if r else None,
            "tracking_number": r.tracking_number if r else None,
            "carrier": r.carrier if r else None,
            "error": r.error if r else None,
            "sent_at": r.created_at.isoformat() if r and r.created_at else None,
        }
    return out

