"""What a shop's pages show from Google and Yelp. Never raises."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.review_sources import google_place, store

logger = logging.getLogger(__name__)


def _yelp(data: dict) -> dict | None:
    y = data.get("yelp") or {}
    if not (y.get("url") or y.get("reviews")):
        return None
    return {
        "url": y.get("url"),
        "reviews": [
            {k: r.get(k) for k in ("id", "author", "author_url", "review_url", "business")}
            for r in (y.get("reviews") or []) if isinstance(r, dict) and r.get("id")
        ],
    }


async def sources(db: AsyncSession, tenant_id: Any) -> dict:
    """{"google": place or None, "yelp": page and reviews or None}."""
    try:
        data = await store.load(db, tenant_id=tenant_id)
    except Exception:
        logger.exception("review sources for %s could not be read", tenant_id)
        return {"google": None, "yelp": None}
    place = await google_place.for_shop((data.get("google_place") or {}).get("place_id"))
    return {"google": place, "yelp": _yelp(data)}
