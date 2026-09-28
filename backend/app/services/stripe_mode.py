"""Whether this platform is taking real money or pretending to.

Stripe has two parallel worlds. A customer, a Connect account, a price and a
payment created in test mode do not exist in live mode, and the ids do not
carry over. So "switch to live" is not a setting on one payment — it changes
which world every id in the database belongs to.

Both keys live in the environment, never in the database: a secret that can
move money does not belong in a table anybody with a console can read. What
is stored here is only which of the two is in use, and only the platform can
change it — one brand flipping this would put every other brand's checkout
into test mode with it.

Switching is deliberate and has consequences the operator has to know:

  * Connect accounts are per mode. A shop onboarded in test has no live
    account, and its card payments will refuse until it onboards again.
  * Subscription prices are per mode. The platform's own billing re-creates
    them on demand, keyed by lookup_key, so that part heals itself.
  * Webhook endpoints are per mode. The live one needs its own signing secret.
"""
from __future__ import annotations

import logging
import time

from sqlalchemy import text

from app.core.config import get_settings

logger = logging.getLogger(__name__)

KEY = "stripe_mode"
LIVE, TEST = "live", "test"

# Read on the way into every Stripe call, so it is cached for a few seconds
# rather than fetched each time. Short enough that a switch takes effect
# while the operator is still looking at the screen.
_TTL = 5.0
_cache: tuple[float, str] | None = None


def _keys(mode: str) -> tuple[str, str]:
    s = get_settings()
    if mode == TEST:
        return s.STRIPE_SECRET_KEY_TEST, s.STRIPE_PUBLISHABLE_KEY_TEST
    return s.STRIPE_SECRET_KEY, s.STRIPE_PUBLISHABLE_KEY


def mode_of(secret: str | None) -> str:
    """Which world a key belongs to, read off the key itself."""
    return TEST if (secret or "").startswith("sk_test") else LIVE


def default_mode() -> str:
    """Where to start when nobody has chosen.

    Test, unless the only key configured is a live one. A platform that has
    not been told is safer pretending than charging.
    """
    s = get_settings()
    if s.STRIPE_SECRET_KEY_TEST:
        return TEST
    if s.STRIPE_SECRET_KEY:
        return mode_of(s.STRIPE_SECRET_KEY)
    return TEST


async def current(db) -> str:
    """The mode this platform is in."""
    global _cache
    now = time.monotonic()
    if _cache and _cache[0] > now:
        return _cache[1]
    mode = default_mode()
    try:
        raw = (await db.execute(
            text("SELECT value FROM app_settings WHERE key = :k"), {"k": KEY}
        )).scalar()
        if raw and str(raw).strip().lower() in (LIVE, TEST):
            mode = str(raw).strip().lower()
    except Exception as exc:  # never let a settings read stop a payment
        logger.warning("stripe_mode lookup failed, using %s: %s", mode, exc)
    _cache = (now + _TTL, mode)
    return mode


def forget() -> None:
    """Drop the cached mode so a switch is felt at once."""
    global _cache
    _cache = None


async def set_mode(db, mode: str) -> dict:
    """Put the platform into one mode or the other."""
    mode = (mode or "").strip().lower()
    if mode not in (LIVE, TEST):
        raise ValueError("Mode is either 'live' or 'test'.")
    secret, _pub = _keys(mode)
    if not secret:
        raise ValueError(
            f"No {mode} key is configured. Set "
            f"{'STRIPE_SECRET_KEY_TEST' if mode == TEST else 'STRIPE_SECRET_KEY'} "
            "on the server first."
        )
    if mode_of(secret) != mode:
        raise ValueError(
            f"The key configured for {mode} mode is not a {mode} key. "
            "Check which key is in which variable."
        )
    await db.execute(text("""
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (:k, :v, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    """), {"k": KEY, "v": mode})
    await db.commit()
    forget()
    logger.warning("Stripe mode switched to %s", mode)
    return await status(db)


async def status(db) -> dict:
    """What the console shows: the mode, and what is ready in each."""
    s = get_settings()
    mode = await current(db)
    secret, pub = _keys(mode)
    return {
        "mode": mode,
        "ready": bool(secret and pub),
        "publishable_key": pub or None,
        # Which of the two can be switched to at all.
        "live_configured": bool(s.STRIPE_SECRET_KEY and s.STRIPE_PUBLISHABLE_KEY),
        "test_configured": bool(s.STRIPE_SECRET_KEY_TEST and s.STRIPE_PUBLISHABLE_KEY_TEST),
        # A live secret sitting in the test variable, or the other way round,
        # is the mistake that looks like everything working until it charges
        # somebody.
        "mismatch": bool(secret) and mode_of(secret) != mode,
    }


async def secret_key(db) -> str:
    """The secret key for whichever mode the platform is in."""
    return _keys(await current(db))[0]


async def publishable_key(db) -> str:
    return _keys(await current(db))[1]
