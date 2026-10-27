"""Where an order came from.

The browser collects this (see frontend/src/lib/attribution.ts) and sends it
once, at checkout. Everything here treats that payload as untrusted: it arrives
from a URL anybody can edit, so every value is trimmed, length-capped and
dropped if it is not a string.

Two rules shape the rest:

* An unknown source is recorded as unknown. A buyer who typed the address in
  has no campaign, and filling the blank with "direct" would turn a fact we do
  not have into one a brand would go on to act on.
* Last non-direct wins. If someone arrives from a Google ad, leaves, and comes
  back by typing the address, the ad is still what sold it — the second visit
  carries no campaign, so it must not erase the first. The browser decides
  this; the server only stores the answer.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit

# The five a brand filters, groups and exports by. These get real columns.
UTM_FIELDS = ("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content")

# Ad click ids, in the order the page names them.
CLICK_FIELDS = ("gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid")

# Everything else about the visit, kept together in one JSONB column.
META_FIELDS = (
    "referrer",       # the page that linked here
    "landing_page",   # the first page of this store they saw
    "gclid",          # Google Ads click
    "gbraid",         # Google Ads click, from an iPhone app
    "wbraid",         # Google Ads click, from an iPhone browser
    "fbclid",         # Meta click
    "msclkid",        # Microsoft Ads click
    "ttclid",         # TikTok click
    "first_seen",     # ISO time of their first visit
    "last_seen",      # ISO time of the visit that placed the order
    "visits",         # how many visits before ordering
    "device",         # mobile | tablet | desktop
)

# One visit (session) of the buyer's journey: when, the first page, and what
# that visit arrived with. The browser keeps the first visit and the latest
# ones; `visits` above is the full count.
SESSION_FIELDS = ("referrer", "landing_page", *UTM_FIELDS, *CLICK_FIELDS)
MAX_SESSIONS = 25

_MAX = 255
_MAX_URL = 1000


def _text(value: Any, limit: int = _MAX) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned[:limit] if cleaned else None


def _time(value: Any) -> datetime | None:
    """An ISO time the browser sent, as an aware datetime, or None."""
    text = _text(value, 40)
    if not text:
        return None
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _sessions(raw: Any) -> list[dict[str, Any]]:
    """The visits the browser listed, cleaned, oldest first."""
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw[:MAX_SESSIONS]:
        if not isinstance(item, dict):
            continue
        start = _time(item.get("at"))
        if start is None:
            continue
        visit: dict[str, Any] = {"at": start.isoformat()}
        # The browser's id for the visit, which Home counted (services/visits).
        try:
            visit["id"] = str(uuid.UUID(_text(item.get("id"), 40) or ""))
        except ValueError:
            pass
        last = _time(item.get("last"))
        if last is not None and last >= start:
            visit["last"] = last.isoformat()
        for field in SESSION_FIELDS:
            value = _text(item.get(field), _MAX_URL if field in ("referrer", "landing_page") else _MAX)
            if value is not None:
                # Lower-cased as on the order itself, so "Google" and "google" are one source.
                visit[field] = value.lower() if field in ("utm_source", "utm_medium") else value
        out.append(visit)
    out.sort(key=lambda v: v["at"])
    return out


def clean(payload: Any) -> dict[str, Any]:
    """A safe, normalised copy of what the browser sent.

    Returns `{"utm": {...}, "meta": {...}}`, both possibly empty. Anything not
    recognised is discarded rather than stored, so a crafted URL cannot push
    arbitrary data into the orders table.
    """
    if not isinstance(payload, dict):
        return {"utm": {}, "meta": {}}

    utm = {
        field: value
        for field in UTM_FIELDS
        # utm_source is lower-cased so "Google", "google" and "GOOGLE" group as
        # one campaign source rather than three.
        if (value := _text(payload.get(field))) is not None
    }
    if "utm_source" in utm:
        utm["utm_source"] = utm["utm_source"].lower()
    if "utm_medium" in utm:
        utm["utm_medium"] = utm["utm_medium"].lower()

    meta: dict[str, Any] = {}
    for field in META_FIELDS:
        raw = payload.get(field)
        if field == "visits":
            try:
                count = int(raw)
            except (TypeError, ValueError):
                continue
            if 0 < count < 10_000:
                meta[field] = count
            continue
        limit = _MAX_URL if field in ("referrer", "landing_page") else _MAX
        value = _text(raw, limit)
        if value is not None:
            meta[field] = value

    sessions = _sessions(payload.get("sessions"))
    if sessions:
        meta["sessions"] = sessions

    return {"utm": utm, "meta": meta}


def apply(order: Any, payload: Any) -> bool:
    """Put a cleaned payload on an order. True if anything was recorded.

    Never overwrites attribution an order already has: it is a record of how
    that one order arrived, and a later edit cannot know better than the visit
    that placed it.
    """
    data = clean(payload)
    if not data["utm"] and not data["meta"]:
        return False
    if any(getattr(order, field, None) for field in UTM_FIELDS) or getattr(order, "attribution", None):
        return False

    for field, value in data["utm"].items():
        setattr(order, field, value)
    if data["meta"]:
        order.attribution = data["meta"]
    return True


def summary(order: Any) -> dict[str, Any] | None:
    """How this order arrived, ready for the order page — or None if unknown.

    `label` is the one line a brand reads at a glance: "google / cpc" and, when
    there is one, the campaign that paid for it.
    """
    utm = {field: getattr(order, field, None) for field in UTM_FIELDS}
    meta = getattr(order, "attribution", None) or {}
    if not any(utm.values()) and not meta:
        return None

    source = utm.get("utm_source")
    medium = utm.get("utm_medium")
    if source:
        label = f"{source} / {medium}" if medium else source
    elif meta.get("referrer"):
        label = f"Referral — {meta['referrer']}"
    elif meta.get("sessions") and not any(meta.get(name) for name in CLICK_FIELDS):
        # The browser listed the visits and none of them came from anywhere:
        # typed in, a bookmark, or a link that hid where it came from.
        label = "Direct"
    else:
        # Something was recorded (a click id, a landing page) but nothing that
        # names a source. Say so rather than guessing at one.
        label = "Unattributed"

    return {
        **{field: value for field, value in utm.items() if value},
        "label": label,
        "campaign": utm.get("utm_campaign"),
        "referrer": meta.get("referrer"),
        "landing_page": meta.get("landing_page"),
        "visits": meta.get("visits"),
        "device": meta.get("device"),
        "first_seen": meta.get("first_seen"),
        "paid_click": next((name for name in CLICK_FIELDS if meta.get(name)), None),
    }


# ── The journey, as the order page's Conversion summary reads it ─────────────

# Where a referrer's host sends a visit from. Checked in order: Gmail and
# Gemini live on google.com, so mail and assistants come before search.
_HOSTS: tuple[tuple[re.Pattern[str], str, str], ...] = tuple(
    (re.compile(pattern), name, kind)
    for pattern, name, kind in (
        (r"^(mail|inbox)\.google\.com$", "Gmail", "email"),
        (r"^outlook\.(live|office|office365)\.com$", "Outlook", "email"),
        (r"(^|\.)mail\.yahoo\.[a-z.]+$", "Yahoo Mail", "email"),
        (r"^mail\.aol\.com$", "AOL Mail", "email"),
        (r"^(chatgpt\.com|chat\.openai\.com)$", "ChatGPT", "ai"),
        (r"(^|\.)perplexity\.ai$", "Perplexity", "ai"),
        (r"^gemini\.google\.com$", "Gemini", "ai"),
        (r"^claude\.ai$", "Claude", "ai"),
        (r"^copilot\.microsoft\.com$", "Copilot", "ai"),
        (r"^google\.[a-z]{2,3}(\.[a-z]{2})?$", "Google", "search"),
        (r"^(cn\.)?bing\.com$", "Bing", "search"),
        (r"^(([a-z]{2}\.)?search\.yahoo\.com|yahoo\.com)$", "Yahoo", "search"),
        (r"^(html\.)?duckduckgo\.com$", "DuckDuckGo", "search"),
        (r"^search\.brave\.com$", "Brave Search", "search"),
        (r"(^|\.)ecosia\.org$", "Ecosia", "search"),
        (r"^(yandex\.[a-z.]+|ya\.ru)$", "Yandex", "search"),
        (r"(^|\.)baidu\.com$", "Baidu", "search"),
        (r"^search\.aol\.com$", "AOL", "search"),
        (r"(^|\.)(facebook\.com|fb\.com|fb\.me)$", "Facebook", "social"),
        (r"(^|\.)instagram\.com$", "Instagram", "social"),
        (r"(^|\.)(threads\.net|threads\.com)$", "Threads", "social"),
        (r"(^|\.)tiktok\.com$", "TikTok", "social"),
        (r"(^|\.)(youtube\.com|youtu\.be)$", "YouTube", "social"),
        (r"(^|\.)(pinterest\.[a-z.]+|pin\.it)$", "Pinterest", "social"),
        (r"(^|\.)(linkedin\.com|lnkd\.in)$", "LinkedIn", "social"),
        (r"(^|\.)(twitter\.com|x\.com|t\.co)$", "X (Twitter)", "social"),
        (r"(^|\.)reddit\.com$", "Reddit", "social"),
        (r"(^|\.)snapchat\.com$", "Snapchat", "social"),
        (r"(^|\.)(whatsapp\.com|wa\.me)$", "WhatsApp", "social"),
        (r"(^|\.)(t\.me|telegram\.org)$", "Telegram", "social"),
        (r"(^|\.)nextdoor\.com$", "Nextdoor", "social"),
    )
)

# utm_source values (lower-cased) and what to call them. Meta's own
# {{site_source_name}} gives fb, ig, msg and an.
_SOURCE_NAMES = {
    "google": "Google", "adwords": "Google", "googleads": "Google", "google_ads": "Google",
    "bing": "Bing", "microsoft": "Microsoft", "yahoo": "Yahoo", "duckduckgo": "DuckDuckGo",
    "facebook": "Facebook", "fb": "Facebook", "instagram": "Instagram", "ig": "Instagram",
    "meta": "Meta", "msg": "Messenger", "messenger": "Messenger", "an": "Meta Audience Network",
    "tiktok": "TikTok", "youtube": "YouTube", "pinterest": "Pinterest", "linkedin": "LinkedIn",
    "twitter": "X (Twitter)", "x": "X (Twitter)", "snapchat": "Snapchat", "reddit": "Reddit",
    "klaviyo": "Klaviyo", "mailchimp": "Mailchimp", "omnisend": "Omnisend",
    "newsletter": "Newsletter", "email": "Email", "sms": "SMS", "chatgpt": "ChatGPT", "chatgpt.com": "ChatGPT",
}
_SEARCH_SOURCES = {"google", "adwords", "googleads", "google_ads", "bing", "microsoft", "yahoo", "duckduckgo"}
_SOCIAL_SOURCES = {
    "facebook", "fb", "instagram", "ig", "meta", "msg", "messenger", "an", "tiktok", "youtube",
    "pinterest", "linkedin", "twitter", "x", "snapchat", "reddit",
}
_EMAIL_SOURCES = {"klaviyo", "mailchimp", "omnisend", "newsletter", "email"}

_PAID_MEDIUMS = {
    "cpc", "ppc", "paid", "paidsearch", "paid_search", "paid-search", "sem", "cpm", "cpv", "cpa",
    "paid_social", "paidsocial", "paid-social", "social_paid", "social-paid", "display", "banner",
    "ad", "ads", "retargeting", "remarketing", "shopping", "pmax", "paid_video",
}
_EMAIL_MEDIUMS = {"email", "e-mail", "e_mail", "newsletter", "mail"}
_SOCIAL_MEDIUMS = {
    "social", "social-network", "social_network", "social-media", "social_media", "sm",
    "organic_social", "organic-social", "post", "bio", "story", "reel",
}
_REFERRAL_MEDIUMS = {"referral", "affiliate", "partner", "link"}

# Which ad network put each click id on the link.
_CLICK_NAMES = {
    "gclid": "Google Ads", "gbraid": "Google Ads", "wbraid": "Google Ads",
    "msclkid": "Microsoft Ads", "fbclid": "Meta", "ttclid": "TikTok Ads",
}


def _host(url: str | None) -> str:
    if not url:
        return ""
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def _from_host(host: str) -> tuple[str, str] | None:
    for pattern, name, kind in _HOSTS:
        if pattern.search(host):
            return name, kind
    return None


def classify(visit: dict[str, Any]) -> dict[str, str]:
    """What kind of visit this was and where from, in the page's words.

    `kind` is one of direct, search, paid_search, social, paid_social, paid,
    meta_click, email, sms, ai, referral, campaign. `short` finishes "1st
    session from …"; `text` is the sentence the session's details open with.
    """
    source = (visit.get("utm_source") or "").lower()
    medium = (visit.get("utm_medium") or "").lower()
    host = _host(visit.get("referrer"))
    known = _from_host(host) if host else None
    click = next((name for name in CLICK_FIELDS if visit.get(name)), None)

    if source or medium:
        name = _SOURCE_NAMES.get(source) or visit.get("utm_source") or (known[0] if known else "a campaign")
        if medium in _EMAIL_MEDIUMS or source in _EMAIL_SOURCES:
            kind = "email"
        elif medium in ("sms", "text") or source == "sms":
            kind = "sms"
        elif medium in _PAID_MEDIUMS or (click and click != "fbclid"):
            kind = "paid_search" if source in _SEARCH_SOURCES else "paid_social" if source in _SOCIAL_SOURCES else "paid"
        elif medium in _SOCIAL_MEDIUMS or source in _SOCIAL_SOURCES:
            kind = "social"
        elif medium == "organic" and (source in _SEARCH_SOURCES or (known and known[1] == "search")):
            kind = "search"
        elif medium in _REFERRAL_MEDIUMS:
            kind = "referral"
        else:
            kind = "campaign"
    elif click in ("gclid", "gbraid", "wbraid"):
        name, kind = "Google", "paid_search"
    elif click == "msclkid":
        name, kind = (known[0] if known and known[1] == "search" else "Microsoft"), "paid_search"
    elif click == "ttclid":
        name, kind = "TikTok", "paid_social"
    elif click == "fbclid":
        # Meta puts this id on ads and on ordinary posts alike.
        name, kind = ("Instagram" if known and known[0] == "Instagram" else "Facebook"), "meta_click"
    elif known:
        name, kind = known
    elif host:
        name, kind = host, "referral"
    else:
        name, kind = "Direct", "direct"

    generic_mail = name in ("Email", "Newsletter")
    short = {
        "direct": "a direct visit",
        "paid_search": f"{name} Ads",
        "paid_social": f"a {name} ad",
        "paid": f"an ad ({name})",
        "email": "an email" if generic_mail else f"an email ({name})",
        "sms": "a text message",
    }.get(kind, name)
    text = {
        "direct": "Came to your store directly: typed the address, used a bookmark, or followed a link that did not say where it came from",
        "search": f"Visited your store from an organic search result on {name}",
        "paid_search": f"Visited your store from a search ad on {name}",
        "paid_social": f"Visited your store from an ad on {name}",
        "paid": f"Visited your store from an ad ({name})",
        "meta_click": f"Visited your store from a link on {name} (a Meta ad or a post)",
        "social": f"Visited your store from {name}",
        "email": "Visited your store from an email" if generic_mail else f"Visited your store from an email ({name})",
        "sms": "Visited your store from a text message",
        "ai": f"Visited your store from a link in {name}",
        "referral": f"Visited your store from a link on {name}",
        "campaign": f"Visited your store from a campaign link ({name})",
    }[kind]
    return {"source": name, "kind": kind, "short": short, "text": text}


def _iso(moment: Any) -> str | None:
    if isinstance(moment, datetime):
        return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).isoformat()
    return None


def journey(order: Any, *, order_count: int | None = None) -> dict[str, Any]:
    """The order's Conversion summary: every visit before it, oldest first.

    Orders from before the browser listed visits carry one recorded visit (the
    campaign that brought the buyer); orders placed by the team, or by a buyer
    whose browser kept nothing, carry none, and the page says so.
    """
    meta = getattr(order, "attribution", None) or {}
    visits = list(meta.get("sessions") or [])
    if not visits:
        utm = {field: getattr(order, field, None) for field in UTM_FIELDS}
        start = _time(meta.get("first_seen")) or _time(meta.get("last_seen"))
        if start is not None:
            legacy: dict[str, Any] = {"at": start.isoformat()}
            for field in UTM_FIELDS:
                if utm.get(field):
                    legacy[field] = utm[field]
            for field in ("referrer", "landing_page", *CLICK_FIELDS):
                if meta.get(field):
                    legacy[field] = meta[field]
            visits = [legacy]

    sessions = []
    for visit in visits:
        sessions.append({
            "at": visit.get("at"),
            "landing_page": visit.get("landing_page"),
            "referrer": visit.get("referrer"),
            "utm": {field: visit[field] for field in UTM_FIELDS if visit.get(field)},
            "ad_click": next((_CLICK_NAMES[name] for name in CLICK_FIELDS if visit.get(name)), None),
            **classify(visit),
        })

    placed = getattr(order, "created_at", None)
    days = None
    first = _time(sessions[0]["at"]) if sessions else None
    if first is not None and isinstance(placed, datetime):
        placed_utc = placed if placed.tzinfo else placed.replace(tzinfo=timezone.utc)
        days = max(0, (placed_utc.astimezone(timezone.utc).date() - first.astimezone(timezone.utc).date()).days)

    try:
        counted = int(meta.get("visits") or 0)
    except (TypeError, ValueError):
        counted = 0
    return {
        "order_count": order_count,
        "sessions": sessions,
        "total_sessions": max(counted, len(sessions)),
        "days_to_conversion": days,
        "converted_at": _iso(placed),
        "device": meta.get("device"),
    }
