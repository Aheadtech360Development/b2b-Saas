"""Tickets for the image tools Worker (workers/image-tools).

Background removal runs on Cloudflare, and the browser sends the image there
directly — routing it through this API would mean uploading every file twice.
So the Worker has to be able to tell a builder's request from anybody else's.
This API signs a short-lived ticket; the Worker, holding the same key, checks
it. The key never reaches the browser.
"""
from __future__ import annotations

import hashlib
import hmac
import time

from app.core.config import get_settings

TICKET_SECONDS = 300


def is_configured() -> bool:
    s = get_settings()
    return bool(s.IMAGE_TOOLS_URL and s.IMAGE_TOOLS_KEY)


def sign(key: str, expires: int, shop: str) -> str:
    """`<expires>.<shop>.<signature>` — the format the Worker reads."""
    signature = hmac.new(key.encode(), f"{expires}.{shop}".encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{shop}.{signature}"


def cutout_ticket(shop: str, now: float | None = None) -> dict:
    """Where the browser sends the image, and the ticket that lets it."""
    s = get_settings()
    expires = int(now if now is not None else time.time()) + TICKET_SECONDS
    return {
        "url": f"{s.IMAGE_TOOLS_URL.rstrip('/')}/cutout",
        "ticket": sign(s.IMAGE_TOOLS_KEY, expires, shop),
        "expires_in": TICKET_SECONDS,
    }
