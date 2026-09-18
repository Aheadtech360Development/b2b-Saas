"""The S&S catalogue as the supplier screens see it.

The whole style list comes from one call (`/v2/styles/`), so browsing and
filtering never depend on a background sync having filled a table first — the
old browse read a cache table only a Celery beat job ever wrote, and on a host
with no worker running it was simply empty.

The style list is the same catalogue for every account, so it is cached once
for the platform (Redis, six hours) in a trimmed form. Anything
account-specific — price, stock — is never cached here and is always fetched
with the brand's own credentials.
"""
from __future__ import annotations

import json
import logging
import time

from app.core.redis import redis_get, redis_set
from app.services.ss_activewear_service import ss_image_url

logger = logging.getLogger(__name__)

# Per country: S&S Canada is a different catalogue on a different API.
STYLES_KEY = "ss:styles:v2:{country}"
STYLES_TTL = 6 * 3600
STATS_TTL = 6 * 3600
STATS_BATCH = 10
# Counting variants means asking S&S for every SKU of every matching style. Past
# this many styles the count is left unknown rather than making the admin wait.
COUNT_LIMIT = 250

_memo: dict[str, tuple[float, list[dict]]] = {}


class CatalogUnavailable(Exception):
    """S&S couldn't be reached with this brand's credentials; message is safe to show."""


def _trim(s: dict) -> dict | None:
    sid = s.get("styleID")
    if sid is None:
        return None
    desc = (s.get("description") or "").strip()
    return {
        "style_id": str(sid),
        "part_number": str(s.get("partNumber") or ""),
        "brand": (s.get("brandName") or "").strip(),
        "style_name": (s.get("styleName") or "").strip(),
        "title": (s.get("title") or "").strip(),
        "category": (s.get("baseCategory") or "").strip(),
        # Kept whole: a sync set to "update everything" writes it to products.
        "description": desc[:8000],
        "image": ss_image_url(s.get("styleImage"), "medium"),
        "brand_image": ss_image_url(s.get("brandImage"), "small"),
    }


async def all_styles(svc) -> list[dict]:
    """Every S&S style, trimmed. Memory, then Redis, then S&S."""
    country = getattr(svc, "country", "US")
    key = STYLES_KEY.format(country=country)
    hit = _memo.get(country)
    if hit and time.monotonic() - hit[0] < 600:
        return hit[1]
    try:
        cached = await redis_get(key)
    except Exception:
        cached = None
    if cached:
        try:
            styles = json.loads(cached)
            _memo[country] = (time.monotonic(), styles)
            return styles
        except ValueError:
            pass

    if not svc.has_credentials:
        raise CatalogUnavailable("Connect your S&S Activewear account first — account number and API key.")
    try:
        raw = await svc.fetch_all_styles()
    except Exception as exc:
        logger.warning("S&S styles fetch failed: %s", exc)
        code = getattr(getattr(exc, "response", None), "status_code", None)
        if code in (401, 403):
            raise CatalogUnavailable("S&S rejected these credentials. Check the account number and API key.")
        raise CatalogUnavailable("Couldn't reach S&S Activewear just now. Please try again.")

    styles = [t for t in (_trim(s) for s in raw) if t]
    styles.sort(key=lambda s: (s["brand"].lower(), s["style_name"].lower()))
    if styles:
        try:
            await redis_set(key, json.dumps(styles), expire=STYLES_TTL)
        except Exception:
            pass
        _memo[country] = (time.monotonic(), styles)
    return styles


def brands(styles: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for s in styles:
        if s["brand"]:
            counts[s["brand"]] = counts.get(s["brand"], 0) + 1
    return [{"brand": b, "styles": n} for b, n in sorted(counts.items(), key=lambda x: x[0].lower())]


def _field(style: dict, field: str) -> list[str]:
    if field == "brand":
        return [style["brand"]]
    if field == "category":
        return [style["category"]]
    if field == "title":
        return [style["title"]]
    # A style can be named by its number, its name, or "Brand Name" together.
    return [style["part_number"], style["style_name"], style["style_id"], f'{style["brand"]} {style["style_name"]}']


def _rule_matches(style: dict, rule: dict) -> bool:
    want = rule["value"].strip().lower()
    have = [v.strip().lower() for v in _field(style, rule["field"]) if v]
    if rule["op"] == "contains":
        return any(want in v for v in have)
    if rule["op"] == "not_equals":
        return all(v != want for v in have)
    return any(v == want for v in have)


def matches(style: dict, filters: dict) -> bool:
    """Does this style pass the brand's import filters? No rules means nothing
    is selected — an empty filter must never import the whole catalogue."""
    rules = (filters or {}).get("rules") or []
    if not rules:
        return False
    hits = (_rule_matches(style, r) for r in rules)
    return all(hits) if filters.get("match") == "all" else any(hits)


def search(styles: list[dict], q: str | None = None, brand: str | None = None) -> list[dict]:
    out = styles
    if brand:
        b = brand.strip().lower()
        out = [s for s in out if s["brand"].lower() == b]
    if q:
        needle = q.strip().lower()
        out = [s for s in out if needle in f'{s["brand"]} {s["style_name"]} {s["part_number"]} {s["title"]}'.lower()]
    return out


async def style_stats(svc, styles: list[dict]) -> dict[str, dict]:
    """Variant count, sizes and colours per style, from S&S's SKU list.

    Cached per style for six hours; only the styles not in cache are asked for,
    ten at a time. A failed batch leaves those styles without stats rather than
    failing the page.
    """
    out: dict[str, dict] = {}
    missing = []
    for s in styles:
        try:
            hit = await redis_get(f"ss:pstats:{getattr(svc, 'country', 'US')}:{s['style_id']}")
        except Exception:
            hit = None
        if hit:
            try:
                out[s["style_id"]] = json.loads(hit)
                continue
            except ValueError:
                pass
        missing.append(s)

    for i in range(0, len(missing), STATS_BATCH):
        batch = missing[i:i + STATS_BATCH]
        parts = [s["part_number"] for s in batch if s["part_number"]]
        if not parts:
            continue
        try:
            rows = await svc.fetch_products_for_parts(parts, fields="Sku,StyleID,SizeName,ColorName")
        except Exception as exc:
            logger.warning("S&S stats batch failed (%s…): %s", parts[:3], exc)
            continue
        grouped: dict[str, dict] = {}
        for r in rows:
            sid = str(r.get("styleID") or "")
            if not sid:
                continue
            g = grouped.setdefault(sid, {"variants": 0, "sizes": [], "colors": set()})
            g["variants"] += 1
            size = r.get("sizeName")
            if size and size not in g["sizes"]:
                g["sizes"].append(size)
            if r.get("colorName"):
                g["colors"].add(r["colorName"])
        for s in batch:
            g = grouped.get(s["style_id"])
            stat = {"variants": g["variants"], "sizes": g["sizes"], "colors": len(g["colors"])} if g \
                else {"variants": 0, "sizes": [], "colors": 0}
            out[s["style_id"]] = stat
            try:
                await redis_set(f"ss:pstats:{getattr(svc, 'country', 'US')}:{s['style_id']}", json.dumps(stat), expire=STATS_TTL)
            except Exception:
                pass
    return out


def as_ss(style: dict) -> dict:
    """A trimmed style back in S&S's own field names, for Match Fields."""
    return {
        "styleID": style.get("style_id"), "partNumber": style.get("part_number"),
        "brandName": style.get("brand"), "styleName": style.get("style_name"),
        "title": style.get("title"), "baseCategory": style.get("category"),
        "description": style.get("description"),
    }

