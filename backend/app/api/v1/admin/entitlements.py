"""What this brand's own console may show.

The API refuses a feature the brand's plan does not include; this is so the
console does not offer it in the first place. A screen that leads to a 403 is
worse than a screen that isn't there.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin

router = APIRouter(prefix="/admin/entitlements", tags=["admin-entitlements"])


@router.get("")
async def my_entitlements(
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """The features this brand may use, as a list the console can check against."""
    from app.core.features import ALL_FEATURES
    from app.services import entitlements

    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        return {"features": list(ALL_FEATURES)}
    return {"features": sorted(await entitlements.for_tenant(db, tenant_id))}
