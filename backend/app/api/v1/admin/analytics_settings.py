"""Admin API — the brand's own tracking tools.

Read and write one JSON blob per brand. Nothing here is a secret: these are the
public IDs a tracking script carries in the page source, so they come back in
full rather than masked. The screen that renders this form is built entirely
from `TOOLS`, so adding a tool needs no change on either side.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.services import analytics_config as svc

router = APIRouter(prefix="/admin/analytics-settings", tags=["admin", "analytics"])


class SaveRequest(BaseModel):
    config: dict = Field(default_factory=dict)
    # Save an ID that fails its format check anyway. Formats change, and an
    # admin looking at the real value in another tab should win over our
    # pattern — but they have to mean it.
    force: bool = False


@router.get("")
async def get_analytics_settings(
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """This brand's tracking setup, plus the catalogue the form is built from."""
    tid = get_current_tenant_id()
    config = await svc.load(db, tenant_id=tid)
    return {
        "config": config,
        "tools": svc.TOOLS,
        "connected_count": sum(
            1 for entry in config["tools"].values() if entry.get("enabled") and entry.get("id")
        ),
    }


@router.put("")
async def save_analytics_settings(
    payload: SaveRequest,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tid = get_current_tenant_id()
    if not tid:
        raise HTTPException(status_code=400, detail="No store context on this request")

    cleaned = svc.clean(payload.config)
    problems = svc.validate(cleaned)
    if problems and not payload.force:
        raise HTTPException(status_code=400, detail=" ".join(problems))

    saved = await svc.save(db, cleaned, tenant_id=tid)
    await db.commit()
    return {
        "config": saved,
        "warnings": problems,
        "message": "Tracking saved." if not problems else "Saved, with warnings.",
    }
