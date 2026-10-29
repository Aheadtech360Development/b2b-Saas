"""Gift cards (Retail launch, package 3): codes, the shop's settings, and the
ledger every balance change goes through.

A gift card is money the shop owes whoever holds the code, so:

- The code is 16 random Crockford base32 characters (80 bits), shown as
  XXXX-XXXX-XXXX-XXXX. It is never stored: only SHA-256 of the shop and the
  normalised code, and its last 4 characters for showing it masked. It is
  shown in full once: in the recipient's email, or on screen to the admin who
  issued it.
- Every change is a `gift_card_ledger` row, made under a lock on the card's
  row (`SELECT ... FOR UPDATE`), with the balance after it. The rows of a card
  add up to its balance; the database refuses a balance below zero.
- Every row carries an idempotency key, unique per shop: a retried capture,
  refund or issue finds its row and writes nothing twice.
- A checkout sets money aside as a hold, taken off the balance at once, so two
  checkouts racing for one card cannot spend more than it has. The hold is
  captured when the order is made and given back if the payment fails or the
  hold runs out (`release_due`, every 5 minutes).
- Wrong codes are counted per visitor and shop; past 10 in 15 minutes or 50 in
  a day the code is not even looked up. An unknown code and one that is
  disabled, voided or expired get the same answer.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func, select

from app.models.gift_card import GiftCard, GiftCardHold, GiftCardLedger

logger = logging.getLogger(__name__)

CENTS = Decimal("0.01")
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32: no I, L, O, U
CODE_LEN = 16
HOLD_MINUTES = 30
MAX_CARDS_PER_ORDER = 5
# The smallest card charge Stripe takes (USD).
CARD_MINIMUM = Decimal("0.50")
MAX_AMOUNT = Decimal("2000")
MESSAGE_MAX = 500

SETTINGS_KEY = "gift_cards"
DEFAULTS: dict[str, Any] = {
    # Off until the shop turns it on: a gift card is a promise the shop keeps.
    "enabled": False,
    "amounts": [25, 50, 100],
    "custom": False,
    "custom_min": 10,
    "custom_max": 500,
    # 0 = never. Otherwise at least 5 years: US federal law (the CARD Act)
    # allows no less, and some states allow no expiry at all.
    "expiry_months": 0,
    "message": "",
}
EXPIRY_MIN_MONTHS = 60
EXPIRY_MAX_MONTHS = 120

NOT_VALID = "That gift card code isn't valid. Check it and try again."
NO_BALANCE = "This gift card has no balance left."
TOO_MANY = "Too many gift card tries. Please wait a few minutes and try again."

# Wrong codes per visitor and shop.
FAIL_LIMIT = 10
FAIL_WINDOW = 900
DAY_LIMIT = 50


class GiftCardError(Exception):
    """Something the buyer or the admin can be told, in these words."""


class TooManyTries(GiftCardError):
    def __init__(self) -> None:
        super().__init__(TOO_MANY)


# ── Codes ──────────────────────────────────────────────────────────────────

_CONFUSABLE = str.maketrans({"O": "0", "I": "1", "L": "1"})


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))


def normalize(raw: Any) -> str | None:
    """The code as typed, made canonical: spaces and dashes dropped, upper case,
    O read as 0 and I or L as 1. None when it cannot be a code at all."""
    if not isinstance(raw, str) or len(raw) > 64:
        return None
    s = re.sub(r"[\s\-]", "", raw).upper().translate(_CONFUSABLE)
    if len(s) != CODE_LEN or any(c not in ALPHABET for c in s):
        return None
    return s


def display(code: str) -> str:
    return "-".join(code[i:i + 4] for i in range(0, CODE_LEN, 4))


def masked(last4: str) -> str:
    return f"•••• {last4}"


def code_hash(tenant_id: Any, code: str) -> str:
    return hashlib.sha256(f"gift-card:{tenant_id}:{code}".encode()).hexdigest()


def money(value: Any) -> Decimal:
    try:
        return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        raise GiftCardError("Enter an amount in dollars, like 25 or 25.50.")


def last4_of(raw: Any) -> str:
    norm = normalize(raw)
    return norm[-4:] if norm else ""


# ── Settings ───────────────────────────────────────────────────────────────

def _amount_ok(value: Any) -> Decimal | None:
    try:
        d = Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None
    return d if Decimal("1") <= d <= MAX_AMOUNT else None


def clean_settings(raw: Any) -> dict[str, Any]:
    out = json.loads(json.dumps(DEFAULTS))
    if not isinstance(raw, dict):
        return out
    if isinstance(raw.get("enabled"), bool):
        out["enabled"] = raw["enabled"]
    if isinstance(raw.get("amounts"), list):
        amounts = sorted({a for a in (_amount_ok(v) for v in raw["amounts"][:12]) if a is not None})
        out["amounts"] = [float(a) if a != a.to_integral() else int(a) for a in amounts][:8]
    if isinstance(raw.get("custom"), bool):
        out["custom"] = raw["custom"]
    lo, hi = _amount_ok(raw.get("custom_min")), _amount_ok(raw.get("custom_max"))
    if lo is not None and hi is not None and lo <= hi:
        out["custom_min"], out["custom_max"] = float(lo), float(hi)
    months = raw.get("expiry_months")
    if isinstance(months, int) and not isinstance(months, bool) and (
            months == 0 or EXPIRY_MIN_MONTHS <= months <= EXPIRY_MAX_MONTHS):
        out["expiry_months"] = months
    if isinstance(raw.get("message"), str):
        out["message"] = raw["message"].strip()[:300]
    if out["enabled"] and not out["amounts"] and not out["custom"]:
        out["amounts"] = list(DEFAULTS["amounts"])
    return out


def check_settings(changes: dict) -> None:
    """Refuse settings that would be quietly dropped, in words the owner can act on."""
    if "amounts" in changes:
        if not isinstance(changes["amounts"], list) or len(changes["amounts"]) > 8:
            raise GiftCardError("Up to 8 amounts.")
        for v in changes["amounts"]:
            if _amount_ok(v) is None:
                raise GiftCardError(f"Each amount must be between $1 and ${MAX_AMOUNT:,.0f}.")
    if "custom_min" in changes or "custom_max" in changes:
        lo, hi = _amount_ok(changes.get("custom_min")), _amount_ok(changes.get("custom_max"))
        if lo is None or hi is None or lo > hi:
            raise GiftCardError(f"The custom range must be between $1 and ${MAX_AMOUNT:,.0f}, lowest first.")
    if "expiry_months" in changes:
        m = changes["expiry_months"]
        if not isinstance(m, int) or isinstance(m, bool) or not (
                m == 0 or EXPIRY_MIN_MONTHS <= m <= EXPIRY_MAX_MONTHS):
            raise GiftCardError("Gift cards never expire, or expire after 5 to 10 years.")


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


async def in_plan(db, tenant_id) -> bool:
    from app.services import entitlements

    try:
        return await entitlements.enabled(db, tenant_id, "gift_cards")
    except Exception:  # noqa: BLE001
        logger.warning("Could not read the gift_cards feature for %s", tenant_id, exc_info=True)
        return False


async def on_sale(db, tenant_id) -> bool:
    """Can buyers buy a gift card at this shop right now."""
    return await in_plan(db, tenant_id) and (await settings_for(db, tenant_id))["enabled"]


async def accepted(db, tenant_id) -> bool:
    """Does checkout take gift cards here. Cards already out are honoured even
    after the shop stops selling new ones: they are money it owes."""
    if not await in_plan(db, tenant_id):
        return False
    if (await settings_for(db, tenant_id))["enabled"]:
        return True
    return bool((await db.execute(
        select(GiftCard.id).where(GiftCard.tenant_id == tenant_id, GiftCard.status == "active",
                                  GiftCard.balance > 0).limit(1)
    )).scalar_one_or_none())


def check_amount(conf: dict, value: Any) -> Decimal:
    amount = money(value)
    presets = {money(a) for a in conf.get("amounts") or []}
    if amount in presets:
        return amount
    if conf.get("custom") and money(conf["custom_min"]) <= amount <= money(conf["custom_max"]):
        return amount
    if conf.get("custom"):
        raise GiftCardError(
            f"Choose an amount between ${money(conf['custom_min']):,.2f} and ${money(conf['custom_max']):,.2f}."
        )
    raise GiftCardError("Choose one of the shop's gift card amounts.")


def expiry_from(conf: dict, now: datetime | None = None) -> datetime | None:
    months = int(conf.get("expiry_months") or 0)
    if not months:
        return None
    return (now or datetime.now(timezone.utc)) + timedelta(days=round(months * 365.25 / 12))


# ── Wrong codes ────────────────────────────────────────────────────────────

def _fail_keys(tenant_id: Any, visitor: str) -> tuple[str, str]:
    return (f"gift-card:fail:{tenant_id}:{visitor}:15m", f"gift-card:fail:{tenant_id}:{visitor}:day")


async def guard(tenant_id: Any, visitor: str) -> None:
    """Refuse before looking anything up when this visitor is over the limit.
    Fails open on Redis trouble, like the platform's other limits; 80 random
    bits are what actually stops guessing."""
    from app.core.redis import redis_get

    short, day = _fail_keys(tenant_id, visitor)
    try:
        if int(await redis_get(short) or 0) >= FAIL_LIMIT or int(await redis_get(day) or 0) >= DAY_LIMIT:
            raise TooManyTries()
    except TooManyTries:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gift card try limit not checked (redis): %s", exc)


async def note_failure(tenant_id: Any, visitor: str) -> None:
    from app.core.redis import redis_increment

    short, day = _fail_keys(tenant_id, visitor)
    try:
        await redis_increment(short, expire=FAIL_WINDOW)
        await redis_increment(day, expire=86400)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gift card wrong try not counted (redis): %s", exc)


def usable_problem(card: GiftCard | None, now: datetime | None = None) -> str | None:
    """Why this card cannot pay right now, in the buyer's words; None if it can."""
    now = now or datetime.now(timezone.utc)
    if card is None or card.status != "active" or (card.expires_at and card.expires_at <= now):
        return NOT_VALID
    if Decimal(str(card.balance)) <= 0:
        return NO_BALANCE
    return None


async def find(db, tenant_id: Any, raw_code: Any) -> GiftCard | None:
    code = normalize(raw_code)
    if not code:
        return None
    return (await db.execute(
        select(GiftCard).where(GiftCard.tenant_id == tenant_id, GiftCard.code_hash == code_hash(tenant_id, code))
    )).scalar_one_or_none()


async def lookup(db, tenant_id: Any, raw_code: Any, visitor: str) -> GiftCard:
    """The card for a code a buyer typed, or GiftCardError. Counts wrong tries."""
    await guard(tenant_id, visitor)
    card = await find(db, tenant_id, raw_code)
    problem = usable_problem(card)
    if problem == NOT_VALID:
        await note_failure(tenant_id, visitor)
        raise GiftCardError(NOT_VALID)
    if problem:
        raise GiftCardError(problem)
    return card


def view(card: GiftCard) -> dict[str, Any]:
    """What a buyer may see of a card they hold the code to."""
    return {
        "last4": card.code_last4,
        "masked": masked(card.code_last4),
        "balance": float(card.balance),
        "currency": card.currency,
        "expires_at": card.expires_at.isoformat() if card.expires_at else None,
    }


# ── The ledger ─────────────────────────────────────────────────────────────

async def _lock(db, card_id: Any) -> GiftCard:
    """The card's row, locked, as it is now. `populate_existing`: a card this
    session read before the lock must not keep its old balance (two checkouts
    would each spend what was there before the other)."""
    card = (await db.execute(
        select(GiftCard).where(GiftCard.id == card_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if card is None:
        raise GiftCardError("Gift card not found.")
    return card


async def _already(db, tenant_id: Any, key: str) -> GiftCardLedger | None:
    return (await db.execute(
        select(GiftCardLedger).where(GiftCardLedger.tenant_id == tenant_id,
                                     GiftCardLedger.idempotency_key == key)
    )).scalar_one_or_none()


async def _write(db, card: GiftCard, kind: str, amount: Decimal, *, key: str, order_id=None,
                 hold_id=None, actor: tuple | None = None, reason: str | None = None) -> GiftCardLedger:
    """One movement on a card the caller holds the lock on."""
    amount = Decimal(str(amount)).quantize(CENTS)
    after = (Decimal(str(card.balance)) + amount).quantize(CENTS)
    if after < 0:
        raise GiftCardError("There isn't that much left on this gift card.")
    card.balance = after
    actor_id, actor_name = actor or (None, None)
    row = GiftCardLedger(
        tenant_id=card.tenant_id, gift_card_id=card.id, kind=kind, amount=amount, balance_after=after,
        order_id=order_id, hold_id=hold_id, actor_user_id=actor_id,
        actor_name=(actor_name or None) and str(actor_name)[:255],
        reason=(reason or None) and str(reason)[:300], idempotency_key=key[:150],
    )
    db.add(row)
    await db.flush()
    return row


async def issue(db, *, tenant_id: Any, amount: Any, source: str, key: str,
                expires_at: datetime | None = None, purchase_order_id=None, buyer_user_id=None,
                buyer_email: str | None = None, recipient_name: str | None = None,
                recipient_email: str | None = None, message: str | None = None,
                sender_name: str | None = None, actor: tuple | None = None,
                note: str | None = None, reason: str | None = None) -> tuple[GiftCard, str | None]:
    """A new card and its code. The code is returned once and never kept.
    The same key again returns the card it made, with no code."""
    amount = money(amount)
    if amount <= 0 or amount > MAX_AMOUNT:
        raise GiftCardError(f"A gift card is between $0.01 and ${MAX_AMOUNT:,.0f}.")
    if source not in ("purchase", "manual", "store_credit"):
        raise GiftCardError("Unknown gift card source.")
    done = await _already(db, tenant_id, key)
    if done is not None:
        return await db.get(GiftCard, done.gift_card_id), None

    for _ in range(5):
        code = new_code()
        digest = code_hash(tenant_id, code)
        if not (await db.execute(select(GiftCard.id).where(
                GiftCard.tenant_id == tenant_id, GiftCard.code_hash == digest))).scalar_one_or_none():
            break
    else:  # 80 random bits colliding five times running is not chance
        raise GiftCardError("Could not make a gift card code. Try again.")

    actor_id, _ = actor or (None, None)
    card = GiftCard(
        tenant_id=tenant_id, code_hash=digest, code_last4=code[-4:], initial_amount=amount,
        balance=Decimal("0"), currency="usd", status="active", expires_at=expires_at, source=source,
        purchase_order_id=purchase_order_id, buyer_user_id=buyer_user_id,
        buyer_email=(buyer_email or None) and buyer_email.strip().lower()[:255],
        recipient_name=(recipient_name or None) and recipient_name.strip()[:120],
        recipient_email=(recipient_email or None) and recipient_email.strip().lower()[:255],
        message=(message or None) and message.strip()[:MESSAGE_MAX],
        sender_name=(sender_name or None) and sender_name.strip()[:120],
        created_by_user_id=actor_id, note=(note or None) and note.strip()[:500],
    )
    db.add(card)
    await db.flush()
    await _write(db, card, "issue", amount, key=key, order_id=purchase_order_id, actor=actor,
                 reason=reason or {"purchase": "Bought", "manual": "Issued by the shop",
                                   "store_credit": "Store credit"}[source])
    return card, code


async def hold(db, card: GiftCard, amount: Decimal, *, checkout_ref: str,
               now: datetime | None = None, minutes: int = HOLD_MINUTES) -> GiftCardHold:
    """Set money aside for a checkout. The caller holds the card's lock."""
    now = now or datetime.now(timezone.utc)
    problem = usable_problem(card, now)
    if problem:
        raise GiftCardError(problem)
    amount = Decimal(str(amount)).quantize(CENTS)
    if amount <= 0:
        raise GiftCardError("Nothing to take from this gift card.")
    h = GiftCardHold(tenant_id=card.tenant_id, gift_card_id=card.id, checkout_ref=checkout_ref[:100],
                     amount=amount, status="held", expires_at=now + timedelta(minutes=minutes))
    db.add(h)
    await db.flush()
    await _write(db, card, "hold", -amount, key=f"hold:{h.id}", hold_id=h.id, reason="Set aside at checkout")
    return h


async def release(db, hold_id: Any, *, reason: str = "Checkout did not finish") -> bool:
    """Give a hold's money back to its card. False when it was already captured
    or given back."""
    h = await db.get(GiftCardHold, hold_id)
    if h is None:
        return False
    card = await _lock(db, h.gift_card_id)
    h = (await db.execute(select(GiftCardHold).where(GiftCardHold.id == hold_id).with_for_update()
                          .execution_options(populate_existing=True))).scalar_one()
    if h.status != "held":
        return False
    await _write(db, card, "release", Decimal(str(h.amount)), key=f"release:{h.id}", hold_id=h.id,
                 order_id=h.order_id, reason=reason)
    h.status = "released"
    await db.flush()
    return True


async def capture(db, hold_id: Any, *, order_id: Any) -> bool:
    """Spend a hold on its order. True if it is (now or already) captured for
    that order; False if it had been given back."""
    h = await db.get(GiftCardHold, hold_id)
    if h is None:
        return False
    card = await _lock(db, h.gift_card_id)
    h = (await db.execute(select(GiftCardHold).where(GiftCardHold.id == hold_id).with_for_update()
                          .execution_options(populate_existing=True))).scalar_one()
    if h.status == "captured":
        return str(h.order_id) == str(order_id)
    if h.status != "held":
        return False
    await _write(db, card, "capture", Decimal("0"), key=f"capture:{h.id}", hold_id=h.id, order_id=order_id,
                 reason="Paid for an order")
    h.status = "captured"
    h.order_id = order_id
    await db.flush()
    return True


async def take_now(db, card_id: Any, amount: Decimal, *, checkout_ref: str, order_id: Any) -> GiftCardHold:
    """Hold and capture at once: a checkout whose hold ran out before the order
    was made, taking the same money again if the card still has it."""
    card = await _lock(db, card_id)
    h = await hold(db, card, amount, checkout_ref=checkout_ref)
    await capture(db, h.id, order_id=order_id)
    return h


async def refund(db, card_id: Any, amount: Any, *, key: str, order_id=None, actor: tuple | None = None,
                 reason: str | None = None) -> GiftCardLedger:
    """Money back onto a card, from a refunded order. A card that was voided or
    has expired since is turned back on with no expiry: the money is the
    holder's."""
    amount = money(amount)
    card = await _lock(db, card_id)
    done = await _already(db, card.tenant_id, key)
    if done is not None:
        return done
    if amount <= 0:
        raise GiftCardError("A refund must be more than $0.00.")
    row = await _write(db, card, "refund", amount, key=key, order_id=order_id, actor=actor,
                       reason=reason or "Order refunded")
    if card.status in ("voided", "expired"):
        card.status = "active"
        card.expires_at = None
        card.status_reason = "Turned back on for a refund"
    await db.flush()
    return row


async def adjust(db, card_id: Any, amount: Any, *, reason: str, key: str, actor: tuple | None = None) -> GiftCardLedger:
    amount = money(amount)
    if amount == 0:
        raise GiftCardError("Enter an amount to add or take off.")
    if not reason or len(reason.strip()) < 3:
        raise GiftCardError("Say why, in a few words.")
    card = await _lock(db, card_id)
    done = await _already(db, card.tenant_id, key)
    if done is not None:
        return done
    if card.status in ("voided", "expired"):
        raise GiftCardError("This gift card is closed. Issue a new one instead.")
    if Decimal(str(card.balance)) + amount > MAX_AMOUNT:
        raise GiftCardError(f"A gift card can hold up to ${MAX_AMOUNT:,.0f}.")
    return await _write(db, card, "adjust", amount, key=key, actor=actor, reason=reason.strip())


async def _open_holds(db, card_id: Any) -> int:
    return int((await db.execute(
        select(func.count()).select_from(GiftCardHold).where(
            GiftCardHold.gift_card_id == card_id, GiftCardHold.status == "held")
    )).scalar_one() or 0)


async def set_status(db, card_id: Any, status: str, *, reason: str, actor: tuple | None = None) -> GiftCard:
    """Disable, turn back on, or void (the balance goes to zero, for good)."""
    if status not in ("active", "disabled", "voided"):
        raise GiftCardError("A gift card is active, disabled or voided.")
    if not reason or len(reason.strip()) < 3:
        raise GiftCardError("Say why, in a few words.")
    card = await _lock(db, card_id)
    if card.status in ("voided", "expired") and status != card.status:
        raise GiftCardError("This gift card is closed. Issue a new one instead.")
    if status == card.status:
        return card
    if status == "voided":
        if await _open_holds(db, card.id):
            raise GiftCardError("A checkout is using this gift card right now. Try again in a few minutes.")
        if Decimal(str(card.balance)) > 0:
            await _write(db, card, "void", -Decimal(str(card.balance)), key=f"void:{card.id}", actor=actor,
                         reason=reason.strip())
    card.status = status
    card.status_reason = reason.strip()[:300]
    await db.flush()
    return card


async def rotate_code(db, card_id: Any) -> tuple[GiftCard, str]:
    """A new code for the same card and balance; the old one stops working.
    For a recipient whose email never arrived."""
    card = await _lock(db, card_id)
    if card.status != "active":
        raise GiftCardError("Only an active gift card can get a new code.")
    for _ in range(5):
        code = new_code()
        digest = code_hash(card.tenant_id, code)
        if not (await db.execute(select(GiftCard.id).where(
                GiftCard.tenant_id == card.tenant_id, GiftCard.code_hash == digest))).scalar_one_or_none():
            break
    else:
        raise GiftCardError("Could not make a gift card code. Try again.")
    card.code_hash = digest
    card.code_last4 = code[-4:]
    await db.flush()
    return card, code


# ── Timed work ─────────────────────────────────────────────────────────────

async def release_due(db, now: datetime | None = None, limit: int = 500) -> int:
    now = now or datetime.now(timezone.utc)
    ids = (await db.execute(
        select(GiftCardHold.id).where(GiftCardHold.status == "held", GiftCardHold.expires_at <= now)
        .order_by(GiftCardHold.expires_at).limit(limit)
    )).scalars().all()
    done = 0
    for hold_id in ids:
        if await release(db, hold_id, reason="Checkout did not finish in time"):
            done += 1
    return done


async def expire_due(db, now: datetime | None = None, limit: int = 500) -> int:
    now = now or datetime.now(timezone.utc)
    ids = (await db.execute(
        select(GiftCard.id).where(GiftCard.status == "active", GiftCard.expires_at.isnot(None),
                                  GiftCard.expires_at <= now).limit(limit)
    )).scalars().all()
    done = 0
    for card_id in ids:
        card = await _lock(db, card_id)
        if card.status != "active" or not card.expires_at or card.expires_at > now:
            continue
        if await _open_holds(db, card.id):
            continue  # a checkout is finishing on it; the next pass takes it
        if Decimal(str(card.balance)) > 0:
            await _write(db, card, "expire", -Decimal(str(card.balance)), key=f"expire:{card.id}",
                         reason="Expired")
        card.status = "expired"
        card.status_reason = "Expired"
        done += 1
    await db.flush()
    return done


async def run(now: datetime | None = None) -> dict:
    """One pass of the timed work, every shop at once."""
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping

    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            released = await release_due(db, now)
            await db.commit()
            expired = await expire_due(db, now)
            await db.commit()
    finally:
        set_bypass_scoping(False)
    if released or expired:
        logger.info("Gift cards: released %s holds, expired %s cards", released, expired)
    return {"released": released, "expired": expired}


TICK_SECONDS = 300


async def scheduler_loop() -> None:
    import asyncio

    await asyncio.sleep(120)
    while True:
        try:
            from app.core.redis import get_redis_pool

            if await get_redis_pool().set("gift-cards:timed", "1", nx=True, ex=TICK_SECONDS - 30):
                await run()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("gift card timed work failed")
        await asyncio.sleep(TICK_SECONDS)


# ── Reading ────────────────────────────────────────────────────────────────

async def balance_matches_ledger(db, card_id: Any) -> bool:
    card = await db.get(GiftCard, card_id)
    total = (await db.execute(
        select(func.coalesce(func.sum(GiftCardLedger.amount), 0)).where(GiftCardLedger.gift_card_id == card_id)
    )).scalar_one()
    return card is not None and Decimal(str(total)).quantize(CENTS) == Decimal(str(card.balance)).quantize(CENTS)


async def report(db, tenant_id: Any) -> dict[str, Any]:
    """Sold, given, redeemed, refunded back and still owed, for the admin."""
    def _f(v: Any) -> float:
        return float(Decimal(str(v or 0)).quantize(CENTS))

    by_source = dict((await db.execute(
        select(GiftCard.source, func.coalesce(func.sum(GiftCard.initial_amount), 0))
        .where(GiftCard.tenant_id == tenant_id).group_by(GiftCard.source)
    )).all())
    redeemed = (await db.execute(
        select(func.coalesce(func.sum(GiftCardHold.amount), 0))
        .where(GiftCardHold.tenant_id == tenant_id, GiftCardHold.status == "captured")
    )).scalar_one()
    held = (await db.execute(
        select(func.coalesce(func.sum(GiftCardHold.amount), 0))
        .where(GiftCardHold.tenant_id == tenant_id, GiftCardHold.status == "held")
    )).scalar_one()
    kinds = dict((await db.execute(
        select(GiftCardLedger.kind, func.coalesce(func.sum(GiftCardLedger.amount), 0))
        .where(GiftCardLedger.tenant_id == tenant_id).group_by(GiftCardLedger.kind)
    )).all())
    outstanding = (await db.execute(
        select(func.coalesce(func.sum(GiftCard.balance), 0))
        .where(GiftCard.tenant_id == tenant_id, GiftCard.status.in_(("active", "disabled")))
    )).scalar_one()
    counts = dict((await db.execute(
        select(GiftCard.status, func.count()).where(GiftCard.tenant_id == tenant_id).group_by(GiftCard.status)
    )).all())
    return {
        "sold": _f(by_source.get("purchase")),
        "issued_by_shop": _f(by_source.get("manual")),
        "store_credit": _f(by_source.get("store_credit")),
        "redeemed": _f(redeemed),
        "refunded_to_cards": _f(kinds.get("refund")),
        "adjusted": _f(kinds.get("adjust")),
        "voided": _f(-(Decimal(str(kinds.get("void") or 0)))),
        "expired": _f(-(Decimal(str(kinds.get("expire") or 0)))),
        "held_at_checkout": _f(held),
        "outstanding": _f(outstanding),
        "cards": {k: int(v) for k, v in counts.items()},
    }
