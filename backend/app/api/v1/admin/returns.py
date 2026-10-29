"""Admin API — Returns and reprints (services/returns).

The outcome is in the path, not the body (/reprint, /refund, /reject), so a
refund here needs the billing permission exactly as the order page's Refund
does (core/permissions._ALSO_REQUIRES): moving the brand's money back to a
card is not something the orders permission allows on its own.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import returns as svc

router = APIRouter(prefix="/admin/returns", tags=["admin", "orders"])


@router.get("")
async def list_returns(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    rows = await svc.list_returns(db)
    return {
        "items": rows,
        "counts": {s: sum(1 for r in rows if r["status"] == s)
                   for s in ("pending", "approved", "rejected", "completed", "received", "refunded", "exchanged", "closed")},
        "reasons": [{"key": k, "words": w} for k, w in svc.REASONS.items()],
    }


@router.get("/orders")
async def orders_for_a_return(q: str | None = None, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    return await svc.find_orders(db, q)


class NewReturn(BaseModel):
    order_id: UUID
    reason: str
    note: str | None = Field(None, max_length=2000)


class NewRefund(NewReturn):
    # Empty: what is left to refund on the order.
    amount: float | None = Field(None, gt=0)


class Decision(BaseModel):
    note: str | None = Field(None, max_length=2000)


class RefundDecision(Decision):
    amount: float | None = Field(None, gt=0)


@router.post("/reprint", status_code=201)
async def new_reprint(payload: NewReturn, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await svc.create(db, request, order_id=payload.order_id, reason=payload.reason, outcome="reprint",
                            note=payload.note, refund_amount=None)


@router.post("/refund", status_code=201)
async def new_refund(payload: NewRefund, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await svc.create(db, request, order_id=payload.order_id, reason=payload.reason, outcome="refund",
                            note=payload.note, refund_amount=payload.amount)


@router.post("/{rma_id}/reprint")
async def approve_as_reprint(rma_id: UUID, payload: Decision, request: Request,
                             db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await svc.resolve(db, request, rma_id, outcome="reprint", note=payload.note, refund_amount=None)


@router.post("/{rma_id}/refund")
async def approve_as_refund(rma_id: UUID, payload: RefundDecision, request: Request,
                            db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await svc.resolve(db, request, rma_id, outcome="refund", note=payload.note, refund_amount=payload.amount)


@router.post("/{rma_id}/reject")
async def reject(rma_id: UUID, payload: Decision, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await svc.resolve(db, request, rma_id, outcome="reject", note=payload.note, refund_amount=None)
