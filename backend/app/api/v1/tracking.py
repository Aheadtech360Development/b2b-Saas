"""Order tracking (Retail launch, package 2): the buyer's page and the shop's parcels.

Buyer side (`/storefront/track`, gated by the `order_tracking` feature):
- GET  /{order_number}  for the order's own buyer signed in, or with the
  order's view key in X-Order-Key (the link in the shop's emails);
- POST ""  {order_number, email} for anyone else. Rate limited per visitor
  and per order; a wrong email and a made-up number get the same 404.
What either returns is services/tracking_page.page: never a full address.

Shop side (`/admin/...`): the order's parcels, adding one by hand, setting a
parcel's status by hand when the courier says nothing, and the page's settings.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.services import order_view, shipments, tracking_page

public_router = APIRouter(prefix="/storefront/track", tags=["storefront", "tracking"])
admin_router = APIRouter(prefix="/admin", tags=["admin", "tracking"])

NOT_FOUND = "We could not find that order. Check the order number and the email it was placed with."
OFF = "This shop does not show order tracking online. Contact the shop for an update."


async def _open(db: AsyncSession) -> None:
    conf = await tracking_page.settings_for(db, get_current_tenant_id())
    if not conf["enabled"]:
        raise HTTPException(status_code=404, detail=OFF)


class Lookup(BaseModel):
    order_number: str = Field(..., min_length=1, max_length=50)
    email: str = Field(..., min_length=3, max_length=255)


@public_router.post("")
async def track_by_lookup(payload: Lookup, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    from app.core.rate_limit import enforce_rate_limit

    tenant_id = get_current_tenant_id()
    number = payload.order_number.strip().lstrip("#").upper()
    await enforce_rate_limit(request, "track_lookup", limit=10, window=900)
    await enforce_rate_limit(request, "track_lookup_order", limit=5, window=3600, extra=f"{tenant_id}:{number}")
    await _open(db)
    order = await tracking_page.find_order(db, tenant_id, number)
    if order is None or not await tracking_page.email_matches(db, order, payload.email):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return await tracking_page.page(db, order)


@public_router.get("/{order_number}")
async def track_by_key(order_number: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    await _open(db)
    order = await tracking_page.find_order(db, get_current_tenant_id(), order_number)
    allowed = order is not None and (
        order_view.key_opens(order, (request.headers.get("x-order-key") or "")[:80])
        or order_view.owned_by(
            order,
            user_id=getattr(request.state, "user_id", None),
            company_id=getattr(request.state, "company_id", None),
            account_type=getattr(request.state, "account_type", None),
        )
    )
    if not allowed:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return await tracking_page.page(db, order)


# ── The shop's side ───────────────────────────────────────────────────────────

async def _order(db: AsyncSession, order_id: uuid.UUID):
    from app.models.order import Order

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _with_events(parcel) -> dict:
    out = shipments.view(parcel)
    out["events"] = [{"status": e.status, "words": shipments.WORDS.get(e.status, e.status), "source": e.source,
                      "note": e.note, "at": e.occurred_at.isoformat()} for e in parcel.events]
    return out


@admin_router.get("/orders/{order_id}/shipments", dependencies=[Depends(require_admin)])
async def order_shipments(order_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    from sqlalchemy.orm import selectinload

    from app.models.shipment import Shipment

    await _order(db, order_id)
    rows = (await db.execute(
        select(Shipment).options(selectinload(Shipment.events))
        .where(Shipment.order_id == order_id).order_by(Shipment.created_at)
    )).scalars().all()
    return {"shipments": [_with_events(r) for r in rows], "statuses": [
        {"key": k, "words": shipments.WORDS[k]} for k in shipments.STATUSES if k != "unknown"]}


class NewShipment(BaseModel):
    tracking_number: str = Field(..., min_length=1, max_length=255)
    carrier: str | None = Field(None, max_length=100)
    tracking_url: str | None = Field(None, max_length=1000)


@admin_router.post("/orders/{order_id}/shipments", dependencies=[Depends(require_admin)], status_code=201)
async def add_shipment(order_id: uuid.UUID, payload: NewShipment, db: AsyncSession = Depends(get_db)) -> dict:
    order = await _order(db, order_id)
    url = (payload.tracking_url or "").strip() or None
    if url and not url.lower().startswith(("https://", "http://")):
        raise HTTPException(status_code=422, detail="The tracking link must start with https://")
    rows = await shipments.record(db, order, payload.tracking_number, carrier=payload.carrier, tracking_url=url,
                                  status="in_transit", source="manual", note="Added by the shop")
    if not order.tracking_number:
        order.tracking_number = rows[0].tracking_number if rows else order.tracking_number
    await db.commit()
    return {"shipments": [shipments.view(r) for r in rows]}


class StatusChange(BaseModel):
    status: str = Field(..., max_length=30)
    note: str | None = Field(None, max_length=500)


@admin_router.patch("/shipments/{shipment_id}", dependencies=[Depends(require_admin)])
async def set_shipment_status(shipment_id: uuid.UUID, payload: StatusChange, db: AsyncSession = Depends(get_db)) -> dict:
    """The shop's word, for a courier that reports nothing (or got it wrong).
    The order list and the buyer's page show the same."""
    from app.models.shipment import Shipment

    parcel = (await db.execute(select(Shipment).where(Shipment.id == shipment_id))).scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=404, detail="Shipment not found")
    if payload.status not in shipments.STATUSES or payload.status == "unknown":
        raise HTTPException(status_code=422, detail="Choose where the parcel is.")
    await shipments.set_status(db, parcel, payload.status, source="manual", note=(payload.note or "").strip() or None)
    await db.commit()
    return shipments.view(parcel)


class TrackingSettings(BaseModel):
    enabled: bool | None = None
    message: str | None = Field(None, max_length=tracking_page.MESSAGE_MAX)


@admin_router.get("/tracking/settings", dependencies=[Depends(require_admin)])
async def get_tracking_settings(db: AsyncSession = Depends(get_db)) -> dict:
    return await tracking_page.settings_for(db, get_current_tenant_id())


@admin_router.put("/tracking/settings", dependencies=[Depends(require_admin)])
async def put_tracking_settings(payload: TrackingSettings, db: AsyncSession = Depends(get_db)) -> dict:
    out = await tracking_page.save_settings(db, get_current_tenant_id(), payload.model_dump(exclude_none=True))
    await db.commit()
    return out
