"""A brand's Google reviews: connect, fetch, store, keep current.

Why the Business Profile API and not Places
-------------------------------------------
Google offers two ways to read reviews. The Places API needs only a key, but it
returns a handful of reviews and its policy forbids storing them — "You must
not pre-fetch, cache, or store Places API content". This feature exists to
store them, so Places is not an option.

The Business Profile API is how a business reads *its own* reviews. The brand
signs in with the Google account that manages its profile, which is what gives
us the right to keep them, and it returns every review with paging.

It has one requirement we cannot satisfy in code: Google must approve the
platform's Cloud project for the Business Profile APIs. Until it does, the
review calls are refused. `status()` reports that plainly rather than letting a
brand think it connected.

What is stored where
--------------------
The connection (refresh token, chosen account and location, last result) is one
tenant-namespaced settings row, like every other per-brand integration. The
refresh token never leaves the server: `status()` reports whether one exists,
never what it is.

The reviews themselves go into `product_reviews` with `source='google'`, so
they are moderated and shown by the code that already handles site reviews.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.tenant_settings import get_setting, set_setting

logger = logging.getLogger(__name__)

KEY = "google_reviews"
SOURCE = "google"

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
LOCATIONS_URL = "https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations"
REVIEWS_URL = "https://mybusiness.googleapis.com/v4/{account}/{location}/reviews"

SCOPE = "https://www.googleapis.com/auth/business.manage"

# A sign-in that takes longer than this was abandoned, and its state is refused.
STATE_TTL_SECONDS = 15 * 60

# Google's own ceiling for one page of reviews.
PAGE_SIZE = 50
# A guard, not a limit anyone should reach: 200 pages is 10,000 reviews.
MAX_PAGES = 200

_STARS = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}

HTTP_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class GoogleReviewsError(Exception):
    """Something the brand or the platform needs to act on, in plain words."""


# ── Configuration ────────────────────────────────────────────────────────────

def configured() -> bool:
    """Is the platform's Google OAuth app set up at all?"""
    return bool(
        settings.GOOGLE_OAUTH_CLIENT_ID
        and settings.GOOGLE_OAUTH_CLIENT_SECRET
        and settings.GOOGLE_OAUTH_REDIRECT_URI
    )


async def load(db: AsyncSession, *, tenant_id: Any = None) -> dict:
    raw = await get_setting(db, KEY, tenant_id=tenant_id)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


async def save(db: AsyncSession, data: dict, *, tenant_id: Any = None) -> None:
    await set_setting(db, KEY, json.dumps(data), tenant_id=tenant_id)


def status(data: dict) -> dict:
    """What the admin screen shows. Never includes a token."""
    return {
        "configured": configured(),
        "connected": bool(data.get("refresh_token")),
        "google_email": data.get("google_email"),
        "account": data.get("account"),
        "account_name": data.get("account_name"),
        "location": data.get("location"),
        "location_name": data.get("location_name"),
        "maps_url": data.get("maps_url"),
        "average_rating": data.get("average_rating"),
        "total_reviews": data.get("total_reviews"),
        "imported": data.get("imported"),
        "last_synced_at": data.get("last_synced_at"),
        "last_error": data.get("last_error"),
    }


# ── Signed state: who started this sign-in, and where to send them back ─────

def _sign(payload: bytes) -> str:
    return hmac.new(settings.APP_SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()


def make_state(tenant_id: Any, user_id: Any, return_to: str) -> str:
    """A state value Google hands back to us unchanged.

    It is the only link between the browser that left for Google and the brand
    it belongs to, because the callback arrives as a plain redirect with no
    admin token on it. Signed, so nobody can hand us a state naming another
    brand; dated, so a stolen one goes stale; and carrying a random nonce, so
    two sign-ins never share one.
    """
    body = json.dumps({
        "t": str(tenant_id), "u": str(user_id) if user_id else None,
        "r": return_to, "n": secrets.token_urlsafe(12), "e": int(time.time()) + STATE_TTL_SECONDS,
    }, separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(body).decode().rstrip("=")
    return f"{encoded}.{_sign(body)}"


def read_state(state: str) -> dict:
    """The state's contents, or GoogleReviewsError if it is forged or stale."""
    try:
        encoded, signature = (state or "").split(".", 1)
        body = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    except (ValueError, TypeError):
        raise GoogleReviewsError("That sign-in link is not valid. Start again from Reviews.")
    if not hmac.compare_digest(_sign(body), signature):
        raise GoogleReviewsError("That sign-in link is not valid. Start again from Reviews.")
    data = json.loads(body)
    if int(data.get("e") or 0) < int(time.time()):
        raise GoogleReviewsError("That sign-in took too long. Start again from Reviews.")
    return data


def safe_return_url(candidate: str | None) -> str:
    """Where to send the admin after Google, limited to our own sites.

    The return address comes from the browser, and an OAuth callback that
    redirects anywhere it is told is a textbook open redirect. Only the
    platform's own frontend, its brand subdomains, and the explicitly allowed
    origins are accepted; anything else falls back to the platform frontend.
    """
    fallback = settings.FRONTEND_URL.rstrip("/")
    if not candidate:
        return fallback
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return fallback
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return fallback
    origin = f"{parsed.scheme}://{parsed.netloc}"

    allowed = {settings.FRONTEND_URL.rstrip("/"), *(
        o.rstrip("/") for o in settings.allowed_origins_list if o
    )}
    domain = re.escape(settings.PLATFORM_DOMAIN or "localhost")
    patterns = [rf"^https://([a-z0-9-]+\.)*{domain}$"]
    if settings.APP_ENV != "production":
        patterns.append(r"^http://([a-z0-9-]+\.)*localhost(:\d+)?$")
    if origin in allowed or any(re.match(p, origin) for p in patterns):
        return origin
    return fallback


def authorize_url(state: str) -> str:
    """The Google consent screen for this brand's sign-in."""
    if not configured():
        raise GoogleReviewsError(
            "Google reviews are not set up on this platform yet. "
            "The platform administrator needs to add the Google sign-in keys."
        )
    return AUTH_URL + "?" + urlencode({
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": f"{SCOPE} openid email",
        # Offline + consent: without both, Google returns no refresh token on a
        # second connection, and syncing would stop an hour after connecting.
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    })


# ── Talking to Google ────────────────────────────────────────────────────────

def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=HTTP_TIMEOUT)


def _google_message(response: httpx.Response) -> str:
    """Google's own reason, in a sentence an admin can act on."""
    try:
        body = response.json()
    except ValueError:
        body = {}
    err = body.get("error")
    message = (err.get("message") if isinstance(err, dict) else None) or body.get("error_description")
    if response.status_code == 403 and message and "has not been used" in message:
        return ("This platform's Google project does not have the Business Profile API "
                "switched on yet. The platform administrator needs to enable it.")
    if response.status_code in (403, 429) and message and ("quota" in message.lower()
                                                            or "not approved" in message.lower()):
        return ("Google has not yet approved this platform for the Business Profile API. "
                "Reviews will import as soon as it does.")
    return message or f"Google answered {response.status_code}."


async def exchange_code(code: str) -> dict:
    """Turn the consent code into tokens. Returns Google's token response."""
    async with _client() as client:
        response = await client.post(TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
    if response.status_code != 200:
        raise GoogleReviewsError(_google_message(response))
    tokens = response.json()
    if not tokens.get("refresh_token"):
        raise GoogleReviewsError(
            "Google did not grant ongoing access. Connect again and allow access when asked."
        )
    return tokens


def _email_from_id_token(id_token: str | None) -> str | None:
    """Which Google account connected, for display. Not used to authorise anything."""
    if not id_token:
        return None
    try:
        payload = id_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return claims.get("email")
    except (IndexError, ValueError, TypeError):
        return None


async def _access_token(data: dict) -> str:
    """A fresh access token from the stored refresh token."""
    if not data.get("refresh_token"):
        raise GoogleReviewsError("Google reviews are not connected.")
    async with _client() as client:
        response = await client.post(TOKEN_URL, data={
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "refresh_token": data["refresh_token"],
            "grant_type": "refresh_token",
        })
    if response.status_code != 200:
        # invalid_grant means the brand revoked us, or the password changed.
        if "invalid_grant" in response.text:
            raise GoogleReviewsError(
                "Google access was removed. Connect Google reviews again to keep them up to date."
            )
        raise GoogleReviewsError(_google_message(response))
    return response.json()["access_token"]


async def _get(client: httpx.AsyncClient, url: str, token: str, params: dict | None = None) -> dict:
    response = await client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
    if response.status_code != 200:
        raise GoogleReviewsError(_google_message(response))
    return response.json()


async def list_locations(data: dict) -> list[dict]:
    """Every business location this Google account manages."""
    token = await _access_token(data)
    out: list[dict] = []
    async with _client() as client:
        accounts: list[dict] = []
        page_token = None
        for _ in range(20):
            params = {"pageSize": 20}
            if page_token:
                params["pageToken"] = page_token
            body = await _get(client, ACCOUNTS_URL, token, params)
            accounts.extend(body.get("accounts") or [])
            page_token = body.get("nextPageToken")
            if not page_token:
                break

        for account in accounts:
            page_token = None
            for _ in range(20):
                params = {"readMask": "name,title,storefrontAddress,metadata", "pageSize": 100}
                if page_token:
                    params["pageToken"] = page_token
                body = await _get(client, LOCATIONS_URL.format(account=account["name"]), token, params)
                for location in body.get("locations") or []:
                    address = location.get("storefrontAddress") or {}
                    out.append({
                        "account": account.get("name"),
                        "account_name": account.get("accountName"),
                        "location": location.get("name"),
                        "title": location.get("title"),
                        "address": ", ".join(
                            p for p in [*(address.get("addressLines") or []),
                                        address.get("locality"), address.get("administrativeArea")]
                            if p
                        ),
                        "maps_url": (location.get("metadata") or {}).get("mapsUri"),
                    })
                page_token = body.get("nextPageToken")
                if not page_token:
                    break
    return out


async def fetch_reviews(data: dict) -> dict:
    """Every review on the chosen location, following Google's pages."""
    # Connection first: telling a brand that never connected to "choose a
    # business" sends them looking for a list that cannot exist yet.
    if not data.get("refresh_token"):
        raise GoogleReviewsError("Google reviews are not connected.")
    if not data.get("account") or not data.get("location"):
        raise GoogleReviewsError("Choose which Google business to import reviews from.")
    token = await _access_token(data)
    url = REVIEWS_URL.format(account=data["account"], location=data["location"])

    reviews: list[dict] = []
    summary: dict = {}
    complete = False
    async with _client() as client:
        page_token = None
        for _ in range(MAX_PAGES):
            params = {"pageSize": PAGE_SIZE, "orderBy": "updateTime desc"}
            if page_token:
                params["pageToken"] = page_token
            body = await _get(client, url, token, params)
            reviews.extend(body.get("reviews") or [])
            summary = {
                "average_rating": body.get("averageRating", summary.get("average_rating")),
                "total_reviews": body.get("totalReviewCount", summary.get("total_reviews")),
            }
            page_token = body.get("nextPageToken")
            if not page_token:
                complete = True
                break
    return {"reviews": reviews, "complete": complete, **summary}


# ── Storing ──────────────────────────────────────────────────────────────────

def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalise(review: dict, maps_url: str | None = None) -> dict | None:
    """One Google review as a row, or None if it cannot be one."""
    review_id = review.get("reviewId") or (review.get("name") or "").rsplit("/", 1)[-1]
    rating = _STARS.get(str(review.get("starRating") or "").upper())
    if not review_id or not rating:
        return None
    reviewer = review.get("reviewer") or {}
    anonymous = bool(reviewer.get("isAnonymous"))
    reply = review.get("reviewReply") or {}
    comment = (review.get("comment") or "").strip()
    # Google appends a machine translation after this marker; the brand's
    # customers wrote the part before it.
    comment = comment.split("(Translated by Google)")[0].strip()
    return {
        "external_id": str(review_id)[:255],
        "rating": rating,
        # A star-only review has no text. The column is required, so it says
        # so rather than showing an empty quote.
        "body": comment or "Rated on Google without a written review.",
        "reviewer_name": ("A Google user" if anonymous else (reviewer.get("displayName") or "A Google user"))[:150],
        "reviewer_photo_url": None if anonymous else (reviewer.get("profilePhotoUrl") or None),
        "reply_text": (reply.get("comment") or None),
        "reviewed_at": _parse_time(review.get("createTime")),
        "source_url": maps_url,
    }


async def store(db: AsyncSession, tenant_id: Any, rows: list[dict], *, complete: bool) -> dict:
    """Upsert this brand's Google reviews. Returns what changed.

    Keyed on Google's review id, so running it twice changes nothing and an
    edited review updates in place. A review the brand hid stays hidden: the
    sync never touches `is_approved` on a row that already exists.

    Only when every page arrived (`complete`) are reviews that Google no longer
    has removed. A partial fetch that pruned would delete everything it simply
    had not reached yet.
    """
    from app.models.product import ProductReview

    tid = uuid.UUID(str(tenant_id))
    existing = {
        r.external_id: r for r in (await db.execute(
            select(ProductReview).where(
                ProductReview.tenant_id == tid, ProductReview.source == SOURCE,
            )
        )).scalars().all()
    }

    added = updated = 0
    seen: set[str] = set()
    for row in rows:
        seen.add(row["external_id"])
        current = existing.get(row["external_id"])
        if current is None:
            db.add(ProductReview(
                tenant_id=tid, product_id=None, source=SOURCE,
                is_verified=True, is_approved=True, title=None, reviewer_company=None,
                **row,
            ))
            added += 1
            continue
        changed = False
        for field, value in row.items():
            if getattr(current, field) != value:
                setattr(current, field, value)
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

    return {"added": added, "updated": updated, "removed": removed, "imported": len(seen)}


async def sync(db: AsyncSession, tenant_id: Any) -> dict:
    """Fetch and store this brand's reviews, and record how it went."""
    data = await load(db, tenant_id=tenant_id)
    now = datetime.now(timezone.utc).isoformat()
    try:
        fetched = await fetch_reviews(data)
        rows = [r for r in (normalise(x, data.get("maps_url")) for x in fetched["reviews"]) if r]
        result = await store(db, tenant_id, rows, complete=fetched["complete"])
    except GoogleReviewsError as exc:
        data["last_error"] = str(exc)
        data["last_attempt_at"] = now
        await save(db, data, tenant_id=tenant_id)
        await db.commit()
        raise

    data.update({
        "last_synced_at": now, "last_error": None,
        "average_rating": fetched.get("average_rating"),
        "total_reviews": fetched.get("total_reviews"),
        "imported": result["imported"],
    })
    await save(db, data, tenant_id=tenant_id)
    await db.commit()
    return {**result, "average_rating": fetched.get("average_rating"),
            "total_reviews": fetched.get("total_reviews")}


async def disconnect(db: AsyncSession, tenant_id: Any, *, remove_reviews: bool = True) -> dict:
    """Stop importing, tell Google to drop our access, and optionally remove
    what was imported. Removal is the default: without a connection the copies
    can only go stale, and a storefront showing reviews the brand can no longer
    keep current is worse than showing none."""
    from app.models.product import ProductReview

    data = await load(db, tenant_id=tenant_id)
    token = data.get("refresh_token")
    if token:
        try:
            async with _client() as client:
                await client.post(REVOKE_URL, params={"token": token})
        except httpx.HTTPError:
            # Revoking is a courtesy. The token is forgotten below regardless,
            # so we can no longer use it even if Google did not hear us.
            logger.info("Could not reach Google to revoke a review token")

    removed = 0
    if remove_reviews:
        result = await db.execute(
            delete(ProductReview).where(
                ProductReview.tenant_id == uuid.UUID(str(tenant_id)),
                ProductReview.source == SOURCE,
            )
        )
        removed = result.rowcount or 0

    await save(db, {}, tenant_id=tenant_id)
    await db.commit()
    return {"removed": removed}


# ── Keeping them current ─────────────────────────────────────────────────────

# New reviews appear on the storefront within this long of being posted.
SYNC_EVERY_SECONDS = 6 * 60 * 60
_TICK_SECONDS = 15 * 60


async def scheduler_loop() -> None:
    """Re-import every connected brand's reviews on a schedule.

    Runs in every web worker, like the supplier scheduler; a Redis lock lets
    one of them act per tick, and each brand is only synced once its last
    attempt is older than SYNC_EVERY_SECONDS.
    """
    import asyncio

    await asyncio.sleep(90)  # let the app finish booting first
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("google reviews scheduler tick failed")
        await asyncio.sleep(_TICK_SECONDS)


async def _tick() -> None:
    from app.core.database import AsyncSessionLocal
    from app.core.redis import get_redis_pool
    from app.core.tenant_context import set_bypass_scoping, set_current_tenant
    from app.core.tenant_settings import _SEP
    from app.models.system import Settings

    if not configured():
        return
    redis = get_redis_pool()
    if not await redis.set("google_reviews:scheduler", "1", nx=True, ex=_TICK_SECONDS - 30):
        return

    set_bypass_scoping(True)  # reading every brand's settings row
    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(Settings.key, Settings.value).where(Settings.key.like(f"{KEY}{_SEP}%"))
            )).all()
    finally:
        set_bypass_scoping(False)

    now = time.time()
    for key, value in rows:
        try:
            data = json.loads(value or "{}")
        except ValueError:
            continue
        if not (data.get("refresh_token") and data.get("location")):
            continue
        last = data.get("last_attempt_at") or data.get("last_synced_at")
        if last:
            try:
                if now - datetime.fromisoformat(last).timestamp() < SYNC_EVERY_SECONDS:
                    continue
            except ValueError:
                pass

        tenant_id = key.split(_SEP, 1)[1]
        # Each brand under its own tenant context, so the stored reviews carry
        # that brand's id and row-level security applies as for any request.
        set_current_tenant(uuid.UUID(tenant_id))
        try:
            async with AsyncSessionLocal() as db:
                await sync(db, tenant_id)
        except GoogleReviewsError as exc:
            logger.info("Google reviews sync for %s: %s", tenant_id, exc)
        except Exception:
            logger.exception("Google reviews sync for %s failed", tenant_id)
        finally:
            set_current_tenant(None)
