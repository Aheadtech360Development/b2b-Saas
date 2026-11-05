"""Platform Admin API — Brand Billing (System A: brand -> platform).

Platform admins generate subscription checkout links for a brand, open the
brand's billing portal, and read subscription status. The brand pays a flat
monthly tier; webhooks (see api/v1/webhooks.py) reconcile the result.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.billing_plans import public_pricing_table, is_valid_plan
from app.services.billing_service import BillingService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/platform", tags=["platform-billing"])


def _require_platform_admin(request: Request) -> None:
    if not getattr(request.state, "is_platform_admin", False):
        raise HTTPException(status_code=403, detail="Platform admin access required")


class CheckoutRequest(BaseModel):
    plan: str


@router.get("/billing/plans")
async def list_plans(request: Request) -> dict:
    """The tier catalogue (name, price, features) for the billing UI, with
    each plan's default price beside the one in force (services/plan_prices)."""
    _require_platform_admin(request)
    from app.services import plan_prices

    return {"plans": [{**p, "default_amount_cents": plan_prices.DEFAULTS.get(p["key"])} for p in public_pricing_table()]}


class PricesIn(BaseModel):
    # plan key -> the monthly price in cents
    prices: dict[str, int]


@router.put("/billing/plans/prices")
async def set_plan_prices(data: PricesIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Set plans' monthly prices. New sign-ups and plan changes are charged the
    new price; brands already paying keep theirs until they change plan."""
    _require_platform_admin(request)
    from app.core.billing_plans import BILLING_PLANS, price_text
    from app.services import plan_prices

    # From the stored row, not this worker's copy, which can be a minute behind.
    stored = await plan_prices.load(db)
    before = {k: stored.get(k, default) for k, default in plan_prices.DEFAULTS.items()}
    try:
        changed = await plan_prices.save(db, data.prices)
    except plan_prices.PriceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if changed:
        from app.api.v1.platform.tenants import _audit

        await _audit(
            db, request, action="UPDATE", entity_type="plan_prices", slug=None,
            old_values={k: before[k] for k in changed}, new_values=changed,
            summary="Plan prices: " + ", ".join(
                f"{BILLING_PLANS[k]['name']} {price_text(before[k])} to {price_text(v)}" for k, v in changed.items()),
        )
    await db.commit()
    # This worker charges the new prices now; the others within a minute.
    await plan_prices.refresh(db)

    if changed:
        # Brands already paying stay on their price: what Stripe bills each is
        # read once, so the console's revenue counts that and not the new one.
        try:
            await BillingService(db).fill_paid_amounts()
        except Exception:
            logger.warning("Could not read what running subscriptions bill", exc_info=True)
            await db.rollback()

    # Stripe's Price for each changed plan now, so the next sign-up does not
    # wait on it; a Stripe that does not answer is retried at that sign-up.
    stripe: dict[str, str] = {}
    for key in changed:
        try:
            price_id = await BillingService(db).price_id_for_plan(key)
            stripe[key] = "ready" if price_id else "pending"
        except Exception:
            stripe[key] = "pending"
    return {
        "changed": list(changed),
        "stripe": stripe,
        "plans": [{**p, "default_amount_cents": plan_prices.DEFAULTS.get(p["key"])} for p in public_pricing_table()],
    }


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
