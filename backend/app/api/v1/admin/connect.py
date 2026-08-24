"""Brand Admin API — Stripe Connect payouts (System B onboarding).

The brand admin connects a Stripe Express account so their storefront can accept
customer payments and receive payouts. Gated to tenant_admin via the `settings`
scope (see app/core/permissions.py) — payout/banking setup is sensitive.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.connect_service import ConnectService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/connect", tags=["admin-connect"])


def _tenant_id(request: Request) -> str:
    tid = getattr(request.state, "tenant_id", None)
    if not tid:
        raise HTTPException(status_code=400, detail="No brand context on this request")
    return str(tid)


@router.get("")
async def connect_status(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Current payout-readiness for the brand (DB-cached — no Stripe call)."""
    try:
        return await ConnectService(db).get_status(_tenant_id(request))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/onboard")
async def start_onboarding(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Create the Express account (if needed) and return a fresh hosted
    onboarding URL. The link expires quickly, so call this each time."""
    try:
        svc = ConnectService(db)
        result = await svc.create_onboarding_link(_tenant_id(request))
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Connect onboarding link failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not reach Stripe. Try again.")


@router.post("/dashboard")
async def express_dashboard(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Return an Express dashboard login link (brand views payouts/balance)."""
    try:
        return await ConnectService(db).create_dashboard_link(_tenant_id(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Connect dashboard link failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not reach Stripe. Try again.")


@router.post("/refresh")
async def refresh_status(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Pull the latest readiness flags from Stripe into the DB and return them.
    Useful right after the brand returns from onboarding."""
    try:
        svc = ConnectService(db)
        result = await svc.refresh_status(_tenant_id(request))
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Connect refresh failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not reach Stripe. Try again.")
