"""Letting a brand's own domain talk to the API.

The browser decides what a page may call by its origin, and CORS allowed the
platform's own domain and its brand subdomains. A shop reached at its own
address is a different origin, so every request the page made was refused
before it left the browser. The shop looked half broken — pages rendered,
because those come from the server, and anything the page fetched afterwards
failed with no error anybody could read.

A pattern cannot cover this: custom domains are rows in a table, added by
brands whenever they buy one. And a blanket allow is not an option either,
because credentials travel on these requests — a refresh cookie that can be
exchanged for an access token, which is an account takeover for any site that
could ask.

So the answer is the list itself: the domains brands have actually verified,
held in memory for a minute and consulted per request. An origin that is not
one of them is handled exactly as before, by the CORS middleware underneath.
"""
from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Long enough that this is not a query per request, short enough that a brand
# that has just pointed its domain here is not told to wait.
_TTL = 60.0
_cache: tuple[float, frozenset[str]] = (0.0, frozenset())


def forget() -> None:
    """Drop the cached list, so a domain saved now is honoured now."""
    global _cache
    _cache = (0.0, frozenset())


async def _domains() -> frozenset[str]:
    """Every custom domain on the platform, and its www form.

    Read unscoped: this runs before anything has resolved a brand, and the
    question is about all of them.
    """
    global _cache
    now = time.monotonic()
    if _cache[0] > now:
        return _cache[1]

    found: set[str] = set()
    try:
        from sqlalchemy import text

        from app.core.database import AsyncSessionLocal
        from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping

        previous = is_scoping_bypassed()
        set_bypass_scoping(True)
        try:
            async with AsyncSessionLocal() as db:
                rows = (await db.execute(text(
                    "SELECT custom_domain FROM tenants "
                    " WHERE custom_domain IS NOT NULL AND custom_domain <> ''"
                ))).scalars().all()
        finally:
            set_bypass_scoping(previous)

        for raw in rows:
            host = (raw or "").strip().lower().rstrip(".")
            if not host or "/" in host:
                continue
            found.add(host)
            # A shop reached at www is the same shop, and a redirect to the
            # apex does not help a request the browser has already refused.
            found.add(host[4:] if host.startswith("www.") else f"www.{host}")
    except Exception:
        # Never let this stop a request. An empty answer means the origin is
        # judged by the rules underneath, which is where it was before.
        logger.exception("Could not read the brands' own domains for CORS")
        # Cached briefly even on failure, so a database that is down does not
        # turn into a query per request on top of everything else.
        _cache = (now + 5.0, _cache[1])
        return _cache[1]

    _cache = (now + _TTL, frozenset(found))
    return _cache[1]


def _host_of(origin: str) -> str:
    """The host part of an origin, lowercased and without its port."""
    host = origin.split("://", 1)[-1].split("/", 1)[0].strip().lower()
    return host.rsplit(":", 1)[0] if ":" in host and not host.endswith("]") else host


class BrandCORSMiddleware(BaseHTTPMiddleware):
    """CORS for the domains brands brought themselves.

    Sits outside the ordinary CORS middleware and only acts when the origin is
    one of those domains. Everything else passes through untouched, so the
    existing rules — and the reasoning behind them — are unchanged.
    """

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        if not origin:
            return await call_next(request)

        # Only https, because that is the only way these are served and it
        # keeps a plain-http impostor on the same name from being allowed.
        if not origin.startswith("https://") or _host_of(origin) not in await _domains():
            return await call_next(request)

        if request.method == "OPTIONS":
            # Answered here rather than passed down: the middleware underneath
            # would refuse this origin, and a refused preflight is a request
            # the browser never makes.
            response = Response(status_code=200)
        else:
            response = await call_next(request)

        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        requested = request.headers.get("access-control-request-headers")
        response.headers["Access-Control-Allow-Headers"] = requested or "*"
        response.headers["Access-Control-Max-Age"] = "600"
        # Added to whatever is there: a response that already varies on
        # something else must keep varying on it.
        existing = response.headers.get("Vary")
        response.headers["Vary"] = f"{existing}, Origin" if existing and "Origin" not in existing else (existing or "Origin")
        return response
