"""Platform Admin API — Brand Billing (System A: brand -> platform).

Platform admins generate subscription checkout links for a brand, open the
brand's billing portal, and read subscription status. The brand pays a flat
monthly tier; webhooks (see api/v1/webhooks.py) reconcile the result.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.billing_plans import public_pricing_table, is_valid_plan
from app.services.billing_service import BillingService

router = APIRouter(prefix="/platform", tags=["platform-billing"])


def _require_platform_admin(request: Request) -> None:
    if not getattr(request.state, "is_platform_admin", False):
        raise HTTPException(status_code=403, detail="Platform admin access required")


class CheckoutRequest(BaseModel):
    plan: str


@router.get("/billing/plans")
async def list_plans(request: Request) -> dict:
    """The tier catalogue (name, price, features) for the billing UI."""
    _require_platform_admin(request)
    return {"plans": public_pricing_table()}


@router.get("/disputes")
async def all_disputes(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Every chargeback/dispute across all brands (super-admin dispute panel)."""
    _require_platform_admin(request)
    from app.services.dispute_service import DisputeService
    return {"disputes": await DisputeService(db).list_all()}


@router.get("/tenants/{slug}/billing")
async def brand_billing_status(
    slug: str, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    _require_platform_admin(request)
    try:
        return await BillingService(db).get_status(slug)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/tenants/{slug}/billing/checkout")
async def brand_billing_checkout(
    slug: str, data: CheckoutRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    """Return a Stripe Checkout URL the brand uses to start/switch their tier."""
    _require_platform_admin(request)
    if not is_valid_plan(data.plan):
        raise HTTPException(status_code=400, detail=f"Unknown plan '{data.plan}'")
    try:
        result = await BillingService(db).create_checkout_session(slug, data.plan)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tenants/{slug}/billing/portal")
async def brand_billing_portal(
    slug: str, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    """Return a Stripe Billing Portal URL (brand manages card / cancels)."""
    _require_platform_admin(request)
    try:
        result = await BillingService(db).create_portal_session(slug)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
