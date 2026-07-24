"""Gang sheet builder — Phase 1.

A buyer uploads artwork files with the print size and quantity for each, picks a
supplier-configured sheet size, and submits a structured job. The supplier
reviews it and either approves it or sends it back for revision.

Layout/nesting is intentionally not part of this phase: the buyer states the
sizes, the supplier arranges the sheet. Everything here is tenant-scoped through
TenantMixin, so a brand only ever sees its own sheet sizes, jobs, and artwork.
"""
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.base import BaseModel as DBBaseModel
from app.models.base import TenantMixin

# ── Status flow ───────────────────────────────────────────────────────────────
# submitted → in_review → approved            (supplier accepts, goes to production)
#                       → revision_requested  (buyer edits and resubmits)
#                       → rejected
STATUS_SUBMITTED = "submitted"
STATUS_IN_REVIEW = "in_review"
STATUS_APPROVED = "approved"
STATUS_REVISION = "revision_requested"
STATUS_REJECTED = "rejected"
STATUS_COMPLETED = "completed"

_ADMIN_STATUSES = {
    STATUS_IN_REVIEW,
    STATUS_APPROVED,
    STATUS_REVISION,
    STATUS_REJECTED,
    STATUS_COMPLETED,
}
# Statuses the buyer is still allowed to edit from.
_BUYER_EDITABLE = {STATUS_SUBMITTED, STATUS_REVISION}


# ── Models ────────────────────────────────────────────────────────────────────
class GangSheetSize(TenantMixin, DBBaseModel):
    __tablename__ = "gang_sheet_sizes"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    width_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    height_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    price_per_sheet: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    bleed_in: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.125"), nullable=False)
    spacing_in: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.125"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class GangSheetOrder(TenantMixin, DBBaseModel):
    __tablename__ = "gang_sheet_orders"

    reference: Mapped[str] = mapped_column(String(40), nullable=False)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    sheet_size_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    # Sheet spec is snapshotted so editing the size catalogue never rewrites history.
    sheet_name: Mapped[str] = mapped_column(String(120), nullable=False)
    sheet_width_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    sheet_height_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    price_per_sheet: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    sheet_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=STATUS_SUBMITTED, nullable=False)
    customer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    supplier_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revision_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class GangSheetArtwork(TenantMixin, DBBaseModel):
    __tablename__ = "gang_sheet_artworks"

    gang_sheet_order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gang_sheet_orders.id", ondelete="CASCADE"), nullable=False
    )
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_name: Mapped[str] = mapped_column(String(300), nullable=False)
    file_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    width_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    height_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


# ── Schemas ───────────────────────────────────────────────────────────────────
class SizeIn(BaseModel):
    name: str
    width_in: Decimal = Field(gt=0)
    height_in: Decimal = Field(gt=0)
    price_per_sheet: Decimal = Field(ge=0, default=Decimal("0"))
    bleed_in: Decimal = Field(ge=0, default=Decimal("0.125"))
    spacing_in: Decimal = Field(ge=0, default=Decimal("0.125"))
    is_active: bool = True
    sort_order: int = 0


class SizeUpdate(BaseModel):
    name: Optional[str] = None
    width_in: Optional[Decimal] = Field(default=None, gt=0)
    height_in: Optional[Decimal] = Field(default=None, gt=0)
    price_per_sheet: Optional[Decimal] = Field(default=None, ge=0)
    bleed_in: Optional[Decimal] = Field(default=None, ge=0)
    spacing_in: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ArtworkIn(BaseModel):
    file_url: str
    file_name: str
    file_type: Optional[str] = None
    width_in: Decimal = Field(gt=0)
    height_in: Decimal = Field(gt=0)
    quantity: int = Field(default=1, ge=1)


class OrderIn(BaseModel):
    sheet_size_id: uuid.UUID
    sheet_quantity: int = Field(default=1, ge=1)
    artworks: list[ArtworkIn] = Field(min_length=1)
    product_id: Optional[uuid.UUID] = None
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    customer_notes: Optional[str] = None


class StatusIn(BaseModel):
    status: str
    supplier_notes: Optional[str] = None


# ── Serialisers ───────────────────────────────────────────────────────────────
def _size_row(s: GangSheetSize) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "width_in": float(s.width_in),
        "height_in": float(s.height_in),
        "price_per_sheet": float(s.price_per_sheet),
        "bleed_in": float(s.bleed_in),
        "spacing_in": float(s.spacing_in),
        "is_active": s.is_active,
        "sort_order": s.sort_order,
    }


def _art_row(a: GangSheetArtwork) -> dict:
    return {
        "id": str(a.id),
        "file_url": a.file_url,
        "file_name": a.file_name,
        "file_type": a.file_type,
        "width_in": float(a.width_in),
        "height_in": float(a.height_in),
        "quantity": a.quantity,
        "sort_order": a.sort_order,
    }


def _order_row(o: GangSheetOrder, artworks: list[GangSheetArtwork] | None = None) -> dict:
    data = {
        "id": str(o.id),
        "reference": o.reference,
        "status": o.status,
        "sheet_name": o.sheet_name,
        "sheet_width_in": float(o.sheet_width_in),
        "sheet_height_in": float(o.sheet_height_in),
        "price_per_sheet": float(o.price_per_sheet),
        "sheet_quantity": o.sheet_quantity,
        "subtotal": float(o.subtotal),
        "customer_notes": o.customer_notes,
        "supplier_notes": o.supplier_notes,
        "revision_count": o.revision_count,
        "contact_email": o.contact_email,
        "contact_name": o.contact_name,
        "product_id": str(o.product_id) if o.product_id else None,
        "sheet_size_id": str(o.sheet_size_id) if o.sheet_size_id else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }
    if artworks is not None:
        data["artworks"] = [_art_row(a) for a in artworks]
    return data


async def _next_reference(db: AsyncSession) -> str:
    """Human-readable per-brand reference. Scoping keeps the count per tenant."""
    n = (await db.execute(select(func.count(GangSheetOrder.id)))).scalar() or 0
    return f"GS-{datetime.now(UTC):%Y%m}-{n + 1:04d}"


async def _load_artworks(db: AsyncSession, order_id: uuid.UUID) -> list[GangSheetArtwork]:
    rows = await db.execute(
        select(GangSheetArtwork)
        .where(GangSheetArtwork.gang_sheet_order_id == order_id)
        .order_by(GangSheetArtwork.sort_order)
    )
    return list(rows.scalars().all())


# ── Customer-facing router ────────────────────────────────────────────────────
public_router = APIRouter(prefix="/gang-sheets", tags=["gang-sheets"])


@public_router.get("/sizes")
async def list_sizes(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Sheet sizes this brand offers. Only active ones are buyable."""
    rows = await db.execute(
        select(GangSheetSize)
        .where(GangSheetSize.is_active.is_(True))
        .order_by(GangSheetSize.sort_order, GangSheetSize.name)
    )
    return [_size_row(s) for s in rows.scalars().all()]


@public_router.post("/orders", status_code=status.HTTP_201_CREATED)
async def submit_order(
    payload: OrderIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit a gang sheet job as a structured order."""
    size = (
        await db.execute(select(GangSheetSize).where(GangSheetSize.id == payload.sheet_size_id))
    ).scalar_one_or_none()
    if not size or not size.is_active:
        raise HTTPException(status_code=400, detail="Selected sheet size is not available")

    # Reject artwork that cannot physically fit the sheet in either orientation —
    # catching it here avoids a production job that can never be laid out.
    usable_w = size.width_in - (size.bleed_in * 2)
    usable_h = size.height_in - (size.bleed_in * 2)
    for art in payload.artworks:
        fits = (art.width_in <= usable_w and art.height_in <= usable_h) or (
            art.height_in <= usable_w and art.width_in <= usable_h
        )
        if not fits:
            raise HTTPException(
                status_code=400,
                detail=(
                    f'"{art.file_name}" ({art.width_in}in x {art.height_in}in) does not fit the '
                    f"{size.name} sheet printable area ({usable_w}in x {usable_h}in)."
                ),
            )

    subtotal = (size.price_per_sheet or Decimal("0")) * payload.sheet_quantity

    order = GangSheetOrder(
        reference=await _next_reference(db),
        company_id=getattr(request.state, "company_id", None),
        user_id=getattr(request.state, "user_id", None),
        contact_email=payload.contact_email,
        contact_name=payload.contact_name,
        product_id=payload.product_id,
        sheet_size_id=size.id,
        sheet_name=size.name,
        sheet_width_in=size.width_in,
        sheet_height_in=size.height_in,
        price_per_sheet=size.price_per_sheet,
        sheet_quantity=payload.sheet_quantity,
        subtotal=subtotal,
        status=STATUS_SUBMITTED,
        customer_notes=payload.customer_notes,
    )
    db.add(order)
    await db.flush()

    for i, art in enumerate(payload.artworks):
        db.add(
            GangSheetArtwork(
                gang_sheet_order_id=order.id,
                file_url=art.file_url,
                file_name=art.file_name,
                file_type=art.file_type,
                width_in=art.width_in,
                height_in=art.height_in,
                quantity=art.quantity,
                sort_order=i,
            )
        )
    await db.flush()
    return _order_row(order, await _load_artworks(db, order.id))


@public_router.get("/orders")
async def my_orders(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """The signed-in buyer's gang sheet jobs."""
    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    if not user_id and not company_id:
        raise HTTPException(status_code=401, detail="Sign in to view your gang sheet orders")

    stmt = select(GangSheetOrder)
    # Company buyers see their company's jobs; individual buyers see their own.
    stmt = stmt.where(
        GangSheetOrder.company_id == company_id
        if company_id
        else GangSheetOrder.user_id == user_id
    )
    rows = await db.execute(stmt.order_by(GangSheetOrder.created_at.desc()))
    return [_order_row(o) for o in rows.scalars().all()]


@public_router.get("/orders/{order_id}")
async def my_order_detail(
    order_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    order = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")

    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    owns = (company_id and str(order.company_id) == str(company_id)) or (
        user_id and str(order.user_id) == str(user_id)
    )
    if not owns and not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=404, detail="Gang sheet order not found")

    return _order_row(order, await _load_artworks(db, order.id))


@public_router.post("/orders/{order_id}/reorder", status_code=status.HTTP_201_CREATED)
async def reorder(
    order_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    """Resubmit an identical job — same artwork, sheet, and quantity."""
    src = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")

    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    owns = (company_id and str(src.company_id) == str(company_id)) or (
        user_id and str(src.user_id) == str(user_id)
    )
    if not owns:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")

    # Re-price against the live catalogue: a reorder is a new sale, so it must not
    # inherit a stale price. Falls back to the original when the size is retired.
    size = (
        await db.execute(select(GangSheetSize).where(GangSheetSize.id == src.sheet_size_id))
    ).scalar_one_or_none() if src.sheet_size_id else None
    price = size.price_per_sheet if size and size.is_active else src.price_per_sheet

    clone = GangSheetOrder(
        reference=await _next_reference(db),
        company_id=src.company_id,
        user_id=src.user_id,
        contact_email=src.contact_email,
        contact_name=src.contact_name,
        product_id=src.product_id,
        sheet_size_id=src.sheet_size_id,
        sheet_name=src.sheet_name,
        sheet_width_in=src.sheet_width_in,
        sheet_height_in=src.sheet_height_in,
        price_per_sheet=price,
        sheet_quantity=src.sheet_quantity,
        subtotal=price * src.sheet_quantity,
        status=STATUS_SUBMITTED,
        customer_notes=src.customer_notes,
    )
    db.add(clone)
    await db.flush()

    for art in await _load_artworks(db, src.id):
        db.add(
            GangSheetArtwork(
                gang_sheet_order_id=clone.id,
                file_url=art.file_url,
                file_name=art.file_name,
                file_type=art.file_type,
                width_in=art.width_in,
                height_in=art.height_in,
                quantity=art.quantity,
                sort_order=art.sort_order,
            )
        )
    await db.flush()
    return _order_row(clone, await _load_artworks(db, clone.id))


# ── Admin router ──────────────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/admin/gang-sheets", tags=["admin-gang-sheets"])


@admin_router.get("/sizes")
async def admin_list_sizes(
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    rows = await db.execute(
        select(GangSheetSize).order_by(GangSheetSize.sort_order, GangSheetSize.name)
    )
    return [_size_row(s) for s in rows.scalars().all()]


@admin_router.post("/sizes", status_code=status.HTTP_201_CREATED)
async def admin_create_size(
    payload: SizeIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    size = GangSheetSize(**payload.model_dump())
    db.add(size)
    await db.flush()
    return _size_row(size)


@admin_router.patch("/sizes/{size_id}")
async def admin_update_size(
    size_id: uuid.UUID,
    payload: SizeUpdate,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    size = (
        await db.execute(select(GangSheetSize).where(GangSheetSize.id == size_id))
    ).scalar_one_or_none()
    if not size:
        raise HTTPException(status_code=404, detail="Sheet size not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(size, k, v)
    await db.flush()
    return _size_row(size)


@admin_router.delete("/sizes/{size_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_size(
    size_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> None:
    size = (
        await db.execute(select(GangSheetSize).where(GangSheetSize.id == size_id))
    ).scalar_one_or_none()
    if not size:
        raise HTTPException(status_code=404, detail="Sheet size not found")
    await db.delete(size)


@admin_router.get("/orders")
async def admin_list_orders(
    status_filter: Optional[str] = None,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = select(GangSheetOrder)
    if status_filter:
        stmt = stmt.where(GangSheetOrder.status == status_filter)
    rows = await db.execute(stmt.order_by(GangSheetOrder.created_at.desc()))
    return [_order_row(o) for o in rows.scalars().all()]


@admin_router.get("/orders/{order_id}")
async def admin_order_detail(
    order_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    order = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    return _order_row(order, await _load_artworks(db, order.id))


@admin_router.patch("/orders/{order_id}/status")
async def admin_set_status(
    order_id: uuid.UUID,
    payload: StatusIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if payload.status not in _ADMIN_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(sorted(_ADMIN_STATUSES))}",
        )
    order = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")

    # Each trip back to the buyer is a revision — the count is what tells the
    # supplier a job is churning.
    if payload.status == STATUS_REVISION and order.status != STATUS_REVISION:
        order.revision_count += 1

    order.status = payload.status
    if payload.supplier_notes is not None:
        order.supplier_notes = payload.supplier_notes
    await db.flush()
    return _order_row(order, await _load_artworks(db, order.id))
