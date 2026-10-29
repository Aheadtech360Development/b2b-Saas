"""The returns and exchanges portal (Retail launch, package 4).

Guest (`/storefront/returns`, gated by `returns_portal`):
- POST "/lookup" {order_number, email}: rate limited per visitor and per
  order; a wrong email and a made-up number get the same 404. Answers what can
  be returned and a 30 minute key for this one order.
- POST "" with that key in X-Return-Token: start the return or exchange.

Signed-in buyer (`/account/returns`): the same for their own orders.

Shop (`/admin/returns/...`, next to the reprint and refund actions of
admin/returns.py): settings, one return in full, and the decisions: approve,
decline, receive (restock or not), refund (to the payment or as store
credit; Billing needed), exchange (Billing needed: a difference may be
refunded), close.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.models.order import Order, OrderItem
from app.models.rma import RMAEvent, RMAItem, RMARequest
from app.services import returns_portal as rp

public_router = APIRouter(prefix="/storefront/returns", tags=["storefront", "returns"])
account_router = APIRouter(prefix="/account/returns", tags=["account", "returns"])
admin_router = APIRouter(prefix="/admin/returns", tags=["admin", "orders"], dependencies=[Depends(require_admin)])

NOT_FOUND = "We could not find that order. Check the order number and the email it was placed with."


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


class ItemIn(BaseModel):
    order_item_id: uuid.UUID
    quantity: int
    reason: str = Field(..., max_length=80)
    replacement_variant_id: uuid.UUID | None = None


class StartIn(BaseModel):
    kind: str = Field(..., pattern="^(return|exchange)$")
    items: list[ItemIn] = Field(..., min_length=1, max_length=50)
    refund_method: str | None = Field(None, pattern="^(original|store_credit)$")
    note: str | None = Field(None, max_length=2000)


def _items(payload: StartIn) -> list[dict]:
    return [{"order_item_id": str(i.order_item_id), "quantity": i.quantity, "reason": i.reason,
             "replacement_variant_id": str(i.replacement_variant_id) if i.replacement_variant_id else None}
            for i in payload.items]


async def _their_returns(db: AsyncSession, order_id) -> list[dict]:
    rows = (await db.execute(
        select(RMARequest).where(RMARequest.order_id == order_id).order_by(RMARequest.created_at.desc())
    )).scalars().all()
    return [{"rma_number": r.rma_number, "kind": r.kind, "status": r.status,
             "status_words": rp.STATUS_WORDS.get(r.status, r.status),
             "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


# ── Guests ──────────────────────────────────────────────────────────────────

class Lookup(BaseModel):
    order_number: str = Field(..., min_length=1, max_length=50)
    email: str = Field(..., min_length=3, max_length=255)


@public_router.post("/lookup")
async def guest_lookup(payload: Lookup, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    from app.core.rate_limit import enforce_rate_limit
    from app.services import tracking_page

    tenant_id = get_current_tenant_id()
    number = payload.order_number.strip().lstrip("#").upper()
    await enforce_rate_limit(request, "return_lookup", limit=10, window=900)
    await enforce_rate_limit(request, "return_lookup_order", limit=5, window=3600, extra=f"{tenant_id}:{number}")
    conf = await rp.settings_for(db, tenant_id)
    if not conf["enabled"]:
        raise HTTPException(status_code=404, detail="This shop does not take returns online. Contact the shop.")
    order = await tracking_page.find_order(db, tenant_id, number)
    if order is None or not await tracking_page.email_matches(db, order, payload.email):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {**await rp.eligibility(db, order, conf), "token": rp.guest_token(order.id),
            "returns": await _their_returns(db, order.id)}


@public_router.post("", status_code=201)
async def guest_start(payload: StartIn, request: Request, db: AsyncSession = Depends(get_db),
                      x_return_token: str | None = Header(default=None)) -> dict:
    order_id = rp.token_order(x_return_token)
    if not order_id:
        raise HTTPException(status_code=403, detail="Look your order up again: this page was open too long.")
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None or str(order.tenant_id) != str(get_current_tenant_id()):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    conf = await rp.settings_for(db, order.tenant_id)
    email = order.guest_email
    if not email and order.placed_by_id:
        from app.models.user import User

        email = (await db.execute(select(User.email).where(User.id == order.placed_by_id))).scalar_one_or_none()
    try:
        rma = await rp.start(db, order, conf, channel="guest", kind=payload.kind, items=_items(payload),
                             refund_method=payload.refund_method, note=payload.note, guest_email=email,
                             actor_name=order.guest_name or email)
    except rp.ReturnError as exc:
        raise _bad(exc)
    await db.commit()
    await rp.tell_buyer(db, rma, order, "pending")
    return {"rma_number": rma.rma_number, "status": rma.status, "status_words": rp.STATUS_WORDS["pending"]}


# ── Signed-in buyers ────────────────────────────────────────────────────────

async def _own_order(db: AsyncSession, request: Request, order_id) -> Order:
    from app.services import order_view

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None or not order_view.owned_by(
            order, user_id=getattr(request.state, "user_id", None),
            company_id=getattr(request.state, "company_id", None),
            account_type=getattr(request.state, "account_type", None)):
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@account_router.get("/settings")
async def account_settings(db: AsyncSession = Depends(get_db)) -> dict:
    conf = await rp.settings_for(db, get_current_tenant_id())
    return {"enabled": conf["enabled"], "window_days": conf["window_days"], "methods": conf["methods"]}


@account_router.get("/eligible/{order_id}")
async def account_eligible(order_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    order = await _own_order(db, request, order_id)
    conf = await rp.settings_for(db, order.tenant_id)
    return {**await rp.eligibility(db, order, conf), "returns": await _their_returns(db, order.id)}


class AccountStartIn(StartIn):
    order_id: uuid.UUID


@account_router.post("", status_code=201)
async def account_start(payload: AccountStartIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    order = await _own_order(db, request, payload.order_id)
    conf = await rp.settings_for(db, order.tenant_id)
    user_id = getattr(request.state, "user_id", None)
    try:
        rma = await rp.start(db, order, conf, channel="account", kind=payload.kind, items=_items(payload),
                             refund_method=payload.refund_method, note=payload.note, user_id=user_id)
    except rp.ReturnError as exc:
        raise _bad(exc)
    await db.commit()
    await rp.tell_buyer(db, rma, order, "pending")
    return {"id": str(rma.id), "rma_number": rma.rma_number, "status": rma.status,
            "status_words": rp.STATUS_WORDS["pending"]}


# ── The shop ────────────────────────────────────────────────────────────────

@admin_router.get("/settings")
async def get_return_settings(db: AsyncSession = Depends(get_db)) -> dict:
    return await rp.settings_for(db, get_current_tenant_id())


class SettingsIn(BaseModel):
    enabled: bool | None = None
    window_days: int | None = None
    reasons: list[str] | None = None
    made_to_order_final_sale: bool | None = None
    final_sale_product_ids: list[str] | None = None
    shipping_payer: str | None = Field(None, pattern="^(buyer|shop)$")
    instructions: str | None = Field(None, max_length=1500)
    methods: list[str] | None = None


@admin_router.put("/settings")
async def put_return_settings(payload: SettingsIn, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        saved = await rp.save_settings(db, get_current_tenant_id(), payload.model_dump(exclude_none=True))
    except rp.ReturnError as exc:
        raise _bad(exc)
    await db.commit()
    return saved


@admin_router.get("/{rma_id}/detail")
async def return_detail(rma_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    from app.models.product import ProductVariant

    rma = await db.get(RMARequest, rma_id)
    if rma is None or str(rma.tenant_id) != str(get_current_tenant_id()):
        raise HTTPException(status_code=404, detail="That return was not found.")
    order = await db.get(Order, rma.order_id)
    rows = (await db.execute(
        select(RMAItem, OrderItem).join(OrderItem, OrderItem.id == RMAItem.order_item_id).where(RMAItem.rma_id == rma.id)
    )).all()
    items = []
    for ri, oi in rows:
        repl = await db.get(ProductVariant, ri.replacement_variant_id) if ri.replacement_variant_id else None
        items.append({
            "id": str(ri.id), "order_item_id": str(oi.id), "product_name": oi.product_name, "sku": oi.sku,
            "color": oi.color, "size": oi.size, "quantity": ri.quantity, "reason": ri.reason,
            "unit_price": float(oi.unit_price or 0), "can_restock": oi.variant_id is not None,
            "received_quantity": ri.received_quantity, "restock": ri.restock,
            "replacement": ({"variant_id": str(repl.id), "label": " / ".join(x for x in (repl.color, repl.size) if x)
                             or repl.sku, "sku": repl.sku} if repl else None),
        })
    events = [{"status": e.status, "status_words": rp.STATUS_WORDS.get(e.status, e.status), "actor_kind": e.actor_kind,
               "actor_name": e.actor_name, "note": e.note, "at": e.created_at.isoformat() if e.created_at else None}
              for e in (await db.execute(select(RMAEvent).where(RMAEvent.rma_id == rma.id)
                                         .order_by(RMAEvent.created_at))).scalars().all()]
    cap = await rp.refund_cap(db, rma, order) if order else 0
    return {**rp.view(rma, items, events, order), "refund_cap": float(cap),
            "refund_left": float(max(0, float(cap) - float(rma.refunded_amount or 0))),
            "buyer_email": await rp.buyer_email(db, rma, order) if order else None}


class DecisionIn(BaseModel):
    note: str | None = Field(None, max_length=2000)


class ReceiveIn(DecisionIn):
    items: list[dict[str, Any]] = []


class RefundIn(DecisionIn):
    amount: float | None = Field(None, gt=0)
    method: str | None = Field(None, pattern="^(original|store_credit)$")


async def _act(db, request, rma_id, action, **kw) -> dict:
    rma = await db.get(RMARequest, rma_id)
    if rma is None or str(rma.tenant_id) != str(get_current_tenant_id()):
        raise HTTPException(status_code=404, detail="That return was not found.")
    try:
        return await rp.act(db, request, rma_id, action, **kw)
    except rp.ReturnError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))


@admin_router.post("/{rma_id}/approve")
async def approve_return(rma_id: uuid.UUID, payload: DecisionIn, request: Request, db: AsyncSession = Depends(get_db)):
    return await _act(db, request, rma_id, "approve", note=payload.note)


@admin_router.post("/{rma_id}/decline")
async def decline_return(rma_id: uuid.UUID, payload: DecisionIn, request: Request, db: AsyncSession = Depends(get_db)):
    return await _act(db, request, rma_id, "decline", note=payload.note)


@admin_router.post("/{rma_id}/receive")
async def receive_return(rma_id: uuid.UUID, payload: ReceiveIn, request: Request, db: AsyncSession = Depends(get_db)):
    return await _act(db, request, rma_id, "receive", note=payload.note, received=payload.items)


@admin_router.post("/{rma_id}/refund-items")
async def refund_return(rma_id: uuid.UUID, payload: RefundIn, request: Request, db: AsyncSession = Depends(get_db)):
    return await _act(db, request, rma_id, "refund", note=payload.note, amount=payload.amount, method=payload.method)


@admin_router.post("/{rma_id}/exchange")
async def exchange_return(rma_id: uuid.UUID, payload: DecisionIn, request: Request, db: AsyncSession = Depends(get_db)):
    return await _act(db, request, rma_id, "exchange", note=payload.note)


@admin_router.post("/{rma_id}/close")
async def close_return(rma_id: uuid.UUID, payload: DecisionIn, request: Request, db: AsyncSession = Depends(get_db)):
    return await _act(db, request, rma_id, "close", note=payload.note)
