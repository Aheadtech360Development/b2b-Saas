"""Gang sheet builder — Phase 1.

A buyer uploads artwork files with the print size and quantity for each, picks a
supplier-configured sheet size, and submits a structured job. The supplier
reviews it and either approves it or sends it back for revision.

Layout/nesting is intentionally not part of this phase: the buyer states the
sizes, the supplier arranges the sheet. Everything here is tenant-scoped through
TenantMixin, so a brand only ever sees its own sheet sizes, jobs, and artwork.
"""
import re
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

    # Which gang-sheet product these sizes belong to. NULL = the brand's global
    # default set (backward-compatible with pre-per-product sizes). See migration 0030.
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
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
    # The print check run on this file at the size it was ordered (migration 0035).
    inspection: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


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
    product_id: Optional[uuid.UUID] = None
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


class UploadBySizeIn(BaseModel):
    """A single-design "Upload by size" order: one artwork printed at an exact
    width×height, priced from the product's area-tiered table (server-side)."""
    product_id: uuid.UUID
    width_in: Decimal = Field(gt=0)
    height_in: Decimal = Field(gt=0)
    quantity: int = Field(default=1, ge=1)
    file_url: str
    file_name: str
    file_type: Optional[str] = None
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    customer_notes: Optional[str] = None


class UploadBySizeEditIn(BaseModel):
    """Revising an existing upload-by-size job: the buyer may swap the artwork,
    change the print size, or change the quantity. The product never changes —
    it is read from the order, so a revision cannot hop to another product's
    price table."""
    width_in: Decimal = Field(gt=0)
    height_in: Decimal = Field(gt=0)
    quantity: int = Field(default=1, ge=1)
    file_url: str
    file_name: str
    file_type: Optional[str] = None
    customer_notes: Optional[str] = None


class StatusIn(BaseModel):
    status: str
    supplier_notes: Optional[str] = None
    internal_notes: Optional[str] = None  # supplier-only; never shown to the buyer


class Placement(BaseModel):
    artwork_id: uuid.UUID
    x_in: float = Field(ge=0)
    y_in: float = Field(ge=0)
    rotation: int = 0          # a quarter turn clockwise: 0, 90, 180 or 270
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
        "product_id": str(s.product_id) if getattr(s, "product_id", None) else None,
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
        "inspection": getattr(a, "inspection", None),
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


def _order_row(
    o: GangSheetOrder,
    artworks: list[GangSheetArtwork] | None = None,
    admin: bool = False,
    product_slug: str | None = None,
) -> dict:
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
        # Who to put on the review screen. A submission with nobody's name on
        # it is a reference number the shop cannot act on.
        "contact_name": o.contact_name or "Guest",
        "product_id": str(o.product_id) if o.product_id else None,
        "sheet_size_id": str(o.sheet_size_id) if o.sheet_size_id else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        "layout": o.layout or [],
        "order_id": str(o.order_id) if getattr(o, "order_id", None) else None,
        "paid": bool(getattr(o, "paid_at", None)),
        # Upload-by-size has no builder to reopen — a revision happens back on the
        # product page, and the buyer's list needs the slug to link there.
        "kind": "gang_sheet" if o.sheet_size_id else "upload_by_size",
        "product_slug": product_slug,
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


async def _product_slugs(db: AsyncSession, product_ids) -> dict[str, str]:
    """Slugs for a batch of product ids, in one query."""
    ids = {pid for pid in product_ids if pid}
    if not ids:
        return {}
    from app.models.product import Product

    rows = await db.execute(select(Product.id, Product.slug).where(Product.id.in_(ids)))
    return {str(i): slug for i, slug in rows.all() if slug}


async def _submitter(request, db: AsyncSession, payload) -> tuple[str | None, str | None]:
    """Who sent this sheet in, for the shop that has to look at it.

    The form only asks a guest for a name — a signed-in buyer has already told
    us who they are and is not asked again. So the name arrived empty for every
    customer with an account, and the shop's review queue was a list of
    references with nobody attached to them.

    Taken from whoever is signed in when the form did not carry one, and the
    company is preferred over the person: a wholesale shop thinks in accounts,
    and "Bilal Printing" is what it needs to see, not "Bilal".
    """
    name = (getattr(payload, "contact_name", None) or "").strip() or None
    email = (getattr(payload, "contact_email", None) or "").strip() or None
    if name and email:
        return name, email

    from sqlalchemy import text as _t

    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)

    if not name and company_id:
        try:
            name = (await db.execute(
                _t("SELECT name FROM companies WHERE id = CAST(:c AS uuid)"),
                {"c": str(company_id)},
            )).scalar() or None
        except Exception:
            pass

    if (not name or not email) and user_id:
        try:
            row = (await db.execute(_t(
                "SELECT first_name, last_name, email FROM users WHERE id = CAST(:u AS uuid)"
            ), {"u": str(user_id)})).first()
            if row:
                if not name:
                    person = " ".join(x for x in (row[0], row[1]) if x).strip()
                    name = person or None
                email = email or row[2]
        except Exception:
            pass

    return name, email


def _initials(name: str) -> str:
    """Up to three letters from somebody's name, for the reference."""
    # Split on spaces, not on every non-letter: a hyphenated or apostrophed
    # surname is one name, and O'Brien-Smith is not three initials.
    out = []
    for word in (name or "").split():
        stripped = re.sub(r"^[^A-Za-z]+", "", word)
        if stripped:
            out.append(stripped[0])
    return "".join(out[:3]).upper()


async def _next_reference(db: AsyncSession, who: str = "") -> str:
    """A reference somebody can read down a phone.

    It used to be a date and a running count — GS-202610-0010 — which says
    nothing about whose job it is. On a production floor with a dozen sheets
    queued, the one thing worth having in the name is the customer. So the
    buyer's initials lead, and the count still follows, so two jobs from the
    same person are never the same reference.

    Falls back to the old shape when there is no name, which is the guest
    case, rather than inventing one.
    """
    n = (await db.execute(select(func.count(GangSheetOrder.id)))).scalar() or 0
    stamp = f"{datetime.now(UTC):%y%m}"
    tag = _initials(who)
    return f"GS-{tag}-{stamp}-{n + 1:04d}" if tag else f"GS-{stamp}-{n + 1:04d}"


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


async def _inspect_and_store(db: AsyncSession, artworks: list[GangSheetArtwork]) -> None:
    """Run the print check over a job's artwork and keep the result on each row.

    Best-effort and in parallel: submitting an order must not fail, or crawl,
    because a file could not be downloaded. Anything that goes wrong is recorded
    as "not checked" by the inspector itself, which is the honest answer.
    """
    import asyncio

    from app.services.artwork.inspect import inspect_artwork

    if not artworks:
        return
    results = await asyncio.gather(*[
        inspect_artwork(a.file_url, float(a.width_in or 0), float(a.height_in or 0), a.file_type or "")
        for a in artworks
    ], return_exceptions=True)
    for art, result in zip(artworks, results):
        if isinstance(result, BaseException):
            continue
        art.inspection = result.as_dict()
    await db.flush()


def _may_touch(request: Request, order: GangSheetOrder) -> bool:
    """Whether this request is allowed to read or change this job.

    A job made while signed in belongs to that account. A job made without one
    belongs to whoever holds its id — the person it was made by, who got it
    back when they made it and in every email about it since.
    """
    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    if order.user_id is None and order.company_id is None:
        return True
    if user_id and str(order.user_id) == str(user_id):
        return True
    return bool(company_id and str(order.company_id) == str(company_id))


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
            # Whichever quarter turn it was given, kept. This used to keep only
            # "upright" or "on its side", so a design the buyer turned upside
            # down in the builder was saved — and printed — the right way up.
            "rotation": (round(p.rotation / 90) * 90) % 360,
            "w_in": round(p.w_in, 3),
            "h_in": round(p.h_in, 3),
        })
    return out


# ── Customer-facing router ────────────────────────────────────────────────────
public_router = APIRouter(prefix="/gang-sheets", tags=["gang-sheets"])


@public_router.get("/sizes")
async def list_sizes(
    product_id: Optional[uuid.UUID] = None, db: AsyncSession = Depends(get_db)
) -> list[dict]:
    """Sheet sizes this brand offers (only active ones are buyable).

    When a product_id is given, return ONLY that product's own sizes — each
    gang-sheet product is configured individually (no shared/auto defaults), so a
    product with no sizes yet simply has none. Without a product_id (the generic
    builder), return every active size.
    """
    base = select(GangSheetSize).where(GangSheetSize.is_active.is_(True))
    order = (GangSheetSize.sort_order, GangSheetSize.name)
    if product_id is not None:
        rows = (await db.execute(
            base.where(GangSheetSize.product_id == product_id).order_by(*order)
        )).scalars().all()
        return [_size_row(s) for s in rows]
    rows = (await db.execute(base.order_by(*order))).scalars().all()
    return [_size_row(s) for s in rows]


@public_router.get("/library")
async def list_library(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Store-curated ready-made designs a buyer can drop straight onto a sheet."""
    rows = await db.execute(
        select(GangSheetLibraryDesign)
        .where(GangSheetLibraryDesign.is_active.is_(True))
        .order_by(GangSheetLibraryDesign.sort_order, GangSheetLibraryDesign.name)
    )
    return [_library_row(d) for d in rows.scalars().all()]


@public_router.get("/assistant")
async def assistant_available(db: AsyncSession = Depends(get_db)) -> dict:
    """Whether this brand's builder shows "Build with AI".

    The platform turns it on per brand (Manage → "Build with AI in the
    builder"); the assistant's own route asks the same question before it
    answers, so hiding the button is not the only thing keeping it off."""
    from app.core.tenant_context import NO_TENANT, get_current_tenant_id
    from app.services import entitlements

    tenant_id = get_current_tenant_id()
    if tenant_id in (None, NO_TENANT):
        return {"available": False}
    return {"available": await entitlements.enabled(db, tenant_id, "gang_sheet_ai")}


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


class InspectIn(BaseModel):
    """Checking a file the buyer has just uploaded, before it becomes an order."""
    file_url: str
    width_in: Decimal = Field(gt=0)
    height_in: Decimal = Field(gt=0)
    file_type: Optional[str] = None


@public_router.post("/artwork/inspect")
async def inspect_uploaded_artwork(payload: InspectIn) -> dict:
    """What will go wrong if this file is printed at this size."""
    from app.services.artwork.inspect import inspect_artwork

    result = await inspect_artwork(
        payload.file_url, float(payload.width_in), float(payload.height_in), payload.file_type or "",
    )
    return result.as_dict()


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

    who_name, who_email = await _submitter(request, db, payload)
    order = GangSheetOrder(
        reference=await _next_reference(db, who_name),
        company_id=getattr(request.state, "company_id", None),
        user_id=getattr(request.state, "user_id", None),
        contact_email=who_email,
        contact_name=who_name,
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
    # A buyer's own finished sheet is one file that is the whole sheet: there
    # is nothing to arrange, so it is laid out here, as Upload by size records
    # its one design. Without a layout the cart refused it ("no saved layout
    # yet"), and the modal that sends it adds it to the cart straight away.
    if len(arts) == 1 and await _gang_sheet_type(db, payload.product_id) == "upload_own":
        a = arts[0]
        w, h = float(a.width_in), float(a.height_in)
        order.layout = [{"artwork_id": str(a.id), "rotation": 0, "w_in": w, "h_in": h,
                         "x_in": max(0.0, (float(order.sheet_width_in) - w) / 2),
                         "y_in": max(0.0, (float(order.sheet_height_in) - h) / 2)}]
    await _inspect_and_store(db, arts)
    # Record the first submission as version 1 of the history.
    order.version = 1
    order.versions = [_snapshot(order, arts, 1)]
    await db.flush()
    # updated_at has onupdate=now(); after an UPDATE flush it is expired and
    # touching it in the serialiser would trigger implicit async IO (500). Refresh
    # reloads it in the async context first.
    await db.refresh(order)
    # No email here. A sheet is saved to the buyer's account when they build
    # it, which is long before — and sometimes instead of — paying for it.
    # Telling somebody "we have received your gang sheet" while it sits in
    # their cart with no card against it is a message about an order nobody
    # placed. See order_service: the word goes out when the order does.
    return _order_row(order, arts)


async def _gang_sheet_type(db: AsyncSession, product_id) -> str | None:
    """Which builder a product sells through: 'gang_sheet', 'upload_by_size',
    'upload_own', or None."""
    if not product_id:
        return None
    from app.models.product import Product

    return (await db.execute(select(Product.gang_sheet_type).where(Product.id == product_id))).scalar_one_or_none()


def _upload_by_size_rate(config: dict, area: float) -> Optional[float]:
    """Price-per-sq-inch for a design of `area` sq.in from a product's tiered
    table. Tiers are {max_area, price_per_sqin}; the first tier whose max_area
    covers the design wins (bigger prints fall to a cheaper per-inch rate).
    Above the largest tier, the largest tier's rate applies. None = no pricing."""
    norm: list[tuple[float, float]] = []
    for t in (config.get("tiers") or []):
        try:
            ma = float(t.get("max_area") or 0)
            pp = float(t.get("price_per_sqin") or 0)
        except (TypeError, ValueError):
            continue
        if ma > 0 and pp > 0:
            norm.append((ma, pp))
    if not norm:
        return None
    norm.sort(key=lambda x: x[0])
    for ma, pp in norm:
        if area <= ma + 1e-6:
            return pp
    return norm[-1][1]


async def _upload_by_size_quote(db: AsyncSession, product_id: uuid.UUID, w: Decimal, h: Decimal):
    """Resolve the product and the server-side unit price for one design at
    w x h, refusing a size the printer cannot run. Shared by the first
    submission and a later revision so an edited job is bounded and priced by
    exactly the same rules as a fresh one."""
    from app.models.product import Product

    product = (
        await db.execute(select(Product).where(Product.id == product_id))
    ).scalar_one_or_none()
    if not product or not getattr(product, "gang_sheet_enabled", False):
        raise HTTPException(status_code=400, detail="This product does not accept uploads by size.")
    if getattr(product, "gang_sheet_type", None) != "upload_by_size":
        raise HTTPException(status_code=400, detail="This product is not configured for upload by size.")

    config = getattr(product, "gang_sheet_config", None) or {}
    printer_w = Decimal(str(config.get("printer_width") or 0))
    max_h = Decimal(str(config.get("max_height") or 0))
    if printer_w > 0 and w > printer_w:
        raise HTTPException(status_code=400, detail=f"Width must be at most {printer_w}in for this product.")
    if max_h > 0 and h > max_h:
        raise HTTPException(status_code=400, detail=f"Height must be at most {max_h}in for this product.")

    rate = _upload_by_size_rate(config, float(w) * float(h))
    if rate is None:
        raise HTTPException(status_code=400, detail="This product has no pricing configured yet.")
    return product, (w * h * Decimal(str(rate))).quantize(Decimal("0.01"))


@public_router.post("/orders/upload-by-size", status_code=status.HTTP_201_CREATED)
async def submit_upload_by_size(
    payload: UploadBySizeIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """One-design "Upload by size" order. Price is computed here from the
    product's area-tiered table — the client's estimate is never trusted."""
    w, h = payload.width_in, payload.height_in
    product, unit_price = await _upload_by_size_quote(db, payload.product_id, w, h)
    subtotal = (unit_price * payload.quantity).quantize(Decimal("0.01"))

    who_name, who_email = await _submitter(request, db, payload)
    order = GangSheetOrder(
        reference=await _next_reference(db, who_name),
        company_id=getattr(request.state, "company_id", None),
        user_id=getattr(request.state, "user_id", None),
        contact_email=who_email,
        contact_name=who_name,
        product_id=product.id,
        sheet_size_id=None,  # upload-by-size has no preset sheet
        sheet_name=f'{product.name} — {w}"×{h}"',
        sheet_width_in=w,
        sheet_height_in=h,
        price_per_sheet=unit_price,
        sheet_quantity=payload.quantity,
        subtotal=subtotal,
        status=STATUS_SUBMITTED,
        customer_notes=payload.customer_notes,
    )
    db.add(order)
    await db.flush()

    art = GangSheetArtwork(
        gang_sheet_order_id=order.id,
        file_url=payload.file_url,
        file_name=payload.file_name,
        file_type=payload.file_type,
        width_in=w,
        height_in=h,
        quantity=payload.quantity,
        sort_order=0,
    )
    db.add(art)
    await db.flush()

    # The single design fills its own sheet — record it as the layout so the admin
    # review + production pipeline sees exactly what was ordered.
    order.layout = [{"artwork_id": str(art.id), "x_in": 0, "y_in": 0, "rotation": 0, "w_in": float(w), "h_in": float(h)}]
    arts = await _load_artworks(db, order.id)
    await _inspect_and_store(db, arts)
    order.version = 1
    order.versions = [_snapshot(order, arts, 1)]
    await db.flush()
    await db.refresh(order)
    # No email here. A sheet is saved to the buyer's account when they build
    # it, which is long before — and sometimes instead of — paying for it.
    # Telling somebody "we have received your gang sheet" while it sits in
    # their cart with no card against it is a message about an order nobody
    # placed. See order_service: the word goes out when the order does.
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

    owns = _may_touch(request, order)
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
    orders = (await db.execute(stmt.order_by(GangSheetOrder.created_at.desc()))).scalars().all()
    slugs = await _product_slugs(db, [o.product_id for o in orders])
    return [_order_row(o, product_slug=slugs.get(str(o.product_id))) for o in orders]


@public_router.get("/orders/{order_id}")
async def my_order_detail(
    order_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    order = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")

    owns = _may_touch(request, order)
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

    owns = _may_touch(request, order)
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

    owns = _may_touch(request, order)
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


@public_router.patch("/orders/{order_id}/upload-by-size")
async def revise_upload_by_size(
    order_id: uuid.UUID,
    payload: UploadBySizeEditIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Replace an editable upload-by-size job's artwork, size and quantity.

    The builder's /contents does the same for a sheet the buyer arranges, but it
    is driven by a sheet size an upload-by-size order does not have. Without this
    counterpart a revision request was a dead end: the buyer could resubmit, but
    only ever the same file at the same size the print team had just rejected.
    """
    order = (
        await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")

    owns = _may_touch(request, order)
    if not owns:
        raise HTTPException(status_code=404, detail="Gang sheet order not found")
    if order.status not in _BUYER_EDITABLE:
        raise HTTPException(status_code=409, detail="This order can no longer be edited.")
    if order.sheet_size_id is not None:
        raise HTTPException(status_code=400, detail="This is a gang sheet — edit it in the builder.")
    if not order.product_id:
        raise HTTPException(status_code=400, detail="This order is not linked to a product.")

    w, h = payload.width_in, payload.height_in
    product, unit_price = await _upload_by_size_quote(db, order.product_id, w, h)
    new_subtotal = (unit_price * payload.quantity).quantize(Decimal("0.01"))

    # A job sent back for revision has usually been paid for already. Letting the
    # buyer enlarge it or raise the quantity here would print more than they paid
    # for, with nothing to collect the difference — so a paid job may change its
    # file and shrink, but not grow.
    if order.order_id and new_subtotal > Decimal(str(order.subtotal or 0)):
        raise HTTPException(
            status_code=400,
            detail=(
                f"This job is already paid (${order.subtotal}), so it can't be made bigger or "
                "ordered in a higher quantity here. Keep the size and quantity at or below "
                "what you ordered, or place a new order for the extra."
            ),
        )

    # One design per upload-by-size job, so the artwork set is replaced outright.
    for a in await _load_artworks(db, order.id):
        await db.delete(a)
    await db.flush()

    art = GangSheetArtwork(
        gang_sheet_order_id=order.id,
        file_url=payload.file_url,
        file_name=payload.file_name,
        file_type=payload.file_type,
        width_in=w,
        height_in=h,
        quantity=payload.quantity,
        sort_order=0,
    )
    db.add(art)
    await db.flush()

    order.sheet_name = f'{product.name} — {w}"×{h}"'
    order.sheet_width_in = w
    order.sheet_height_in = h
    order.price_per_sheet = unit_price
    order.sheet_quantity = payload.quantity
    order.subtotal = new_subtotal
    if payload.customer_notes is not None:
        order.customer_notes = payload.customer_notes
    order.layout = [{"artwork_id": str(art.id), "x_in": 0, "y_in": 0, "rotation": 0, "w_in": float(w), "h_in": float(h)}]
    await db.flush()

    # Keep the current version's snapshot accurate; resubmit is what opens a new
    # version, so a plain edit must not spawn one (mirrors rebuild_order).
    arts = await _load_artworks(db, order.id)
    snap = _snapshot(order, arts, order.version or 1)
    vers = list(order.versions or [])
    if vers:
        vers[-1] = snap
    else:
        vers = [snap]
    order.versions = vers

    # Not checked out yet: the cart line snapshotted the old price, label and
    # image, and would otherwise bill the size the buyer just changed away from.
    if not order.order_id:
        from app.models.order import CartItem

        for line in (await db.execute(
            select(CartItem).where(CartItem.gang_sheet_order_id == order.id)
        )).scalars().all():
            line.quantity = order.sheet_quantity
            line.unit_price = unit_price
            line.label = order.sheet_name
            line.image_url = art.file_url

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

    owns = _may_touch(request, order)
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
    if src.sheet_size_id:
        size = (
            await db.execute(select(GangSheetSize).where(GangSheetSize.id == src.sheet_size_id))
        ).scalar_one_or_none()
        price = size.price_per_sheet if size and size.is_active else src.price_per_sheet
    else:
        # Upload-by-size prices off the product's area tiers, not a sheet size.
        # Without this branch a reorder silently billed last year's rate.
        price = src.price_per_sheet
        if src.product_id:
            from app.models.product import Product

            prod = (
                await db.execute(select(Product).where(Product.id == src.product_id))
            ).scalar_one_or_none()
            cfg = (getattr(prod, "gang_sheet_config", None) or {}) if prod else {}
            rate = _upload_by_size_rate(cfg, float(src.sheet_width_in) * float(src.sheet_height_in))
            if rate is not None:
                price = (src.sheet_width_in * src.sheet_height_in * Decimal(str(rate))).quantize(Decimal("0.01"))

    clone = GangSheetOrder(
        reference=await _next_reference(db, src.contact_name or ""),
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

    src_arts = await _load_artworks(db, src.id)
    copies = []
    for art in src_arts:
        copy = GangSheetArtwork(
            gang_sheet_order_id=clone.id,
            file_url=art.file_url,
            file_name=art.file_name,
            file_type=art.file_type,
            width_in=art.width_in,
            height_in=art.height_in,
            quantity=art.quantity,
            sort_order=art.sort_order,
        )
        db.add(copy)
        copies.append(copy)
    await db.flush()

    # Carry the arrangement across. The copies are new rows with new ids, so each
    # placement has to point at its copy — left alone, the layout referenced
    # artwork that no longer belonged to this order and the cart rejected the
    # reorder as having no layout at all.
    id_map = {str(a.id): str(c.id) for a, c in zip(src_arts, copies)}
    clone.layout = [
        {**p, "artwork_id": id_map[str(p.get("artwork_id"))]}
        for p in (src.layout or [])
        if str(p.get("artwork_id")) in id_map
    ]
    arts = await _load_artworks(db, clone.id)
    clone.version = 1
    clone.versions = [_snapshot(clone, arts, 1)]
    await db.flush()
    await db.refresh(clone)
    return _order_row(clone, arts)


# ── Admin router ──────────────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/admin/gang-sheets", tags=["admin-gang-sheets"])


@admin_router.get("/dashboard")
async def admin_dashboard(
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    """Live stats for the gang-sheet admin Dashboard (this brand only).

    Everything is computed from the brand's own gang_sheet_orders — fully
    dynamic, nothing hardcoded. GangSheetOrder is tenant-scoped, so the ORM
    auto-filters to the current brand.
    """
    # Totals
    total_jobs = (await db.execute(select(func.count(GangSheetOrder.id)))).scalar() or 0
    total_sheets = (await db.execute(
        select(func.coalesce(func.sum(GangSheetOrder.sheet_quantity), 0))
    )).scalar() or 0
    total_orders = (await db.execute(
        select(func.count(GangSheetOrder.id)).where(GangSheetOrder.order_id.isnot(None))
    )).scalar() or 0
    total_amount = (await db.execute(
        select(func.coalesce(func.sum(GangSheetOrder.subtotal), 0)).where(GangSheetOrder.order_id.isnot(None))
    )).scalar() or 0

    # Breakdown by status (the review pipeline) — real counts.
    status_rows = (await db.execute(
        select(GangSheetOrder.status, func.count(GangSheetOrder.id)).group_by(GangSheetOrder.status)
    )).all()
    status_breakdown = [{"status": s, "count": int(c)} for s, c in status_rows]

    # Recent designs (latest jobs) + recent orders (jobs that became a paid/placed order).
    recent = (await db.execute(
        select(GangSheetOrder).order_by(GangSheetOrder.created_at.desc()).limit(8)
    )).scalars().all()
    recent_designs = [{
        "reference": o.reference,
        "contact": o.contact_name,
        "status": o.status,
        "sheet_name": o.sheet_name,
        "subtotal": float(o.subtotal),
        "created_at": o.created_at.isoformat() if o.created_at else None,
    } for o in recent]

    recent_ord_rows = (await db.execute(
        select(GangSheetOrder).where(GangSheetOrder.order_id.isnot(None))
        .order_by(GangSheetOrder.created_at.desc()).limit(8)
    )).scalars().all()
    recent_orders = [{
        "reference": o.reference,
        "subtotal": float(o.subtotal),
        "paid": bool(getattr(o, "paid_at", None)),
        "created_at": o.created_at.isoformat() if o.created_at else None,
    } for o in recent_ord_rows]

    return {
        "total_jobs": int(total_jobs),
        "total_sheets": int(total_sheets),
        "total_orders": int(total_orders),
        "total_amount": float(total_amount),
        "status_breakdown": status_breakdown,
        "recent_designs": recent_designs,
        "recent_orders": recent_orders,
    }


# The three ways a brand can sell a gang sheet.
#   gang_sheet     — the buyer arranges designs on a sheet in the builder
#   upload_by_size — one design, printed at an exact size, priced by area
#   upload_own     — the buyer's own finished sheet, printed at a length they pick
# The empty string clears it, which is how the builder is switched off.
GANG_SHEET_TYPES = {"gang_sheet", "upload_by_size", "upload_own", ""}


class GSProductUpdate(BaseModel):
    gang_sheet_enabled: Optional[bool] = None
    # 'gang_sheet' | 'upload_by_size' | 'upload_own' | '' (clear)
    gang_sheet_type: Optional[str] = None
    gang_sheet_config: Optional[dict] = None  # type-specific (upload_by_size tiers etc.)


async def _gs_size_counts(db: AsyncSession) -> dict[str, int]:
    rows = (await db.execute(
        select(GangSheetSize.product_id, func.count(GangSheetSize.id)).group_by(GangSheetSize.product_id)
    )).all()
    return {str(pid): int(c) for pid, c in rows if pid}


@admin_router.get("/products")
async def admin_list_gs_products(
    show_all: bool = False,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Brand products with the gang-sheet builder. Default: only builder-enabled
    products; pass show_all=true to browse every product (to enable more)."""
    from app.models.product import Product

    stmt = select(Product)
    if not show_all:
        stmt = stmt.where(Product.gang_sheet_enabled.is_(True))
    prods = (await db.execute(
        stmt.order_by(Product.gang_sheet_enabled.desc(), Product.name).limit(200)
    )).scalars().all()
    counts = await _gs_size_counts(db)
    return [{
        "id": str(p.id),
        "name": p.name,
        "slug": p.slug,
        "gang_sheet_enabled": bool(p.gang_sheet_enabled),
        "gang_sheet_type": getattr(p, "gang_sheet_type", None),
        "gang_sheet_config": getattr(p, "gang_sheet_config", None),
        "size_count": counts.get(str(p.id), 0),
    } for p in prods]


@admin_router.patch("/products/{product_id}")
async def admin_update_gs_product(
    product_id: uuid.UUID,
    payload: GSProductUpdate,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Enable/disable the builder on a product and set its builder type."""
    from app.models.product import Product

    p = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.gang_sheet_enabled is not None:
        p.gang_sheet_enabled = payload.gang_sheet_enabled
    if payload.gang_sheet_type is not None:
        # 'upload_own' is the third: the buyer brings a sheet that is already
        # laid out, picks how long it runs, and nothing is arranged here.
        if payload.gang_sheet_type not in GANG_SHEET_TYPES:
            raise HTTPException(
                status_code=400,
                detail="gang_sheet_type must be one of: "
                       + ", ".join(repr(t) for t in sorted(GANG_SHEET_TYPES) if t),
            )
        p.gang_sheet_type = payload.gang_sheet_type or None
    if payload.gang_sheet_config is not None:
        p.gang_sheet_config = payload.gang_sheet_config or None
    await db.flush()
    counts = await _gs_size_counts(db)
    return {
        "id": str(p.id),
        "name": p.name,
        "slug": p.slug,
        "gang_sheet_enabled": bool(p.gang_sheet_enabled),
        "gang_sheet_type": getattr(p, "gang_sheet_type", None),
        "gang_sheet_config": getattr(p, "gang_sheet_config", None),
        "size_count": counts.get(str(p.id), 0),
    }


@admin_router.get("/setup")
async def admin_setup(
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    """Onboarding checklist state (this brand) — all live, nothing hardcoded."""
    from app.models.product import Product

    has_sizes = ((await db.execute(select(func.count(GangSheetSize.id)))).scalar() or 0) > 0
    has_products = ((await db.execute(
        select(func.count(Product.id)).where(Product.gang_sheet_enabled.is_(True))
    )).scalar() or 0) > 0
    has_designs = ((await db.execute(select(func.count(GangSheetOrder.id)))).scalar() or 0) > 0
    has_library = ((await db.execute(select(func.count(GangSheetLibraryDesign.id)))).scalar() or 0) > 0
    return {
        "has_products": bool(has_products),
        "has_sizes": bool(has_sizes),
        "has_library": bool(has_library),
        "has_designs": bool(has_designs),
    }


@admin_router.get("/settings")
async def admin_get_gs_settings(
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    """This brand's gang-sheet settings blob (General/Output/Builder/Appearance/Gallery)."""
    import json as _json
    from app.core.tenant_settings import get_setting

    raw = await get_setting(db, "gs_settings")
    if not raw:
        return {}
    try:
        return _json.loads(raw)
    except Exception:
        return {}


@admin_router.put("/settings")
async def admin_save_gs_settings(
    payload: dict, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    """Save this brand's gang-sheet settings blob (per-tenant, namespaced key)."""
    import json as _json
    from app.core.tenant_context import get_current_tenant_id
    from app.core.tenant_settings import scoped_key
    from app.models.system import Settings as PlatformSettings

    key = scoped_key("gs_settings", get_current_tenant_id())
    row = (await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == key)
    )).scalar_one_or_none()
    value = _json.dumps(payload)
    if row:
        row.value = value
    else:
        db.add(PlatformSettings(key=key, value=value))
    await db.flush()
    return payload


@admin_router.get("/sizes")
async def admin_list_sizes(
    product_id: Optional[uuid.UUID] = None,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = select(GangSheetSize)
    if product_id is not None:
        stmt = stmt.where(GangSheetSize.product_id == product_id)
    rows = await db.execute(stmt.order_by(GangSheetSize.sort_order, GangSheetSize.name))
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


# ── Production files: what the print team prints from ─────────────────────────
# A sheet's preview and its print-ready PNG are drawn on request from its
# layout and artwork (services/gang_sheet_render.py) and reached by a signed
# link, so the order page can list them as plain links — like the print apps
# shops know from Shopify — without the browser having to send a sign-in.
FILE_KINDS = ("print", "preview")
FILE_LINK_DAYS = 7
# Below this many DPI a design is "low resolution": the print check's own line
# where edges and text start to look fuzzy (services/artwork/inspect.py).
LOW_RES_DPI = 200


def _file_sig(sheet_id, tenant_id, kind: str, exp: int) -> str:
    import hashlib
    import hmac

    from app.core.config import settings

    # Keyed with both secrets. APP_SECRET_KEY has a default in the code that a
    # deployment may never have changed; the sign-in key cannot be left at its
    # default without sign-in itself being forgeable. Either one kept secret
    # keeps these links unforgeable.
    key = f"{settings.APP_SECRET_KEY}\x00{settings.JWT_SECRET_KEY}".encode()
    msg = f"gang-sheet-file:{sheet_id}:{tenant_id or ''}:{kind}:{exp}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:40]


def file_link(o: GangSheetOrder, kind: str, *, now: float | None = None) -> str:
    """A link to one of the sheet's files, good for FILE_LINK_DAYS. A path on the
    API: the page puts its API address in front."""
    import time

    exp = int((now if now is not None else time.time()) + FILE_LINK_DAYS * 86400)
    return f"/api/v1/gang-sheets/files/{o.id}/{kind}?exp={exp}&sig={_file_sig(o.id, o.tenant_id, kind, exp)}"


def _sheet_kind(o: GangSheetOrder, product_type: str | None) -> str:
    """Which of the three builders made this sheet: the builder that arranges
    designs on a sheet, Upload by size (one design, one size), or a buyer's own
    finished sheet."""
    if product_type == "upload_own":
        return "upload_own"
    if product_type == "upload_by_size" or not o.sheet_size_id:
        return "upload_by_size"
    return "gang_sheet"


def _drawn_layout(o: GangSheetOrder, kind: str, arts: list[GangSheetArtwork]) -> list[dict]:
    """The placements the sheet is drawn from. A buyer's own sheet is stored as
    one artwork with no placement — it is the sheet — so it is placed centred,
    inside the bleed it was sized to. Upload by size records its one placement
    when it is submitted; one from before that is placed the same way."""
    if o.layout:
        return list(o.layout)
    if kind in ("upload_own", "upload_by_size") and arts:
        a = arts[0]
        w, h = float(a.width_in), float(a.height_in)
        return [{"artwork_id": str(a.id), "rotation": 0, "w_in": w, "h_in": h,
                 "x_in": max(0.0, (float(o.sheet_width_in) - w) / 2),
                 "y_in": max(0.0, (float(o.sheet_height_in) - h) / 2)}]
    return []


def _resolution(arts: list[GangSheetArtwork]) -> dict:
    """The print check's verdict on resolution, for the whole sheet: whether any
    design is low resolution, the lowest measured, and which ones."""
    measured = []
    unchecked = 0
    for a in arts:
        insp = getattr(a, "inspection", None) or {}
        dpi = (insp.get("measured") or {}).get("effective_dpi")
        if isinstance(dpi, (int, float)) and dpi > 0:
            measured.append((a.file_name, int(dpi)))
        elif any(f.get("code") == "vector" for f in insp.get("findings") or []):
            continue  # vector: sharp at any size
        else:
            unchecked += 1
    low = [(name, dpi) for name, dpi in measured if dpi < LOW_RES_DPI]
    return {
        "low": bool(low),
        "low_files": [{"name": n, "dpi": d} for n, d in low],
        "lowest_dpi": min((d for _, d in measured), default=None),
        "designs": len(arts),
        "unchecked": unchecked,
        "threshold_dpi": LOW_RES_DPI,
    }


def _too_large(a: GangSheetArtwork) -> bool:
    """Whether the print check measured this file bigger than the print file
    draws (gang_sheet_render.MAX_SOURCE_PIXELS) — known without fetching it."""
    from app.services.gang_sheet_render import MAX_SOURCE_PIXELS

    px = ((getattr(a, "inspection", None) or {}).get("measured") or {}).get("pixels") or ""
    try:
        w, h = (int(n) for n in str(px).lower().split("x"))
    except ValueError:
        return False
    return w * h > MAX_SOURCE_PIXELS


def _print_name(o: GangSheetOrder) -> str:
    w, h = f"{float(o.sheet_width_in):g}", f"{float(o.sheet_height_in):g}"
    return f"{o.reference}-{w}x{h}in-300dpi.png"


async def production_details(db: AsyncSession, sales_order_id) -> list[dict]:
    """What production needs for every gang sheet on a sales order, as the order
    page lists it under the sheet's line: its size, a preview, the print-ready
    file, where the buyer and the shop edit it, and whether any design is low
    resolution. One shape for all three builders."""
    from app.services.gang_sheet_render import DRAWABLE

    rows = (await db.execute(
        select(GangSheetOrder)
        .where(GangSheetOrder.order_id == sales_order_id)
        .order_by(GangSheetOrder.created_at)
    )).scalars().all()
    if not rows:
        return []
    pids = [o.product_id for o in rows if o.product_id]
    types: dict[str, str | None] = {}
    if pids:
        from sqlalchemy import text as _text

        for pid, ptype, slug in (await db.execute(_text(
            "SELECT CAST(id AS text), gang_sheet_type, slug FROM products WHERE CAST(id AS text) = ANY(:ids)"
        ), {"ids": [str(p) for p in pids]})).all():
            types[pid] = (ptype, slug)

    out = []
    for o in rows:
        arts = await _load_artworks(db, o.id)
        ptype, slug = types.get(str(o.product_id), (None, None)) if o.product_id else (None, None)
        kind = _sheet_kind(o, ptype)
        layout = _drawn_layout(o, kind, arts)
        placed = {str(p.get("artwork_id")) for p in layout}
        used = [a for a in arts if str(a.id) in placed]
        # What the PNG cannot hold: vector and layered files, and any too big
        # to draw. Production prints those from the original.
        left_out = sorted({a.file_name for a in used
                           if (a.file_type or "").lower() not in DRAWABLE or _too_large(a)})

        if kind == "upload_own" and arts:
            # The buyer's own sheet is already the print file: theirs, untouched.
            print_file = {"url": arts[0].file_url, "name": arts[0].file_name, "signed": False}
        elif kind == "upload_by_size" and used and len(left_out) == len(used):
            # One design, and the PNG cannot hold it: the design is the file.
            print_file = {"url": used[0].file_url, "name": used[0].file_name, "signed": False}
        elif layout:
            print_file = {"url": file_link(o, "print"), "name": _print_name(o), "signed": True}
        else:
            print_file = None

        # Where the buyer changes it, while they still may: the builder for a
        # sheet they arranged, the product page for Upload by size. A sheet they
        # uploaded finished has no editor — it is changed by uploading another.
        edit = None
        if o.status in _BUYER_EDITABLE and kind == "gang_sheet":
            edit = f"/gang-sheets?edit={o.id}" + (f"&product={o.product_id}" if o.product_id else "")
        elif o.status in _BUYER_EDITABLE and kind == "upload_by_size" and slug:
            edit = f"/products/{slug}?revise={o.id}"

        out.append({
            "id": str(o.id),
            "reference": o.reference,
            "kind": kind,
            "status": o.status,
            "sheet_name": o.sheet_name,
            "width_in": float(o.sheet_width_in),
            "height_in": float(o.sheet_height_in),
            "quantity": o.sheet_quantity,
            # A buyer's own sheet is its own preview — one file the size of
            # the sheet, opened as it is rather than drawn again.
            "preview_url": (arts[0].file_url if kind == "upload_own" and arts
                            else file_link(o, "preview") if layout else None),
            "print_file": print_file,
            # Not laid out yet: a builder sheet the shop has still to arrange.
            "needs_layout": kind == "gang_sheet" and not layout,
            "left_out": left_out,
            "edit_url": edit,
            "admin_edit_url": f"/admin/gang-sheets?sheet={o.id}",
            "originals": [{"name": a.file_name, "url": a.file_url} for a in arts],
            "resolution": _resolution(arts),
        })
    return out


@public_router.get("/files/{sheet_id}/{kind}")
async def sheet_file(sheet_id: uuid.UUID, kind: str, exp: int, sig: str):
    """A sheet's preview or print-ready PNG, drawn now from its layout.

    Reached by the signed link the order page lists (file_link), not by a
    sign-in — a download link the browser follows sends none. The signature
    names the sheet, its brand, the kind of file and when the link stops
    working, so it opens that one file and nothing else.
    """
    import asyncio
    import hmac
    import time

    from fastapi.responses import Response, StreamingResponse
    from sqlalchemy import text as _text

    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping
    from app.services import gang_sheet_render as render

    if kind not in FILE_KINDS:
        raise HTTPException(status_code=404, detail="No such file")
    if exp < time.time():
        raise HTTPException(status_code=410, detail="This link has expired. Open the order again for a new one.")

    # Looked up across brands on purpose — the link carries no sign-in and the
    # API address names no shop — and then held to the brand the link was
    # signed for.
    previous = is_scoping_bypassed()
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(_text("SELECT set_config('app.bypass_rls', 'on', true)"))
            o = (await db.execute(select(GangSheetOrder).where(GangSheetOrder.id == sheet_id))).scalar_one_or_none()
            if o is None or not hmac.compare_digest(sig, _file_sig(o.id, o.tenant_id, kind, exp)):
                raise HTTPException(status_code=404, detail="No such file")
            arts = await _load_artworks(db, o.id)
            ptype = None
            if o.product_id:
                ptype = (await db.execute(_text("SELECT gang_sheet_type FROM products WHERE id = :p"),
                                          {"p": str(o.product_id)})).scalar()
    finally:
        set_bypass_scoping(previous)

    sheet_kind = _sheet_kind(o, ptype)
    layout = _drawn_layout(o, sheet_kind, arts)
    if not layout:
        raise HTTPException(status_code=409, detail="This sheet has not been laid out yet.")
    w_in, h_in = float(o.sheet_width_in), float(o.sheet_height_in)
    dpi = render.PRINT_DPI if kind == "print" else render.preview_dpi(w_in, h_in)
    px_w, px_h = render.sheet_pixels(w_in, h_in, dpi)
    if px_w * px_h > render.MAX_SHEET_PIXELS:
        raise HTTPException(status_code=413, detail="This sheet is too large to draw.")

    wanted = {str(p.get("artwork_id")) for p in layout}
    art_rows = [_art_row(a) for a in arts]
    sources, missing = await render.load_sources(art_rows, wanted)
    sheet = render.plan(w_in, h_in, layout, {r["id"]: r for r in art_rows}, sources, dpi, missing)

    if kind == "preview":
        data = await asyncio.to_thread(lambda: b"".join(render.png_stream(sheet, checker=True)))
        return Response(data, media_type="image/png", headers={
            "Content-Disposition": f'inline; filename="{o.reference}-preview.png"',
            "Cache-Control": "private, max-age=600",
        })
    headers = {
        "Content-Disposition": f'attachment; filename="{_print_name(o)}"',
        "Cache-Control": "private, max-age=600",
        "X-Sheet-Pixels": f"{sheet.width}x{sheet.height}",
    }
    if sheet.left_out:
        # Said where a download can carry it: the file itself has no room. The
        # names are the buyer's own, so percent-encoded — a header is Latin-1.
        from urllib.parse import quote

        headers["X-Left-Out"] = quote("; ".join(n for n, _ in sheet.left_out)[:600], safe=" ;()")
    return StreamingResponse(render.png_stream(sheet), media_type="image/png", headers=headers)


@admin_router.get("/by-order/{sales_order_id}")
async def admin_sheets_for_order(
    sales_order_id: uuid.UUID,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Every gang sheet paid for on a sales order, with artwork and layout.

    A paid gang sheet arrives as an order line with no variant behind it, so the
    order page has nothing to show on its own. This is the bridge: the sheets
    link back through `order_id`, and production needs the artwork and placements
    from right there rather than hunting for the reference on another screen.
    """
    rows = (await db.execute(
        select(GangSheetOrder)
        .where(GangSheetOrder.order_id == sales_order_id)
        .order_by(GangSheetOrder.created_at)
    )).scalars().all()

    sheets = []
    for o in rows:
        row = _order_row(o, await _load_artworks(db, o.id), admin=True)
        # The size record carries bleed/spacing, which the preview needs to draw
        # the safe area the same way the buyer saw it.
        if o.sheet_size_id:
            size = (await db.execute(
                select(GangSheetSize).where(GangSheetSize.id == o.sheet_size_id)
            )).scalar_one_or_none()
            if size:
                row["bleed_in"] = float(getattr(size, "bleed_in", 0) or 0)
                row["spacing_in"] = float(getattr(size, "spacing_in", 0) or 0)
        else:
            # Upload-by-size: the sheet IS the design, cut to that size. There is
            # no margin to trim, so drawing a bleed line here would mark a
            # correct job as running past a safe area that doesn't exist.
            row["bleed_in"] = 0.0
            row["spacing_in"] = 0.0
        sheets.append(row)

    # The production files, the same ones the order's lines list.
    production = {d["id"]: d for d in await production_details(db, sales_order_id)}
    for row in sheets:
        row["production"] = production.get(row["id"])
    return {"sheets": sheets, "count": len(sheets)}


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
