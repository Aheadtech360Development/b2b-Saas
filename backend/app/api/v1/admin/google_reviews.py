"""Google reviews — connect a brand's Business Profile and keep its reviews in.

Two routers:

* `/admin/google-reviews` for the brand's admin, gated by the auth middleware
  and the "products" permission like the rest of Reviews.
* `/integrations/google-reviews/callback`, where Google sends the browser back.
  It carries no admin token — it is a redirect — so the signed `state` is what
  ties it to a brand. A forged or stale state is refused before anything is
  stored.
"""
from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id, set_bypass_scoping
from app.middleware.auth_middleware import require_admin
from app.services import google_reviews as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/google-reviews", tags=["admin", "reviews"])
callback_router = APIRouter(prefix="/integrations/google-reviews", tags=["reviews"])


def _tenant() -> str:
    tid = get_current_tenant_id()
    if not tid:
        raise HTTPException(status_code=400, detail="No store context on this request")
    return str(tid)


@router.get("")
async def get_status(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Is Google connected, which business, and how the last import went."""
    from app.models.product import ProductReview

    tid = _tenant()
    data = await svc.load(db, tenant_id=tid)
    shown = (await db.execute(
        select(func.count(ProductReview.id)).where(
            ProductReview.source == svc.SOURCE, ProductReview.is_approved == True,  # noqa: E712
        )
    )).scalar_one()
    return {**svc.status(data), "shown": shown}


class ConnectIn(BaseModel):
    # Where the admin started, so they land back on the same site afterwards.
    # Checked against our own origins before it is ever used.
    return_to: str | None = None


@router.post("/connect")
async def start_connect(
    payload: ConnectIn, request: Request,
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """The Google sign-in page for this brand."""
    tid = _tenant()
    state = svc.make_state(
        tid, getattr(request.state, "user_id", None), svc.safe_return_url(payload.return_to),
    )
    try:
        return {"url": svc.authorize_url(state)}
    except svc.GoogleReviewsError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/locations")
async def get_locations(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """The businesses the connected Google account manages."""
    data = await svc.load(db, tenant_id=_tenant())
    try:
        return {"locations": await svc.list_locations(data)}
    except svc.GoogleReviewsError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class LocationIn(BaseModel):
    account: str
    location: str
    title: str | None = None
    account_name: str | None = None
    maps_url: str | None = None


@router.post("/location")
async def choose_location(
    payload: LocationIn,
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Pick which business to import from, then import straight away.

    The choice is checked against what this Google account actually manages,
    so a brand cannot point its import at somebody else's business by typing
    an id.
    """
    tid = _tenant()
    data = await svc.load(db, tenant_id=tid)
    try:
        managed = await svc.list_locations(data)
    except svc.GoogleReviewsError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    match = next((m for m in managed
                  if m["account"] == payload.account and m["location"] == payload.location), None)
    if match is None:
        raise HTTPException(status_code=403, detail="That business is not managed by the connected Google account.")

    # Switching business: the old business's reviews are not this one's.
    if data.get("location") and data.get("location") != match["location"]:
        from sqlalchemy import delete

        from app.models.product import ProductReview
        import uuid as _uuid

        await db.execute(delete(ProductReview).where(
            ProductReview.tenant_id == _uuid.UUID(tid), ProductReview.source == svc.SOURCE,
        ))

    data.update({
        "account": match["account"], "account_name": match["account_name"],
        "location": match["location"], "location_name": match["title"],
        "maps_url": match["maps_url"],
    })
    await svc.save(db, data, tenant_id=tid)
    await db.commit()

    try:
        result = await svc.sync(db, tid)
    except svc.GoogleReviewsError as exc:
        # Saved either way: the choice stands, and the next sync will retry.
        return {"saved": True, "synced": False, "message": str(exc)}
    return {"saved": True, "synced": True, **result}


@router.post("/sync")
async def sync_now(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await svc.sync(db, _tenant())
    except svc.GoogleReviewsError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("")
async def disconnect(
    keep_reviews: bool = Query(False),
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    result = await svc.disconnect(db, _tenant(), remove_reviews=not keep_reviews)
    return {"disconnected": True, **result}


# ── Where Google sends the browser back ──────────────────────────────────────

@callback_router.get("/callback")
async def oauth_callback(
    state: str = Query(""),
    code: str | None = Query(None),
    error: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Finish the sign-in and send the admin back to their Reviews page.

    Everything that identifies the brand comes from the signed state — never
    from a query parameter the browser could change.
    """
    try:
        claims = svc.read_state(state)
    except svc.GoogleReviewsError as exc:
        return RedirectResponse(
            f"{svc.safe_return_url(None)}/admin/products/reviews?"
            + urlencode({"google": "error", "message": str(exc)}),
            status_code=302,
        )

    back = f"{svc.safe_return_url(claims.get('r'))}/admin/products/reviews"

    if error or not code:
        # The admin pressed Cancel on Google's screen.
        return RedirectResponse(f"{back}?" + urlencode({
            "google": "error", "message": "Google sign-in was cancelled.",
        }), status_code=302)

    try:
        tokens = await svc.exchange_code(code)
    except svc.GoogleReviewsError as exc:
        return RedirectResponse(f"{back}?" + urlencode({"google": "error", "message": str(exc)}),
                                status_code=302)

    # This request has no signed-in admin, so no tenant scope; the tenant comes
    # from the verified state and the write is scoped to it explicitly.
    tenant_id = claims["t"]
    set_bypass_scoping(True)
    try:
        data = await svc.load(db, tenant_id=tenant_id)
        data.update({
            "refresh_token": tokens["refresh_token"],
            "google_email": svc._email_from_id_token(tokens.get("id_token")),
            "connected_by": claims.get("u"),
            "last_error": None,
        })
        await svc.save(db, data, tenant_id=tenant_id)
        await db.commit()
    finally:
        set_bypass_scoping(False)

    return RedirectResponse(f"{back}?google=connected", status_code=302)
