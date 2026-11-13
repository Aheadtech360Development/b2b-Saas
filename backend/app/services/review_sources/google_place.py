"""A brand's Google business: its rating, review count and Google's picked reviews.

This is the quick way to show Google reviews: the brand finds its business by
name, and the shop shows what Google's Places API says about it. It needs only
the platform's Places API key, no sign-in and no approval from Google.

What Google allows, and so what this does
-----------------------------------------
* Only the place id may be kept. Everything else (name, rating, the reviews) is
  read live and held in Redis for a day at most, for speed, as the Google Maps
  Platform terms allow for temporary caching.
* Google returns at most five reviews per place, chosen by Google.
* Shown with Google's attribution: each author's name, photo and profile link,
  a "Report" link for each review, and a link to the business on Google Maps.
* The rating and count shown are Google's own, never mixed with the shop's
  other reviews.

A brand that wants every Google review imported connects its Business Profile
instead (services/google_reviews.py); that needs Google to approve the platform.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

SEARCH_FIELDS = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.googleMapsUri",
    "places.rating", "places.userRatingCount",
])
DETAILS_FIELDS = "id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews"

# How long a place's details are kept, and how long a failure is remembered so
# a broken key does not cost a call on every page view.
CACHE_SECONDS = 24 * 60 * 60
FAILURE_SECONDS = 10 * 60
MAX_RESULTS = 8

HTTP_TIMEOUT = httpx.Timeout(15.0, connect=8.0)

_PLACE_ID = re.compile(r"^[A-Za-z0-9_-]{10,300}$")


class GooglePlaceError(Exception):
    """Something the brand or the platform needs to act on, in plain words."""


def configured() -> bool:
    return bool(getattr(settings, "GOOGLE_PLACES_API_KEY", ""))


def valid_place_id(place_id: str | None) -> bool:
    return bool(place_id and _PLACE_ID.match(place_id))


def _client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=HTTP_TIMEOUT, transport=transport)


def _headers(fields: str) -> dict:
    return {"X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": fields}


def _message(response: httpx.Response) -> str:
    try:
        error = (response.json() or {}).get("error") or {}
    except ValueError:
        error = {}
    status = str(error.get("status") or "")
    if response.status_code == 403 or status == "PERMISSION_DENIED":
        return ("Google refused this platform's Places key. The platform administrator needs "
                "to switch on the Places API (New) for it.")
    if response.status_code == 404 or status == "NOT_FOUND":
        return "Google no longer has that business. Find it again."
    if response.status_code == 429:
        return "Google is busy. Try again in a minute."
    return "Google did not answer as expected. Try again in a minute."


def _text(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("text")
    return str(value or "").strip()


def _https(value: Any) -> str | None:
    url = str(value or "")
    return url if url.startswith("https://") and len(url) <= 1000 else None


async def search(query: str, *, transport: httpx.AsyncBaseTransport | None = None) -> list[dict]:
    """Businesses on Google matching what the brand typed."""
    if not configured():
        raise GooglePlaceError("Google business search is not set up on this platform yet.")
    query = (query or "").strip()
    if len(query) < 3:
        raise GooglePlaceError("Type your business name, and the city if it is a common name.")
    try:
        async with _client(transport) as client:
            response = await client.post(SEARCH_URL, headers=_headers(SEARCH_FIELDS),
                                         json={"textQuery": query[:200], "languageCode": "en"})
    except httpx.HTTPError:
        raise GooglePlaceError("Could not reach Google. Try again in a minute.")
    if response.status_code != 200:
        raise GooglePlaceError(_message(response))
    out = []
    for place in (response.json() or {}).get("places") or []:
        place_id = str(place.get("id") or "")
        if not valid_place_id(place_id):
            continue
        out.append({
            "place_id": place_id,
            "name": _text(place.get("displayName")),
            "address": str(place.get("formattedAddress") or ""),
            "rating": place.get("rating"),
            "total": place.get("userRatingCount"),
            "maps_url": _https(place.get("googleMapsUri")),
        })
        if len(out) >= MAX_RESULTS:
            break
    return out


def shape(place: dict) -> dict:
    """Google's answer as the shop shows it."""
    reviews = []
    for review in place.get("reviews") or []:
        try:
            rating = int(review.get("rating"))
        except (TypeError, ValueError):
            continue
        if not 1 <= rating <= 5:
            continue
        author = review.get("authorAttribution") or {}
        reviews.append({
            "rating": rating,
            "text": _text(review.get("text")) or _text(review.get("originalText")),
            "author": str(author.get("displayName") or "A Google user")[:150],
            "author_url": _https(author.get("uri")),
            "author_photo": _https(author.get("photoUri")),
            "when": str(review.get("relativePublishTimeDescription") or ""),
            "published": str(review.get("publishTime") or ""),
            "url": _https(review.get("googleMapsUri")),
            "report_url": _https(review.get("flagContentUri")),
        })
    return {
        "place_id": str(place.get("id") or ""),
        "name": _text(place.get("displayName")),
        "address": str(place.get("formattedAddress") or ""),
        "rating": place.get("rating"),
        "total": place.get("userRatingCount"),
        "maps_url": _https(place.get("googleMapsUri")),
        "reviews": reviews,
    }


def _cache_key(place_id: str) -> str:
    return f"google_place:{place_id}"


async def details(place_id: str, *, transport: httpx.AsyncBaseTransport | None = None,
                  use_cache: bool = True) -> dict:
    """The place as the shop shows it, from the day's cache or from Google."""
    if not configured():
        raise GooglePlaceError("Google business search is not set up on this platform yet.")
    if not valid_place_id(place_id):
        raise GooglePlaceError("That is not a Google business. Find it again.")

    redis = None
    if use_cache:
        try:
            from app.core.redis import get_redis_pool

            redis = get_redis_pool()
            cached = await redis.get(_cache_key(place_id))
            if cached:
                data = json.loads(cached)
                if data.get("error"):
                    raise GooglePlaceError(data["error"])
                return data
        except GooglePlaceError:
            raise
        except Exception:
            redis = None  # no cache: ask Google directly

    async def remember(value: dict, seconds: int) -> None:
        if redis is not None:
            try:
                await redis.set(_cache_key(place_id), json.dumps(value), ex=seconds)
            except Exception:
                pass

    try:
        async with _client(transport) as client:
            response = await client.get(DETAILS_URL.format(place_id=place_id),
                                        headers=_headers(DETAILS_FIELDS), params={"languageCode": "en"})
    except httpx.HTTPError:
        raise GooglePlaceError("Could not reach Google. Try again in a minute.")
    if response.status_code != 200:
        message = _message(response)
        await remember({"error": message}, FAILURE_SECONDS)
        raise GooglePlaceError(message)
    data = shape(response.json() or {})
    await remember(data, CACHE_SECONDS)
    return data


async def for_shop(place_id: str | None) -> dict | None:
    """What a shop's page shows, or None when there is nothing to show.

    Never raises: a Google outage must not break a storefront page.
    """
    if not place_id or not configured():
        return None
    try:
        return await details(place_id)
    except GooglePlaceError as exc:
        logger.info("Google place %s not shown: %s", place_id, exc)
        return None
    except Exception:
        logger.exception("Google place %s failed", place_id)
        return None
