"""Marketing → Reviews: where the shop's reviews come from, and its review rules.

    GET    /admin/review-sources                 the whole setup (never the Judge.me token)
    PUT    /admin/review-sources/rules           who may write a review, held for approval or not
    POST   /admin/review-sources/judgeme         check the details, save them, import everything
    POST   /admin/review-sources/judgeme/sync    import again now
    DELETE /admin/review-sources/judgeme         forget the token, remove the imported reviews
    GET    /admin/review-sources/google/search   find the business on Google
    PUT    /admin/review-sources/google          show this Google business
    DELETE /admin/review-sources/google
    PUT    /admin/review-sources/yelp            Yelp page link and embedded reviews
    DELETE /admin/review-sources/yelp

Gated like the rest of Reviews: the "reviews" feature and the products permission.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.services.review_sources import google_place, judgeme, store, yelp

router = APIRouter(prefix="/admin/review-sources", tags=["admin", "reviews"])


def _tenant() -> str:
    tid = get_current_tenant_id()
    if not tid:
        raise HTTPException(status_code=400, detail="No store context on this request")
    return str(tid)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _counts(db: AsyncSession) -> dict:
    from app.models.product import ProductReview

    rows = (await db.execute(
        select(ProductReview.source, ProductReview.is_approved, func.count(ProductReview.id))
        .group_by(ProductReview.source, ProductReview.is_approved)
    )).all()
    out: dict[str, dict[str, int]] = {}
    for source, approved, n in rows:
        part = out.setdefault(source or "site", {"shown": 0, "hidden": 0})
        part["shown" if approved else "hidden"] += int(n)
    return out


async def _overview(db: AsyncSession, tid: str) -> dict:
    data = await store.load(db, tenant_id=tid)
    view = store.public_view(data)
    place_id = view["google_place"].get("place_id")
    place = None
    place_error = None
    if place_id:
        try:
            place = await google_place.details(place_id)
        except google_place.GooglePlaceError as exc:
            place_error = str(exc)
    view["google_place"] = {
        **view["google_place"],
        "configured": google_place.configured(),
        "place": place,
        "error": place_error,
    }
    view["counts"] = await _counts(db)
    return view


@router.get("")
async def overview(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await _overview(db, _tenant())


# ── Rules ────────────────────────────────────────────────────────────────────

class RulesIn(BaseModel):
    who: str = Field(..., description="'signed_in' or 'buyers'")
    hold: bool = False


@router.put("/rules")
async def save_rules(payload: RulesIn, _: None = Depends(require_admin),
                     db: AsyncSession = Depends(get_db)) -> dict:
    if payload.who not in store.WHO:
        raise HTTPException(status_code=400, detail="Choose who may write a review.")
    tid = _tenant()
    data = await store.load(db, tenant_id=tid)
    data["rules"] = {"who": payload.who, "hold": bool(payload.hold)}
    await store.save(db, data, tenant_id=tid)
    await db.commit()
    return data["rules"]


# ── Judge.me ─────────────────────────────────────────────────────────────────

class JudgeMeIn(BaseModel):
    shop_domain: str = Field(..., max_length=300)
    # Blank keeps the token already saved, so the domain can be corrected
    # without pasting the token again.
    api_token: str | None = Field(None, max_length=300)


@router.post("/judgeme")
async def connect_judgeme(payload: JudgeMeIn, _: None = Depends(require_admin),
                          db: AsyncSession = Depends(get_db)) -> dict:
    """Check the details with Judge.me, keep them, and import every review."""
    tid = _tenant()
    data = await store.load(db, tenant_id=tid)
    saved = data["judgeme"]
    try:
        domain = judgeme.clean_domain(payload.shop_domain)
        token = judgeme.clean_token(payload.api_token or saved.get("api_token"))
        shop = await judgeme.shop_info(domain, token)
    except judgeme.JudgeMeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Another Judge.me shop's reviews are not this one's.
    if saved.get("shop_domain") and saved["shop_domain"] != domain:
        await judgeme.remove_imported(db, tid)
    data["judgeme"] = {
        "shop_domain": domain, "api_token": token, "shop_name": shop["name"],
        "connected_at": saved.get("connected_at") if saved.get("shop_domain") == domain else _now(),
    }
    await store.save(db, data, tenant_id=tid)
    await db.commit()

    try:
        result = await judgeme.sync(db, tid)
    except judgeme.JudgeMeError as exc:
        # Connected either way; the next sync tries again.
        return {"connected": True, "synced": False, "message": str(exc), **(await _overview(db, tid))}
    return {"connected": True, "synced": True, "result": result, **(await _overview(db, tid))}


@router.post("/judgeme/sync")
async def sync_judgeme(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    tid = _tenant()
    try:
        result = await judgeme.sync(db, tid)
    except judgeme.JudgeMeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"result": result, **(await _overview(db, tid))}


@router.delete("/judgeme")
async def disconnect_judgeme(keep_reviews: bool = Query(False), _: None = Depends(require_admin),
                             db: AsyncSession = Depends(get_db)) -> dict:
    """Forget the token. The imported reviews go too unless the shop keeps them:
    without the connection they can only go stale."""
    tid = _tenant()
    removed = 0 if keep_reviews else await judgeme.remove_imported(db, tid)
    data = await store.load(db, tenant_id=tid)
    data["judgeme"] = {}
    await store.save(db, data, tenant_id=tid)
    await db.commit()
    return {"removed": removed, **(await _overview(db, tid))}


# ── Google business ──────────────────────────────────────────────────────────

@router.get("/google/search")
async def search_google(q: str = Query("", max_length=200), _: None = Depends(require_admin),
                        db: AsyncSession = Depends(get_db)) -> dict:
    _tenant()
    try:
        return {"places": await google_place.search(q)}
    except google_place.GooglePlaceError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class GoogleIn(BaseModel):
    place_id: str = Field(..., max_length=300)


@router.put("/google")
async def choose_google(payload: GoogleIn, _: None = Depends(require_admin),
                        db: AsyncSession = Depends(get_db)) -> dict:
    tid = _tenant()
    try:
        # Read it from Google now: a place id that does not answer is not saved.
        await google_place.details(payload.place_id, use_cache=False)
    except google_place.GooglePlaceError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    data = await store.load(db, tenant_id=tid)
    # Only the place id is kept: Google's terms allow storing nothing else.
    data["google_place"] = {"place_id": payload.place_id, "saved_at": _now()}
    await store.save(db, data, tenant_id=tid)
    await db.commit()
    return await _overview(db, tid)


@router.delete("/google")
async def remove_google(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    tid = _tenant()
    data = await store.load(db, tenant_id=tid)
    data["google_place"] = {}
    await store.save(db, data, tenant_id=tid)
    await db.commit()
    return await _overview(db, tid)


# ── Yelp ─────────────────────────────────────────────────────────────────────

class YelpIn(BaseModel):
    url: str | None = Field(None, max_length=500)
    # Reviews already saved that stay (by Yelp review id), and new embed codes.
    keep: list[str] = Field(default_factory=list, max_length=yelp.MAX_REVIEWS)
    add: list[str] = Field(default_factory=list, max_length=yelp.MAX_REVIEWS)


@router.put("/yelp")
async def save_yelp(payload: YelpIn, _: None = Depends(require_admin),
                    db: AsyncSession = Depends(get_db)) -> dict:
    tid = _tenant()
    if any(len(code) > 5000 for code in payload.add):
        raise HTTPException(status_code=400, detail="That embed code is too long. Paste only the code Yelp gives you.")
    data = await store.load(db, tenant_id=tid)
    kept = [r for r in (data["yelp"].get("reviews") or [])
            if isinstance(r, dict) and r.get("id") in set(payload.keep)]
    try:
        cleaned = yelp.clean(payload.url, payload.add, kept=kept)
    except yelp.YelpError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    data["yelp"] = {**cleaned, "saved_at": _now()} if (cleaned["url"] or cleaned["reviews"]) else {}
    await store.save(db, data, tenant_id=tid)
    await db.commit()
    return await _overview(db, tid)


@router.delete("/yelp")
async def remove_yelp(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    tid = _tenant()
    data = await store.load(db, tenant_id=tid)
    data["yelp"] = {}
    await store.save(db, data, tenant_id=tid)
    await db.commit()
    return await _overview(db, tid)
