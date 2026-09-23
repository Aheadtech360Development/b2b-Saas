"""Which brand a web address belongs to.

A shop is reached three ways: a subdomain of the platform, its own domain, or
a `?tenant=` link. The first and the last are read straight off the request.
This is the middle one — the brand's own address, kept in `tenants.custom_domain`.

It matters most in the case that was broken: someone opens the shop's link in
a fresh browser. There is no cookie and no `?tenant=`, and on a host without
wildcard subdomains there is no subdomain either, so the visitor arrived at no
brand at all and saw the platform's own bare storefront instead of the shop.

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

_cache: dict[str, Any] = {"at": 0.0, "by_host": {}, "only": None}


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
    # When a platform runs one brand, every address on it is that brand's.
    # With a second brand this stops, and each one needs its own address —
    # guessing between two shops would be worse than showing neither.
    _cache["only"] = rows[0][0] if len(rows) == 1 else None
    _cache["at"] = time.monotonic()


async def slug_for_host(db: AsyncSession, host: str | None) -> str | None:
    """The brand reached at this address, or None."""
    if time.monotonic() - float(_cache["at"]) > TTL_SECONDS:
        try:
            await _load(db)
        except Exception as exc:  # a lookup that fails must not fail the request
            logger.warning("could not read brand domains: %s", exc)
            return None

    key = normalise(host)
    found = _cache["by_host"].get(key)
    if found:
        return found
    return _cache["only"]
