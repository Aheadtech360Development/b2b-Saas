"""Brands on product cards (the manager's ask: "showcase the supplier logo on
product cards", the way a blanks shop shows Gildan or BELLA + CANVAS beside
the price).

A product's brand is its Vendor; an S&S import writes the S&S brand there
(Match Fields: brandName → vendor). One setting per shop, `brand_logos`:

    {"show": true,
     "brands": {"gildan": {"name": "Gildan", "logo": "https://cdn.ssactivewear.com/Images/Brand/35_fm.jpg",
                           "source": "ss", "hide": false}}}

A card shows the brand's logo, or its name when there is no logo; nothing for
a product with no vendor, a brand the shop hid, or a shop that turned brands
off.

Where logos come from:
- S&S: every style imported or synced keeps its brand's logo, and "Get logos
  from S&S" fills them in for the brands already in the shop (S&S Brands API).
- The shop: its own logo for any brand (its own brand too), or none.
A logo the shop chose or removed is its own ("source": "own"): S&S never
writes over it.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

KEY = "brand_logos"
MAX_BRANDS = 500
SOURCES = ("ss", "own")

# Brands already on file, by (shop, brand): a sync of a thousand styles reads
# the setting once per brand rather than once per product.
_known: dict[tuple[str, str], float] = {}
_KNOWN_FOR = 600.0


def key_of(name: str | None) -> str:
    """"BELLA + CANVAS", "Bella+Canvas" and "bella canvas" are one brand."""
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def url_ok(url: str) -> bool:
    """A web address, or a picture the platform itself serves ("/media/…")."""
    return (url.lower().startswith(("https://", "http://")) or (url.startswith("/") and not url.startswith("//"))) \
        and len(url) <= 1000


def clean(raw: Any) -> dict:
    """The setting as stored, or the defaults; anything malformed is dropped."""
    out: dict = {"show": True, "brands": {}}
    if not isinstance(raw, dict):
        return out
    if isinstance(raw.get("show"), bool):
        out["show"] = raw["show"]
    brands = raw.get("brands") if isinstance(raw.get("brands"), dict) else {}
    for key, b in list(brands.items())[:MAX_BRANDS]:
        if not isinstance(b, dict) or not key_of(key):
            continue
        logo = str(b.get("logo") or "").strip()
        out["brands"][key_of(key)] = {
            "name": str(b.get("name") or key).strip()[:100],
            "logo": logo if logo and url_ok(logo) else "",
            "source": b.get("source") if b.get("source") in SOURCES else "own",
            "hide": bool(b.get("hide")),
        }
    return out


async def settings_for(db, tenant_id) -> dict:
    from app.core.tenant_settings import get_setting

    raw = await get_setting(db, KEY, tenant_id=tenant_id)
    try:
        return clean(json.loads(raw) if raw else None)
    except (TypeError, ValueError):
        return clean(None)


async def _write(db, tenant_id, conf: dict) -> None:
    from app.core.tenant_settings import set_setting

    await set_setting(db, KEY, json.dumps(conf), tenant_id=tenant_id)
    for key in conf["brands"]:
        _known[(str(tenant_id), key)] = time.monotonic()


def card_brand(conf: dict | None, vendor: str | None) -> dict:
    """What a product card shows for this vendor: the brand's name and logo, or blanks."""
    key = key_of(vendor)
    if not conf or not key or not conf.get("show", True):
        return {"brand": "", "brand_logo": ""}
    b = conf["brands"].get(key) or {}
    if b.get("hide"):
        return {"brand": "", "brand_logo": ""}
    return {"brand": (b.get("name") or vendor or "").strip(), "brand_logo": b.get("logo") or ""}


async def remember(db, tenant_id, name: str | None, logo: str | None) -> bool:
    """Keep the S&S logo of a brand the shop has nothing on file for. True when written."""
    key = key_of(name)
    if not tenant_id or not key or not logo or not url_ok(logo):
        return False
    memo = (str(tenant_id), key)
    if time.monotonic() - _known.get(memo, float("-inf")) < _KNOWN_FOR:
        return False
    conf = await settings_for(db, tenant_id)
    if key in conf["brands"] or len(conf["brands"]) >= MAX_BRANDS:
        _known[memo] = time.monotonic()
        return False
    conf["brands"][key] = {"name": str(name).strip()[:100], "logo": logo, "source": "ss", "hide": False}
    await _write(db, tenant_id, conf)
    return True


async def remember_safely(db, tenant_id, name: str | None, logo: str | None) -> None:
    """remember(), never failing the import or sync it rides on."""
    try:
        async with db.begin_nested():
            await remember(db, tenant_id, name, logo)
    except Exception:  # noqa: BLE001
        logger.warning("Brand logo for %s not kept", name, exc_info=True)


async def overview(db, tenant_id) -> dict:
    """The admin's list: every brand of the shop's products (their vendors) and every
    brand on file, with its logo, where the logo came from and how many products carry it."""
    from sqlalchemy import func, select

    from app.models.product import Product

    conf = await settings_for(db, tenant_id)
    counts: dict[str, list] = {}
    for vendor, n in (await db.execute(
        select(Product.vendor, func.count(Product.id)).where(Product.vendor.isnot(None)).group_by(Product.vendor)
    )).all():
        key = key_of(vendor)
        if key:
            counts.setdefault(key, [vendor.strip(), 0])[1] += int(n)
    rows = []
    for key in set(counts) | set(conf["brands"]):
        b = conf["brands"].get(key) or {}
        rows.append({
            "key": key, "name": b.get("name") or counts[key][0], "logo": b.get("logo") or "",
            "source": b.get("source") or "", "hide": bool(b.get("hide")), "products": counts.get(key, [None, 0])[1],
        })
    rows.sort(key=lambda r: (r["products"] == 0, r["name"].lower()))
    return {"show": conf["show"], "brands": rows}


async def save(db, tenant_id, *, show: bool | None, brands: list[dict]) -> dict:
    """The admin's changes: brands on cards or not, and each brand's logo and whether cards show it."""
    conf = await settings_for(db, tenant_id)
    if show is not None:
        conf["show"] = bool(show)
    for b in brands:
        key = key_of(b.get("key") or b.get("name"))
        if not key:
            raise ValueError("A brand has no name.")
        logo = str(b.get("logo") or "").strip()
        if logo and not url_ok(logo):
            raise ValueError(f"The logo for {b.get('name') or key} is not a web address.")
        current = conf["brands"].get(key) or {}
        conf["brands"][key] = {
            "name": str(b.get("name") or current.get("name") or key).strip()[:100],
            "logo": logo,
            # A logo the shop chose, or took away, is its own from now on.
            "source": "own" if logo != (current.get("logo") or "") else (current.get("source") or "own"),
            "hide": bool(b.get("hide")),
        }
    if len(conf["brands"]) > MAX_BRANDS:
        raise ValueError(f"Up to {MAX_BRANDS} brands.")
    await _write(db, tenant_id, conf)
    return await overview(db, tenant_id)


async def from_ss(db, tenant_id, svc) -> dict:
    """S&S's own logos for the shop's brands that have none yet (S&S Brands API).
    A brand the shop gave its own logo, or removed one from, is left alone."""
    from app.services.ss_activewear_service import ss_image_url

    listing = await svc.fetch_brands()
    by_key = {key_of(b.get("name")): b for b in listing if isinstance(b, dict) and b.get("name") and b.get("image")}
    conf = await settings_for(db, tenant_id)
    filled: list[str] = []
    missing: list[str] = []
    for row in (await overview(db, tenant_id))["brands"]:
        if not row["products"]:
            continue
        current = conf["brands"].get(row["key"]) or {}
        if current.get("logo") or current.get("source") == "own":
            continue
        found = by_key.get(row["key"])
        logo = ss_image_url(found.get("image"), "medium") if found else None
        if not logo:
            missing.append(row["name"])
            continue
        conf["brands"][row["key"]] = {"name": row["name"], "logo": logo, "source": "ss", "hide": bool(current.get("hide"))}
        filled.append(row["name"])
    if filled:
        await _write(db, tenant_id, conf)
    return {"filled": filled, "missing": missing, **(await overview(db, tenant_id))}


def logo_of_style(style: dict) -> str | None:
    """The brand logo of an S&S style, medium size: from S&S's own field, or a
    trimmed catalogue style's (services/suppliers/ss_catalog, small)."""
    from app.services.ss_activewear_service import ss_image_url

    if style.get("brandImage"):
        return ss_image_url(style["brandImage"], "medium")
    small = style.get("brand_image")
    return small.replace("_fs.", "_fm.") if small else None
