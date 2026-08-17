"""Lightweight Redis-backed rate limiting for abuse-prone endpoints.

Fixed-window counters via redis_increment (INCR + TTL on first hit). Applied to
the sensitive endpoints only — login, 2FA, password reset, registration — not
every request, to keep Redis load (and cost) down. Fails OPEN: if Redis is
unavailable the request is allowed, so a Redis hiccup never locks users out.

Real client IP is taken from X-Forwarded-For (the app runs behind Railway's
proxy), falling back to the socket peer.
"""
from __future__ import annotations

import logging

from fastapi import HTTPException, Request, status

from app.core.redis import redis_increment

logger = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce_rate_limit(
    request: Request,
    scope: str,
    limit: int,
    window: int,
    extra: str | None = None,
) -> None:
    """Count this attempt; raise 429 (with Retry-After) once `limit` in `window`
    seconds is exceeded. `extra` narrows the key (e.g. the email/user being
    targeted) so one account's abuse doesn't lock out a whole shared IP."""
    ident = client_ip(request)
    if extra:
        ident = f"{ident}:{extra.lower().strip()}"
    key = f"rl:{scope}:{ident}"
    try:
        count = await redis_increment(key, expire=window)
    except Exception as exc:  # noqa: BLE001 — fail open on Redis trouble
        logger.warning("rate limit check skipped (redis error): %s", exc)
        return
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait a bit and try again.",
            headers={"Retry-After": str(window)},
        )
