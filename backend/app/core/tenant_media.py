"""Trusted per-tenant media folder resolution.

Media (ImageKit) is stored under `/tenants/{slug}/…`. The folder key must come
from a source the caller cannot forge — otherwise a brand admin could point
media reads/writes/deletes at another brand's folder by changing the
`X-Tenant-Slug` header (which the tenant middleware trusts for public routing).

Rule:
  • authenticated request  → bind to the JWT tenant (`request.state.tenant_id`),
    ignoring the header; the slug is looked up from the tenants table.
  • public/guest request    → the resolved subdomain slug, but only if it maps to
    a real *active* tenant (else None → caller rejects).
"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def resolve_media_folder_key(request: Request, db: AsyncSession) -> str | None:
    """Return the trusted tenant slug to use as the media folder key, or None."""
    tenant_id = getattr(request.state, "tenant_id", None)
    if tenant_id:
        row = (
            await db.execute(
                text("SELECT slug FROM tenants WHERE id = :id AND status = 'active'"),
                {"id": str(tenant_id)},
            )
        ).first()
        return row[0] if row else None

    slug = getattr(request.state, "tenant_slug", None)
    if slug:
        row = (
            await db.execute(
                text("SELECT slug FROM tenants WHERE slug = :s AND status = 'active'"),
                {"s": slug},
            )
        ).first()
        return row[0] if row else None

    return None
