"""Each brand's own tracking tools.

A brand connects its own Google Analytics, its own Meta Pixel, its own Klaviyo
— its data belongs in its accounts, not in a platform-wide one, and two brands
on this platform must never see each other's traffic.

What is stored here is only ever a public identifier: a GA4 measurement ID, a
pixel number, a Klaviyo public key. These are meant to be readable in the page
source of any site that uses them, which is why they can be served to the
storefront without authentication. Anything genuinely secret — a Meta
Conversions API token, a Klaviyo private key — is deliberately not here; that
belongs with the other credentials in `integrations_service`, behind masking.

Storage follows suppliers and shipping: one tenant-namespaced settings row
holding JSON, so adding a tool needs no migration.

Adding a tool is a TOOLS entry and nothing else. The admin screen renders its
field from this registry and the storefront loads it from the same list.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import get_setting, set_setting

logger = logging.getLogger(__name__)

KEY = "analytics"


class Tool(dict):
    """One tracking tool a brand can switch on."""

    def __init__(self, key: str, name: str, field_label: str, blurb: str,
                 placeholder: str = "", pattern: str = "", where: str = "",
                 docs_url: str = ""):
        super().__init__(
            key=key, name=name, field_label=field_label, blurb=blurb,
            placeholder=placeholder, pattern=pattern, where=where, docs_url=docs_url,
        )


# `pattern` is checked on save so a mistyped ID is caught here rather than
# discovered weeks later as an empty report. `where` tells the admin where to
# find the value, because that is the part people actually get stuck on.
TOOLS: list[Tool] = [
    Tool(
        "ga4", "Google Analytics 4", "Measurement ID",
        "Traffic, products viewed and purchases, in your own GA4 property.",
        "G-XXXXXXXXXX", r"^G-[A-Z0-9]{6,15}$",
        "Google Analytics → Admin → Data streams → your web stream.",
        "https://support.google.com/analytics/answer/9539598",
    ),
    Tool(
        "gtm", "Google Tag Manager", "Container ID",
        "Load your own tags through GTM instead of adding each one here.",
        "GTM-XXXXXXX", r"^GTM-[A-Z0-9]{4,10}$",
        "Tag Manager → Workspace, top of the page beside the container name.",
        "https://support.google.com/tagmanager/answer/6103696",
    ),
    Tool(
        "clarity", "Microsoft Clarity", "Project ID",
        "Session recordings and heatmaps of your storefront.",
        "abcdefghij", r"^[a-z0-9]{8,15}$",
        "Clarity → Settings → Setup, in the tracking code.",
        "https://clarity.microsoft.com/",
    ),
    Tool(
        "meta_pixel", "Meta Pixel", "Pixel ID",
        "Facebook and Instagram ads: track what your ads actually sold.",
        "123456789012345", r"^\d{10,20}$",
        "Meta Events Manager → Data sources → your pixel.",
        "https://www.facebook.com/business/help/952192354843755",
    ),
    Tool(
        "tiktok_pixel", "TikTok Pixel", "Pixel ID",
        "TikTok ads: attribute orders back to the campaign that drove them.",
        "CXXXXXXXXXXXXXXXXXXX", r"^[A-Z0-9]{15,30}$",
        "TikTok Ads Manager → Assets → Events → Web events.",
        "https://ads.tiktok.com/help/article/get-started-pixel",
    ),
    Tool(
        "pinterest_tag", "Pinterest Tag", "Tag ID",
        "Pinterest ads and organic pins.",
        "2612345678901", r"^\d{10,20}$",
        "Pinterest Ads → Conversions → Tag manager.",
        "https://help.pinterest.com/en/business/article/install-the-pinterest-tag",
    ),
    Tool(
        "snap_pixel", "Snap Pixel", "Pixel ID",
        "Snapchat ads.",
        "00000000-0000-0000-0000-000000000000",
        r"^[0-9a-fA-F-]{20,40}$",
        "Snapchat Ads Manager → Events Manager.",
        "https://businesshelp.snapchat.com/s/article/snap-pixel-about",
    ),
    Tool(
        "klaviyo", "Klaviyo", "Public API key",
        "Email and SMS flows: abandoned carts, post-purchase, win-backs.",
        "XXXXXX", r"^[A-Za-z0-9]{5,12}$",
        "Klaviyo → Settings → API keys → Public API key / Site ID.",
        "https://help.klaviyo.com/hc/en-us/articles/115005062267",
    ),
    Tool(
        "omnisend", "Omnisend", "Brand ID",
        "Omnisend email and SMS automation.",
        "60f0a1b2c3d4e5f6a7b8c9d0", r"^[A-Za-z0-9]{16,40}$",
        "Omnisend → Store settings → Integrations & API.",
        "https://support.omnisend.com/",
    ),
]

TOOL_KEYS = tuple(tool["key"] for tool in TOOLS)
_BY_KEY = {tool["key"]: tool for tool in TOOLS}

# A snippet is the escape hatch for a tool the registry does not cover. It is
# raw markup the brand's own admin chose to add to its own storefront — the
# same trust a shop theme already carries — and it is never served to any other
# brand's pages.
MAX_SNIPPET = 8000


def blank() -> dict[str, Any]:
    return {
        "enabled": False,
        "tools": {key: {"id": "", "enabled": False} for key in TOOL_KEYS},
        "head_snippet": "",
        "body_snippet": "",
        # Track only what the storefront needs; a brand can switch off the
        # per-product events and keep page views.
        "track_products": True,
        "track_checkout": True,
    }


def _clean_tool(key: str, raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    value = str(raw.get("id") or "").strip()
    return {"id": value[:200], "enabled": bool(raw.get("enabled")) and bool(value)}


def clean(raw: Any) -> dict[str, Any]:
    """A saved-shape copy of whatever the admin screen sent."""
    out = blank()
    if not isinstance(raw, dict):
        return out

    out["enabled"] = bool(raw.get("enabled"))
    tools = raw.get("tools") if isinstance(raw.get("tools"), dict) else {}
    for key in TOOL_KEYS:
        out["tools"][key] = _clean_tool(key, tools.get(key))

    for field in ("head_snippet", "body_snippet"):
        value = raw.get(field)
        out[field] = value.strip()[:MAX_SNIPPET] if isinstance(value, str) else ""

    for flag in ("track_products", "track_checkout"):
        if flag in raw:
            out[flag] = bool(raw.get(flag))
    return out


def validate(config: dict[str, Any]) -> list[str]:
    """Which IDs do not look like what that tool issues.

    Returned rather than raised so the admin screen can mark the offending
    field instead of refusing the whole form.
    """
    problems: list[str] = []
    for key, entry in (config.get("tools") or {}).items():
        tool = _BY_KEY.get(key)
        value = (entry or {}).get("id") or ""
        if not tool or not value or not tool["pattern"]:
            continue
        if not re.match(tool["pattern"], value):
            problems.append(
                f"{tool['name']}: \"{value}\" does not look like a {tool['field_label'].lower()} "
                f"(expected something like {tool['placeholder']})."
            )
    return problems


async def load(db: AsyncSession, *, tenant_id: Any = None) -> dict[str, Any]:
    raw = await get_setting(db, KEY, tenant_id=tenant_id)
    if not raw:
        return blank()
    try:
        return clean(json.loads(raw))
    except (ValueError, TypeError):
        logger.warning("Analytics settings for tenant %s are not readable JSON", tenant_id)
        return blank()


async def save(db: AsyncSession, config: dict[str, Any], *, tenant_id: Any = None) -> dict[str, Any]:
    cleaned = clean(config)
    await set_setting(db, KEY, json.dumps(cleaned), tenant_id=tenant_id)
    return cleaned


def public(config: dict[str, Any]) -> dict[str, Any]:
    """What the storefront is told to load.

    Only switched-on tools with an ID, and nothing at all when the brand has
    tracking off — so turning it off really does stop every script, rather
    than leaving them loaded and idle.
    """
    if not config.get("enabled"):
        return {"enabled": False, "tools": {}, "head_snippet": "", "body_snippet": "",
                "track_products": False, "track_checkout": False}

    tools = {
        key: entry["id"]
        for key, entry in (config.get("tools") or {}).items()
        if key in _BY_KEY and entry.get("enabled") and entry.get("id")
    }
    return {
        "enabled": True,
        "tools": tools,
        "head_snippet": config.get("head_snippet") or "",
        "body_snippet": config.get("body_snippet") or "",
        "track_products": bool(config.get("track_products", True)),
        "track_checkout": bool(config.get("track_checkout", True)),
    }
