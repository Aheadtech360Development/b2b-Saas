"""Returns and reprints: an order that went wrong, put right.

A return (an RMA request) is either sent in by the customer from their account,
or made here by the shop. Either way it is put right one of two ways:

- reprint, the usual fix: a no-charge order linked to the faulty one, with the
  same lines at $0.00. A print job on the faulty order is copied onto it
  already approved, so it goes straight to the print queue, and stocked items
  come off stock as a checkout's would;
- refund, the exception: money back on the card it was paid with, through the
  order page's own refund (admin/orders.issue_refund), so it shows in the
  refunds ledger with the same checks.

What a return was put right with is kept on the order's history (a
"return_approved" event carrying the return's id and the outcome), not in a
column: the list reads it from there. Nothing here needs a migration.
"""
from __future__ import annotations

import random
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.inventory import InventoryRecord
from app.models.order import Order, OrderEvent, OrderItem
from app.models.rma import RMARequest
from app.services import order_events

REASONS: dict[str, str] = {
    "print_quality": "Print quality",
    "wrong_file": "Wrong file",
    "damaged": "Damaged",
    "other": "Other",
}
OUTCOMES = ("reprint", "refund")
STATUS_WORDS = {"pending": "Review", "approved": "Approved", "rejected": "Rejected", "completed": "Completed"}


def reason_text(key: str, note: str | None) -> str:
    """The reason as the return keeps it (one text field): its name, and the
    shop's words after it."""
    words = REASONS.get(key)
    if not words:
        raise HTTPException(status_code=400, detail="Choose a reason: print quality, wrong file, damaged or other.")
    note = (note or "").strip()
    return f"{words}: {note}"[:500] if note else words


async def _outcomes(db: AsyncSession, rma_ids: list[str]) -> dict[str, dict[str, Any]]:
    """What each return was put right with, from its order's history."""
    if not rma_ids:
        return {}
    rows = (await db.execute(
        select(OrderEvent.meta, OrderEvent.occurred_at)
        .where(OrderEvent.type == "return_approved",
               OrderEvent.meta["rma_id"].astext.in_(rma_ids))
        .order_by(OrderEvent.occurred_at)
    )).all()
    out: dict[str, dict[str, Any]] = {}
    for meta, _at in rows:
        if isinstance(meta, dict) and meta.get("rma_id"):
            out[str(meta["rma_id"])] = meta
    return out


async def list_returns(db: AsyncSession) -> list[dict[str, Any]]:
    rmas = (await db.execute(select(RMARequest).order_by(RMARequest.created_at.desc()).limit(500))).scalars().all()
    if not rmas:
        return []
    orders = {o.id: (o, name) for o, name in (await db.execute(
        select(Order, Company.name).outerjoin(Company, Order.company_id == Company.id)
        .where(Order.id.in_([r.order_id for r in rmas]))
    )).all()}
    outcomes = await _outcomes(db, [str(r.id) for r in rmas])
    rows = []
    for r in rmas:
        order, company = orders.get(r.order_id, (None, None))
        done = outcomes.get(str(r.id)) or {}
        rows.append({
            "id": str(r.id),
            "rma_number": r.rma_number,
            "order_id": str(r.order_id),
            "order_number": order.order_number if order else None,
            "customer": company or (order.guest_name or order.guest_email if order else None) or "Customer",
            "reason": r.reason,
            "notes": r.notes,
            "admin_notes": r.admin_notes,
            "status": r.status,
            "status_words": STATUS_WORDS.get(r.status, r.status.title()),
            "outcome": done.get("outcome"),
            "reprint": ({"id": done["reprint_order_id"], "number": done.get("reprint_number")}
                        if done.get("reprint_order_id") else None),
            "refund_amount": done.get("refund_amount"),
            "can_refund": bool(order and order.stripe_payment_intent_id and order.payment_status == "paid"),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return rows


async def _new_rma_number(db: AsyncSession) -> str:
    """RMA-<six digits>, as the customer's form numbers them, never one in use."""
    for _ in range(20):
        number = f"RMA-{random.randint(100000, 999999)}"
        if not (await db.execute(select(RMARequest.id).where(RMARequest.rma_number == number))).first():
            return number
    raise HTTPException(status_code=500, detail="Could not number the return. Try again.")


async def make_reprint(db: AsyncSession, request: Request, order: Order, *, rma: RMARequest,
                       note: str | None) -> Order:
    """The no-charge order that prints `order` again (see the module's note)."""
    from app.api.v1.gang_sheets import STATUS_APPROVED, GangSheetOrder, copy_job
    from app.services.order_service import OrderService

    now = datetime.now(timezone.utc)
    reprint = Order(
        order_number=await OrderService(db)._generate_order_number(),
        company_id=order.company_id,
        placed_by_id=order.placed_by_id,
        guest_email=order.guest_email,
        guest_name=order.guest_name,
        guest_phone=order.guest_phone,
        is_guest_order=order.is_guest_order,
        status="confirmed",
        payment_status="paid",
        payment_method="no_charge",
        po_number=order.po_number,
        notes=(f"Reprint of order {order.order_number} (return {rma.rma_number})."
               + (f" {note.strip()}" if note and note.strip() else "")),
        shipping_address_id=order.shipping_address_id,
        shipping_address_snapshot=order.shipping_address_snapshot,
        shipping_method=order.shipping_method,
        subtotal=0, shipping_cost=0, tax_amount=0, total=0, amount_paid=0,
        marked_paid_at=now, marked_paid_by="No charge (reprint)",
    )
    db.add(reprint)
    await db.flush()

    # The print jobs, copied approved onto the reprint; the lines that named
    # a job by its reference name the copy instead.
    renamed: dict[str, str] = {}
    jobs = (await db.execute(select(GangSheetOrder).where(GangSheetOrder.order_id == order.id))).scalars().all()
    for job in jobs:
        copy = await copy_job(db, job, status=STATUS_APPROVED, price=Decimal("0.00"), order_id=reprint.id,
                              paid_at=now, internal_notes=f"Reprint of {job.reference} for order {order.order_number} "
                                                         f"(return {rma.rma_number}).")
        renamed[job.reference] = copy.reference

    items = (await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
    for item in items:
        name = item.product_name
        for old, new in renamed.items():
            name = name.replace(old, new)
        db.add(OrderItem(
            order_id=reprint.id, variant_id=item.variant_id, product_id=item.product_id,
            quantity=item.quantity, unit_price=0, line_total=0, product_name=name[:255],
            sku=item.sku, color=item.color, size=item.size, configuration=item.configuration,
        ))
        # Stocked items come off stock as a checkout's do (order_service, 9.5).
        if item.variant_id is not None:
            left = int(item.quantity)
            records = (await db.execute(
                select(InventoryRecord).where(InventoryRecord.variant_id == item.variant_id)
                .order_by(InventoryRecord.quantity.desc())
            )).scalars().all()
            for rec in records:
                if left <= 0:
                    break
                take = min(int(rec.quantity), left)
                if take > 0:
                    await db.execute(update(InventoryRecord).where(InventoryRecord.id == rec.id)
                                     .values(quantity=int(rec.quantity) - take))
                    left -= take
    await db.flush()

    await order_events.record_admin(
        db, request, reprint, "order_created",
        f"Reprint of order {order.order_number} at no charge (return {rma.rma_number})",
        meta={"channel": "reprint", "reprint_of": order.order_number, "reprint_of_id": str(order.id),
              "rma_id": str(rma.id)},
    )
    await order_events.record_admin(
        db, request, order, "reprint_created",
        f"Reprinted at no charge as order {reprint.order_number} (return {rma.rma_number})",
        meta={"rma_id": str(rma.id), "reprint_order_id": str(reprint.id), "reprint_number": reprint.order_number},
    )
    return reprint


async def _put_right(db: AsyncSession, request: Request, order: Order, rma: RMARequest, *,
                     outcome: str, note: str | None, refund_amount: float | None) -> dict[str, Any]:
    """Carry out the outcome and keep it on the order's history. Commits."""
    meta: dict[str, Any] = {"rma_id": str(rma.id), "rma_number": rma.rma_number, "outcome": outcome}
    if outcome == "reprint":
        reprint = await make_reprint(db, request, order, rma=rma, note=note)
        meta.update(reprint_order_id=str(reprint.id), reprint_number=reprint.order_number)
        words = f"Return {rma.rma_number} approved: reprinted as order {reprint.order_number}"
    else:
        from app.api.v1.admin.orders import issue_refund

        # Commits the refund (and the return with it) once Stripe has said yes.
        result = await issue_refund(db, request, order, amount=refund_amount, reason="requested_by_customer",
                                    note=(note or f"Return {rma.rma_number}"),
                                    request_id=f"rma:{rma.id}:{refund_amount}")
        meta["refund_amount"] = result.get("amount")
        words = f"Return {rma.rma_number} approved: ${float(result.get('amount') or 0):.2f} refunded"
    rma.status = "approved"
    await order_events.record_admin(db, request, order, "return_approved", words, meta=meta)
    await db.commit()
    return meta


async def create(db: AsyncSession, request: Request, *, order_id: Any, reason: str, outcome: str,
                 note: str | None, refund_amount: float | None) -> dict[str, Any]:
    """A return the shop makes itself, put right at once."""
    if outcome not in OUTCOMES:
        raise HTTPException(status_code=400, detail="Choose Reprint or Refund.")
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="That order was not found.")
    if order.order_number.startswith("DRAFT-") and order.status == "pending":
        raise HTTPException(status_code=400, detail="That is a draft, not an order yet.")
    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="That order was cancelled.")
    actor = getattr(request.state, "user_id", None)
    rma = RMARequest(
        order_id=order.id,
        submitted_by_id=order.placed_by_id or actor,
        rma_number=await _new_rma_number(db),
        reason=reason_text(reason, None),
        notes=(note or "").strip() or None,
        admin_notes="Made by the shop.",
        status="pending",
    )
    db.add(rma)
    await db.flush()
    done = await _put_right(db, request, order, rma, outcome=outcome, note=note, refund_amount=refund_amount)
    return {"id": str(rma.id), "rma_number": rma.rma_number, **done}


async def resolve(db: AsyncSession, request: Request, rma_id: Any, *, outcome: str, note: str | None,
                  refund_amount: float | None) -> dict[str, Any]:
    """A customer's return in review: approved as a reprint or a refund, or
    rejected (outcome "reject"), with the shop's note."""
    rma = (await db.execute(select(RMARequest).where(RMARequest.id == rma_id))).scalar_one_or_none()
    if rma is None:
        raise HTTPException(status_code=404, detail="That return was not found.")
    if rma.status != "pending":
        raise HTTPException(status_code=409, detail=f"Return {rma.rma_number} was already {rma.status}.")
    order = (await db.execute(select(Order).where(Order.id == rma.order_id))).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="The return's order was not found.")
    if note and note.strip():
        rma.admin_notes = note.strip()
    if outcome == "reject":
        rma.status = "rejected"
        await order_events.record_admin(
            db, request, order, "return_rejected",
            f"Return {rma.rma_number} rejected" + (f" — {note.strip()}" if note and note.strip() else ""),
            meta={"rma_id": str(rma.id), "rma_number": rma.rma_number, "from": "pending", "to": "rejected"},
        )
        await db.commit()
        _tell_customer(rma.id)
        return {"id": str(rma.id), "status": "rejected"}
    if outcome not in OUTCOMES:
        raise HTTPException(status_code=400, detail="Choose Reprint, Refund or Reject.")
    done = await _put_right(db, request, order, rma, outcome=outcome, note=note, refund_amount=refund_amount)
    _tell_customer(rma.id)
    return {"id": str(rma.id), "status": "approved", **done}


def _tell_customer(rma_id: Any) -> None:
    """The customer who asked hears the answer, by the email the old review
    sent (admin/orders.update_rma). Never the reason a decision fails."""
    try:
        from app.tasks.email_tasks import send_rma_status_email

        send_rma_status_email.delay(str(rma_id))
    except Exception:  # noqa: BLE001
        pass


async def find_orders(db: AsyncSession, q: str | None) -> list[dict[str, Any]]:
    """Orders a return can be made for: real orders, not drafts or cancelled,
    newest first, by number or customer."""
    query = (select(Order, Company.name).outerjoin(Company, Order.company_id == Company.id)
             .where(Order.status != "cancelled", Order.order_number.notlike("DRAFT-%")))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(Order.order_number.ilike(like) | Company.name.ilike(like)
                            | Order.guest_name.ilike(like) | Order.guest_email.ilike(like))
    rows = (await db.execute(query.order_by(Order.created_at.desc()).limit(20))).all()
    return [{
        "id": str(o.id), "order_number": o.order_number,
        "customer": name or o.guest_name or o.guest_email or "Customer",
        "total": float(o.total or 0),
        "can_refund": bool(o.stripe_payment_intent_id and o.payment_status == "paid"),
    } for o, name in rows]

