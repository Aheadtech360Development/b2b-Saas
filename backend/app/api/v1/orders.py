# backend/app/api/v1/orders.py
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.order import Order, OrderComment
from app.models.user import User
from app.schemas.order import OrderListItem, OrderOut
from app.services.order_service import OrderService
from app.types.api import PaginatedResponse

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=PaginatedResponse[OrderListItem])
async def list_orders(
    request: Request,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")

    svc = OrderService(db)

    if account_type == "retail" and user_id:
        orders, total = await svc.list_orders_for_retail_user(user_id, page, page_size, q=q, status=status)
    elif company_id:
        orders, total = await svc.list_orders_for_company(company_id, page, page_size, q=q, status=status)
    else:
        raise ForbiddenError("Company account required")

    return PaginatedResponse(
        items=orders,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    from sqlalchemy.orm import selectinload as _sil

    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")

    svc = OrderService(db)

    # Support order_number (AF-XXXXXX / DRAFT-XXXXXX / numeric 1001+) or UUID in URL
    if order_id.upper().startswith(("AF-", "DRAFT-")) or order_id.isdigit():
        order_num = order_id.upper() if order_id.upper().startswith(("AF-", "DRAFT-")) else order_id
        # Resolve order_number → UUID, then delegate to service methods so all
        # required relationships are eagerly loaded (prevents MissingGreenlet 500s).
        row = await db.execute(select(Order.id).where(Order.order_number == order_num))
        found_id = row.scalar_one_or_none()
        if not found_id:
            raise NotFoundError(f"Order {order_id} not found")
        if account_type == "retail" and user_id:
            return await svc.get_order_for_retail_user(found_id, user_id)
        elif company_id:
            return await svc.get_order(found_id, company_id)
        else:
            raise ForbiddenError("Company account required")

    oid = _uuid.UUID(order_id)
    if account_type == "retail" and user_id:
        return await svc.get_order_for_retail_user(oid, user_id)
    elif company_id:
        return await svc.get_order(oid, company_id)
    else:
        raise ForbiddenError("Company account required")


@router.post("/{order_id}/reorder")
async def reorder(
    order_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")

    if account_type != "retail" and not company_id:
        raise ForbiddenError("Company account required")

    from decimal import Decimal
    discount_percent = getattr(request.state, "tier_discount_percent", Decimal("0"))

    svc = OrderService(db)
    result = await svc.reorder(order_id, company_id, discount_percent)
    await db.commit()
    return result


# ── PDF endpoints ──────────────────────────────────────────────────────────────

def _pdf_response(pdf_bytes: bytes, filename: str) -> StreamingResponse:
    import io
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _load_order_for_company(order_id: UUID, company_id, db: AsyncSession) -> Order:
    import uuid as _uuid
    from sqlalchemy.orm import selectinload
    company_uuid = _uuid.UUID(str(company_id)) if not isinstance(company_id, _uuid.UUID) else company_id
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.placed_by),
            selectinload(Order.company),
        )
        .where(Order.id == order_id, Order.company_id == company_uuid)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    return order


async def _load_order_for_auth(order_id_str: str, request: Request, db: AsyncSession) -> Order:
    """Load an order by UUID or order_number for the authenticated user (retail or wholesale)."""
    import uuid as _uuid
    from sqlalchemy.orm import selectinload

    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")

    def _q(where_clauses):
        return (
            select(Order)
            .options(
                selectinload(Order.items),
                selectinload(Order.placed_by),
                selectinload(Order.company),
            )
            .where(*where_clauses)
        )

    if order_id_str.upper().startswith(("AF-", "DRAFT-")) or order_id_str.isdigit():
        order_num = order_id_str.upper() if order_id_str.upper().startswith(("AF-", "DRAFT-")) else order_id_str
        if account_type == "retail" and user_id:
            stmt = _q([Order.order_number == order_num, Order.placed_by_id == _uuid.UUID(user_id)])
        elif company_id:
            stmt = _q([Order.order_number == order_num, Order.company_id == _uuid.UUID(str(company_id))])
        else:
            raise ForbiddenError("Company account required")
    else:
        try:
            oid = _uuid.UUID(order_id_str)
        except ValueError:
            raise NotFoundError(f"Order {order_id_str} not found")
        if account_type == "retail" and user_id:
            stmt = _q([Order.id == oid, Order.placed_by_id == _uuid.UUID(user_id)])
        elif company_id:
            stmt = _q([Order.id == oid, Order.company_id == _uuid.UUID(str(company_id))])
        else:
            raise ForbiddenError("Company account required")

    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id_str} not found")
    return order


@router.get("/{order_id}/pdf/confirmation")
async def download_order_confirmation_pdf(
    order_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    company_id = getattr(request.state, "company_id", None)
    if not company_id:
        raise ForbiddenError("Company account required")

    order = await _load_order_for_company(order_id, company_id, db)
    from app.services.pdf_service import PDFService
    pdf = PDFService().generate_order_confirmation(order)
    return _pdf_response(pdf, f"order-confirmation-{order.order_number}.pdf")


@router.get("/{order_id}/pdf/invoice")
async def download_invoice_pdf(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    order = await _load_order_for_auth(order_id, request, db)

    # Invoice PDF is generated here from the order itself.
    from app.services.pdf_service import PDFService
    try:
        pdf = PDFService().generate_invoice(order)
        if not pdf:
            raise ValueError("PDF generation returned empty bytes")
        return _pdf_response(pdf, f"invoice-{order.order_number}.pdf")
    except Exception as e:
        logger.error(f"Invoice PDF generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.get("/{order_id}/pdf/ship-confirmation")
async def download_ship_confirmation_pdf(
    order_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    company_id = getattr(request.state, "company_id", None)
    if not company_id:
        raise ForbiddenError("Company account required")

    order = await _load_order_for_company(order_id, company_id, db)
    from app.services.pdf_service import PDFService
    pdf = PDFService().generate_ship_confirmation(order)
    return _pdf_response(pdf, f"ship-confirmation-{order.order_number}.pdf")


@router.get("/{order_id}/pdf/pack-slip")
async def download_pack_slip_pdf(
    order_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    company_id = getattr(request.state, "company_id", None)
    if not company_id:
        raise ForbiddenError("Company account required")

    order = await _load_order_for_company(order_id, company_id, db)
    from app.services.pdf_service import PDFService
    pdf = PDFService().generate_pack_slip(order)
    return _pdf_response(pdf, f"pack-slip-{order.order_number}.pdf")


# ── Order comments ─────────────────────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel, Field as _Field
from datetime import datetime as _datetime


class CommentIn(_BaseModel):
    body: str = _Field(..., min_length=1, max_length=2000)


class CommentOut(_BaseModel):
    id: UUID
    body: str
    is_admin: bool
    author_name: str | None
    created_at: _datetime

    model_config = {"from_attributes": True}


class _PayInvoiceRequest(_BaseModel):
    """A Stripe PaymentIntent the buyer has already confirmed on this invoice."""
    payment_intent_id: str


@router.get("/{order_id}/comments", response_model=list[CommentOut])
async def list_order_comments(
    order_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")

    # Verify order ownership: retail via placed_by_id, wholesale via company_id
    if account_type == "retail" and user_id:
        order = (await db.execute(
            select(Order).where(Order.id == order_id, Order.placed_by_id == _uuid.UUID(user_id))
        )).scalar_one_or_none()
    elif company_id:
        order = (await db.execute(
            select(Order).where(Order.id == order_id, Order.company_id == _uuid.UUID(str(company_id)))
        )).scalar_one_or_none()
    else:
        raise ForbiddenError("Company account required")
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(OrderComment)
        .options(selectinload(OrderComment.author))
        .where(OrderComment.order_id == order_id)
        .order_by(OrderComment.created_at)
    )
    comments = result.scalars().all()

    return [
        CommentOut(
            id=c.id,
            body=c.body,
            is_admin=c.is_admin,
            author_name=c.author.full_name if c.author else None,
            created_at=c.created_at,
        )
        for c in comments
    ]


@router.post("/{order_id}/comments", response_model=CommentOut, status_code=201)
async def add_order_comment(
    order_id: UUID,
    payload: CommentIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")

    # Verify order ownership: retail via placed_by_id, wholesale via company_id
    if account_type == "retail" and user_id:
        order = (await db.execute(
            select(Order).where(Order.id == order_id, Order.placed_by_id == _uuid.UUID(user_id))
        )).scalar_one_or_none()
    elif company_id:
        order = (await db.execute(
            select(Order).where(Order.id == order_id, Order.company_id == _uuid.UUID(str(company_id)))
        )).scalar_one_or_none()
    else:
        raise ForbiddenError("Company account required")
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    comment = OrderComment(
        order_id=order_id,
        author_id=user_id,
        body=payload.body,
        is_admin=False,
    )
    db.add(comment)
    await db.flush()

    author = None
    if user_id:
        author = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()

    await db.commit()
    await db.refresh(comment)

    return CommentOut(
        id=comment.id,
        body=comment.body,
        is_admin=comment.is_admin,
        author_name=author.full_name if author else None,
        created_at=comment.created_at,
    )


@router.get("/{order_id}/invoice-summary")
async def get_order_invoice_summary(order_id: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint — returns limited order data for invoice payment links."""
    from sqlalchemy.orm import selectinload as _sil
    result = await db.execute(
        select(Order).options(_sil(Order.items))
        .where(Order.order_number == order_id.upper())
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    _total = float(order.total)
    _paid = float(order.amount_paid or 0)
    return {
        "id": str(order.id),
        "order_number": order.order_number,
        "status": order.status,
        "payment_status": order.payment_status,
        "subtotal": float(order.subtotal or 0),
        "shipping_cost": float(order.shipping_cost or 0),
        "tax_amount": float(order.tax_amount or 0),
        "total": _total,
        "amount_paid": _paid,
        "balance_due": max(0.0, _total - _paid),
        "items": [
            {
                "product_name": item.product_name,
                "color": item.color,
                "size": item.size,
                "quantity": item.quantity,
                "unit_price": float(item.unit_price),
                "line_total": float(item.line_total or 0),
                "sku": item.sku,
                # Configured lines list the options that were chosen, so the
                # invoice says what was actually ordered.
                "configuration": getattr(item, "configuration", None),
            }
            for item in (order.items or [])
        ],
    }


@router.post("/{order_id}/invoice-intent")
async def create_invoice_payment_intent(
    order_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Start a Stripe payment for what is still owed on this invoice.

    The amount is the balance the server works out, never a figure the page
    sends — an invoice link is easy to reach, so the price of paying it can't be
    something the browser decides.
    """
    from decimal import Decimal as _Dec

    from app.core.config import settings as _settings
    from app.core.tenant_context import get_current_tenant_id
    from app.services.connect_service import ConnectService
    from app.services.payment_service import PaymentService

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    balance = max(_Dec("0.00"), _Dec(str(order.total or 0)) - _Dec(str(order.amount_paid or 0)))
    if balance <= _Dec("0.00"):
        raise HTTPException(status_code=400, detail="This invoice is already paid in full")

    tenant_id = get_current_tenant_id()
    connect = await ConnectService(db).get_status(str(tenant_id)) if tenant_id else {}
    if not connect.get("charges_enabled"):
        raise HTTPException(status_code=409, detail={
            "code": "STORE_PAYMENTS_NOT_READY",
            "message": "This store hasn't finished payment setup yet.",
        })

    intent = await PaymentService(db).create_direct_payment_intent(
        amount_decimal=balance,
        connected_account_id=connect["account_id"],
        metadata={"order_id": str(order.id), "order_number": order.order_number, "kind": "invoice"},
    )
    return {
        "client_secret": intent.client_secret,
        "connected_account_id": connect["account_id"],
        "publishable_key": _settings.STRIPE_PUBLISHABLE_KEY,
        "amount": float(balance),
    }


@router.post("/{order_id}/pay-invoice")
async def pay_invoice(
    order_id: UUID,
    payload: _PayInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    import json as _json
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    from sqlalchemy import text as _text
    from sqlalchemy.orm import selectinload as _sil

    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")

    result = await db.execute(
        select(Order).options(_sil(Order.items)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    if account_type == "retail" and user_id:
        if order.placed_by_id != _uuid.UUID(user_id):
            raise ForbiddenError("Access denied")
    elif company_id:
        if order.company_id != _uuid.UUID(str(company_id)):
            raise ForbiddenError("Access denied")
    else:
        raise ForbiddenError("Authentication required")

    from decimal import Decimal as _Dec
    _order_total = _Dec(str(order.total or 0))
    _already_paid = _Dec(str(order.amount_paid or 0))
    _balance_due = max(_Dec('0.00'), _order_total - _already_paid)

    if _balance_due <= _Dec('0.00'):
        raise HTTPException(status_code=400, detail="Order is already paid in full")

    # The buyer paid through Stripe before calling this; confirming the intent
    # here is what stops an invoice being marked paid on the client's say-so.
    from app.core.config import settings
    from app.core.tenant_context import get_current_tenant_id
    from app.services.connect_service import ConnectService
    import stripe as _stripe_lib

    _tid = get_current_tenant_id()
    _connect = await ConnectService(db).get_status(str(_tid)) if _tid else {}
    _acct = _connect.get("account_id")
    if not _acct:
        raise HTTPException(status_code=400, detail="This store is not set up for card payments.")

    _stripe_lib.api_key = settings.STRIPE_SECRET_KEY
    try:
        _pi = _stripe_lib.PaymentIntent.retrieve(payload.payment_intent_id, stripe_account=_acct)
    except Exception as exc:
        logger.warning("Invoice PI verify failed for %s: %s", payload.payment_intent_id, exc)
        raise HTTPException(status_code=400, detail="Could not verify your payment. Please contact the store.")
    if getattr(_pi, "status", None) != "succeeded":
        raise HTTPException(status_code=400, detail="Payment was not completed. Please try again.")

    now = _dt.now(_tz.utc)
    timeline = list(order.timeline or [])
    timeline.append({
        "message": f"Payment received via invoice link — ${float(_balance_due):.2f}",
        "status": "paid",
        "created_by": "Customer",
        "created_at": now.isoformat(),
    })
    await db.execute(
        _text(
            "UPDATE orders SET payment_status='paid', marked_paid_at=:ts, "
            "amount_paid=:ap, "
            "timeline=CAST(:tl AS jsonb) WHERE id=:id"
        ),
        {"ts": now, "ap": float(_order_total), "tl": _json.dumps(timeline), "id": str(order_id)},
    )
    await db.commit()
    return {
        "message": "Payment successful",
        "order_number": order.order_number,
        "charge_id": payload.payment_intent_id,
    }
