"""Admin API — Invoices and payments (services/invoices).

The list with its three figures, payment reminders, and the invoice PDF. An
invoice is marked paid with the order's own route (POST
/admin/orders/{id}/mark-paid), so the order's history says the same thing
whichever screen it was done from.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.order import Order
from app.models.user import User
from app.services import invoices as inv
from app.services import order_events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/invoices", tags=["admin", "orders"])


@router.get("")
async def list_invoices(
    tab: str = "all",
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    utc_offset: int = Query(0, ge=-14 * 60, le=14 * 60),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if tab not in inv.TABS:
        raise HTTPException(status_code=400, detail=f"There is no invoices tab called '{tab}'.")
    rows = await inv.load(db, utc_offset_minutes=utc_offset)
    figures = inv.summary(rows, utc_offset_minutes=utc_offset)
    shown = [r for r in rows if inv.in_tab(r, tab)]
    if q and q.strip():
        needle = q.strip().lower()
        shown = [r for r in shown if needle in f"{r['invoice_number']} {r['order_number']} {r['customer']}".lower()]
    total = len(shown)
    start = (page - 1) * page_size
    return {
        "items": shown[start:start + page_size],
        "total": total,
        "page": page,
        "pages": max(1, (total + page_size - 1) // page_size),
        **figures,
    }


class RemindIn(BaseModel):
    order_ids: list[UUID] = Field(default_factory=list, max_length=200)
    utc_offset: int = Field(0, ge=-14 * 60, le=14 * 60)


async def _customer_of(db: AsyncSession, order: Order) -> tuple[str | None, str | None]:
    """Who the invoice goes to: the guest, or the person who placed the order."""
    if order.is_guest_order and order.guest_email:
        return order.guest_email, order.guest_name
    if order.placed_by_id:
        user = (await db.execute(select(User).where(User.id == order.placed_by_id))).scalar_one_or_none()
        if user:
            return user.email, f"{user.first_name} {user.last_name}".strip() or None
    return None, None


@router.post("/remind")
async def send_reminders(payload: RemindIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Email the invoice again, as a reminder with its own due date, to each
    order given that still owes something. Each reminder goes on the order's
    history."""
    from app.services.email_service import EmailService

    if not payload.order_ids:
        raise HTTPException(status_code=400, detail="Choose at least one invoice.")
    offset = timedelta(minutes=payload.utc_offset)
    sent: list[str] = []
    skipped: list[dict[str, str]] = []
    orders = (await db.execute(
        select(Order).options(selectinload(Order.items))
        .where(Order.id.in_(payload.order_ids), inv.is_invoice())
    )).scalars().all()
    found = {o.id for o in orders}
    for oid in payload.order_ids:
        if oid not in found:
            skipped.append({"order_id": str(oid), "why": "Not an invoice of this shop."})
    for order in orders:
        balance = inv.balance_of(total=order.total, amount_paid=order.amount_paid, payment_status=order.payment_status)
        if balance <= 0:
            skipped.append({"order_id": str(order.id), "why": f"{order.order_number} is paid."})
            continue
        to_email, name = await _customer_of(db, order)
        if not to_email:
            skipped.append({"order_id": str(order.id), "why": f"{order.order_number} has no customer email."})
            continue
        due = inv.due_on(terms=order.payment_terms, invoiced_at=order.invoice_sent_at,
                         placed_at=order.created_at, offset=offset)
        # "Invoice due" is one of the shop's Notifications (Settings): off,
        # no reminder goes; its own wording, in place of the email's own.
        from app.services import notifications as _notes

        w = await _notes.wording(db, "invoice_due", {
            "order": order.order_number, "customer": ((name or "").split() or ["there"])[0],
            "total": f"${float(balance):.2f}",
        })
        if not w.send:
            skipped.append({"order_id": str(order.id),
                            "why": "Payment reminders are switched off in Settings, Notifications."})
            continue
        ok = EmailService(db).send_invoice(order, to_email, payment_terms=order.payment_terms,
                                           customer_name=name, due_on=due, reminder=True,
                                           subject=w.subject, intro_html=w.intro_html)
        if not ok:
            skipped.append({"order_id": str(order.id), "why": f"The reminder for {order.order_number} could not be sent."})
            continue
        await order_events.record_admin(
            db, request, order, "invoice_reminder",
            f"Payment reminder sent to {to_email} (${float(balance):.2f} due {due:%b %d})",
            meta={"to": to_email, "balance": float(balance), "due_on": due.isoformat()},
        )
        sent.append(order.order_number)
    await db.commit()
    return {"sent": sent, "skipped": skipped}


@router.get("/{order_id}/pdf")
async def invoice_pdf(order_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    """The invoice PDF the customer gets, for the shop's own copy."""
    from app.services.pdf_service import PDFService

    order = (await db.execute(
        select(Order).options(selectinload(Order.items), selectinload(Order.placed_by), selectinload(Order.company))
        .where(Order.id == order_id)
    )).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    try:
        pdf = PDFService().generate_invoice(order)
    except Exception:
        logger.exception("Invoice PDF failed for order %s", order_id)
        raise HTTPException(status_code=500, detail="The invoice PDF could not be made.")
    number = inv.invoice_number(order.order_number, order.created_at)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{number}.pdf"'})

