"""Admin API — the Production board.

One answer for the board, its counts and its list (services/production_board),
the drafts kept out of it, and the shop's same-day cutoff. A job itself is
read and changed through the gang sheet routes it always used
(/admin/gang-sheets/orders/...), so the board adds no second way to approve
or print.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.services import production_board as pb

router = APIRouter(prefix="/admin/production", tags=["admin", "production"])


@router.get("")
async def production_board(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    from app.core.tenant_settings import get_setting

    rows = await pb.load_queue(db)
    drafts, drafts_value = await pb.drafts_summary(db)
    return pb.board(rows, drafts, drafts_value, await get_setting(db, pb.CUTOFF_KEY))


@router.get("/drafts")
async def production_drafts(
    limit: int = Query(50, ge=1, le=200),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"drafts": await pb.load_drafts(db, limit)}


@router.get("/settings")
async def production_settings(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    from app.core.tenant_settings import get_setting

    return {"cutoff": (await get_setting(db, pb.CUTOFF_KEY)) or None}


class _Settings(BaseModel):
    # "12:00", 24-hour; empty switches the cutoff off.
    cutoff: str = Field("", max_length=5)


@router.put("/settings")
async def save_production_settings(
    payload: _Settings, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    from app.core.tenant_settings import set_setting

    try:
        cutoff = pb.clean_cutoff(payload.cutoff)
    except ValueError:
        raise HTTPException(status_code=400, detail="Write the time as HH:MM, for example 12:00 or 15:30.")
    await set_setting(db, pb.CUTOFF_KEY, cutoff)
    await db.commit()
    return {"cutoff": cutoff or None}
