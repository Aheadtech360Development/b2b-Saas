"""Public: what a storefront page should render through.

One question, asked by every storefront page before it draws anything:
does this brand render through the visual builder?

For every store that existed before the builder — and every store that has
not explicitly switched — the answer is {"mode": "legacy"}, and the page goes
on down the path it has always taken, untouched. Only a brand whose site is in
visual_builder mode *and* has a published version gets a builder page back.

Under /storefront, so it is public by the auth middleware's prefix rule, and
the brand is the one the request resolved to — never one named in the query.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.builder import resolve, site as site_svc

router = APIRouter(prefix="/storefront", tags=["storefront", "builder"])
logger = logging.getLogger(__name__)

_LEGACY = {"mode": "legacy"}


async def _tenant(request: Request, db: AsyncSession) -> uuid.UUID | None:
    raw = getattr(request.state, "tenant_id", None)
    if raw:
        return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))
    slug = getattr(request.state, "tenant_slug", None)
    if not slug:
        return None
    row = (await db.execute(
        text("SELECT id FROM tenants WHERE slug = :s AND status = 'active'"), {"s": slug}
    )).first()
    return row[0] if row else None


@router.get("/site")
async def storefront_site(
    request: Request,
    route: str = "home",
    slug: str = "",
    q: str = "",
    page: int = 1,
    sort: str = "",
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    tid = await _tenant(request, db)
    if tid is None:
        return _LEGACY
    try:
        mode, doc, number = await site_svc.live_document(db, tid)
    except Exception:
        # The builder tables may not exist on an environment that has not run
        # the migration yet. That is a legacy store by definition — the safe
        # answer is always the one the shop rendered with yesterday.
        logger.warning("Builder lookup failed for %s; rendering legacy", tid, exc_info=True)
        return _LEGACY
    if mode != "visual_builder" or not doc:
        return _LEGACY
    return await resolve.render_payload(db, tid, doc, route=route, slug=slug, query=q,
                                        page=max(1, page), sort=sort, version=number)
