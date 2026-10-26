"""The customer's side of a quote: its page, and accepting it.

Public as an address, not by number alone: a quote opens to the order's view
key (services/order_view), which the quote email's link carries in its
#fragment and the page sends in X-Order-Key, or to the signed-in buyer it
belongs to. Anyone else gets the answer a wrong number gets. A draft never
sent is not a quote yet, so it does not open either.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.order import Order, OrderEvent, OrderItem
from app.services import order_events, order_view
from app.services import quotes as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quotes", tags=["quotes"])


async def _quote_for(db: AsyncSession, request: Request, number: str) -> Order:
    from app.core.tenant_context import get_current_tenant_id

    order = await svc.find_by_number(db, get_current_tenant_id(), number)
    allowed = order is not None and (
        order_view.key_opens(order, (request.headers.get("x-order-key") or "")[:80])
        or order_view.owned_by(order, user_id=getattr(request.state, "user_id", None),
                               company_id=getattr(request.state, "company_id", None),
                               account_type=getattr(request.state, "account_type", None))
    )
    if not allowed:
        raise HTTPException(status_code=404, detail=f"Quote {number} not found")
    return order


async def _state(db: AsyncSession, order: Order, offset: int) -> dict[str, Any]:
    today = (datetime.now(timezone.utc) + timedelta(minutes=offset)).date()
    rows = (await db.execute(
        select(OrderEvent.type, OrderEvent.meta, OrderEvent.occurred_at)
        .where(OrderEvent.order_id == order.id, OrderEvent.type.in_(("quote_sent", "quote_accepted", "order_confirmed")))
        .order_by(OrderEvent.occurred_at)
    )).all()
    last = {kind: {**(meta or {}), "at": at.isoformat() if at else None} for kind, meta, at in rows}
    sent = last.get("quote_sent")
    if not sent:
        raise HTTPException(status_code=404, detail="Quote not found")
    status = svc.status_of(order_status=order.status, sent=sent, accepted="quote_accepted" in last, today=today)
    return {"status": status, "sent": sent, "accepted_at": (last.get("quote_accepted") or {}).get("at"),
            "number": (last.get("order_confirmed") or {}).get("from_draft") or order.order_number}


@router.get("")
async def my_quotes(request: Request, utc_offset: int = Query(0, ge=-14 * 60, le=14 * 60),
                    db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """The signed-in buyer's quotes and price requests, for their account."""
    import uuid as _uuid

    from app.core.tenant_context import get_current_tenant_id
    from app.models.user import User

    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to see your quotes")
    # The same rule as a quote's own page (order_view.owned_by): a retail buyer's
    # own orders, or their company's.
    if getattr(request.state, "account_type", None) == "retail":
        owner = Order.placed_by_id == _uuid.UUID(str(user_id))
    elif company_id:
        owner = Order.company_id == _uuid.UUID(str(company_id))
    else:
        return {"items": []}
    email = (await db.execute(select(User.email).where(User.id == _uuid.UUID(str(user_id))))).scalar()
    return {"items": await svc.for_buyer(db, get_current_tenant_id(), owner=owner, email=email,
                                         utc_offset_minutes=utc_offset)}


@router.get("/{number}")
async def view_quote(number: str, request: Request, utc_offset: int = Query(0, ge=-14 * 60, le=14 * 60),
                     db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    order = await _quote_for(db, request, number)
    st = await _state(db, order, utc_offset)
    items = (await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
    return {
        "number": st["number"],
        "status": st["status"], "status_words": svc.STATUS_WORDS[st["status"]],
        "order_number": order.order_number if st["status"] == "ordered" else None,
        "valid_until": st["sent"].get("valid_until"),
        "accepted_at": st["accepted_at"],
        "items": [{"name": i.product_name, "color": i.color, "size": i.size, "quantity": i.quantity,
                   "unit_price": float(i.unit_price or 0), "line_total": float(i.line_total or 0)} for i in items],
        "subtotal": float(order.subtotal or 0), "shipping": float(order.shipping_cost or 0),
        "tax": float(order.tax_amount or 0), "total": float(order.total or 0),
    }


@router.post("/{number}/accept")
async def accept_quote(number: str, request: Request, utc_offset: int = Query(0, ge=-14 * 60, le=14 * 60),
                       db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """The customer says yes. The shop is told, and converts it to an order."""
    order = await _quote_for(db, request, number)
    st = await _state(db, order, utc_offset)
    if st["status"] in ("accepted", "ordered"):
        return {"status": st["status"]}
    if st["status"] == "expired":
        raise HTTPException(status_code=409, detail="This quote has expired. Ask the shop for a new one.")
    who = order.guest_name or order.guest_email or "The customer"
    if order.company_id:
        from app.models.company import Company

        who = (await db.execute(select(Company.name).where(Company.id == order.company_id))).scalar() or who
    await order_events.record(
        db, order, "quote_accepted", f"Quote {st['number']} accepted by {who}",
        actor_type="customer", actor_id=getattr(request.state, "user_id", None), actor_name=who,
        meta={"by": "signed_in" if getattr(request.state, "user_id", None) else "quote_link"},
    )
    await db.commit()
    try:
        from app.services.email_service import EmailService

        EmailService(db).send_quote_accepted_alert(order, who)
    except Exception:  # noqa: BLE001 — accepting never fails over the shop's alert
        logger.warning("quote %s: the accepted alert could not be sent", st["number"], exc_info=True)
    return {"status": "accepted"}
