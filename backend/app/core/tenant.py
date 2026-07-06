"""
Tenant dependency — FastAPI Depends() that resolves the current tenant
from request.state.tenant_slug (set by TenantMiddleware).

Usage:
    @router.post("/login")
    async def login(tenant: dict = Depends(get_current_tenant), ...):
        tenant_id = tenant["id"]  # None for platform-level requests
"""
from typing import Any

from fastapi import Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db


async def get_current_tenant(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Resolve tenant from subdomain slug (set by TenantMiddleware).
    Returns tenant dict. Raises 404/403 on unknown or suspended tenant.
    For root domain (no slug), returns platform sentinel.
    """
    slug: str | None = getattr(request.state, "tenant_slug", None)

    if not slug:
        # Root domain → platform-level (no tenant)
        return {"id": None, "slug": None, "status": "platform", "plan": None, "name": "Platform"}

    result = await db.execute(
        text("SELECT id, slug, name, status, plan FROM tenants WHERE slug = :s"),
        {"s": slug},
    )
    row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail=f"Tenant '{slug}' not found")

    tenant = dict(row)

    if tenant["status"] in ("suspended", "cancelled"):
        raise HTTPException(
            status_code=403,
            detail=f"This account is {tenant['status']}. Contact support.",
        )

    return tenant
