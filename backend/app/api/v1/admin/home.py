"""The admin's Home page in one request: see services/admin_home."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.services.admin_home import build_home, sales_for

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/home")
async def get_home(
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """What needs the shop today, where its work stands, what is left to set
    up, its sales and its latest orders."""
    return await build_home(db, get_current_tenant_id(), getattr(request.state, "user_id", None))


@router.get("/home/sales")
async def get_home_sales(
    range: str = Query("30d", pattern="^(today|7d|30d|90d|all|custom)$"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    # The viewer's clock, in minutes east of UTC, as Reports takes it.
    utc_offset: int = Query(0, ge=-840, le=840),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Home's Sales for the days chosen: total sales, orders, average order,
    sessions and conversion rate (visits that placed an order out of all)."""
    tid = get_current_tenant_id()
    if not tid:
        raise HTTPException(status_code=400, detail="Open this from your shop's admin.")
    try:
        return await sales_for(db, tid, range, date_from=date_from, date_to=date_to, utc_offset=utc_offset)
    except ValueError:
        raise HTTPException(status_code=422, detail="A custom range needs a start and an end date, written YYYY-MM-DD.")
