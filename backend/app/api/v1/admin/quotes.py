"""Admin API — Quotes (services/quotes).

A quote is a draft order, priced and edited with the draft routes
(POST /admin/orders/draft with the quote request it prices, and
/admin/orders/{id}/items). Here: the list, one quote, sending it to the
customer with a valid-until date, and converting it into an order, which is
the order's own confirm (PATCH /admin/orders/{id}), so the invoice email and
the history are exactly what confirming a draft gives.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.order import Order, OrderItem
from app.models.user import User
from app.services import order_events
from app.services import quotes as svc

router = APIRouter(prefix="/admin/quotes", tags=["admin", "orders"])

_OFFSET = Query(0, ge=-14 * 60, le=14 * 60)


def _tenant(request: Request) -> Any:
    tid = getattr(request.state, "tenant_id", None)
    if not tid:
        raise HTTPException(status_code=400, detail="Open a shop's admin to see its quotes.")
    return tid


@router.get("")
async def list_quotes(request: Request, utc_offset: int = _OFFSET, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    rows = await svc.board(db, _tenant(request), utc_offset_minutes=utc_offset)
    return {"items": rows, "counts": {s: sum(1 for r in rows if r["status"] == s) for s in svc.STATUS_WORDS}}


@router.get("/{order_id}")
async def one_quote(order_id: UUID, request: Request, utc_offset: int = _OFFSET,
                    db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    found = await svc.detail(db, _tenant(request), order_id, utc_offset_minutes=utc_offset)
    if found is None:
        raise HTTPException(status_code=404, detail="That quote was not found.")
    return found


async def _open_quote(db: AsyncSession, order_id: UUID) -> Order:
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="That quote was not found.")
    if order.status != "pending":
        # Converted already: it carries its order number now.
        raise HTTPException(status_code=409, detail=f"This quote is already order {order.order_number}.")
    if not (order.order_number or "").startswith("DRAFT-"):
        raise HTTPException(status_code=404, detail="That quote was not found.")
    return order


class SendIn(BaseModel):
    valid_until: date
    message: str | None = Field(None, max_length=2000)
    utc_offset: int = Field(0, ge=-14 * 60, le=14 * 60)


@router.post("/{order_id}/send")
async def send_quote(order_id: UUID, payload: SendIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Email the quote to the customer, valid until the date given."""
    from app.services.email_service import EmailService

    order = await _open_quote(db, order_id)
    today = (datetime.now(timezone.utc) + timedelta(minutes=payload.utc_offset)).date()
    if payload.valid_until < today:
        raise HTTPException(status_code=400, detail="Valid until has to be today or later.")
    items = (await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
    if not items or float(order.total or 0) <= 0:
        raise HTTPException(status_code=400, detail="Price the quote first: it has no priced lines.")
    to_email, name = order.guest_email, order.guest_name
    if not to_email and order.placed_by_id:
        user = (await db.execute(select(User).where(User.id == order.placed_by_id))).scalar_one_or_none()
        if user:
            to_email, name = user.email, (f"{user.first_name} {user.last_name}".strip() or None)
    if not to_email:
        raise HTTPException(status_code=422, detail="This customer has no email to send the quote to.")
    # "Quote ready" is one of the shop's Notifications (Settings): off, no
    # quote email goes; its own wording, in place of the email's own.
    from app.services import notifications as _notes

    w = await _notes.wording(db, "quote_ready", {
        "order": order.order_number, "customer": ((name or "").split() or ["there"])[0],
        "total": f"${float(order.total or 0):.2f}",
    })
    if not w.send:
        raise HTTPException(status_code=409, detail="Quote emails are switched off in Settings, Notifications.")
    if not EmailService(db).send_quote(order, items, to_email, payload.valid_until, name, payload.message,
                                       subject=w.subject, intro_html=w.intro_html):
        raise HTTPException(status_code=502, detail="The quote email could not be sent. Try again shortly.")
    await order_events.record_admin(
        db, request, order, "quote_sent",
        f"Quote sent to {to_email}, valid until {payload.valid_until:%b %d, %Y} (${float(order.total):.2f})",
        meta={"to": to_email, "valid_until": payload.valid_until.isoformat(), "total": float(order.total or 0)},
    )
    await db.commit()
    return {"sent_to": to_email, "valid_until": payload.valid_until.isoformat()}


@router.post("/{order_id}/convert")
async def convert_quote(order_id: UUID, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """The quote becomes an order: the order's own confirm, which gives it
    the shop's next order number and emails its invoice."""
    from app.api.v1.admin.orders import update_admin_order
    from app.schemas.order import OrderUpdateRequest

    order = await _open_quote(db, order_id)
    if float(order.total or 0) <= 0:
        raise HTTPException(status_code=400, detail="Price the quote first: it has no priced lines.")
    await update_admin_order(order.id, OrderUpdateRequest(status="confirmed"), request, db)
    fresh = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
    return {"order_id": str(fresh.id), "order_number": fresh.order_number}
