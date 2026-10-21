"""Whether a brand's people may get in: one rule for sign-in, token refresh and
every signed-in request.

A shop is closed in one of two ways, and they are not the same:

* The platform closed it (Suspend, or Suspend and Cancel, in the console).
  Nobody from the brand gets in until the platform opens it again.
* Its plan lapsed (Stripe says canceled, unpaid or incomplete_expired). The
  shop is closed to its buyers, but its staff must still be able to sign in and
  pay: paying is what reopens it, and a shop nobody can sign in to could never
  be paid for.

The platform's own decision is kept as the brand setting HOLD_KEY, so a Stripe
event can neither reopen a shop the platform closed nor be overridden by one.
A brand closed before the hold existed has none; if its plan has not lapsed,
it was closed by hand, and is treated as held.

Platform support entering a brand from the console is let in either way:
helping a closed shop is part of the job.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime

from sqlalchemy import text

logger = logging.getLogger(__name__)

HOLD_KEY = "platform_hold"
# The Stripe states that close a shop (billing_service._DEAD_STATES).
LAPSED = frozenset({"canceled", "unpaid", "incomplete_expired"})

OPEN, BILLING_ONLY, CLOSED = "open", "billing_only", "closed"

# How long a brand's state may lag behind a change made elsewhere. The console
# forgets it straight away; this only bounds a change made by another worker.
_TTL_SECONDS = 30
_cache: dict[str, tuple[float, dict]] = {}


def decide(status: str | None, sub_status: str | None, held: bool, is_staff: bool) -> str:
    """OPEN, BILLING_ONLY (staff of a shop whose plan lapsed: in, to pay) or CLOSED."""
    if (status or "active") == "active":
        return OPEN
    if held or (sub_status or "") not in LAPSED:
        return CLOSED
    return BILLING_ONLY if is_staff else CLOSED


def _parse_hold(raw) -> dict | None:
    if raw in (None, ""):
        return None
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return {"note": str(raw)}
    return value if isinstance(value, dict) and value else None


async def state(tenant_id) -> dict:
    """The brand's status, its plan's status and the platform's hold, cached."""
    key = str(tenant_id)
    hit = _cache.get(key)
    now = time.monotonic()
    if hit and now - hit[0] < _TTL_SECONDS:
        return hit[1]

    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping

    previous = is_scoping_bypassed()
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
            row = (await db.execute(text("""
                SELECT t.status, s.status AS sub_status,
                       (SELECT value FROM settings WHERE key = :k) AS hold
                  FROM tenants t
                  LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id
                 WHERE t.id = CAST(:t AS uuid)
            """), {"t": key, "k": f"{HOLD_KEY}@{key}"})).mappings().first()
    finally:
        set_bypass_scoping(previous)

    found = {
        "status": row["status"] if row else None,
        "sub_status": row["sub_status"] if row else None,
        "hold": _parse_hold(row["hold"]) if row else None,
    }
    _cache[key] = (now, found)
    return found


async def gate(tenant_id, *, is_staff: bool) -> str:
    """OPEN, BILLING_ONLY or CLOSED for one of this brand's people right now.

    A brand that cannot be found is left to the caller's own checks (OPEN):
    this rule closes shops, it does not decide who exists.
    """
    found = await state(tenant_id)
    if found["status"] is None:
        return OPEN
    return decide(found["status"], found["sub_status"], bool(found["hold"]), is_staff)


def forget(tenant_id=None) -> None:
    """Drop the cached state, after the console or Stripe changed it."""
    if tenant_id is None:
        _cache.clear()
    else:
        _cache.pop(str(tenant_id), None)


async def hold(db, tenant_id, *, status: str, by: str | None, reason: str = "") -> None:
    """Record that the platform closed this shop by hand. The caller commits."""
    from app.core.tenant_settings import set_setting

    await set_setting(db, HOLD_KEY, json.dumps({
        "status": status, "by": by, "reason": (reason or "").strip()[:500],
        "at": datetime.now(UTC).isoformat(),
    }), tenant_id=tenant_id)
    forget(tenant_id)


async def release(db, tenant_id) -> None:
    """The platform opened the shop again. The caller commits."""
    from app.core.tenant_settings import set_setting

    await set_setting(db, HOLD_KEY, "", tenant_id=tenant_id)
    forget(tenant_id)


async def is_held(db, tenant_id) -> bool:
    from app.core.tenant_settings import get_setting

    return _parse_hold(await get_setting(db, HOLD_KEY, tenant_id=tenant_id)) is not None
