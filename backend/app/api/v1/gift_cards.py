"""Gift cards (Retail launch, package 3): the shop's page and the admin's.

Buyer side (`/storefront/gift-cards`, gated by the `gift_cards` feature):
- GET  ""          what the shop sells (amounts, custom range, expiry) and
                   whether checkout takes gift cards;
- POST "/balance"  {code}: a card's balance. Rate limited on wrong codes per
                   visitor (services/gift_cards.lookup); an unknown code and a
                   disabled one get the same answer.

Admin side (`/admin/gift-cards`; Marketing for reading, issuing and adjusting
also need Billing, as a refund does):
- list (masked codes), one card with its ledger, issue (the code is shown once),
  adjust, disable / turn on / void (each with a reason), send a new code,
  the report, and the shop's settings.

Buying one is a cart line (`POST /cart/gift-card`, the guest cart's
`gift_card` line); paying with one is part of checkout
(services/gift_card_checkout).
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.models.gift_card import GiftCard, GiftCardHold, GiftCardLedger
from app.services import gift_card_checkout as gcc
from app.services import gift_cards as gc

public_router = APIRouter(prefix="/storefront/gift-cards", tags=["storefront", "gift-cards"])
admin_router = APIRouter(prefix="/admin/gift-cards", tags=["admin", "gift-cards"],
                         dependencies=[Depends(require_admin)])


def _bad(exc: Exception) -> HTTPException:
    if isinstance(exc, gc.TooManyTries):
        return HTTPException(status_code=429, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


# ── The shop's side ─────────────────────────────────────────────────────────

@public_router.get("")
async def storefront_settings(db: AsyncSession = Depends(get_db)) -> dict:
    tenant_id = get_current_tenant_id()
    conf = await gc.settings_for(db, tenant_id)
    return {
        "on_sale": bool(conf["enabled"]),
        "accepted": await gc.accepted(db, tenant_id),
        "amounts": conf["amounts"],
        "custom": conf["custom"],
        "custom_min": conf["custom_min"],
        "custom_max": conf["custom_max"],
        "expiry_months": conf["expiry_months"],
        "message": conf["message"],
        "message_max": gc.MESSAGE_MAX,
    }


class BalanceAsk(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)


@public_router.post("/balance")
async def balance(payload: BalanceAsk, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    from app.core.rate_limit import client_ip

    tenant_id = get_current_tenant_id()
    try:
        card = await gc.lookup(db, tenant_id, payload.code, client_ip(request))
    except gc.GiftCardError as exc:
        if str(exc) == gc.NO_BALANCE:
            # A real card with nothing left: say so, it is the holder asking.
            card = await gc.find(db, tenant_id, payload.code)
            if card is not None:
                return {**gc.view(card), "usable": False, "problem": gc.NO_BALANCE}
        raise _bad(exc)
    return {**gc.view(card), "usable": True, "problem": None}


# ── The admin's side ────────────────────────────────────────────────────────

def _row(card: GiftCard) -> dict:
    return {
        "id": str(card.id),
        "last4": card.code_last4,
        "masked": gc.masked(card.code_last4),
        "initial_amount": float(card.initial_amount),
        "balance": float(card.balance),
        "currency": card.currency,
        "status": card.status,
        "status_reason": card.status_reason,
        "source": card.source,
        "expires_at": card.expires_at.isoformat() if card.expires_at else None,
        "purchase_order_id": str(card.purchase_order_id) if card.purchase_order_id else None,
        "buyer_email": card.buyer_email,
        "recipient_name": card.recipient_name,
        "recipient_email": card.recipient_email,
        "sender_name": card.sender_name,
        "message": card.message,
        "note": card.note,
        "delivered_at": card.delivered_at.isoformat() if card.delivered_at else None,
        "created_at": card.created_at.isoformat() if card.created_at else None,
    }


async def _actor(db: AsyncSession, request: Request) -> tuple:
    from app.services import order_events

    return await order_events.admin_actor(db, request)


@admin_router.get("")
async def list_cards(
    q: str | None = Query(None, max_length=100),
    status: str | None = Query(None),
    source: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = get_current_tenant_id()
    where = [GiftCard.tenant_id == tenant_id]
    if status in ("active", "disabled", "voided", "expired"):
        where.append(GiftCard.status == status)
    if source in ("purchase", "manual", "store_credit"):
        where.append(GiftCard.source == source)
    if q and q.strip():
        term = q.strip()
        # A full code finds its card by hash; otherwise the last 4 or an email.
        full = gc.normalize(term)
        if full:
            where.append(GiftCard.code_hash == gc.code_hash(tenant_id, full))
        else:
            like = f"%{term.lower()}%"
            where.append(or_(GiftCard.code_last4 == term.upper()[-4:],
                             func.lower(GiftCard.recipient_email).like(like),
                             func.lower(GiftCard.buyer_email).like(like),
                             func.lower(GiftCard.recipient_name).like(like)))
    total = (await db.execute(select(func.count()).select_from(GiftCard).where(*where))).scalar_one()
    cards = (await db.execute(
        select(GiftCard).where(*where).order_by(GiftCard.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return {"items": [_row(c) for c in cards], "total": int(total), "page": page, "page_size": page_size}


@admin_router.get("/report")
async def card_report(db: AsyncSession = Depends(get_db)) -> dict:
    return await gc.report(db, get_current_tenant_id())


@admin_router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict:
    return {**(await gc.settings_for(db, get_current_tenant_id())),
            "expiry_choices": [0, 60, 84, 120], "max_amount": float(gc.MAX_AMOUNT)}


class SettingsChange(BaseModel):
    enabled: bool | None = None
    amounts: list[Decimal] | None = None
    custom: bool | None = None
    custom_min: Decimal | None = None
    custom_max: Decimal | None = None
    expiry_months: int | None = None
    message: str | None = Field(None, max_length=300)


@admin_router.put("/settings")
async def put_settings(payload: SettingsChange, db: AsyncSession = Depends(get_db)) -> dict:
    changes = payload.model_dump(exclude_none=True)
    if "amounts" in changes:
        changes["amounts"] = [float(a) for a in changes["amounts"]]
    for k in ("custom_min", "custom_max"):
        if k in changes:
            changes[k] = float(changes[k])
    if ("custom_min" in changes) != ("custom_max" in changes):
        current = await gc.settings_for(db, get_current_tenant_id())
        changes.setdefault("custom_min", current["custom_min"])
        changes.setdefault("custom_max", current["custom_max"])
    try:
        saved = await gc.save_settings(db, get_current_tenant_id(), changes)
    except gc.GiftCardError as exc:
        raise _bad(exc)
    await db.commit()
    return saved


class IssueRequest(BaseModel):
    amount: Decimal
    recipient_name: str | None = Field(None, max_length=120)
    recipient_email: str | None = Field(None, max_length=254)
    message: str | None = Field(None, max_length=500)
    note: str | None = Field(None, max_length=500)
    send_email: bool = False
    # Store credit (a return put right as a gift card) or a card given away.
    source: str = "manual"
    # One per press of the button: a double click issues one card.
    request_id: str = Field(..., min_length=8, max_length=100)


@admin_router.post("")
async def issue_card(payload: IssueRequest, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    tenant_id = get_current_tenant_id()
    if payload.source not in ("manual", "store_credit"):
        raise HTTPException(status_code=400, detail="A card the shop issues is a gift or store credit.")
    if payload.send_email and not payload.recipient_email:
        raise HTTPException(status_code=400, detail="Enter the email address to send it to.")
    if payload.recipient_email:
        try:
            gcc.line_details(amount=Decimal("1"), recipient_email=payload.recipient_email)
        except gc.GiftCardError as exc:
            raise _bad(exc)
    conf = await gc.settings_for(db, tenant_id)
    actor = await _actor(db, request)
    try:
        card, code = await gc.issue(
            db, tenant_id=tenant_id, amount=payload.amount, source=payload.source,
            key=f"manual:{payload.request_id}", expires_at=gc.expiry_from(conf),
            recipient_name=payload.recipient_name, recipient_email=payload.recipient_email,
            message=payload.message, sender_name=None, actor=actor, note=payload.note,
        )
    except gc.GiftCardError as exc:
        raise _bad(exc)
    if code is None:
        raise HTTPException(status_code=409, detail="This card was already issued. Its code was shown then; "
                                                    "use Send a new code if it was lost.")
    sent = False
    if payload.send_email:
        sent = await gcc.send_one(db, card, code)
    await db.commit()
    return {"card": _row(card), "code": gc.display(code), "emailed": sent}


@admin_router.get("/{card_id}")
async def get_card(card_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    card = await db.get(GiftCard, card_id)
    if card is None or str(card.tenant_id) != str(get_current_tenant_id()):
        raise HTTPException(status_code=404, detail="Gift card not found.")
    ledger = (await db.execute(
        select(GiftCardLedger).where(GiftCardLedger.gift_card_id == card.id)
        .order_by(GiftCardLedger.created_at.desc(), GiftCardLedger.id)
    )).scalars().all()
    holds = (await db.execute(
        select(GiftCardHold).where(GiftCardHold.gift_card_id == card.id, GiftCardHold.status == "held")
    )).scalars().all()
    order_ids = {r.order_id for r in ledger if r.order_id} | ({card.purchase_order_id} if card.purchase_order_id else set())
    numbers: dict = {}
    if order_ids:
        from app.models.order import Order

        numbers = dict((await db.execute(
            select(Order.id, Order.order_number).where(Order.id.in_(order_ids))
        )).all())
    return {
        **_row(card),
        "purchase_order_number": numbers.get(card.purchase_order_id),
        "held": float(sum((Decimal(str(h.amount)) for h in holds), Decimal("0"))),
        "ledger": [{
            "id": str(r.id), "kind": r.kind, "amount": float(r.amount), "balance_after": float(r.balance_after),
            "order_id": str(r.order_id) if r.order_id else None,
            "order_number": numbers.get(r.order_id), "actor_name": r.actor_name, "reason": r.reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in ledger],
        "ledger_matches": await gc.balance_matches_ledger(db, card.id),
    }


async def _own(db: AsyncSession, card_id: uuid.UUID) -> GiftCard:
    card = await db.get(GiftCard, card_id)
    if card is None or str(card.tenant_id) != str(get_current_tenant_id()):
        raise HTTPException(status_code=404, detail="Gift card not found.")
    return card


class AdjustRequest(BaseModel):
    amount: Decimal
    reason: str = Field(..., min_length=3, max_length=300)
    request_id: str = Field(..., min_length=8, max_length=100)


@admin_router.post("/{card_id}/adjust")
async def adjust_card(card_id: uuid.UUID, payload: AdjustRequest, request: Request,
                      db: AsyncSession = Depends(get_db)) -> dict:
    await _own(db, card_id)
    try:
        await gc.adjust(db, card_id, payload.amount, reason=payload.reason,
                        key=f"adjust:{payload.request_id}", actor=await _actor(db, request))
    except gc.GiftCardError as exc:
        raise _bad(exc)
    await db.commit()
    return _row(await _own(db, card_id))


class StatusRequest(BaseModel):
    status: str
    reason: str = Field(..., min_length=3, max_length=300)


@admin_router.post("/{card_id}/status")
async def set_card_status(card_id: uuid.UUID, payload: StatusRequest, request: Request,
                          db: AsyncSession = Depends(get_db)) -> dict:
    await _own(db, card_id)
    try:
        await gc.set_status(db, card_id, payload.status, reason=payload.reason, actor=await _actor(db, request))
    except gc.GiftCardError as exc:
        raise _bad(exc)
    await db.commit()
    return _row(await _own(db, card_id))


@admin_router.post("/{card_id}/resend")
async def send_new_code(card_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """A new code for the card, emailed to its recipient: the old one stops
    working. For a recipient whose email never arrived (the code is never
    kept, so the same one cannot be sent again)."""
    card = await _own(db, card_id)
    if not card.recipient_email:
        raise HTTPException(status_code=400, detail="This card has no recipient email. Add one by issuing a new card.")
    try:
        card, code = await gc.rotate_code(db, card_id)
    except gc.GiftCardError as exc:
        raise _bad(exc)
    sent = await gcc.send_one(db, card, code)
    await db.commit()
    return {"card": _row(card), "code": gc.display(code), "emailed": sent}
