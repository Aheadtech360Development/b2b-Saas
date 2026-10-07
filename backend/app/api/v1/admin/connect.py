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


def _stripe_failure(exc: Exception, what: str) -> HTTPException:
    """Turn a Stripe failure into something the person reading it can act on.

    Every one of these used to come back as "Could not reach Stripe. Try
    again." Retrying is the right advice for a network blip and useless
    advice for the rest, which is most of them: Connect not enabled on the
    live account, a platform profile that was never completed, a key from the
    wrong mode. Stripe says exactly which, in a sentence written to be read —
    and we were logging it where only we would look while telling the brand
    to try again.

    Stripe's own wording is passed through for the errors that are settings
    to fix. Authentication is answered separately, because the brand cannot
    do anything about the platform's key and should not be sent to look.
    """
    import stripe

    if isinstance(exc, stripe.AuthenticationError):
        logger.error("%s failed: the platform's Stripe key was rejected: %s", what, exc)
        return HTTPException(
            status_code=502,
            detail="The platform's payment settings are not accepting this key. "
                   "Nothing for you to fix here — please tell support.",
        )
    if isinstance(exc, (stripe.APIConnectionError, stripe.RateLimitError)):
        logger.warning("%s failed, retryable: %s", what, exc)
        return HTTPException(status_code=502, detail="Could not reach Stripe. Try again.")
    if isinstance(exc, stripe.StripeError):
        message = getattr(exc, "user_message", None) or str(getattr(exc, "message", "") or exc)
        logger.error("%s failed: %s", what, message)
        return HTTPException(status_code=502, detail=message.strip() or "Stripe refused the request.")

    logger.exception("%s failed: %s", what, exc)
    return HTTPException(status_code=502, detail="Could not reach Stripe. Try again.")


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
        raise _stripe_failure(e, "Connect onboarding link")


@router.post("/dashboard")
async def express_dashboard(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Where the brand sees its balance and payouts: an Express login link, or
    the full Stripe Dashboard for a standard account (ConnectService)."""
    try:
        return await ConnectService(db).create_dashboard_link(_tenant_id(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise _stripe_failure(e, "Connect dashboard link")


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
        raise _stripe_failure(e, "Connect refresh")
