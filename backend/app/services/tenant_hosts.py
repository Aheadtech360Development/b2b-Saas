"""Which brand a web address belongs to.

A shop is reached three ways: a subdomain of the platform, its own domain, or
a `?tenant=` link. The first and the last are read straight off the request.
This is the middle one — the brand's own address, kept in `tenants.custom_domain`.

It matters when a brand brings its own domain. Until then a brand is reached
at the platform's address with `?tenant=<slug>`, and the platform's own address
on its own belongs to the platform — not to whichever brand happens to be the
only one so far. Guessing there would quietly change the day a second brand
signed up, which is exactly when nobody would be looking.

The map is tiny — one row per brand — so it is held in memory for a minute
rather than queried on every request.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

TTL_SECONDS = 60

_cache: dict[str, Any] = {"at": 0.0, "by_host": {}}


def normalise(host: str | None) -> str:
    """A hostname as it is compared: no port, no leading www, lower case."""
    hostname = (host or "").split(",")[0].strip().split(":")[0].strip().lower()
    return hostname[4:] if hostname.startswith("www.") else hostname


def forget() -> None:
    """Drop the cache — after a brand's domain changes."""
    _cache["at"] = 0.0


async def _load(db: AsyncSession) -> None:
    rows = (await db.execute(text(
        "SELECT slug, custom_domain FROM tenants WHERE status = 'active'"
    ))).all()
    by_host: dict[str, str] = {}
    for slug, domain in rows:
        key = normalise(domain)
        if key:
            by_host[key] = slug
    _cache["by_host"] = by_host
    _cache["at"] = time.monotonic()


async def slug_for_host(db: AsyncSession, host: str | None) -> str | None:
    """The brand reached at this address, or None."""
    if time.monotonic() - float(_cache["at"]) > TTL_SECONDS:
        try:
            await _load(db)
        except Exception as exc:  # a lookup that fails must not fail the request
            logger.warning("could not read brand domains: %s", exc)
            return None

    return _cache["by_host"].get(normalise(host))
