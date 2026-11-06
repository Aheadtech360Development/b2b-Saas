"""T-shirt designer: the design a buyer made, and its finished files.

Built the way the gang sheet builder is: a buyer's design is a job with a
reference, the same review flow (submitted, in review, approved, production,
completed, or sent back), the same rule about who may touch it, and a history
of every version sent in. Everything is tenant-scoped through TenantMixin, so a
shop only ever sees its own designs.

The one difference is where the finished files come from. A gang sheet's print
file is drawn here, from its artwork files and layout. A t-shirt design is text
in web fonts, curved type and canvas effects, which only a browser draws
faithfully, so the designer renders the finished files and sends them: for each
shirt and each printed side, a preview of the garment with the design on it and
the print artwork alone at 300 DPI. They are checked here and kept in ImageKit,
in the shop's folder, with a row each in tshirt_design_outputs.

The price is the designer's own quote until the designer is connected to the
shop's products and price tables: it is recorded as quoted, not charged.
"""
import io
import json
import logging
import os
import re
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.api.v1.gang_sheets import (
    STATUS_APPROVED,
    STATUS_COMPLETED,
    STATUS_IN_REVIEW,
    STATUS_PRODUCTION,
    STATUS_REJECTED,
    STATUS_REVISION,
    STATUS_SUBMITTED,
    STATUS_TIMELINE,
    _ADMIN_STATUSES,
    _BUYER_EDITABLE,
    _initials,
    _submitter,
)
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.tenant_media import resolve_media_folder_key
from app.middleware.auth_middleware import require_admin
from app.models.base import BaseModel as DBBaseModel
from app.models.base import TenantMixin

logger = logging.getLogger(__name__)

VIEWS = ("front", "back", "left", "right")
# preview: the garment in its colour with the design on it, for people to look at.
# print:   the artwork alone, transparent, at print size, for the printer.
OUTPUT_KINDS = ("preview", "print")
# A whole shirt front at 300 DPI is about 10,000 px tall; past this a file is
# not a print file but a mistake.
MAX_OUTPUT_PX = 12_000
MAX_OUTPUT_BYTES = 60 * 1024 * 1024
# The design document is the canvas's own objects. A pasted photo is held as a
# small copy inside it; a document past this is not a design.
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
_SHIRT_KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}:[a-z0-9][a-z0-9-]{0,80}$")


# ── Models ────────────────────────────────────────────────────────────────────


class TShirtDesign(TenantMixin, DBBaseModel):
    """One buyer's design: every shirt in it, its sizes, and where it stands."""

    __tablename__ = "tshirt_designs"

    reference: Mapped[str] = mapped_column(String(40), nullable=False)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Untitled design")
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="print")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=STATUS_SUBMITTED)
    # The designer's whole document: each shirt's design by view, sizes, roster.
    document: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    shirt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quoted_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    customer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    supplier_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revision_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    versions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Set when the design is paid for through the cart.
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class TShirtDesignOutput(TenantMixin, DBBaseModel):
    """A finished file: one shirt, one side, a preview or the print artwork."""

    __tablename__ = "tshirt_design_outputs"

    design_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tshirt_designs.id", ondelete="CASCADE"), nullable=False
    )
    shirt_key: Mapped[str] = mapped_column(String(170), nullable=False)
    view: Mapped[str] = mapped_column(String(10), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    # ImageKit's id for the file, so a replaced file can be removed there too.
    file_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    file_name: Mapped[str] = mapped_column(String(300), nullable=False)
    width_px: Mapped[int] = mapped_column(Integer, nullable=False)
    height_px: Mapped[int] = mapped_column(Integer, nullable=False)
    dpi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


# ── Payloads ──────────────────────────────────────────────────────────────────


class DesignIn(BaseModel):
    document: dict[str, Any]
    quoted_total: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("1000000"))
    contact_name: Optional[str] = Field(default=None, max_length=255)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    customer_notes: Optional[str] = Field(default=None, max_length=2000)


class StatusIn(BaseModel):
    status: str
    supplier_notes: Optional[str] = Field(default=None, max_length=4000)


class NotesIn(BaseModel):
    internal_notes: Optional[str] = Field(default=None, max_length=8000)


# ── Helpers ───────────────────────────────────────────────────────────────────


def summarise_document(doc: dict[str, Any]) -> dict[str, Any]:
    """Check a design document's shape and read what the job record keeps.

    Raises ValueError with a message for the buyer when it is not a design.
    """
    if not isinstance(doc, dict):
        raise ValueError("The design could not be read.")
    if len(json.dumps(doc, separators=(",", ":"))) > MAX_DOCUMENT_BYTES:
        raise ValueError("This design is too large to save. Use smaller pictures and try again.")
    products = doc.get("products")
    if not isinstance(products, list) or not products:
        raise ValueError("Add a garment to the design before sending it.")
    shirts: list[str] = []
    for p in products:
        if not isinstance(p, dict) or not isinstance(p.get("colorIds"), list):
            raise ValueError("The design's garments could not be read.")
        for c in p["colorIds"]:
            key = f"{p.get('garmentId')}:{c}"
            if not _SHIRT_KEY.match(key):
                raise ValueError("The design's garments could not be read.")
            shirts.append(key)
    designs = doc.get("designs")
    if not isinstance(designs, dict):
        raise ValueError("The design could not be read. Reopen it in the designer and save again.")
    quantities = doc.get("quantities") if isinstance(doc.get("quantities"), dict) else {}
    total = 0
    for key, sizes in quantities.items():
        if key in shirts and isinstance(sizes, dict):
            total += sum(int(n) for n in sizes.values() if isinstance(n, (int, float)) and n > 0)
    method = doc.get("method") if doc.get("method") in ("print", "embroidery") else "print"
    name = str(doc.get("name") or "Untitled design").strip()[:120] or "Untitled design"
    return {"shirts": shirts, "shirt_count": len(shirts), "total_qty": total, "method": method, "name": name}


def check_output(shirt_key: str, view: str, kind: str, shirts: list[str]) -> None:
    """Whether a finished file names a real shirt, side and kind of this design."""
    if kind not in OUTPUT_KINDS:
        raise ValueError("Unknown kind of file.")
    if view not in VIEWS:
        raise ValueError("Unknown side of the shirt.")
    if shirt_key not in shirts:
        raise ValueError("That shirt is not in this design.")


def read_png(content: bytes) -> tuple[int, int, Optional[int]]:
    """The width, height and DPI of a PNG, or ValueError when it is not one we keep."""
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(content))
        fmt = img.format
        w, h = img.size
        dpi = img.info.get("dpi")
    except Exception:
        raise ValueError("The file could not be read as a picture.")
    if fmt != "PNG":
        raise ValueError("Finished files must be PNG.")
    if w < 1 or h < 1 or w > MAX_OUTPUT_PX or h > MAX_OUTPUT_PX:
        raise ValueError(f"Finished files must be at most {MAX_OUTPUT_PX} pixels on a side.")
    return w, h, (round(dpi[0]) if dpi else None)


def output_folder(reference: str) -> str:
    """Where a design's files go inside the shop's ImageKit folder."""
    safe = re.sub(r"[^A-Za-z0-9-]", "", reference) or "design"
    return f"tshirt-designs/{safe}"


def output_name(shirt_key: str, view: str, kind: str) -> str:
    return f"{shirt_key.replace(':', '-')}-{view}-{kind}.png"


async def _next_reference(db: AsyncSession, who: str = "") -> str:
    """A reference somebody can read down a phone, in the gang sheets' shape:
    the buyer's initials, the month, and a running count."""
    n = (await db.execute(select(func.count(TShirtDesign.id)))).scalar() or 0
    stamp = f"{datetime.now(UTC):%y%m}"
    tag = _initials(who)
    return f"TS-{tag}-{stamp}-{n + 1:04d}" if tag else f"TS-{stamp}-{n + 1:04d}"


def _may_touch(request: Request, design: TShirtDesign) -> bool:
    """Same rule as a gang sheet: a design made signed in belongs to that account;
    one made as a guest belongs to whoever holds its id."""
    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    if design.user_id is None and design.company_id is None:
        return True
    if user_id and str(design.user_id) == str(user_id):
        return True
    return bool(company_id and str(design.company_id) == str(company_id))


def _snapshot(d: TShirtDesign, version: int) -> dict:
    return {
        "version": version,
        "at": datetime.now(UTC).isoformat(),
        "document": d.document,
        "quoted_total": float(d.quoted_total),
        "total_qty": d.total_qty,
    }


def _output_row(o: TShirtDesignOutput) -> dict:
    return {
        "id": str(o.id),
        "shirt_key": o.shirt_key,
        "view": o.view,
        "kind": o.kind,
        "file_url": o.file_url,
        "file_name": o.file_name,
        "width_px": o.width_px,
        "height_px": o.height_px,
        "dpi": o.dpi,
    }


def _design_row(d: TShirtDesign, outputs: list[TShirtDesignOutput] | None = None, admin: bool = False) -> dict:
    data = {
        "id": str(d.id),
        "reference": d.reference,
        "name": d.name,
        "method": d.method,
        "status": d.status,
        "status_timeline": STATUS_TIMELINE,
        "version": d.version,
        "shirt_count": d.shirt_count,
        "total_qty": d.total_qty,
        "quoted_total": float(d.quoted_total),
        "contact_name": d.contact_name or "Guest",
        "contact_email": d.contact_email,
        "customer_notes": d.customer_notes,
        "supplier_notes": d.supplier_notes,
        "revision_count": d.revision_count,
        "order_id": str(d.order_id) if d.order_id else None,
        "paid": bool(d.paid_at),
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }
    if outputs is not None:
        data["outputs"] = [_output_row(o) for o in outputs]
        data["document"] = d.document
    if admin:
        data["internal_notes"] = d.internal_notes
        data["versions"] = d.versions or []
    return data


async def _load(db: AsyncSession, design_id: uuid.UUID) -> TShirtDesign:
    d = (await db.execute(select(TShirtDesign).where(TShirtDesign.id == design_id))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Design not found")
    return d


async def _outputs(db: AsyncSession, design_id: uuid.UUID) -> list[TShirtDesignOutput]:
    return list((await db.execute(
        select(TShirtDesignOutput)
        .where(TShirtDesignOutput.design_id == design_id)
        .order_by(TShirtDesignOutput.shirt_key, TShirtDesignOutput.view, TShirtDesignOutput.kind)
    )).scalars().all())


async def _forget_file(o: TShirtDesignOutput, folder: str | None) -> None:
    """Remove a replaced file from ImageKit. A file left behind costs storage,
    not correctness, so a failure here never fails the request."""
    if not o.file_id:
        return
    from app.services import imagekit_service

    try:
        await imagekit_service.delete_file(o.file_id, expected_tenant=folder)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not remove replaced t-shirt file %s: %s", o.file_id, exc)


async def _store(content: bytes, name: str, reference: str, design_id: uuid.UUID,
                 request: Request, db: AsyncSession) -> tuple[str, str | None]:
    """Keep a finished file: in ImageKit, in the shop's folder; on this
    server's disk when ImageKit is not set up, as gang sheet artwork does."""
    from app.services import imagekit_service

    if imagekit_service.is_configured():
        folder = await resolve_media_folder_key(request, db)
        try:
            result = await imagekit_service.upload_bytes(
                content, name, tenant_id=folder, subfolder=output_folder(reference),
            )
            return result["url"], result.get("file_id")
        except Exception as exc:  # noqa: BLE001 — fall back to local storage
            logger.warning("ImageKit t-shirt upload failed: %s", exc)

    local_dir = f"/app/media/tshirt-designs/{design_id}"
    os.makedirs(local_dir, exist_ok=True)
    with open(f"{local_dir}/{name}", "wb") as fh:
        fh.write(content)
    return f"/media/tshirt-designs/{design_id}/{name}", None


# ── Buyer routes ──────────────────────────────────────────────────────────────

public_router = APIRouter(prefix="/tshirt-designs", tags=["tshirt-designs"])


@public_router.post("", status_code=status.HTTP_201_CREATED)
async def submit_design(payload: DesignIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Send a design in. Its finished files follow, one request each."""
    await enforce_rate_limit(request, scope="tshirt_submit", limit=30, window=60)
    try:
        summary = summarise_document(payload.document)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    who_name, who_email = await _submitter(request, db, payload)
    d = TShirtDesign(
        reference=await _next_reference(db, who_name or ""),
        company_id=getattr(request.state, "company_id", None),
        user_id=getattr(request.state, "user_id", None),
        contact_email=who_email,
        contact_name=who_name,
        name=summary["name"],
        method=summary["method"],
        status=STATUS_SUBMITTED,
        document=payload.document,
        shirt_count=summary["shirt_count"],
        total_qty=summary["total_qty"],
        quoted_total=payload.quoted_total,
        customer_notes=payload.customer_notes,
        version=1,
    )
    db.add(d)
    await db.flush()
    d.versions = [_snapshot(d, 1)]
    await db.flush()
    await db.refresh(d)
    return _design_row(d, [])


@public_router.get("/mine")
async def my_designs(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """The signed-in buyer's designs, newest first."""
    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    if not user_id and not company_id:
        raise HTTPException(status_code=401, detail="Sign in to see your designs.")
    q = select(TShirtDesign).order_by(TShirtDesign.created_at.desc()).limit(200)
    q = q.where(TShirtDesign.company_id == company_id) if company_id else q.where(TShirtDesign.user_id == user_id)
    return [_design_row(d) for d in (await db.execute(q)).scalars().all()]


@public_router.get("/{design_id}")
async def my_design(design_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    d = await _load(db, design_id)
    if not _may_touch(request, d):
        raise HTTPException(status_code=404, detail="Design not found")
    return _design_row(d, await _outputs(db, d.id))


@public_router.patch("/{design_id}")
async def update_design(design_id: uuid.UUID, payload: DesignIn, request: Request,
                        db: AsyncSession = Depends(get_db)) -> dict:
    """Send a changed design. Allowed while it is still the buyer's to change;
    its finished files are cleared, because they show the old design, and the
    designer sends new ones."""
    d = await _load(db, design_id)
    if not _may_touch(request, d):
        raise HTTPException(status_code=404, detail="Design not found")
    if d.status not in _BUYER_EDITABLE:
        raise HTTPException(status_code=409, detail="This design is with the print team and can no longer be changed.")
    try:
        summary = summarise_document(payload.document)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    folder = await resolve_media_folder_key(request, db)
    for o in await _outputs(db, d.id):
        await _forget_file(o, folder)
        await db.delete(o)
    d.document = payload.document
    d.name = summary["name"]
    d.method = summary["method"]
    d.shirt_count = summary["shirt_count"]
    d.total_qty = summary["total_qty"]
    d.quoted_total = payload.quoted_total
    if payload.customer_notes is not None:
        d.customer_notes = payload.customer_notes
    # Sent back for changes: this is the resubmission.
    if d.status == STATUS_REVISION:
        d.status = STATUS_IN_REVIEW
        d.revision_count = (d.revision_count or 0) + 1
    d.version = (d.version or 1) + 1
    d.versions = [*(d.versions or []), _snapshot(d, d.version)]
    await db.flush()
    await db.refresh(d)
    return _design_row(d, [])


@public_router.post("/{design_id}/outputs", status_code=status.HTTP_201_CREATED)
async def add_output(
    design_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    shirt_key: str = Form(...),
    view: str = Form(...),
    kind: str = Form(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """One finished file for one shirt and side. Sending the same shirt, side
    and kind again replaces the file."""
    await enforce_rate_limit(request, scope="tshirt_output", limit=120, window=60)
    d = await _load(db, design_id)
    if not _may_touch(request, d):
        raise HTTPException(status_code=404, detail="Design not found")
    if d.status not in _BUYER_EDITABLE:
        raise HTTPException(status_code=409, detail="This design is with the print team and can no longer be changed.")
    try:
        check_output(shirt_key, view, kind, summarise_document(d.document)["shirts"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    content = b""
    while True:
        chunk = await file.read(1 << 20)
        if not chunk:
            break
        content += chunk
        if len(content) > MAX_OUTPUT_BYTES:
            raise HTTPException(status_code=413, detail=f"File is too large (max {MAX_OUTPUT_BYTES // (1024 * 1024)} MB)")
    try:
        width, height, dpi = read_png(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    name = output_name(shirt_key, view, kind)
    url, file_id = await _store(content, name, d.reference, d.id, request, db)

    folder = await resolve_media_folder_key(request, db)
    old = (await db.execute(select(TShirtDesignOutput).where(
        TShirtDesignOutput.design_id == d.id,
        TShirtDesignOutput.shirt_key == shirt_key,
        TShirtDesignOutput.view == view,
        TShirtDesignOutput.kind == kind,
    ))).scalars().all()
    for o in old:
        await _forget_file(o, folder)
        await db.delete(o)
    row = TShirtDesignOutput(
        design_id=d.id, shirt_key=shirt_key, view=view, kind=kind,
        file_url=url, file_id=file_id, file_name=name, width_px=width, height_px=height, dpi=dpi,
    )
    db.add(row)
    await db.flush()
    return _output_row(row)


# ── Shop routes ───────────────────────────────────────────────────────────────

admin_router = APIRouter(prefix="/admin/tshirt-designs", tags=["admin-tshirt-designs"],
                         dependencies=[Depends(require_admin)])


@admin_router.get("")
async def admin_list(status_filter: Optional[str] = None, db: AsyncSession = Depends(get_db)) -> list[dict]:
    q = select(TShirtDesign).order_by(TShirtDesign.created_at.desc()).limit(500)
    if status_filter:
        q = q.where(TShirtDesign.status == status_filter)
    return [_design_row(d, admin=True) for d in (await db.execute(q)).scalars().all()]


@admin_router.get("/{design_id}")
async def admin_detail(design_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    d = await _load(db, design_id)
    return _design_row(d, await _outputs(db, d.id), admin=True)


@admin_router.patch("/{design_id}/status")
async def admin_set_status(design_id: uuid.UUID, payload: StatusIn, db: AsyncSession = Depends(get_db)) -> dict:
    if payload.status not in _ADMIN_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status.")
    d = await _load(db, design_id)
    d.status = payload.status
    if payload.supplier_notes is not None:
        d.supplier_notes = payload.supplier_notes
    await db.flush()
    await db.refresh(d)
    return _design_row(d, await _outputs(db, d.id), admin=True)


@admin_router.patch("/{design_id}/notes")
async def admin_set_notes(design_id: uuid.UUID, payload: NotesIn, db: AsyncSession = Depends(get_db)) -> dict:
    d = await _load(db, design_id)
    d.internal_notes = payload.internal_notes
    await db.flush()
    await db.refresh(d)
    return _design_row(d, admin=True)


# Re-exported for the shop's screens and tests.
__all__ = [
    "TShirtDesign", "TShirtDesignOutput", "public_router", "admin_router",
    "summarise_document", "check_output", "read_png", "output_folder", "output_name",
    "STATUS_APPROVED", "STATUS_COMPLETED", "STATUS_IN_REVIEW", "STATUS_PRODUCTION", "STATUS_REJECTED",
]
