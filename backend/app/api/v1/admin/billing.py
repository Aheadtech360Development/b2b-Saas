"""Brand Admin API — self-serve subscription billing (System A, brand side).

The brand admin sees their plan, upgrades/downgrades, and manages their card via
the Stripe billing portal. Mirrors platform/billing.py but scoped to the caller's
own tenant. Gated to tenant_admin via the `settings` scope (billing is owner-level).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.billing_plans import public_pricing_table, is_valid_plan
from app.services.billing_service import BillingService

router = APIRouter(prefix="/admin/billing", tags=["admin-billing"])


class CheckoutRequest(BaseModel):
    plan: str


async def _brand_slug(request: Request, db: AsyncSession) -> str:
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No brand context on this request")
    row = (await db.execute(text("SELECT slug FROM tenants WHERE id = :t"), {"t": str(tenant_id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    return row[0]


@router.get("")
async def my_billing(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Current subscription + the available plans, for the brand billing page."""
    slug = await _brand_slug(request, db)
    status = await BillingService(db).get_status(slug)
    return {**status, "plans": public_pricing_table()}


@router.post("/checkout")
async def my_checkout(
    data: CheckoutRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    """Start/switch the brand's own subscription — returns a Stripe Checkout URL."""
    if not is_valid_plan(data.plan):
        raise HTTPException(status_code=400, detail=f"Unknown plan '{data.plan}'")
    slug = await _brand_slug(request, db)
    try:
        result = await BillingService(db).create_checkout_session(slug, data.plan)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync")
async def my_sync(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Reconcile the brand's latest subscription from Stripe (webhook fallback,
    called on the checkout success redirect)."""
    slug = await _brand_slug(request, db)
    try:
        result = await BillingService(db).sync_current(slug)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/portal")
async def my_portal(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Stripe Billing Portal link — brand manages card / cancels."""
    slug = await _brand_slug(request, db)
    try:
        result = await BillingService(db).create_portal_session(slug)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
