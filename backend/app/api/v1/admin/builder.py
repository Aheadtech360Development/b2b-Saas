"""Admin API — the visual website builder.

Under /admin/storefront so it takes the "storefront" permission, like the rest
of the shop's design.

Nothing here changes what shoppers see except two actions, both explicit:
Publish (which makes the draft the live version) and the render-mode switch
(which moves the storefront from the imported theme to the builder, or back).
Opening the builder, editing, saving and previewing all happen to the draft.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.builder import BuilderFont, BuilderSite, BuilderVersion
from app.services.builder import resolve, site as site_svc
from app.services.builder.schema import blocking
from app.services.builder.starter import starter_document

router = APIRouter(prefix="/admin/storefront/builder", tags=["admin", "builder"])

MAX_FONT_BYTES = 2_000_000
# What a font file starts with. The extension is a claim; these bytes are the
# file saying what it is.
_FONT_MAGIC = {
    "woff2": (b"wOF2",),
    "woff": (b"wOFF",),
    "ttf": (b"\x00\x01\x00\x00", b"true"),
    "otf": (b"OTTO",),
}
_FAMILY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$")


def _tenant(request: Request) -> uuid.UUID:
    raw = getattr(request.state, "tenant_id", None)
    if not raw:
        raise HTTPException(status_code=400, detail="Open a brand's admin to work on its site.")
    return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))


async def _seed(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    """The starter, dressed in what the brand already has."""
    row = (await db.execute(text(
        "SELECT t.name, b.store_name, b.primary_color, "
        "CAST(b.header_menu_id AS text) AS header_menu, CAST(b.footer_menu_id AS text) AS footer_menu "
        "FROM tenants t LEFT JOIN tenant_branding b ON b.tenant_id = t.id WHERE t.id = CAST(:t AS uuid)"
    ), {"t": str(tenant_id)})).first()
    header_menu = (row.header_menu if row else "") or ""
    if not header_menu:
        header_menu = (await db.execute(text(
            "SELECT CAST(id AS text) FROM tenant_menus WHERE tenant_id = CAST(:t AS uuid) "
            "ORDER BY created_at LIMIT 1"
        ), {"t": str(tenant_id)})).scalar() or ""
    return starter_document(
        store_name=(row.store_name or row.name) if row else "",
        primary=(row.primary_color if row else "") or "",
        header_menu=header_menu,
        footer_menu=(row.footer_menu if row else "") or "",
    )


async def _state(db: AsyncSession, site: BuilderSite) -> dict[str, Any]:
    live_number = None
    if site.published_version_id:
        live_number = (await db.execute(
            select(BuilderVersion.number).where(BuilderVersion.id == site.published_version_id)
        )).scalar()
    return {
        "draft": site.draft or {},
        "revision": site.draft_revision,
        "mode": site.render_mode,
        "liveVersion": live_number,
        "versions": await site_svc.versions(db, site),
        "keepVersions": site_svc.KEEP_VERSIONS,
    }


@router.get("")
async def get_site(request: Request, _: None = Depends(require_admin),
                   db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """The builder as the editor needs it. First visit makes a starter draft —
    in legacy mode, so the live storefront is exactly what it was."""
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        site = await site_svc.ensure_site(db, tid, await _seed(db, tid))
        await db.commit()
    return await _state(db, site)


class DraftIn(BaseModel):
    draft: dict = Field(default_factory=dict)
    revision: int | None = None


@router.put("/draft")
async def save_draft(data: DraftIn, request: Request, _: None = Depends(require_admin),
                     db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    try:
        site = await site_svc.save_draft(db, site, data.draft, data.revision)
    except site_svc.DraftConflict as exc:
        raise HTTPException(status_code=409, detail={
            "code": "DRAFT_CONFLICT", "revision": exc.current_revision,
            "message": "This site was changed in another window. Reload to get the latest before saving.",
        })
    await db.commit()
    return {"revision": site.draft_revision}


@router.post("/validate")
async def validate_draft(request: Request, _: None = Depends(require_admin),
                         db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    issues = await site_svc.check(db, site)
    return {"ok": not blocking(issues), "issues": [i.as_dict() for i in issues]}


class PublishIn(BaseModel):
    note: str | None = None


@router.post("/publish")
async def publish(data: PublishIn, request: Request, _: None = Depends(require_admin),
                  db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Make the draft live — all of it, or none of it.

    A draft with any error is refused and the live site is untouched. Note
    that publishing does not switch the storefront to the builder; a brand on
    its imported theme can publish and preview as often as it likes first.
    """
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    try:
        result = await site_svc.publish(
            db, site, user_id=getattr(request.state, "user_id", None), note=data.note,
        )
        await db.commit()
    except site_svc.PublishBlocked as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail={
            "code": "PUBLISH_BLOCKED",
            "message": "Nothing was published — fix these first. Your live site has not changed.",
            "issues": [i.as_dict() for i in exc.issues],
        })
    except Exception:
        await db.rollback()
        raise
    site = await site_svc.get_site(db, tid)
    return {"version": result.version.number, "warnings": [w.as_dict() for w in result.warnings],
            # Nothing had changed since the live version, so no new one was made.
            "unchanged": result.unchanged,
            # Older versions removed to keep history inside its limit — said
            # here so the editor can tell the merchant which.
            "pruned": result.pruned, "keepVersions": site_svc.KEEP_VERSIONS,
            **(await _state(db, site))}  # type: ignore[arg-type]


@router.get("/versions")
async def list_versions(request: Request, _: None = Depends(require_admin),
                        db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    site = await site_svc.get_site(db, _tenant(request))
    return await site_svc.versions(db, site) if site else []


class RollbackIn(BaseModel):
    version_id: str


@router.post("/rollback")
async def rollback(data: RollbackIn, request: Request, _: None = Depends(require_admin),
                   db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    try:
        version = await site_svc.rollback(db, site, data.version_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    await db.commit()
    site = await site_svc.get_site(db, tid)
    return {"version": version.number, **(await _state(db, site))}  # type: ignore[arg-type]


class PinIn(BaseModel):
    pinned: bool


@router.put("/versions/{version_id}/pin")
async def pin_version(version_id: str, data: PinIn, request: Request, _: None = Depends(require_admin),
                      db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Keep a version out of the history limit — or let it go again."""
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    try:
        await site_svc.set_pinned(db, site, version_id, data.pinned)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except site_svc.PinRefused as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await db.commit()
    return await _state(db, site)


class ModeIn(BaseModel):
    mode: str


@router.put("/mode")
async def set_mode(data: ModeIn, request: Request, _: None = Depends(require_admin),
                   db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Switch the storefront between the imported theme and the builder.

    Both directions are one click, and going back to the imported theme puts
    it back exactly as it was — the builder never touched it.
    """
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    try:
        await site_svc.set_mode(db, site, data.mode)
    except site_svc.ModeRefused as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await db.commit()
    return await _state(db, site)


@router.post("/reset")
async def reset_draft(request: Request, _: None = Depends(require_admin),
                      db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Start the draft over from the starter. The live version is untouched."""
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    site = await site_svc.save_draft(db, site, await _seed(db, tid), None)
    await db.commit()
    return await _state(db, site)


@router.get("/preview")
async def preview(request: Request, route: str = "home", slug: str = "", q: str = "",
                  page: int = 1, sort: str = "", template: str = "", _: None = Depends(require_admin),
                  db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """The draft, rendered with real data, for the editor and the preview tab.

    Admin-only, because a draft is not public — and it never touches the
    published version or the render mode.
    """
    tid = _tenant(request)
    site = await site_svc.get_site(db, tid)
    if site is None:
        raise HTTPException(status_code=404, detail="Open the builder first.")
    return await resolve.render_payload(db, tid, site.draft or {}, route=route, slug=slug,
                                        query=q, page=max(1, page), sort=sort, version=None,
                                        template_id=template)


class LookupIn(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=500)


@router.post("/products/lookup")
async def lookup_products(data: LookupIn, request: Request, _: None = Depends(require_admin),
                          db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Names for products the site refers to by id — the ones a template is
    assigned to, which a search would only find by name."""
    tid = _tenant(request)
    ids = [str(u) for u in (resolve._uuid(i) for i in data.ids) if u]
    if not ids:
        return []
    rows = (await db.execute(text(
        "SELECT CAST(id AS text) AS id, name, slug, status FROM products "
        "WHERE tenant_id = CAST(:t AS uuid) AND CAST(id AS text) = ANY(:ids)"
    ), {"t": str(tid), "ids": ids})).all()
    return [{"id": r.id, "name": r.name, "slug": r.slug, "status": r.status} for r in rows]


# ── Fonts ─────────────────────────────────────────────────────────────────────

def _font_out(f: BuilderFont) -> dict[str, Any]:
    return {"id": str(f.id), "family": f.family, "weight": f.weight, "style": f.style,
            "format": f.format, "url": f.url, "size": f.size_bytes}


@router.get("/fonts")
async def list_fonts(request: Request, _: None = Depends(require_admin),
                     db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    tid = _tenant(request)
    rows = (await db.execute(
        select(BuilderFont).where(BuilderFont.tenant_id == tid).order_by(BuilderFont.family, BuilderFont.weight)
    )).scalars().all()
    return [_font_out(f) for f in rows]


@router.post("/fonts")
async def upload_font(
    request: Request,
    file: UploadFile = File(...),
    family: str = Form(...),
    weight: int = Form(400),
    style: str = Form("normal"),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """One face of a brand's own font — a family at one weight and style.

    The file is checked for what it is, not what it is called: a font file
    begins with a signature, and a .woff2 that does not is not a font.
    """
    from app.services import imagekit_service

    tid = _tenant(request)
    family = (family or "").strip()
    if not _FAMILY.match(family):
        raise HTTPException(status_code=400, detail="A font name is letters, numbers, spaces and hyphens.")
    if weight < 100 or weight > 900 or weight % 100:
        raise HTTPException(status_code=400, detail="Weight is 100 to 900, in hundreds.")
    if style not in ("normal", "italic"):
        raise HTTPException(status_code=400, detail="Style is normal or italic.")

    name = (file.filename or "").lower()
    fmt = name.rsplit(".", 1)[-1] if "." in name else ""
    if fmt not in _FONT_MAGIC:
        raise HTTPException(status_code=400, detail="Upload a WOFF2, WOFF, TTF or OTF file. WOFF2 is best.")
    content = await file.read(MAX_FONT_BYTES + 1)
    if len(content) > MAX_FONT_BYTES:
        raise HTTPException(status_code=400, detail="Font files can be up to 2 MB.")
    if not content.startswith(_FONT_MAGIC[fmt]):
        raise HTTPException(status_code=400, detail=f"That file is not a {fmt.upper()} font.")
    if not imagekit_service.is_configured():
        raise HTTPException(status_code=503, detail="File storage is not set up on this platform.")

    stored = await imagekit_service.upload_bytes(
        content, f"font-{re.sub(r'[^a-z0-9]+', '-', family.lower())}-{weight}-{style}.{fmt}", tid,
    )
    font = BuilderFont(tenant_id=tid, family=family, weight=weight, style=style, format=fmt,
                       url=stored["url"], size_bytes=len(content))
    db.add(font)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"{family} {weight} {style} is already uploaded.")
    return _font_out(font)


@router.delete("/fonts/{font_id}", status_code=204)
async def delete_font(font_id: str, request: Request, _: None = Depends(require_admin),
                      db: AsyncSession = Depends(get_db)) -> None:
    """Remove an uploaded face — unless the live site uses its family.

    Deleting a font the published site depends on would change the live site's
    look without a publish, which is exactly what the draft exists to prevent.
    """
    tid = _tenant(request)
    fid = site_svc._uuid(font_id)
    font = None
    if fid:
        font = (await db.execute(
            select(BuilderFont).where(BuilderFont.id == fid, BuilderFont.tenant_id == tid)
        )).scalar_one_or_none()
    if font is None:
        raise HTTPException(status_code=404, detail="Font not found.")

    # The published version, whether or not the storefront is on the builder
    # yet: switching to it later would bring that version live, fonts and all.
    site = await site_svc.get_site(db, tid)
    published_doc: dict[str, Any] = {}
    if site and site.published_version_id:
        published_doc = (await db.execute(
            select(BuilderVersion.document).where(BuilderVersion.id == site.published_version_id)
        )).scalar() or {}
    in_use = any(
        isinstance(f, dict) and f.get("source") == "custom" and f.get("family") == font.family
        for f in ((published_doc.get("settings") or {}).get("fonts") or [])
    )
    if in_use:
        raise HTTPException(status_code=409, detail=(
            f"The published site uses {font.family}. Choose another font, publish, and then delete it."
        ))
    await db.delete(font)
    await db.commit()
