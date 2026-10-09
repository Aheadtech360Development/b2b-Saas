"""The admin's Home page in one request: see services/admin_home."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.services.admin_home import build_home

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
