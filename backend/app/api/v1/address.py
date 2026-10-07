"""Address suggestions for the street field at checkout.

A buyer typing "30 N Gould" is offered whole US addresses; picking one fills
the street, city, state and ZIP. The suggestions come from Geoapify, asked by
the server, so the key stays here rather than in the page.

Every shop shares one free allowance: 3,000 requests a day. So repeats are
answered from a cache, one visitor and one shop may only ask so fast, and the
server stops asking for the day before the allowance runs out. When it cannot
help (no key set, the allowance spent, the service down) it answers with no
suggestions and the buyer types the address as before. Suggestions only ever
help; they never stand in the way of an order.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Query, Request

from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit
from app.core.redis import redis_get, redis_increment, redis_set

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/address")

GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode/autocomplete"
# The free plan asks for this credit wherever its results are shown.
ATTRIBUTION = "Powered by Geoapify"
# The free plan is 3,000 requests a day for the whole platform. Stop short of
# it, and let no one shop take more than half.
DAILY_BUDGET = 2_800
SHOP_DAILY_BUDGET = 1_400
# A visitor typing quickly asks a few times a second, briefly.
VISITOR_PER_MINUTE = 40
CACHE_SECONDS = 7 * 86_400
COOL_DOWN_SECONDS = 3_600
TIMEOUT = 4.0
MIN_CHARS = 3
LIMIT = 5

US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
    "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA",
    "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "puerto rico": "PR", "guam": "GU", "american samoa": "AS", "northern mariana islands": "MP",
    "united states virgin islands": "VI",
}

# The house number a buyer typed: "30", "30B", "120-24".
_TYPED_NUMBER = re.compile(r"^\s*(\d+[a-z]?(?:-\d+[a-z]?)?)\s+\S", re.IGNORECASE)


class Unavailable(Exception):
    """Geoapify did not answer with suggestions."""


def _answer(suggestions: list[dict]) -> dict:
    return {"enabled": True, "suggestions": suggestions, "attribution": ATTRIBUTION}


def suggestions_from(results: list[dict], typed: str, country: str) -> list[dict]:
    """Geoapify's results as what the address form needs: the street line,
    city, two-letter state and ZIP. A result with no street (a city, a ZIP
    area) fills nothing the buyer was typing, so it is not offered.

    A street the data knows without the buyer's house number keeps the number
    they typed: many US houses are missing from open map data, their streets
    are not."""
    m = _TYPED_NUMBER.match(typed)
    typed_number = m.group(1) if m else None
    out: list[dict] = []
    seen: set[str] = set()
    for r in results:
        street = str(r.get("street") or "").strip()
        if not street:
            continue
        number = str(r.get("housenumber") or "").strip() or typed_number
        line1 = f"{number} {street}" if number else street
        city = str(r.get("city") or r.get("town") or r.get("village") or r.get("hamlet") or "").strip()
        state = str(r.get("state_code") or "").strip().upper()
        if not state:
            name = str(r.get("state") or "").strip()
            state = US_STATES.get(name.lower(), "" if country == "us" else name)
        postal = str(r.get("postcode") or "").strip()
        label = ", ".join(p for p in (line1, city, f"{state} {postal}".strip()) if p)
        if label.lower() in seen:
            continue
        seen.add(label.lower())
        out.append({
            "label": label,
            "line1": line1,
            "city": city,
            "state": state,
            "postal_code": postal,
            "country": str(r.get("country_code") or country).upper(),
        })
        if len(out) >= LIMIT:
            break
    return out


async def ask_geoapify(text: str, country: str, key: str) -> list[dict]:
    """Geoapify's autocomplete for this text, inside one country."""
    import httpx

    params = {
        "text": text, "filter": f"countrycode:{country}", "format": "json",
        "limit": LIMIT, "lang": "en", "apiKey": key,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(GEOAPIFY_URL, params=params)
    if res.status_code == 429:
        # The day's allowance is spent (or it is being asked too fast): stop
        # asking for a while rather than fail every keystroke.
        try:
            await redis_set("addr:cooldown", "1", expire=COOL_DOWN_SECONDS)
        except Exception:  # noqa: BLE001
            pass
    if res.status_code != 200:
        # The status only: the request URL carries the key.
        raise Unavailable(f"status {res.status_code}")
    data = res.json()
    if isinstance(data.get("results"), list):
        return data["results"]
    return [f.get("properties") or {} for f in data.get("features") or []]


async def _within_budget(request: Request) -> bool:
    """Count this request against the day's allowance, the platform's and this
    shop's. Without Redis nothing is counted, and Geoapify's own limit is what
    stops it."""
    day = datetime.now(UTC).strftime("%Y%m%d")
    slug = str(getattr(request.state, "tenant_slug", None) or "")
    # The slug comes from a header: anything else counts as the platform's.
    shop = slug if re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", slug) else "platform"
    try:
        if await redis_get("addr:cooldown"):
            return False
        total = await redis_increment(f"addr:budget:{day}", expire=2 * 86_400)
        mine = await redis_increment(f"addr:budget:{day}:{shop}", expire=2 * 86_400)
    except Exception:  # noqa: BLE001 — never stand in the way
        return True
    return total <= DAILY_BUDGET and mine <= SHOP_DAILY_BUDGET


@router.get("/suggest")
async def suggest(
    request: Request,
    q: str = Query("", max_length=120),
    country: str = Query("US", max_length=2),
) -> dict:
    """Up to five whole addresses for what the buyer has typed so far."""
    key = (settings.GEOAPIFY_API_KEY or "").strip()
    if not key:
        return {"enabled": False, "suggestions": []}
    text = " ".join(q.split())
    cc = (country or "US").strip().lower()
    if len(text) < MIN_CHARS or not re.fullmatch(r"[a-z]{2}", cc):
        return _answer([])

    cache_key = f"addr:v1:{cc}:{text.lower()}"
    try:
        cached = await redis_get(cache_key)
    except Exception:  # noqa: BLE001
        cached = None
    if cached is not None:
        return _answer(json.loads(cached))

    await enforce_rate_limit(request, "addr-suggest", limit=VISITOR_PER_MINUTE, window=60)
    if not await _within_budget(request):
        return _answer([])
    try:
        found = suggestions_from(await ask_geoapify(text, cc, key), text, cc)
    except Unavailable as exc:
        logger.warning("Address suggestions unavailable: %s", exc)
        return _answer([])
    except Exception as exc:  # noqa: BLE001 — the buyer types it instead
        # The kind of error only: a network error can carry the request URL,
        # and the URL carries the key.
        logger.warning("Address suggestions unavailable: %s", type(exc).__name__)
        return _answer([])
    try:
        await redis_set(cache_key, json.dumps(found), expire=CACHE_SECONDS)
    except Exception:  # noqa: BLE001
        pass
    return _answer(found)
