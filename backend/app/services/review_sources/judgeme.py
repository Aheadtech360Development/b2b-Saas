"""Judge.me: a brand's reviews from the review app its Shopify shop used.

The brand gives its shop domain and its *private* API token (Judge.me admin →
Settings → Integrations → View API tokens). With them we read every review it
has, product and store, and keep them current every few hours. Nothing is ever
written back to Judge.me.

What each review becomes
------------------------
A row in `product_reviews` with source 'judgeme', keyed on Judge.me's review id,
so a second import changes nothing and an edit updates in place:

* the product: matched on Judge.me's product handle against the shop's URL
  handles (a shop moved from Shopify keeps them), then on the exact product
  name. A store review (no product) stays a store review. A product review
  that matches nothing is not imported, and its handle is listed for the admin
  to fix, because showing it on the wrong product, or as a store review, would
  misstate what the customer wrote about.
* "Verified buyer" exactly when Judge.me says so (its own list of verified
  statuses).
* shown on the shop when it is published on Judge.me. A review the shop hides
  here stays hidden; one Judge.me stops publishing is hidden here too.
* the reviewer's name as first name and last initial, the way review widgets
  show it, and never their email.
* the first published photo.

Judge.me's API returns no replies, so none are imported.
"""
from __future__ import annotations

import html
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SOURCE = "judgeme"
API = "https://api.judge.me/api/v1"

# Judge.me's own ceiling for one page.
PER_PAGE = 100
# A guard, not a limit anyone should reach: 1,000 pages is 100,000 reviews.
MAX_PAGES = 1000
# How many unmatched product handles the admin is shown.
MAX_UNMATCHED_SHOWN = 25

# Judge.me's verified statuses ("Reviews with the following status are
# considered verified reviews"), from its API reference.
VERIFIED = {"confirmed-buyer", "buyer", "verified-purchase", "semi-verified-purchase", "admin"}

HTTP_TIMEOUT = httpx.Timeout(30.0, connect=10.0)

_HOST = re.compile(r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


class JudgeMeError(Exception):
    """Something the brand needs to act on, in plain words."""


# ── The brand's details ──────────────────────────────────────────────────────

def clean_domain(raw: str | None) -> str:
    """The shop domain Judge.me knows the shop by.

    Accepts what an admin is likely to paste: "my-shop", "my-shop.myshopify.com",
    "https://my-shop.myshopify.com/admin". A bare name is a Shopify shop.
    """
    value = (raw or "").strip().lower()
    value = re.sub(r"^[a-z]+://", "", value).split("/", 1)[0].split("?", 1)[0].strip(". ")
    if value and "." not in value:
        value = f"{value}.myshopify.com"
    if not _HOST.match(value):
        raise JudgeMeError(
            "Enter the shop domain Judge.me shows under Settings → Integrations, "
            "for example your-shop.myshopify.com."
        )
    return value


def clean_token(raw: str | None) -> str:
    value = (raw or "").strip()
    if len(value) < 8 or len(value) > 200 or any(c.isspace() for c in value):
        raise JudgeMeError(
            "Paste the private API token from Judge.me → Settings → Integrations → View API tokens."
        )
    return value


# ── Talking to Judge.me ──────────────────────────────────────────────────────

def _client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=HTTP_TIMEOUT, transport=transport)


def _their_words(response: httpx.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return None
    if isinstance(body, dict):
        for key in ("error", "message", "errors"):
            value = body.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:200]
    return None


async def _get(client: httpx.AsyncClient, path: str, *, domain: str, token: str,
               params: dict | None = None) -> Any:
    try:
        response = await client.get(
            f"{API}{path}",
            params={"shop_domain": domain, **(params or {})},
            headers={"X-Api-Token": token, "Accept": "application/json"},
        )
    except httpx.TimeoutException:
        raise JudgeMeError("Judge.me did not answer in time. Try again in a minute.")
    except httpx.HTTPError:
        raise JudgeMeError("Could not reach Judge.me. Try again in a minute.")

    if response.status_code in (401, 403):
        words = _their_words(response)
        raise JudgeMeError(
            "Judge.me did not accept this shop domain and private API token"
            + (f": {words}" if words else ".")
            + " Use the private token, not the public one."
        )
    if response.status_code == 404:
        raise JudgeMeError("Judge.me has no shop with that domain. Check the shop domain.")
    if response.status_code == 429:
        raise JudgeMeError("Judge.me asked us to slow down. Try again in a few minutes.")
    if response.status_code != 200:
        raise JudgeMeError(f"Judge.me answered {response.status_code}. Try again later.")
    try:
        return response.json()
    except ValueError:
        raise JudgeMeError("Judge.me sent an answer we could not read. Try again later.")


async def shop_info(domain: str, token: str, *, transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """Proves the details work, and names the shop for the admin."""
    async with _client(transport) as client:
        body = await _get(client, "/shops/info", domain=domain, token=token)
    shop = body.get("shop") if isinstance(body, dict) else None
    shop = shop if isinstance(shop, dict) else {}
    return {
        "name": str(shop.get("name") or domain)[:150],
        "platform": shop.get("platform"),
        "plan": shop.get("plan"),
    }


async def fetch_reviews(domain: str, token: str, *,
                        transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """Every review Judge.me has for the shop, page by page.

    `complete` is True only when the last page was reached: an import that
    stopped early must not remove the reviews it simply had not got to.
    """
    reviews: list[dict] = []
    seen: set[str] = set()
    complete = False
    async with _client(transport) as client:
        for page in range(1, MAX_PAGES + 1):
            body = await _get(client, "/reviews", domain=domain, token=token,
                              params={"per_page": PER_PAGE, "page": page})
            batch = body.get("reviews") if isinstance(body, dict) else None
            if not isinstance(batch, list):
                raise JudgeMeError("Judge.me sent an answer we could not read. Try again later.")
            fresh = [r for r in batch if isinstance(r, dict) and str(r.get("id")) not in seen]
            if batch and not fresh:
                # The same page again: paging is not moving. Keep what arrived,
                # but do not treat it as the whole list.
                logger.info("Judge.me paging repeated a page for %s at page %s", domain, page)
                break
            for r in fresh:
                seen.add(str(r.get("id")))
            reviews.extend(fresh)
            if len(batch) < PER_PAGE:
                complete = True
                break
    return {"reviews": reviews, "complete": complete}


# ── Turning a review into a row ──────────────────────────────────────────────

_TAG = re.compile(r"<[^>]+>")


def _text(value: Any, limit: int) -> str:
    """Judge.me's raw text as plain text: tags dropped, entities read, spaces tidied."""
    s = html.unescape(_TAG.sub(" ", str(value or "")))
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s[:limit]


def short_name(raw: Any) -> str:
    """'Jane Smith' → 'Jane S.' — how review widgets show a customer."""
    words = [w for w in re.split(r"\s+", _text(raw, 150)) if w]
    if not words or any("@" in w for w in words):
        return "A customer"
    if len(words) == 1:
        return words[0][:150]
    return f"{words[0]} {words[-1][0].upper()}."[:150]


def _when(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        when = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _picture(pictures: Any) -> str | None:
    for picture in pictures if isinstance(pictures, list) else []:
        if not isinstance(picture, dict) or picture.get("hidden"):
            continue
        urls = picture.get("urls") if isinstance(picture.get("urls"), dict) else {}
        for size in ("huge", "original", "compact", "small"):
            url = str(urls.get(size) or "")
            if url.startswith("https://") and len(url) <= 1000:
                return url
    return None


def _product_key(review: dict) -> tuple[str, str]:
    handle = str(review.get("product_handle") or "").strip().lower()
    title = _text(review.get("product_title"), 255).lower()
    return handle, title


def is_store_review(review: dict) -> bool:
    """A review of the shop rather than of one of its products."""
    handle, _ = _product_key(review)
    external = review.get("product_external_id")
    return not handle and external in (None, "", 0, "0", -1, "-1")


def normalise(review: dict) -> dict | None:
    """One Judge.me review as row fields, or None if it cannot be one."""
    review_id = review.get("id")
    try:
        rating = int(review.get("rating"))
    except (TypeError, ValueError):
        return None
    if review_id in (None, "") or not 1 <= rating <= 5:
        return None
    body = _text(review.get("body"), 5000)
    reviewer = review.get("reviewer") if isinstance(review.get("reviewer"), dict) else {}
    return {
        "external_id": str(review_id)[:255],
        "rating": rating,
        "title": _text(review.get("title"), 255) or None,
        # A star-only review has no text, and the column needs some.
        "body": body or f"Rated {rating} out of 5 without a written review.",
        "reviewer_name": short_name(reviewer.get("name")),
        "is_verified": str(review.get("verified") or "") in VERIFIED,
        "image_url": _picture(review.get("pictures")),
        "reviewed_at": _when(review.get("created_at")),
    }


def published(review: dict) -> bool:
    return review.get("curated") == "ok" and not review.get("hidden")


# ── Storing ──────────────────────────────────────────────────────────────────

async def _products(db: AsyncSession) -> tuple[dict[str, uuid.UUID], dict[str, uuid.UUID]]:
    """This shop's products by URL handle and by name (names only when unique)."""
    from app.models.product import Product

    rows = (await db.execute(select(Product.id, Product.slug, Product.name))).all()
    by_handle = {str(r.slug or "").strip().lower(): r.id for r in rows if r.slug}
    names: dict[str, list[uuid.UUID]] = {}
    for r in rows:
        key = str(r.name or "").strip().lower()
        if key:
            names.setdefault(key, []).append(r.id)
    by_name = {k: v[0] for k, v in names.items() if len(v) == 1}
    return by_handle, by_name


async def store(db: AsyncSession, tenant_id: Any, reviews: list[dict], *, complete: bool) -> dict:
    """Upsert this brand's Judge.me reviews. Returns what changed.

    Runs on the brand's own session, so every read and write is its own.
    """
    from app.models.product import ProductReview

    tid = uuid.UUID(str(tenant_id))
    by_handle, by_name = await _products(db)
    existing = {
        r.external_id: r for r in (await db.execute(
            select(ProductReview).where(ProductReview.tenant_id == tid, ProductReview.source == SOURCE)
        )).scalars().all()
    }

    added = updated = hidden_by_source = store_reviews = 0
    unmatched: dict[str, int] = {}
    seen: set[str] = set()
    for raw in reviews:
        row = normalise(raw)
        if row is None:
            continue
        if is_store_review(raw):
            product_id = None
            store_reviews += 1
        else:
            handle, title = _product_key(raw)
            product_id = by_handle.get(handle) or by_name.get(title)
            if product_id is None:
                label = handle or title or "a product with no handle"
                unmatched[label] = unmatched.get(label, 0) + 1
                continue
        seen.add(row["external_id"])
        live = published(raw)
        current = existing.get(row["external_id"])
        if current is None:
            db.add(ProductReview(
                tenant_id=tid, product_id=product_id, user_id=None, source=SOURCE,
                is_approved=live, reviewer_company=None, reviewer_photo_url=None,
                source_url=None, reply_text=None, **row,
            ))
            added += 1
            continue
        changed = False
        for field, value in {**row, "product_id": product_id}.items():
            if getattr(current, field) != value:
                setattr(current, field, value)
                changed = True
        # Judge.me stopped publishing it: hide it here too. The reverse is the
        # shop's call, so a review it hid here is never shown again by a sync.
        if not live and current.is_approved:
            current.is_approved = False
            hidden_by_source += 1
            changed = True
        if changed:
            updated += 1

    removed = 0
    if complete:
        gone = [key for key in existing if key not in seen]
        if gone:
            result = await db.execute(
                delete(ProductReview).where(
                    ProductReview.tenant_id == tid,
                    ProductReview.source == SOURCE,
                    ProductReview.external_id.in_(gone),
                )
            )
            removed = result.rowcount or 0

    worst_first = sorted(unmatched.items(), key=lambda kv: (-kv[1], kv[0]))
    return {
        "added": added, "updated": updated, "removed": removed,
        "hidden_by_source": hidden_by_source,
        "imported": len(seen), "store_reviews": store_reviews,
        "unmatched": sum(unmatched.values()),
        "unmatched_handles": [h for h, _ in worst_first[:MAX_UNMATCHED_SHOWN]],
    }


# ── Import and keep current ──────────────────────────────────────────────────

async def sync(db: AsyncSession, tenant_id: Any, *,
               transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """Read every review from Judge.me, store them, and record how it went."""
    from app.services.review_sources import store as settings_store

    data = await settings_store.load(db, tenant_id=tenant_id)
    jm = data["judgeme"]
    if not (jm.get("shop_domain") and jm.get("api_token")):
        raise JudgeMeError("Judge.me is not connected.")
    now = datetime.now(timezone.utc).isoformat()
    jm["last_attempt_at"] = now
    try:
        fetched = await fetch_reviews(jm["shop_domain"], jm["api_token"], transport=transport)
        result = await store(db, tenant_id, fetched["reviews"], complete=fetched["complete"])
    except JudgeMeError as exc:
        await db.rollback()
        data = await settings_store.load(db, tenant_id=tenant_id)
        data["judgeme"].update({"last_error": str(exc), "last_attempt_at": now})
        await settings_store.save(db, data, tenant_id=tenant_id)
        await db.commit()
        raise

    jm.update({
        "last_synced_at": now, "last_error": None,
        "imported": result["imported"], "store_reviews": result["store_reviews"],
        "unmatched": result["unmatched"], "unmatched_handles": result["unmatched_handles"],
        "complete": fetched["complete"],
    })
    await settings_store.save(db, data, tenant_id=tenant_id)
    await db.commit()
    return {**result, "complete": fetched["complete"]}


async def remove_imported(db: AsyncSession, tenant_id: Any) -> int:
    from app.models.product import ProductReview

    result = await db.execute(
        delete(ProductReview).where(
            ProductReview.tenant_id == uuid.UUID(str(tenant_id)),
            ProductReview.source == SOURCE,
        )
    )
    return result.rowcount or 0


# New Judge.me reviews reach the shop within this long.
SYNC_EVERY_SECONDS = 6 * 60 * 60
_TICK_SECONDS = 15 * 60


async def scheduler_loop() -> None:
    """Re-import every connected brand's Judge.me reviews on a schedule.

    Runs in every web worker; a Redis lock lets one of them act per tick, and a
    brand is synced once its last attempt is older than SYNC_EVERY_SECONDS.
    """
    import asyncio

    await asyncio.sleep(120)  # let the app finish booting first
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("judge.me reviews scheduler tick failed")
        await asyncio.sleep(_TICK_SECONDS)


def due(jm: dict, now: float) -> bool:
    if not (jm.get("shop_domain") and jm.get("api_token")):
        return False
    last = jm.get("last_attempt_at") or jm.get("last_synced_at")
    if not last:
        return True
    try:
        return now - datetime.fromisoformat(str(last)).timestamp() >= SYNC_EVERY_SECONDS
    except ValueError:
        return True


async def _tick() -> None:
    import json

    from app.core.database import AsyncSessionLocal
    from app.core.redis import get_redis_pool
    from app.core.tenant_context import set_bypass_scoping, set_current_tenant
    from app.core.tenant_settings import _SEP
    from app.models.system import Settings
    from app.services import entitlements
    from app.services.review_sources import store as settings_store

    redis = get_redis_pool()
    if not await redis.set("review_sources:judgeme:scheduler", "1", nx=True, ex=_TICK_SECONDS - 30):
        return

    set_bypass_scoping(True)  # reading every brand's settings row
    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(Settings.key, Settings.value).where(Settings.key.like(f"{settings_store.KEY}{_SEP}%"))
            )).all()
    finally:
        set_bypass_scoping(False)

    now = time.time()
    for key, value in rows:
        try:
            jm = (json.loads(value or "{}") or {}).get("judgeme") or {}
        except (ValueError, AttributeError):
            continue
        if not isinstance(jm, dict) or not due(jm, now):
            continue
        tenant_id = key.split(_SEP, 1)[1].strip()
        # Each brand under its own tenant context, so its reviews carry its id
        # and row-level security applies as for any request.
        set_current_tenant(uuid.UUID(tenant_id))
        try:
            async with AsyncSessionLocal() as db:
                if not await entitlements.enabled(db, tenant_id, "reviews"):
                    continue
                await sync(db, tenant_id)
        except JudgeMeError as exc:
            logger.info("Judge.me sync for %s: %s", tenant_id, exc)
        except Exception:
            logger.exception("Judge.me sync for %s failed", tenant_id)
        finally:
            set_current_tenant(None)
