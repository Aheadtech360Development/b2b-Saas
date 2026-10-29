"""Loyalty points and buyer referrals (Retail launch, package 5).

Points are whole numbers on a ledger, like gift cards' money:
- every change is a `loyalty_ledger` row made under a lock on the buyer's
  account row (with `populate_existing`: an account read earlier in the
  session must not keep its old balance), with the balance after it;
- rows that add points keep `remaining`, spent oldest first (expiring
  soonest first), so expiry takes exactly what is left of each grant;
- idempotency keys (unique per shop) make every retry harmless: earn:{order},
  reverse:{order}:{target}, redeem:{request}, adjust:{request},
  expire:{row}, referral:{referral}:{side}.

Earning: an order earns when it is paid and placed by an account, on what
the goods cost (total less shipping and tax, gift cards bought on it left
out); cancelled and unpaid orders earn nothing. Checkout earns at once
(`earn_safely`, after the order is saved: points never fail an order); the
10 minute loop (`run`) earns every paid order the checkout did not (marked
paid by hand, an invoice paid later), reverses what refunds take back (in
proportion to what was refunded), expires old points, emails before they
expire, and settles referrals.

Redeeming a reward tier spends points for a single use discount code that
only that buyer can use (discount_codes.owner_user_id).

Referrals (?bref=CODE, apart from the partner program's ?ref=): the friend
claims the code before their first paid order; when it is paid both earn.
Self referral is blocked and shown to the owner: the same account, the same
email (dots and +tags in Gmail names ignored), or the same delivery address
as one of the referrer's orders.
"""
from __future__ import annotations

import json
import logging
import math
import re
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_, select

from app.models.loyalty import BuyerReferral, LoyaltyAccount, LoyaltyLedger

logger = logging.getLogger(__name__)

SETTINGS_KEY = "loyalty"
DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "program_name": "Rewards",
    "points_name": "points",
    "points_per_dollar": 1,
    # Points for dollars off, as single use codes.
    "tiers": [{"points": 100, "reward": 5}, {"points": 250, "reward": 15}, {"points": 500, "reward": 35}],
    "expiry_months": 12,          # 0: points never expire
    "referral_enabled": False,
    "referrer_points": 100,
    "friend_points": 50,
}
ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
EXPIRY_NOTICE_DAYS = 14
TICK_SECONDS = 600


class LoyaltyError(Exception):
    """Something the buyer or the owner can be told, in these words."""


# ── Settings ───────────────────────────────────────────────────────────────

def _int(value: Any, lo: int, hi: int) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi and float(value) == n else None


def clean_settings(raw: Any) -> dict[str, Any]:
    out = json.loads(json.dumps(DEFAULTS))
    if not isinstance(raw, dict):
        return out
    for key in ("enabled", "referral_enabled"):
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    for key, limit in (("program_name", 40), ("points_name", 20)):
        if isinstance(raw.get(key), str) and raw[key].strip():
            out[key] = raw[key].strip()[:limit]
    for key, lo, hi in (("points_per_dollar", 1, 100), ("expiry_months", 0, 60),
                        ("referrer_points", 0, 100000), ("friend_points", 0, 100000)):
        n = _int(raw.get(key), lo, hi)
        if n is not None:
            out[key] = n
    if isinstance(raw.get("tiers"), list):
        tiers = {}
        for t in raw["tiers"][:10]:
            if not isinstance(t, dict):
                continue
            pts, reward = _int(t.get("points"), 1, 1000000), t.get("reward")
            try:
                reward = Decimal(str(reward)).quantize(Decimal("0.01"))
            except Exception:  # noqa: BLE001
                continue
            if pts and Decimal("0.01") <= reward <= Decimal("1000"):
                tiers[pts] = float(reward) if reward != reward.to_integral() else int(reward)
        if tiers:
            out["tiers"] = [{"points": p, "reward": r} for p, r in sorted(tiers.items())]
    return out


def check_settings(changes: dict) -> None:
    if "points_per_dollar" in changes and _int(changes["points_per_dollar"], 1, 100) is None:
        raise LoyaltyError("Points per dollar is a whole number from 1 to 100.")
    if "expiry_months" in changes and _int(changes["expiry_months"], 0, 60) is None:
        raise LoyaltyError("Points expire after 1 to 60 months, or never (0).")
    if "tiers" in changes:
        if not isinstance(changes["tiers"], list) or not clean_settings({"tiers": changes["tiers"]})["tiers"] \
                or len(clean_settings({"tiers": changes["tiers"]})["tiers"]) != len(changes["tiers"]):
            raise LoyaltyError("Each reward needs whole points and a dollar amount from $0.01 to $1,000, "
                               "each points level once.")


async def settings_for(db, tenant_id) -> dict[str, Any]:
    from app.core.tenant_settings import get_setting

    raw = await get_setting(db, SETTINGS_KEY, tenant_id=tenant_id)
    try:
        return clean_settings(json.loads(raw) if raw else None)
    except (TypeError, ValueError):
        return clean_settings(None)


async def save_settings(db, tenant_id, changes: dict) -> dict[str, Any]:
    from app.core.tenant_settings import set_setting

    check_settings(changes)
    merged = clean_settings({**(await settings_for(db, tenant_id)), **changes})
    await set_setting(db, SETTINGS_KEY, json.dumps(merged), tenant_id=tenant_id)
    return merged


async def active(db, tenant_id) -> dict[str, Any] | None:
    """The shop's settings when its program runs (feature in plan and on)."""
    from app.services import entitlements

    try:
        if not await entitlements.enabled(db, tenant_id, "loyalty"):
            return None
    except Exception:  # noqa: BLE001
        return None
    conf = await settings_for(db, tenant_id)
    return conf if conf["enabled"] else None


# ── Accounts and the ledger ────────────────────────────────────────────────

def _code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


async def account_for(db, tenant_id, user_id, *, create: bool = True) -> LoyaltyAccount | None:
    acct = (await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.tenant_id == tenant_id, LoyaltyAccount.user_id == user_id)
    )).scalar_one_or_none()
    if acct is not None or not create:
        return acct
    for _ in range(5):
        code = _code()
        if not (await db.execute(select(LoyaltyAccount.id).where(
                LoyaltyAccount.tenant_id == tenant_id, LoyaltyAccount.referral_code == code))).first():
            break
    acct = LoyaltyAccount(tenant_id=tenant_id, user_id=user_id, balance=0, lifetime_earned=0, referral_code=code)
    try:
        async with db.begin_nested():
            db.add(acct)
            await db.flush()
    except Exception:  # noqa: BLE001 - made by a concurrent request: use that one
        acct = (await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.tenant_id == tenant_id, LoyaltyAccount.user_id == user_id)
        )).scalar_one()
    return acct


async def _lock(db, account_id) -> LoyaltyAccount:
    acct = (await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.id == account_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if acct is None:
        raise LoyaltyError("Rewards account not found.")
    return acct


async def _done(db, tenant_id, key: str) -> LoyaltyLedger | None:
    return (await db.execute(
        select(LoyaltyLedger).where(LoyaltyLedger.tenant_id == tenant_id, LoyaltyLedger.idempotency_key == key)
    )).scalar_one_or_none()


async def _consume(db, acct: LoyaltyAccount, points: int, *, first_order=None) -> None:
    """Take `points` from the oldest grants (the given order's own first)."""
    rows = (await db.execute(
        select(LoyaltyLedger).where(LoyaltyLedger.account_id == acct.id, LoyaltyLedger.remaining > 0)
        .order_by(LoyaltyLedger.expires_at.asc().nulls_last(), LoyaltyLedger.created_at)
        .with_for_update().execution_options(populate_existing=True)
    )).scalars().all()
    if first_order is not None:
        rows = sorted(rows, key=lambda r: 0 if str(r.order_id) == str(first_order) and r.kind == "earn" else 1)
    left = points
    for r in rows:
        if left <= 0:
            break
        take = min(int(r.remaining or 0), left)
        r.remaining = int(r.remaining or 0) - take
        left -= take
    if left > 0:
        raise LoyaltyError("Not enough points.")


async def _write(db, acct: LoyaltyAccount, kind: str, points: int, *, key: str, order_id=None,
                 discount_code_id=None, expires_at=None, actor: tuple | None = None,
                 reason: str | None = None, first_order=None) -> LoyaltyLedger:
    """One movement on an account the caller holds the lock on."""
    if points < 0:
        if acct.balance + points < 0:
            raise LoyaltyError("Not enough points.")
        await _consume(db, acct, -points, first_order=first_order)
    acct.balance = int(acct.balance) + points
    if points > 0 and kind in ("earn", "referral"):
        acct.lifetime_earned = int(acct.lifetime_earned) + points
    actor_id, actor_name = actor or (None, None)
    row = LoyaltyLedger(
        tenant_id=acct.tenant_id, account_id=acct.id, kind=kind, points=points,
        remaining=points if points > 0 else None, balance_after=acct.balance, expires_at=expires_at,
        order_id=order_id, discount_code_id=discount_code_id, actor_user_id=actor_id,
        actor_name=(actor_name or None) and str(actor_name)[:255], reason=(reason or None) and reason[:300],
        idempotency_key=key[:150],
    )
    db.add(row)
    await db.flush()
    return row


def _expiry(conf: dict, now: datetime | None = None) -> datetime | None:
    months = int(conf.get("expiry_months") or 0)
    return (now or datetime.now(timezone.utc)) + timedelta(days=round(months * 365.25 / 12)) if months else None


# ── Earning and reversing ──────────────────────────────────────────────────

def points_for(order: Any, conf: dict, gift_cards_bought: Decimal = Decimal("0")) -> int:
    """What an order earns: the goods (total less shipping, tax and gift
    cards bought on it) times points per dollar, rounded down."""
    base = (Decimal(str(order.total or 0)) - Decimal(str(order.shipping_cost or 0))
            - Decimal(str(order.tax_amount or 0)) - gift_cards_bought)
    return max(0, math.floor(base * int(conf["points_per_dollar"])))


def earns(order: Any) -> bool:
    return (order.payment_status == "paid" and order.status not in ("cancelled", "refunded")
            and bool(order.placed_by_id) and (order.payment_method or "") != "no_charge"
            and not (order.order_number or "").startswith("DRAFT-"))


async def _gift_cards_bought(db, order_id) -> Decimal:
    from app.models.order import OrderItem
    from app.services.gift_card_checkout import GIFT_SKU

    return Decimal(str((await db.execute(
        select(func.coalesce(func.sum(OrderItem.line_total), 0)).where(OrderItem.order_id == order_id,
                                                                          OrderItem.sku == GIFT_SKU)
    )).scalar_one() or 0))


async def earn(db, order: Any, conf: dict) -> LoyaltyLedger | None:
    """Points for a paid order. Once per order, whoever asks."""
    if not earns(order):
        return None
    if await _done(db, order.tenant_id, f"earn:{order.id}"):
        return None
    pts = points_for(order, conf, await _gift_cards_bought(db, order.id))
    if pts <= 0:
        return None
    acct = await account_for(db, order.tenant_id, order.placed_by_id)
    acct = await _lock(db, acct.id)
    if await _done(db, order.tenant_id, f"earn:{order.id}"):
        return None
    return await _write(db, acct, "earn", pts, key=f"earn:{order.id}", order_id=order.id,
                        expires_at=_expiry(conf), reason=f"Order {order.order_number}")


async def reverse(db, order: Any) -> LoyaltyLedger | None:
    """Take back the share of an order's points its refunds took back: all of
    them for a full refund, in proportion for a part. What was already spent
    cannot be taken back, and the row says so."""
    earned = await _done(db, order.tenant_id, f"earn:{order.id}")
    if earned is None:
        return None
    total = Decimal(str(order.total or 0))
    refunded = min(total, Decimal(str(getattr(order, "amount_refunded", 0) or 0)))
    if total <= 0:
        return None
    target = math.floor(Decimal(earned.points) * refunded / total) if refunded < total else int(earned.points)
    already = -int((await db.execute(
        select(func.coalesce(func.sum(LoyaltyLedger.points), 0)).where(
            LoyaltyLedger.account_id == earned.account_id, LoyaltyLedger.order_id == order.id,
            LoyaltyLedger.kind == "reverse")
    )).scalar_one() or 0)
    delta = target - already
    if delta <= 0:
        return None
    key = f"reverse:{order.id}:{target}"
    if await _done(db, order.tenant_id, key):
        return None
    acct = await _lock(db, earned.account_id)
    take = min(delta, int(acct.balance))
    if take <= 0:
        return None
    short = delta - take
    return await _write(db, acct, "reverse", -take, key=key, order_id=order.id, first_order=order.id,
                        reason=f"Refund on order {order.order_number}"
                        + (f" ({short} already spent)" if short else ""))


async def earn_safely(db, order: Any) -> int:
    """Checkout's call, after the order is saved: never raises. The loop
    earns anything this misses."""
    try:
        conf = await active(db, order.tenant_id)
        if not conf:
            return 0
        async with db.begin_nested():
            row = await earn(db, order, conf)
        await db.commit()
        if row is not None:
            await _mail_earned(db, order, row.points, conf)
            return int(row.points)
    except Exception:  # noqa: BLE001
        logger.warning("Loyalty: earn for order %s left to the loop", getattr(order, "id", None), exc_info=True)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
    return 0


# ── Redeeming, adjusting, expiring ─────────────────────────────────────────

async def redeem(db, tenant_id, user_id, tier_points: int, *, request_id: str, conf: dict) -> tuple[Any, LoyaltyLedger]:
    """Spend points on a tier: a single use code for the buyer alone."""
    from app.models.discount import DiscountCode

    tier = next((t for t in conf["tiers"] if int(t["points"]) == int(tier_points)), None)
    if tier is None:
        raise LoyaltyError("Choose one of the shop's rewards.")
    acct = await account_for(db, tenant_id, user_id)
    acct = await _lock(db, acct.id)
    key = f"redeem:{request_id}"
    done = await _done(db, tenant_id, key)
    if done is not None:
        return await db.get(DiscountCode, done.discount_code_id), done
    if acct.balance < int(tier["points"]):
        raise LoyaltyError(f"You need {int(tier['points']) - acct.balance} more {conf['points_name']} for this reward.")
    code = None
    for _ in range(5):
        candidate = f"RWD-{_code()}"
        try:
            async with db.begin_nested():
                code = DiscountCode(
                    tenant_id=tenant_id, code=candidate, discount_type="fixed_amount",
                    discount_value=Decimal(str(tier["reward"])), usage_limit_total=1, usage_limit_per_customer=1,
                    applicable_to="all", customer_eligibility="all", is_active=True,
                    expires_at=datetime.now(timezone.utc) + timedelta(days=365), owner_user_id=user_id,
                )
                db.add(code)
                await db.flush()
            break
        except Exception:  # noqa: BLE001 - the code is taken in some shop: another
            code = None
    if code is None:
        raise LoyaltyError("Could not make a reward code. Try again.")
    row = await _write(db, acct, "redeem", -int(tier["points"]), key=key, discount_code_id=code.id,
                       reason=f"${tier['reward']} off, code {code.code}")
    return code, row


async def adjust(db, tenant_id, account_id, points: int, *, reason: str, request_id: str,
                 actor: tuple | None, conf: dict) -> LoyaltyLedger:
    if not isinstance(points, int) or isinstance(points, bool) or points == 0 or abs(points) > 1000000:
        raise LoyaltyError("Enter the points to add, or a minus to take off.")
    if not reason or len(reason.strip()) < 3:
        raise LoyaltyError("Say why, in a few words.")
    acct = await _lock(db, account_id)
    if str(acct.tenant_id) != str(tenant_id):
        raise LoyaltyError("Rewards account not found.")
    done = await _done(db, tenant_id, f"adjust:{request_id}")
    if done is not None:
        return done
    return await _write(db, acct, "adjust", points, key=f"adjust:{request_id}", actor=actor, reason=reason.strip(),
                        expires_at=_expiry(conf) if points > 0 else None)


async def expire_due(db, now: datetime | None = None, limit: int = 500) -> int:
    now = now or datetime.now(timezone.utc)
    rows = (await db.execute(
        select(LoyaltyLedger.id, LoyaltyLedger.account_id).where(
            LoyaltyLedger.remaining > 0, LoyaltyLedger.expires_at.isnot(None), LoyaltyLedger.expires_at <= now)
        .limit(limit)
    )).all()
    n = 0
    for row_id, account_id in rows:
        acct = await _lock(db, account_id)
        grant = (await db.execute(select(LoyaltyLedger).where(LoyaltyLedger.id == row_id).with_for_update()
                                  .execution_options(populate_existing=True))).scalar_one()
        left = int(grant.remaining or 0)
        if left <= 0 or await _done(db, acct.tenant_id, f"expire:{grant.id}"):
            continue
        grant.remaining = 0
        acct.balance = int(acct.balance) - left
        db.add(LoyaltyLedger(tenant_id=acct.tenant_id, account_id=acct.id, kind="expire", points=-left,
                             balance_after=acct.balance, reason="Expired", idempotency_key=f"expire:{grant.id}"))
        await db.flush()
        n += 1
    return n


# ── Referrals ──────────────────────────────────────────────────────────────

def same_email(a: str | None, b: str | None) -> bool:
    def norm(e: str | None) -> str:
        e = (e or "").strip().lower()
        if "@" not in e:
            return e
        local, domain = e.split("@", 1)
        local = local.split("+", 1)[0]
        if domain in ("gmail.com", "googlemail.com"):
            local, domain = local.replace(".", ""), "gmail.com"
        return f"{local}@{domain}"
    return bool(a and b) and norm(a) == norm(b)


def _place(snapshot: Any) -> str | None:
    try:
        data = json.loads(snapshot) if isinstance(snapshot, str) else (snapshot or {})
    except (TypeError, ValueError):
        return None
    line = re.sub(r"[^a-z0-9]", "", str(data.get("line1") or "").lower())
    zip_ = re.sub(r"[^0-9]", "", str(data.get("postal_code") or ""))[:5]
    return f"{line}|{zip_}" if line and zip_ else None


async def claim(db, tenant_id, user, code: str, conf: dict) -> BuyerReferral:
    """A buyer says who referred them, before their first paid order."""
    from app.models.order import Order
    from app.models.user import User

    if not conf.get("referral_enabled"):
        raise LoyaltyError("This shop has no referral rewards right now.")
    code = re.sub(r"[^A-Z0-9]", "", (code or "").upper())[:16]
    referrer = (await db.execute(select(LoyaltyAccount).where(
        LoyaltyAccount.tenant_id == tenant_id, LoyaltyAccount.referral_code == code))).scalar_one_or_none()
    if referrer is None:
        raise LoyaltyError("That referral code isn't valid.")
    if (await db.execute(select(BuyerReferral.id).where(BuyerReferral.tenant_id == tenant_id,
                                                        BuyerReferral.referred_user_id == user.id))).first():
        raise LoyaltyError("You were already referred.")
    paid_before = (await db.execute(select(Order.id).where(
        Order.placed_by_id == user.id, Order.payment_status == "paid").limit(1))).first()
    if paid_before:
        raise LoyaltyError("Referral rewards are for a first order.")
    status, why = "pending", None
    referrer_email = (await db.execute(select(User.email).where(User.id == referrer.user_id))).scalar_one_or_none()
    if str(referrer.user_id) == str(user.id):
        status, why = "blocked", "Referred themselves (same account)"
    elif same_email(referrer_email, user.email):
        status, why = "blocked", "Referred themselves (same email)"
    ref = BuyerReferral(tenant_id=tenant_id, referrer_account_id=referrer.id, referred_user_id=user.id,
                        referred_email=(user.email or "").lower()[:255], status=status, block_reason=why)
    db.add(ref)
    await db.flush()
    # A blocked one is kept (the owner sees it flagged); the caller saves it
    # and tells the buyer no.
    return ref


async def settle_referral(db, ref: BuyerReferral, conf: dict) -> str:
    """A pending referral whose friend has paid for a first order: rewarded,
    or blocked as self referral. Returns the new status (or pending)."""
    from app.models.order import Order

    first = (await db.execute(
        select(Order).where(Order.tenant_id == ref.tenant_id, Order.placed_by_id == ref.referred_user_id,
                            Order.payment_status == "paid", Order.status.notin_(("cancelled", "refunded")))
        .order_by(Order.created_at).limit(1)
    )).scalar_one_or_none()
    if first is None:
        return "pending"
    referrer = await db.get(LoyaltyAccount, ref.referrer_account_id)
    theirs = (await db.execute(select(Order.shipping_address_snapshot).where(
        Order.tenant_id == ref.tenant_id, Order.placed_by_id == referrer.user_id)
        .order_by(Order.created_at.desc()).limit(20))).scalars().all()
    here = _place(first.shipping_address_snapshot)
    ref.first_order_id = first.id
    if here and here in {_place(s) for s in theirs}:
        ref.status, ref.block_reason = "blocked", "Referred themselves (same delivery address)"
        await db.flush()
        return "blocked"
    ref.status = "qualified"
    friend = await account_for(db, ref.tenant_id, ref.referred_user_id)
    for acct_id, pts, side in ((referrer.id, int(conf["referrer_points"]), "referrer"),
                               (friend.id, int(conf["friend_points"]), "friend")):
        if pts > 0 and not await _done(db, ref.tenant_id, f"referral:{ref.id}:{side}"):
            acct = await _lock(db, acct_id)
            await _write(db, acct, "referral", pts, key=f"referral:{ref.id}:{side}", order_id=first.id,
                         expires_at=_expiry(conf),
                         reason="Referred a friend" if side == "referrer" else "Welcome, referred by a friend")
    ref.status, ref.rewarded_at = "rewarded", datetime.now(timezone.utc)
    await db.flush()
    return "rewarded"


# ── Telling the buyer ──────────────────────────────────────────────────────

async def _buyer(db, user_id):
    from app.models.user import User

    return (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def _mail_earned(db, order: Any, points: int, conf: dict) -> None:
    from app.services import brand_urls, mails
    from app.services.email_service import EmailService

    user = await _buyer(db, order.placed_by_id)
    if user is None or not user.email:
        return
    acct = await account_for(db, order.tenant_id, user.id, create=False)
    subject, html = mails.points_earned(
        points=points, balance=int(acct.balance if acct else points), points_name=conf["points_name"],
        program=conf["program_name"], order_number=order.order_number,
        rewards_url=await brand_urls.for_tenant(db, order.tenant_id, "/account/rewards"),
    )
    try:
        EmailService(db).send_raw(to_email=user.email, subject=subject, body_html=html)
    except Exception:  # noqa: BLE001
        logger.warning("Loyalty: points email failed for order %s", order.id, exc_info=True)


async def notify_expiring(db, now: datetime | None = None, limit: int = 200) -> int:
    """One email per grant, two weeks before its points expire."""
    from app.services import brand_urls, mails
    from app.services.email_service import EmailService

    now = now or datetime.now(timezone.utc)
    rows = (await db.execute(
        select(LoyaltyLedger).where(LoyaltyLedger.remaining > 0, LoyaltyLedger.expires_at.isnot(None),
                                    LoyaltyLedger.expires_at <= now + timedelta(days=EXPIRY_NOTICE_DAYS),
                                    LoyaltyLedger.expires_at > now, LoyaltyLedger.expiry_notified_at.is_(None))
        .limit(limit)
    )).scalars().all()
    sent = 0
    for row in rows:
        row.expiry_notified_at = now
        acct = await db.get(LoyaltyAccount, row.account_id)
        conf = await active(db, row.tenant_id)
        user = await _buyer(db, acct.user_id) if acct else None
        if not conf or user is None or not user.email:
            continue
        await _brand(db, row.tenant_id)
        subject, html = mails.points_expiring(
            points=int(row.remaining), expires_on=row.expires_at, points_name=conf["points_name"],
            program=conf["program_name"], rewards_url=await brand_urls.for_tenant(db, row.tenant_id, "/account/rewards"),
        )
        try:
            if EmailService(db).send_raw(to_email=user.email, subject=subject, body_html=html):
                sent += 1
        except Exception:  # noqa: BLE001
            logger.warning("Loyalty: expiry email failed", exc_info=True)
    await db.flush()
    return sent


async def _brand(db, tenant_id) -> None:
    """Mail from the timed loop goes out in the shop's name."""
    from app.core.database import _resolve_brand_name, _resolve_brand_site
    from app.core.tenant_context import set_current_brand_name, set_current_brand_site

    set_current_brand_name(await _resolve_brand_name(db, tenant_id))
    set_current_brand_site(await _resolve_brand_site(db, tenant_id))


# ── The loop ───────────────────────────────────────────────────────────────

async def run(now: datetime | None = None, days: int = 60) -> dict[str, int]:
    """Earn what checkout missed, reverse what refunds took back, expire,
    warn before expiry and settle referrals. Every shop; each order in its
    own savepoint so one bad row stops nothing."""
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping
    from app.models.order import Order

    now = now or datetime.now(timezone.utc)
    out = {"earned": 0, "reversed": 0, "expired": 0, "notified": 0, "referrals": 0}
    confs: dict = {}
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            async def conf_for(tid):
                if tid not in confs:
                    confs[tid] = await active(db, tid)
                return confs[tid]

            earned_keys = select(LoyaltyLedger.order_id).where(LoyaltyLedger.kind == "earn",
                                                               LoyaltyLedger.order_id.isnot(None))
            todo = (await db.execute(
                select(Order).where(Order.payment_status == "paid", Order.placed_by_id.isnot(None),
                                    Order.status.notin_(("cancelled", "refunded")),
                                    Order.created_at >= now - timedelta(days=days), Order.id.notin_(earned_keys))
                .order_by(Order.created_at).limit(500)
            )).scalars().all()
            for order in todo:
                conf = await conf_for(order.tenant_id)
                if not conf:
                    continue
                try:
                    async with db.begin_nested():
                        if await earn(db, order, conf):
                            out["earned"] += 1
                except Exception:  # noqa: BLE001
                    logger.exception("Loyalty: could not earn for order %s", order.id)
            await db.commit()

            refunded = (await db.execute(
                select(Order).where(Order.id.in_(earned_keys), Order.amount_refunded > 0,
                                    Order.created_at >= now - timedelta(days=180)).limit(1000)
            )).scalars().all()
            for order in refunded:
                try:
                    async with db.begin_nested():
                        if await reverse(db, order):
                            out["reversed"] += 1
                except Exception:  # noqa: BLE001
                    logger.exception("Loyalty: could not reverse for order %s", order.id)
            await db.commit()

            out["expired"] = await expire_due(db, now)
            await db.commit()
            out["notified"] = await notify_expiring(db, now)
            await db.commit()

            pending = (await db.execute(select(BuyerReferral).where(BuyerReferral.status == "pending")
                                        .limit(500))).scalars().all()
            for ref in pending:
                conf = await conf_for(ref.tenant_id)
                if not conf or not ref.referred_user_id:
                    continue
                try:
                    async with db.begin_nested():
                        if await settle_referral(db, ref, conf) != "pending":
                            out["referrals"] += 1
                except Exception:  # noqa: BLE001
                    logger.exception("Loyalty: could not settle referral %s", ref.id)
            await db.commit()
    finally:
        set_bypass_scoping(False)
    if any(out.values()):
        logger.info("Loyalty: %s", out)
    return out


async def scheduler_loop() -> None:
    import asyncio

    await asyncio.sleep(240)
    while True:
        try:
            from app.core.redis import get_redis_pool

            if await get_redis_pool().set("loyalty:timed", "1", nx=True, ex=TICK_SECONDS - 60):
                await run()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("loyalty timed work failed")
        await asyncio.sleep(TICK_SECONDS)


# ── Reading ────────────────────────────────────────────────────────────────

async def balance_matches(db, account_id) -> bool:
    acct = await db.get(LoyaltyAccount, account_id)
    total, open_ = (await db.execute(
        select(func.coalesce(func.sum(LoyaltyLedger.points), 0),
               func.coalesce(func.sum(LoyaltyLedger.remaining), 0)).where(LoyaltyLedger.account_id == account_id)
    )).one()
    return acct is not None and int(total) == int(acct.balance) == int(open_)
