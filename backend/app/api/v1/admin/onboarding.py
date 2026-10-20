"""The owner's setup steps (/onboarding): read where the shop stands, save where
the owner is. See services/onboarding.

The steps themselves save through the endpoints that already own each thing
(the shop's name, logo and colour through /admin/storefront, a supplier or a
carrier through /admin/integrations, payments through /admin/connect, pickup
through /admin/settings); this only keeps the owner's place and what they told
us about the business.
"""
from __future__ import annotations

import logging
from html import escape
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.services import onboarding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/onboarding", tags=["admin"])


def _tenant():
    tenant_id = get_current_tenant_id()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No shop on this request")
    return tenant_id


class ProgressIn(BaseModel):
    step: int | None = Field(default=None, ge=1, le=onboarding.STEPS)
    reached: int | None = Field(default=None, ge=1, le=onboarding.STEPS)
    business_type: str | None = Field(default=None, max_length=40)
    country: str | None = Field(default=None, max_length=2)
    # "Open my store": the owner is done with the steps (Home stops asking).
    finished: bool | None = None


class NotifyIn(BaseModel):
    topic: Literal["sanmar"]


@router.get("")
async def get_onboarding(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Where the shop stands on each step, read from where each thing is kept."""
    return await onboarding.state(db, _tenant())


@router.put("")
async def save_onboarding(
    data: ProgressIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Keep the owner's place, and what they said about the business."""
    tenant_id = _tenant()
    changes = data.model_dump(exclude_unset=True)
    if "business_type" in changes and changes["business_type"] is not None \
            and onboarding.clean_business_type(changes["business_type"]) is None:
        raise HTTPException(status_code=400, detail="Choose one of the business types shown.")
    if "country" in changes and changes["country"] is not None \
            and onboarding.clean_country(changes["country"]) is None:
        raise HTTPException(status_code=400, detail="Choose a country from the list.")
    await onboarding.save_progress(db, tenant_id, changes)
    await db.commit()
    return await onboarding.state(db, tenant_id)


def _tell_platform(shop: str, slug: str, email: str) -> None:
    """Runs after the response: a shop asking to hear about SanMar."""
    from app.services.email_service import notify_platform

    # A shop names itself, so its name is text here, never markup.
    shop_h, slug_h, email_h = escape(shop), escape(slug), escape(email)
    try:
        notify_platform(
            f"SanMar interest — {shop} ({slug})",
            '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">'
            f"<p><strong>{shop_h}</strong> ({slug_h}) asked to be told when SanMar is available "
            "as a supplier, from the setup steps.</p>"
            f'<p style="color:#6B7280">Owner: <a href="mailto:{email_h}">{email_h}</a></p></div>',
        )
    except Exception:  # noqa: BLE001  (a notice must never fail the owner's click)
        logger.warning("sanmar notice failed for %s", slug, exc_info=True)


@router.post("/notify")
async def notify_me(
    data: NotifyIn, background: BackgroundTasks,
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """"Notify me" on a supplier that is not here yet: noted on the shop, and the
    platform is told who is waiting for it."""
    tenant_id = _tenant()
    before = await onboarding.read_progress(db, tenant_id)
    await onboarding.save_progress(db, tenant_id, {"sanmar_notify": True})
    await db.commit()
    if not (before or {}).get("sanmar_notify"):
        row = (await db.execute(text("""
            SELECT t.slug, t.email, COALESCE(b.store_name, b.company_name, t.name) AS shop
              FROM tenants t LEFT JOIN tenant_branding b ON b.tenant_id = t.id
             WHERE t.id = CAST(:t AS uuid)
        """), {"t": str(tenant_id)})).mappings().first()
        if row:
            background.add_task(_tell_platform, row["shop"] or row["slug"], row["slug"], row["email"] or "")
    return await onboarding.state(db, tenant_id)
