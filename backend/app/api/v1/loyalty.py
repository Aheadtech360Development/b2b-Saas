"""Loyalty points and buyer referrals (Retail launch, package 5).

Buyer (`/account/rewards`, gated by `loyalty`):
- GET ""            the program, balance, history, rewards, reward codes,
                    and the buyer's referral link;
- GET "/summary"    balance only, for the cart;
- POST "/redeem"    {points, request_id}: a single use code for this buyer;
- POST "/referral"  {code}: who referred them, before their first paid order.

Shop (`/admin/loyalty`; Marketing to read, Billing too to adjust points):
settings, accounts with their ledgers, adjust with a reason, referrals with
the self-referral flags.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.models.loyalty import BuyerReferral, LoyaltyAccount, LoyaltyLedger
from app.services import loyalty as lo

account_router = APIRouter(prefix="/account/rewards", tags=["account", "loyalty"])
admin_router = APIRouter(prefix="/admin/loyalty", tags=["admin", "loyalty"], dependencies=[Depends(require_admin)])

KIND_WORDS = {"earn": "Earned", "reverse": "Taken back (refund)", "redeem": "Spent on a reward",
              "referral": "Referral reward", "adjust": "Adjusted by the shop", "expire": "Expired", "restore": "Given back"}


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


def _row(r: LoyaltyLedger) -> dict:
    return {"id": str(r.id), "kind": r.kind, "kind_words": KIND_WORDS.get(r.kind, r.kind), "points": r.points,
            "balance_after": r.balance_after, "remaining": r.remaining,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "order_id": str(r.order_id) if r.order_id else None, "reason": r.reason, "actor_name": r.actor_name,
            "created_at": r.created_at.isoformat() if r.created_at else None}


async def _me(db: AsyncSession, request: Request):
    from app.models.user import User

    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to see your rewards.")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to see your rewards.")
    return user


# ── The buyer ───────────────────────────────────────────────────────────────

@account_router.get("/summary")
async def my_summary(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    tenant_id = get_current_tenant_id()
    conf = await lo.active(db, tenant_id)
    if not conf:
        return {"enabled": False}
    user_id = getattr(request.state, "user_id", None)
    acct = await lo.account_for(db, tenant_id, user_id, create=False) if user_id else None
    balance = int(acct.balance) if acct else 0
    nxt = next((t for t in conf["tiers"] if int(t["points"]) > balance), None)
    return {"enabled": True, "balance": balance, "points_name": conf["points_name"], "program_name": conf["program_name"],
            "points_per_dollar": conf["points_per_dollar"],
            "next_reward": ({"points": nxt["points"], "reward": nxt["reward"], "needed": int(nxt["points"]) - balance}
                            if nxt else None)}


@account_router.get("")
async def my_rewards(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    from app.models.discount import DiscountCode, DiscountUsage
    from app.services import brand_urls

    tenant_id = get_current_tenant_id()
    conf = await lo.active(db, tenant_id)
    if not conf:
        return {"enabled": False}
    user = await _me(db, request)
    acct = await lo.account_for(db, tenant_id, user.id)
    await db.commit()
    rows = (await db.execute(select(LoyaltyLedger).where(LoyaltyLedger.account_id == acct.id)
                             .order_by(LoyaltyLedger.created_at.desc()).limit(100))).scalars().all()
    used = select(DiscountUsage.discount_code_id)
    codes = (await db.execute(select(DiscountCode).where(
        DiscountCode.owner_user_id == user.id, DiscountCode.is_active.is_(True), DiscountCode.id.notin_(used))
        .order_by(DiscountCode.created_at.desc()))).scalars().all()
    referred = dict((await db.execute(select(BuyerReferral.status, func.count()).where(
        BuyerReferral.referrer_account_id == acct.id).group_by(BuyerReferral.status))).all())
    return {
        "enabled": True, "program_name": conf["program_name"], "points_name": conf["points_name"],
        "points_per_dollar": conf["points_per_dollar"], "expiry_months": conf["expiry_months"],
        "balance": int(acct.balance), "lifetime_earned": int(acct.lifetime_earned),
        "tiers": conf["tiers"], "history": [_row(r) for r in rows],
        "codes": [{"code": c.code, "value": float(c.discount_value),
                   "expires_at": c.expires_at.isoformat() if c.expires_at else None} for c in codes],
        "referral": ({
            "code": acct.referral_code,
            "link": await brand_urls.for_tenant(db, tenant_id, f"/?bref={acct.referral_code}"),
            "you_get": conf["referrer_points"], "friend_gets": conf["friend_points"],
            "rewarded": int(referred.get("rewarded", 0)), "pending": int(referred.get("pending", 0)),
        } if conf["referral_enabled"] else None),
    }


class RedeemIn(BaseModel):
    points: int = Field(..., ge=1)
    request_id: str = Field(..., min_length=8, max_length=100)


@account_router.post("/redeem")
async def redeem(payload: RedeemIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    tenant_id = get_current_tenant_id()
    conf = await lo.active(db, tenant_id)
    if not conf:
        raise HTTPException(status_code=404, detail="This shop has no rewards program.")
    user = await _me(db, request)
    try:
        code, row = await lo.redeem(db, tenant_id, user.id, payload.points, request_id=payload.request_id, conf=conf)
    except lo.LoyaltyError as exc:
        raise _bad(exc)
    await db.commit()
    return {"code": code.code, "value": float(code.discount_value), "balance": row.balance_after,
            "expires_at": code.expires_at.isoformat() if code.expires_at else None}


class ClaimIn(BaseModel):
    code: str = Field(..., min_length=4, max_length=40)


@account_router.post("/referral")
async def claim_referral(payload: ClaimIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    from app.core.rate_limit import enforce_rate_limit

    await enforce_rate_limit(request, "buyer_referral", limit=10, window=3600)
    tenant_id = get_current_tenant_id()
    conf = await lo.active(db, tenant_id)
    if not conf:
        raise HTTPException(status_code=404, detail="This shop has no rewards program.")
    user = await _me(db, request)
    try:
        ref = await lo.claim(db, tenant_id, user, payload.code, conf)
    except lo.LoyaltyError as exc:
        raise _bad(exc)
    await db.commit()
    if ref.status == "blocked":
        raise HTTPException(status_code=400, detail="You can't use your own referral code.")
    return {"status": ref.status, "friend_gets": conf["friend_points"], "points_name": conf["points_name"]}


# ── The shop ────────────────────────────────────────────────────────────────

@admin_router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict:
    return await lo.settings_for(db, get_current_tenant_id())


class SettingsIn(BaseModel):
    enabled: bool | None = None
    program_name: str | None = Field(None, max_length=40)
    points_name: str | None = Field(None, max_length=20)
    points_per_dollar: int | None = None
    tiers: list[dict[str, Any]] | None = None
    expiry_months: int | None = None
    referral_enabled: bool | None = None
    referrer_points: int | None = None
    friend_points: int | None = None


@admin_router.put("/settings")
async def put_settings(payload: SettingsIn, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        saved = await lo.save_settings(db, get_current_tenant_id(), payload.model_dump(exclude_none=True))
    except lo.LoyaltyError as exc:
        raise _bad(exc)
    await db.commit()
    return saved


@admin_router.get("/accounts")
async def accounts(q: str | None = Query(None, max_length=100), page: int = Query(1, ge=1),
                   db: AsyncSession = Depends(get_db)) -> dict:
    from app.models.user import User

    tenant_id = get_current_tenant_id()
    where = [LoyaltyAccount.tenant_id == tenant_id]
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        where.append(or_(func.lower(User.email).like(like), func.lower(User.first_name).like(like),
                         func.lower(User.last_name).like(like), LoyaltyAccount.referral_code == q.strip().upper()))
    base = select(LoyaltyAccount, User).join(User, User.id == LoyaltyAccount.user_id).where(*where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(LoyaltyAccount.balance.desc()).offset((page - 1) * 50).limit(50))).all()
    totals = (await db.execute(select(func.coalesce(func.sum(LoyaltyAccount.balance), 0),
                                      func.coalesce(func.sum(LoyaltyAccount.lifetime_earned), 0))
                               .where(LoyaltyAccount.tenant_id == tenant_id))).one()
    return {"items": [{"id": str(a.id), "user_id": str(u.id), "email": u.email,
                       "name": " ".join(x for x in (u.first_name, u.last_name) if x) or u.email,
                       "balance": a.balance, "lifetime_earned": a.lifetime_earned, "referral_code": a.referral_code}
                      for a, u in rows],
            "total": int(total), "outstanding": int(totals[0]), "earned": int(totals[1])}


@admin_router.get("/accounts/{account_id}")
async def account_detail(account_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    acct = await db.get(LoyaltyAccount, account_id)
    if acct is None or str(acct.tenant_id) != str(get_current_tenant_id()):
        raise HTTPException(status_code=404, detail="Rewards account not found.")
    rows = (await db.execute(select(LoyaltyLedger).where(LoyaltyLedger.account_id == acct.id)
                             .order_by(LoyaltyLedger.created_at.desc()).limit(200))).scalars().all()
    return {"id": str(acct.id), "balance": acct.balance, "lifetime_earned": acct.lifetime_earned,
            "referral_code": acct.referral_code, "history": [_row(r) for r in rows],
            "ledger_matches": await lo.balance_matches(db, acct.id)}


class AdjustIn(BaseModel):
    points: int
    reason: str = Field(..., min_length=3, max_length=300)
    request_id: str = Field(..., min_length=8, max_length=100)


@admin_router.post("/accounts/{account_id}/adjust")
async def adjust(account_id: uuid.UUID, payload: AdjustIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    from app.services import order_events

    tenant_id = get_current_tenant_id()
    conf = await lo.settings_for(db, tenant_id)
    try:
        row = await lo.adjust(db, tenant_id, account_id, payload.points, reason=payload.reason,
                              request_id=payload.request_id, actor=await order_events.admin_actor(db, request), conf=conf)
    except lo.LoyaltyError as exc:
        raise _bad(exc)
    await db.commit()
    return _row(row)


@admin_router.get("/referrals")
async def referrals(db: AsyncSession = Depends(get_db)) -> dict:
    from app.models.user import User

    tenant_id = get_current_tenant_id()
    rows = (await db.execute(
        select(BuyerReferral, LoyaltyAccount, User).join(LoyaltyAccount, LoyaltyAccount.id == BuyerReferral.referrer_account_id)
        .join(User, User.id == LoyaltyAccount.user_id).where(BuyerReferral.tenant_id == tenant_id)
        .order_by(BuyerReferral.created_at.desc()).limit(300)
    )).all()
    return {"items": [{
        "id": str(r.id), "status": r.status, "flagged": r.status == "blocked", "block_reason": r.block_reason,
        "referrer_email": u.email, "friend_email": r.referred_email,
        "first_order_id": str(r.first_order_id) if r.first_order_id else None,
        "rewarded_at": r.rewarded_at.isoformat() if r.rewarded_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r, a, u in rows]}
