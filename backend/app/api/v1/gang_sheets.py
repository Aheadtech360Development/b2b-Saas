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
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.base import BaseModel as DBBaseModel
from app.models.base import TenantMixin

# ── Status flow ───────────────────────────────────────────────────────────────
# submitted → in_review → approved → production → completed
#                       → revision_requested → (buyer resubmits) → in_review
#                       → rejected
STATUS_SUBMITTED = "submitted"
STATUS_IN_REVIEW = "in_review"
STATUS_APPROVED = "approved"
STATUS_PRODUCTION = "production"
STATUS_REVISION = "revision_requested"
STATUS_REJECTED = "rejected"
STATUS_COMPLETED = "completed"

# The stages shown on the progress timeline, in order. revision/rejected are
# branch outcomes, surfaced separately rather than as a linear step.
STATUS_TIMELINE = [STATUS_SUBMITTED, STATUS_IN_REVIEW, STATUS_APPROVED, STATUS_PRODUCTION, STATUS_COMPLETED]

_ADMIN_STATUSES = {
    STATUS_IN_REVIEW,
    STATUS_APPROVED,
    STATUS_PRODUCTION,
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
    # Custom-length pricing: width fixed, buyer picks length between min/max,
    # priced per inch. pricing_mode 'fixed' keeps the flat per-sheet behaviour.
    pricing_mode: Mapped[str] = mapped_column(String(20), default="fixed", nullable=False)
    price_per_inch: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=0, nullable=False)
    min_length_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=12, nullable=False)
    max_length_in: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=240, nullable=False)
    max_upload_mb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
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
    # Phase 2: placements on the sheet — [{artwork_id, x_in, y_in, rotation, w_in, h_in}]
    layout: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # Batch 3: supplier-only notes + preserved submission history
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    versions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # Checkout link: set when the buyer pays for this sheet through the cart, so
    # the review pipeline and the paid order stay connected both ways.
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


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


class GangSheetLibraryDesign(TenantMixin, DBBaseModel):
    """A store-curated ready-made design buyers can drop onto a sheet. Managed by
    the brand's admin; surfaced to buyers in the builder's "Designs" tab."""
    __tablename__ = "gang_sheet_library_designs"

    name: Mapped[str] = mapped_column(String(300), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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
    pricing_mode: str = "fixed"                                  # 'fixed' | 'custom_length'
    price_per_inch: Decimal = Field(ge=0, default=Decimal("0"))
    min_length_in: Decimal = Field(gt=0, default=Decimal("12"))
    max_length_in: Decimal = Field(gt=0, default=Decimal("240"))
    max_upload_mb: Optional[int] = Field(default=None, ge=1)


class SizeUpdate(BaseModel):
    name: Optional[str] = None
    width_in: Optional[Decimal] = Field(default=None, gt=0)
    height_in: Optional[Decimal] = Field(default=None, gt=0)
    price_per_sheet: Optional[Decimal] = Field(default=None, ge=0)
    bleed_in: Optional[Decimal] = Field(default=None, ge=0)
    spacing_in: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    pricing_mode: Optional[str] = None
    price_per_inch: Optional[Decimal] = Field(default=None, ge=0)
    min_length_in: Optional[Decimal] = Field(default=None, gt=0)
    max_length_in: Optional[Decimal] = Field(default=None, gt=0)
    max_upload_mb: Optional[int] = Field(default=None, ge=1)


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
    # For a custom-length size, the buyer's chosen length (inches). Ignored for
    # fixed sizes, which use their stored height.
    custom_length_in: Optional[Decimal] = Field(default=None, gt=0)


class StatusIn(BaseModel):
    status: str
    supplier_notes: Optional[str] = None
    internal_notes: Optional[str] = None  # supplier-only; never shown to the buyer


class Placement(BaseModel):
    artwork_id: uuid.UUID
    x_in: float = Field(ge=0)
    y_in: float = Field(ge=0)
    rotation: int = 0          # 0 or 90 — Phase 2 keeps rotation orthogonal
    w_in: float = Field(gt=0)
    h_in: float = Field(gt=0)


class LayoutIn(BaseModel):
    layout: list[Placement]


class LibraryIn(BaseModel):
    name: str
    file_url: str
    file_type: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class RebuildIn(BaseModel):
    """Replace an editable order's contents when the buyer reopens it in the
    builder — same shape as a fresh submission, applied to the existing order."""
    sheet_size_id: uuid.UUID
    sheet_quantity: int = Field(default=1, ge=1)
    artworks: list[ArtworkIn] = Field(min_length=1)
    custom_length_in: Optional[Decimal] = Field(default=None, gt=0)


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
        "pricing_mode": getattr(s, "pricing_mode", "fixed"),
        "price_per_inch": float(getattr(s, "price_per_inch", 0) or 0),
        "min_length_in": float(getattr(s, "min_length_in", 12) or 12),
        "max_length_in": float(getattr(s, "max_length_in", 240) or 240),
        "max_upload_mb": getattr(s, "max_upload_mb", None),
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


def _library_row(d: GangSheetLibraryDesign) -> dict:
    return {
        "id": str(d.id),
        "name": d.name,
        "file_url": d.file_url,
        "file_type": d.file_type,
        "category": d.category,
        "is_active": d.is_active,
        "sort_order": d.sort_order,
    }


def _order_row(o: GangSheetOrder, artworks: list[GangSheetArtwork] | None = None, admin: bool = False) -> dict:
    data = {
        "id": str(o.id),
        "reference": o.reference,
        "status": o.status,
        "status_timeline": STATUS_TIMELINE,
        "version": getattr(o, "version", 1),
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
        "layout": o.layout or [],
        "order_id": str(o.order_id) if getattr(o, "order_id", None) else None,
        "paid": bool(getattr(o, "paid_at", None)),
    }
    if artworks is not None:
        data["artworks"] = [_art_row(a) for a in artworks]
    # Supplier-only fields never reach the buyer.
    if admin:
        data["internal_notes"] = getattr(o, "internal_notes", None)
        data["versions"] = getattr(o, "versions", None) or []
    return data


def _snapshot(o: GangSheetOrder, artworks: list[GangSheetArtwork], version: int) -> dict:
    """Freeze the current artwork set + layout as an immutable version entry, so a
    later resubmit never overwrites what the supplier already saw."""
    return {
        "version": version,
        "created_at": datetime.now(UTC).isoformat(),
        "artworks": [_art_row(a) for a in artworks],
        "layout": o.layout or [],
    }


async def _next_reference(db: AsyncSession) -> str:
    """Human-readable per-brand reference. Scoping keeps the count per tenant."""
    n = (await db.execute(select(func.count(GangSheetOrder.id)))).scalar() or 0
    return f"GS-{datetime.now(UTC):%Y%m}-{n + 1:04d}"


# What the buyer is told at each lifecycle event. The email shell rebrands to the
# active tenant automatically, so copy here stays brand-neutral.
_EVENT_COPY: dict[str, tuple[str, str]] = {
    STATUS_SUBMITTED: ("Gang sheet received — {ref}", "We've received your gang sheet <b>{ref}</b> and our team will review it shortly."),
    STATUS_IN_REVIEW: ("Your gang sheet is in review — {ref}", "Your gang sheet <b>{ref}</b> is now being reviewed by our team."),
    STATUS_APPROVED: ("Gang sheet approved — {ref}", "Good news — your gang sheet <b>{ref}</b> has been approved and is queued for production."),
    STATUS_PRODUCTION: ("Your gang sheet is in production — {ref}", "Your gang sheet <b>{ref}</b> has entered production."),
    STATUS_REVISION: ("Changes requested on your gang sheet — {ref}", "Our team has requested changes to gang sheet <b>{ref}</b>. Please review the notes, update your artwork, and resubmit."),
    STATUS_REJECTED: ("Update on your gang sheet — {ref}", "Unfortunately gang sheet <b>{ref}</b> could not be accepted."),
    STATUS_COMPLETED: ("Your gang sheet is complete — {ref}", "Your gang sheet <b>{ref}</b> is complete. Thank you!"),
}


async def _buyer_email(db: AsyncSession, order: GangSheetOrder) -> str | None:
    """Where to reach the buyer — the contact email they gave, else their account
    email. Returns None when neither exists (nothing to notify)."""
    if order.contact_email:
        return order.contact_email
    if order.user_id:
        from sqlalchemy import text as _t
        return (await db.execute(_t("SELECT email FROM users WHERE id=:i"), {"i": str(order.user_id)})).scalar()
    return None


async def _notify(db: AsyncSession, order: GangSheetOrder, event: str, extra_html: str = "") -> None:
    """Email the buyer about a lifecycle event. Best-effort: a mail failure must
    never block the status change or submission that triggered it. The email shell
    resolves the tenant's brand, so the buyer only ever sees their store."""
    copy = _EVENT_COPY.get(event)
    if not copy:
        return
    try:
        to = await _buyer_email(db, order)
        if not to:
            return
        from app.services.email_service import EmailService

        subj = copy[0].format(ref=order.reference)
        body = EmailService._base_template(
            f"<h2 style='color:#1B3A5C;margin:0 0 12px'>Gang Sheet Update</h2>"
            f"<p style='font-size:14px;color:#444'>{copy[1].format(ref=order.reference)}</p>"
            f"{extra_html}"
            f"<p style='font-size:13px;color:#666;margin-top:16px'>Reference: <b>{order.reference}</b> · "
            f"{order.sheet_name} · {order.sheet_quantity} sheet(s)</p>"
        )
        EmailService(db).send_raw(to_email=to, subject=subj, body_html=body)
    except Exception:
        pass


async def _load_artworks(db: AsyncSession, order_id: uuid.UUID) -> list[GangSheetArtwork]:
    rows = await db.execute(
        select(GangSheetArtwork)
        .where(GangSheetArtwork.gang_sheet_order_id == order_id)
        .order_by(GangSheetArtwork.sort_order)
    )
    return list(rows.scalars().all())


def _validate_layout(
    order: GangSheetOrder, artworks: list[GangSheetArtwork], placements: list[Placement]
) -> list[dict]:
    """Validate a proposed arrangement and return it as JSON-safe dicts.

    Every placement must reference an artwork on this order and sit fully inside
    the sheet's printable area (bleed removed on every side). Validating on the
    server means a hand-crafted request can't save a piece off the sheet or one
    belonging to someone else's order.
    """
    valid_ids = {str(a.id) for a in artworks}
    # Hard bound is the full sheet; the bleed margin is a visual guide the canvas
    # enforces. A tiny epsilon absorbs float rounding from the client.
    usable_w = float(order.sheet_width_in)
    usable_h = float(order.sheet_height_in)

    out: list[dict] = []
    for p in placements:
        if str(p.artwork_id) not in valid_ids:
            raise HTTPException(status_code=400, detail="Layout references an unknown artwork")
        w, h = (p.w_in, p.h_in) if p.rotation % 180 == 0 else (p.h_in, p.w_in)
        if p.x_in < 0 or p.y_in < 0 or p.x_in + w > usable_w + 0.01 or p.y_in + h > usable_h + 0.01:
            raise HTTPException(
                status_code=400,
                detail="A placement falls outside the sheet — move it back inside before saving.",
            )
        out.append({
            "artwork_id": str(p.artwork_id),
            "x_in": round(p.x_in, 3),
            "y_in": round(p.y_in, 3),
            "rotation": 90 if p.rotation % 180 else 0,
            "w_in": round(p.w_in, 3),
            "h_in": round(p.h_in, 3),
        })
    return out


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


@public_router.get("/library")
async def list_library(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Store-curated ready-made designs a buyer can drop straight onto a sheet."""
    rows = await db.execute(
        select(GangSheetLibraryDesign)
        .where(GangSheetLibraryDesign.is_active.is_(True))
        .order_by(GangSheetLibraryDesign.sort_order, GangSheetLibraryDesign.name)
    )
    return [_library_row(d) for d in rows.scalars().all()]


@public_router.get("/my-artworks")
async def my_artworks(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """The buyer's own previously-uploaded designs, de-duplicated, newest first —
    the builder's "Gallery" so past artwork can be reused without re-uploading."""
    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    if not user_id and not company_id:
        return []

    order_ids = select(GangSheetOrder.id).where(
        GangSheetOrder.company_id == company_id if company_id else GangSheetOrder.user_id == user_id
    )
    rows = await db.execute(
        select(GangSheetArtwork)
        .where(GangSheetArtwork.gang_sheet_order_id.in_(order_ids))
        .order_by(GangSheetArtwork.created_at.desc())
    )
    seen: set[str] = set()
    out: list[dict] = []
    for a in rows.scalars().all():
        if a.file_url in seen:
            continue
        seen.add(a.file_url)
        out.append(_art_row(a))
        if len(out) >= 60:
            break
    return out


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

    # Resolve the effective sheet: a custom-length size fixes the width and lets
    # the buyer choose the length (priced per inch); a fixed size uses its stored
    # dimensions and flat price. Either way, the order snapshots the result.
    sheet_height = size.height_in
    unit_price = size.price_per_sheet or Decimal("0")
    if getattr(size, "pricing_mode", "fixed") == "custom_length":
        length = payload.custom_length_in
        if length is None:
            raise HTTPException(status_code=400, detail="Enter a length for this custom sheet.")
        if length < size.min_length_in or length > size.max_length_in:
            raise HTTPException(
                status_code=400,
                detail=f"Length must be between {size.min_length_in}in and {size.max_length_in}in.",
            )
        sheet_height = length
        unit_price = (length * (size.price_per_inch or Decimal("0"))).quantize(Decimal("0.01"))

    # Reject artwork that cannot physically fit the sheet in either orientation —
    # catching it here avoids a production job that can never be laid out.
    usable_w = size.width_in - (size.bleed_in * 2)
    usable_h = sheet_height - (size.bleed_in * 2)
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

    subtotal = unit_price * payload.sheet_quantity

    order = GangSheetOrder(
        reference=await _next_reference(db),
        company_id=getattr(request.state, "company_id", None),
        user_id=getattr(request.state, "user_id", None),
        contact_email=payload.contact_email,
        contact_name=payload.contact_name,
        product_id=payload.product_id,
        sheet_size_id=size.id,
        sheet_name=(f"{size.name} ({sheet_height}\")" if getattr(size, "pricing_mode", "fixed") == "custom_length" else size.name),
        sheet_width_in=size.width_in,
        sheet_height_in=sheet_height,
        price_per_sheet=unit_price,
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
    arts = await _load_artworks(db, order.id)
    # Record the first submission as version 1 of the history.
    order.version = 1
    order.versions = [_snapshot(order, arts, 1)]
    await db.flush()
    # updated_at has onupdate=now(); after an UPDATE flush it is expired and
    # touching it in the serialiser would trigger implicit async IO (500). Refresh
    # reloads it in the async context first.
    await db.refresh(order)
    await _notify(db, order, STATUS_SUBMITTED)
    return _order_row(order, arts)


@public_router.post("/orders/{order_id}/artwork", status_code=status.HTTP_201_CREATED)
async def add_artwork(
    order_id: uuid.UUID,
    payload: ArtworkIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Add another design to an existing order while it's still the buyer's to
    change. Lets the arrange step act like a real editor — upload more artwork
    without starting a new order."""
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
    if not owns:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    if order.status not in _BUYER_EDITABLE:
        raise HTTPException(status_code=409, detail="This order can no longer be edited.")

    arts = await _load_artworks(db, order.id)
    db.add(GangSheetArtwork(
        gang_sheet_order_id=order.id,
        file_url=payload.file_url,
        file_name=payload.file_name,
        file_type=payload.file_type,
        width_in=payload.width_in,
        height_in=payload.height_in,
        quantity=payload.quantity,
        sort_order=len(arts),
    ))
    await db.flush()
    await db.refresh(order)
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


@public_router.patch("/orders/{order_id}/layout")
async def save_my_layout(
    order_id: uuid.UUID,
    payload: LayoutIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Buyer saves how they've arranged the artwork on the sheet.

    Only allowed while the job is still theirs to change (submitted or sent back
    for revision) — once the supplier has approved it, the layout is locked so a
    late edit can't diverge from what's already going to production.
    """
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
    if not owns:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    if order.status not in _BUYER_EDITABLE:
        raise HTTPException(status_code=409, detail="This order can no longer be edited.")

    artworks = await _load_artworks(db, order.id)
    order.layout = _validate_layout(order, artworks, payload.layout)
    await db.flush()
    await db.refresh(order)  # reload onupdate'd updated_at before serialising
    return _order_row(order, artworks)


@public_router.patch("/orders/{order_id}/contents")
async def rebuild_order(
    order_id: uuid.UUID,
    payload: RebuildIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Replace an editable order's artwork + sheet + quantity when the buyer
    reopens it in the builder. The layout is cleared (artwork ids change); the
    client re-saves it afterwards. Only allowed while the job is still the
    buyer's to change."""
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
    if not owns:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    if order.status not in _BUYER_EDITABLE:
        raise HTTPException(status_code=409, detail="This order can no longer be edited.")

    size = (
        await db.execute(select(GangSheetSize).where(GangSheetSize.id == payload.sheet_size_id))
    ).scalar_one_or_none()
    if not size or not size.is_active:
        raise HTTPException(status_code=400, detail="Selected sheet size is not available")

    # Resolve sheet + unit price (mirrors submit_order).
    sheet_height = size.height_in
    unit_price = size.price_per_sheet or Decimal("0")
    if getattr(size, "pricing_mode", "fixed") == "custom_length":
        length = payload.custom_length_in
        if length is None:
            raise HTTPException(status_code=400, detail="Enter a length for this custom sheet.")
        if length < size.min_length_in or length > size.max_length_in:
            raise HTTPException(status_code=400, detail=f"Length must be between {size.min_length_in}in and {size.max_length_in}in.")
        sheet_height = length
        unit_price = (length * (size.price_per_inch or Decimal("0"))).quantize(Decimal("0.01"))

    usable_w = size.width_in - (size.bleed_in * 2)
    usable_h = sheet_height - (size.bleed_in * 2)
    for art in payload.artworks:
        fits = (art.width_in <= usable_w and art.height_in <= usable_h) or (
            art.height_in <= usable_w and art.width_in <= usable_h
        )
        if not fits:
            raise HTTPException(
                status_code=400,
                detail=f'"{art.file_name}" ({art.width_in}in x {art.height_in}in) does not fit the {size.name} sheet.',
            )

    # Replace artwork rows.
    for a in await _load_artworks(db, order.id):
        await db.delete(a)
    await db.flush()
    for i, art in enumerate(payload.artworks):
        db.add(GangSheetArtwork(
            gang_sheet_order_id=order.id,
            file_url=art.file_url, file_name=art.file_name, file_type=art.file_type,
            width_in=art.width_in, height_in=art.height_in, quantity=art.quantity, sort_order=i,
        ))

    # Update the sheet snapshot + price; clear the layout (ids changed).
    order.sheet_size_id = size.id
    order.sheet_name = (f"{size.name} ({sheet_height}\")" if getattr(size, "pricing_mode", "fixed") == "custom_length" else size.name)
    order.sheet_width_in = size.width_in
    order.sheet_height_in = sheet_height
    order.price_per_sheet = unit_price
    order.sheet_quantity = payload.sheet_quantity
    order.subtotal = unit_price * payload.sheet_quantity
    order.layout = []
    await db.flush()

    # Keep the current version's snapshot accurate (don't spawn a new version for
    # a plain edit — resubmit handles that).
    arts = await _load_artworks(db, order.id)
    snap = _snapshot(order, arts, order.version or 1)
    vers = list(order.versions or [])
    if vers:
        vers[-1] = snap
    else:
        vers = [snap]
    order.versions = vers
    await db.flush()
    await db.refresh(order)
    return _order_row(order, arts)


@public_router.post("/orders/{order_id}/resubmit")
async def resubmit_order(
    order_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    """Buyer resubmits after a revision request. Snapshots the current artwork +
    layout as a new version (never overwriting the previous one) and sends the job
    back into review."""
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
    if not owns:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    if order.status != STATUS_REVISION:
        raise HTTPException(status_code=409, detail="Only an order awaiting revision can be resubmitted.")

    arts = await _load_artworks(db, order.id)
    order.version = (order.version or 1) + 1
    order.versions = [*(order.versions or []), _snapshot(order, arts, order.version)]
    order.status = STATUS_IN_REVIEW
    await db.flush()
    await db.refresh(order)
    return _order_row(order, arts)


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
    return [_order_row(o, admin=True) for o in rows.scalars().all()]


@admin_router.get("/orders/{order_id}")
async def admin_order_detail(
    order_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    order = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    return _order_row(order, await _load_artworks(db, order.id), admin=True)


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
    if payload.internal_notes is not None:
        order.internal_notes = payload.internal_notes
    await db.flush()
    # Tell the buyer what changed. A revision passes the supplier note along.
    extra = (f"<p style='background:#FFF7ED;border-radius:6px;padding:10px 12px;font-size:13px;color:#9A3412'>{order.supplier_notes}</p>"
             if payload.status == STATUS_REVISION and order.supplier_notes else "")
    await _notify(db, order, payload.status, extra_html=extra)
    await db.refresh(order)
    return _order_row(order, await _load_artworks(db, order.id), admin=True)


@admin_router.patch("/orders/{order_id}/layout")
async def admin_save_layout(
    order_id: uuid.UUID,
    payload: LayoutIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Supplier arranges the sheet. Allowed at any status — the supplier is the
    one who finalises the layout for production, including after approval."""
    order = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    artworks = await _load_artworks(db, order.id)
    order.layout = _validate_layout(order, artworks, payload.layout)
    await db.flush()
    await db.refresh(order)  # reload onupdate'd updated_at before serialising
    return _order_row(order, artworks, admin=True)


# ── Admin: design library ─────────────────────────────────────────────────────
@admin_router.get("/library")
async def admin_list_library(
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    rows = await db.execute(
        select(GangSheetLibraryDesign).order_by(GangSheetLibraryDesign.sort_order, GangSheetLibraryDesign.name)
    )
    return [_library_row(d) for d in rows.scalars().all()]


@admin_router.post("/library", status_code=status.HTTP_201_CREATED)
async def admin_create_library(
    payload: LibraryIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    design = GangSheetLibraryDesign(**payload.model_dump())
    db.add(design)
    await db.flush()
    return _library_row(design)


@admin_router.delete("/library/{design_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_library(
    design_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> None:
    design = (
        await db.execute(select(GangSheetLibraryDesign).where(GangSheetLibraryDesign.id == design_id))
    ).scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")
    await db.delete(design)
