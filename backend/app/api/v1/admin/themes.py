"""Admin API — the brand's website theme.

The design is imported once — an HTML file becomes the brand's theme, which
the platform team or the brand's own administrator may do. After that any
storefront-capable staff member edits content: section order, which sections
show, and the text, links and images inside them. Save keeps a draft;
only Publish changes what shoppers see.

Sits under /admin/storefront so it takes the "storefront" permission, like the
rest of the store's design.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.brand_theme import BrandTheme
from app.services import theme_data, theme_import, theme_render

router = APIRouter(prefix="/admin/storefront/theme", tags=["admin", "theme"])

MAX_UPLOAD_BYTES = 5_000_000


class StateIn(BaseModel):
    draft: dict = Field(default_factory=dict)


def _tenant(request: Request) -> uuid.UUID:
    raw = getattr(request.state, "tenant_id", None)
    if not raw:
        raise HTTPException(status_code=400, detail="Open a brand's admin to work on its theme.")
    return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))


async def _active(db: AsyncSession, tenant_id: uuid.UUID) -> BrandTheme | None:
    return (await db.execute(
        select(BrandTheme).where(BrandTheme.tenant_id == tenant_id, BrandTheme.is_active.is_(True))
    )).scalar_one_or_none()


def _status(theme: BrandTheme) -> str:
    if theme.published is None:
        return "draft"
    return "published" if theme.draft == theme.published else "changes"


def _pages_summary(theme: BrandTheme) -> list[dict]:
    """What the customizer's page selector shows, in a sensible order."""
    pages = (theme.definition or {}).get("pages") or {}
    state = ((theme.draft or {}).get("pages")) or {}
    rows = []
    for key, page in pages.items():
        ids = [s["id"] for s in page.get("sections", [])]
        hidden = set((state.get(key) or {}).get("hidden") or [])
        rows.append({
            "key": key,
            "label": page.get("label") or key.title(),
            "kind": page.get("kind") or "page",
            "section_count": len(ids),
            "hidden_count": len([i for i in ids if i in hidden]),
        })
    order = {"home": 0, "collection": 1}
    rows.sort(key=lambda r: (order.get(r["key"], 2), r["label"]))
    return rows


def _detail(theme: BrandTheme) -> dict:
    return {
        "id": str(theme.id),
        "name": theme.name,
        "status": _status(theme),
        "published_at": theme.published_at.isoformat() if theme.published_at else None,
        "updated_at": theme.updated_at.isoformat() if theme.updated_at else None,
        "pages": _pages_summary(theme),
        "definition": theme.definition,
        "draft": theme.draft,
    }


@router.get("")
async def get_theme(request: Request, _: None = Depends(require_admin),
                    db: AsyncSession = Depends(get_db)) -> dict:
    """This brand's theme, or `theme: null` when it has none yet."""
    theme = await _active(db, _tenant(request))
    return {"theme": _detail(theme) if theme else None}


@router.put("")
async def save_draft(data: StateIn, request: Request, _: None = Depends(require_admin),
                     db: AsyncSession = Depends(get_db)) -> dict:
    """Save what the customizer has. Shoppers see nothing new until Publish."""
    theme = await _active(db, _tenant(request))
    if theme is None:
        raise HTTPException(status_code=404, detail="This brand has no theme yet.")
    theme.draft = theme_render.clean_state(theme.definition, data.draft)
    theme.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(theme)
    return {"theme": _detail(theme)}


@router.post("/publish")
async def publish(request: Request, _: None = Depends(require_admin),
                  db: AsyncSession = Depends(get_db)) -> dict:
    theme = await _active(db, _tenant(request))
    if theme is None:
        raise HTTPException(status_code=404, detail="This brand has no theme yet.")
    theme.published = theme_render.clean_state(theme.definition, theme.draft)
    theme.draft = theme.published
    now = datetime.now(timezone.utc)
    theme.published_at = now
    theme.updated_at = now
    await db.commit()
    await db.refresh(theme)
    return {"theme": _detail(theme)}


@router.post("/discard")
async def discard(request: Request, _: None = Depends(require_admin),
                  db: AsyncSession = Depends(get_db)) -> dict:
    """Throw away unpublished edits — back to what the storefront shows."""
    theme = await _active(db, _tenant(request))
    if theme is None:
        raise HTTPException(status_code=404, detail="This brand has no theme yet.")
    if theme.published is None:
        theme.draft = theme_import.default_state(theme.definition)
    else:
        theme.draft = theme.published
    theme.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(theme)
    return {"theme": _detail(theme)}


class SlotsIn(BaseModel):
    """What each row of cards should show, keyed "<section>|<row>"."""
    slots: dict[str, dict] = Field(default_factory=dict)


@router.post("/data")
async def slot_data(data: SlotsIn, request: Request, _: None = Depends(require_admin),
                    db: AsyncSession = Depends(get_db)) -> dict:
    """The cards these rows would show — the same ones the storefront serves.

    The preview asks for these so an admin sees their own products while they
    work, rather than the design's examples.
    """
    _tenant(request)
    out = {}
    for key, spec in list(data.slots.items())[:40]:
        out[key] = await theme_data.items_for(db, spec)
    return {"items": out}


@router.post("/import")
async def import_theme(
    request: Request,
    file: UploadFile = File(...),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Import a design file as this brand's theme.

    The file is HTML that runs on the storefront, so it is limited to the
    platform team and the brand's own administrator — the staff roles below
    that can edit a theme's content but not replace the design. Scripts and
    inline handlers are stripped on the way in. Re-importing keeps the saved
    values whose fields still exist in the new design.
    """
    role = getattr(request.state, "role", "") or ""
    if not (getattr(request.state, "is_platform_admin", False) or role in {"platform_admin", "tenant_admin"}):
        raise HTTPException(status_code=403, detail="Only an administrator can import a design.")
    tenant_id = _tenant(request)

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is larger than 5 MB.")
    try:
        html = raw.decode("utf-8", errors="replace")
        definition = theme_import.import_html(html, name=file.filename or "Theme")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    theme = await _active(db, tenant_id)
    if theme is None:
        theme = BrandTheme(
            tenant_id=tenant_id,
            name=(file.filename or "Theme").rsplit(".", 1)[0][:160],
            definition=definition,
            draft=theme_import.default_state(definition),
            is_active=True,
        )
        db.add(theme)
    else:
        # Keep what the brand has already written wherever it still fits.
        kept = theme_render.clean_state(definition, theme.draft)
        theme.definition = definition
        theme.draft = kept
        theme.updated_at = datetime.now(timezone.utc)
    await db.execute(
        update(BrandTheme)
        .where(BrandTheme.tenant_id == tenant_id, BrandTheme.id != (theme.id or uuid.uuid4()))
        .values(is_active=False)
    )
    await db.commit()
    await db.refresh(theme)
    return {"theme": _detail(theme)}
