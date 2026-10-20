"""A new shop's five setup steps (the owner's onboarding wizard, /onboarding).

Where the owner is in the steps is one per-brand setting, `onboarding` (JSON),
so there is nothing to migrate:

    {"step": 3, "reached": 3, "business_type": "dtf_operator", "country": "US",
     "started_at": "...", "finished_at": null, "sanmar_notify": null}

Only a shop that signed up through the new sign-up has it. A shop without it
was set up before the wizard existed, and nothing asks it to "finish setting
up" (Home's checklist step for it only shows when the setting is there and the
owner has not finished).

What is done is read from where each thing is actually kept — the same places
Home's checklist reads (services/admin_home) — never from what the wizard
remembers, so "done" means done.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import get_setting, scoped_key, set_setting

logger = logging.getLogger(__name__)

KEY = "onboarding"
STEPS = 5

# What the owner runs (design screen 7). The key is stored; the words are shown.
BUSINESS_TYPES: dict[str, str] = {
    "print_shop": "Print shop",
    "dtf_operator": "DTF operator",
    "screen_printer": "Screen printer",
    "embroiderer": "Embroiderer",
    "blank_supplier": "Blank supplier",
    "wholesale_apparel": "Wholesale apparel",
    "custom_apparel_brand": "Custom apparel brand",
}

# tenant_branding.primary_color's column default: a shop that still has it has
# not chosen a colour.
DEFAULT_PRIMARY = "#1c3557"


def clean_business_type(value: Any) -> str | None:
    key = str(value or "").strip().lower()
    return key if key in BUSINESS_TYPES else None


def clean_country(value: Any) -> str | None:
    code = str(value or "").strip().upper()
    return code if len(code) == 2 and code.isalpha() else None


def initial(business_type: Any, country: Any, *, step: int = 2) -> dict[str, Any]:
    """The progress a shop starts with: step 1 was the sign-up itself."""
    return {
        "step": step,
        "reached": step,
        "business_type": clean_business_type(business_type),
        "country": clean_country(country),
        "started_at": datetime.now(UTC).isoformat(),
        "finished_at": None,
        "sanmar_notify": None,
    }


def _parse(raw: Any) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:  # noqa: BLE001
        return None
    return value if isinstance(value, dict) else None


async def read_progress(db: AsyncSession, tenant_id: Any) -> dict[str, Any] | None:
    """This shop's saved progress, or None for a shop set up before the wizard."""
    # Read the brand's own row only: a global row of this name must never be
    # mistaken for a shop's progress.
    raw = (await db.execute(
        text("SELECT value FROM settings WHERE key = :k"), {"k": scoped_key(KEY, tenant_id)},
    )).scalar()
    return _parse(raw)


async def save_progress(db: AsyncSession, tenant_id: Any, changes: dict[str, Any]) -> dict[str, Any]:
    """Merge what the wizard sends into the saved progress and keep it.

    Steps are clamped to 1..5, and `reached` never goes down: going back to
    look at a step does not lose the steps after it.
    """
    current = await read_progress(db, tenant_id) or initial(None, None, step=1)
    merged = dict(current)
    if "step" in changes and changes["step"] is not None:
        merged["step"] = max(1, min(STEPS, int(changes["step"])))
    reached = max(int(current.get("reached") or 1), int(merged.get("step") or 1))
    if changes.get("reached") is not None:
        reached = max(reached, max(1, min(STEPS, int(changes["reached"]))))
    merged["reached"] = reached
    if "business_type" in changes:
        merged["business_type"] = clean_business_type(changes["business_type"])
    if "country" in changes:
        merged["country"] = clean_country(changes["country"])
    if changes.get("finished"):
        merged["finished_at"] = merged.get("finished_at") or datetime.now(UTC).isoformat()
    if changes.get("sanmar_notify"):
        merged["sanmar_notify"] = merged.get("sanmar_notify") or datetime.now(UTC).isoformat()
    await set_setting(db, KEY, json.dumps(merged), tenant_id=tenant_id)
    return merged


async def _setting_json(db: AsyncSession, key: str, tenant_id: Any) -> Any:
    raw = await get_setting(db, key, tenant_id=tenant_id)
    try:
        return json.loads(raw) if isinstance(raw, str) and raw[:1] in "{[" else raw
    except Exception:  # noqa: BLE001
        return raw


async def _pickup(db: AsyncSession, tenant_id: Any) -> dict[str, Any]:
    """Whether buyers can collect here, and from where. Pickup counts as set up
    once it is offered and there is an address to give out (its own, or the
    ship-from address it falls back to: services/pickup.resolve)."""
    from app.services import pickup

    on = await pickup.pickup_offered(db, tenant_id)
    place = await pickup.pickup_location(db, tenant_id)
    saved = await _setting_json(db, "pickup_location", tenant_id)
    saved = saved if isinstance(saved, dict) else {}
    return {
        "enabled": on,
        "address": place.get("address") or "",
        "set": bool(on and place.get("address")),
        "saved": {k: str(saved.get(k) or "") for k in ("name", "street1", "city", "state", "zip", "hours", "note")},
    }


async def checks(db: AsyncSession, tenant_id: Any, progress: dict[str, Any] | None) -> dict[str, Any]:
    """What is done, each read from where that thing is kept."""
    out: dict[str, Any] = {}

    async def guard(name: str, fn, fallback: Any) -> None:
        try:
            out[name] = await fn()
        except Exception as exc:  # noqa: BLE001  (shown as not done rather than failing the page)
            logger.warning("onboarding: %s check failed: %s", name, exc)
            await db.rollback()
            out[name] = fallback

    async def branding():
        row = (await db.execute(text("""
            SELECT store_name, company_name, logo_url, primary_color, font_heading, font_body
              FROM tenant_branding WHERE tenant_id = CAST(:t AS uuid)
        """), {"t": str(tenant_id)})).mappings().first()
        return dict(row) if row else {}

    async def products():
        n = (await db.execute(text("""
            SELECT count(*) FROM products WHERE tenant_id = CAST(:t AS uuid) AND status <> 'archived'
        """), {"t": str(tenant_id)})).scalar() or 0
        gang = (await db.execute(text("""
            SELECT count(*) FROM products
             WHERE tenant_id = CAST(:t AS uuid) AND status <> 'archived' AND gang_sheet_enabled IS TRUE
        """), {"t": str(tenant_id)})).scalar() or 0
        return {"count": int(n), "gang_sheet": int(gang)}

    async def supplier():
        from app.services import integrations_service as integrations

        cfg = await integrations.get_connection(db, "ss_activewear", tenant_id=tenant_id) or {}
        return bool(str(cfg.get("account_number") or "").strip())

    async def stripe():
        from app.services.connect_service import ConnectService

        s = await ConnectService(db).get_status(str(tenant_id))
        return {
            "connected": bool(s.get("connected")),
            "charges_enabled": bool(s.get("charges_enabled")),
            "details_submitted": bool(s.get("details_submitted")),
        }

    async def carriers():
        from app.services.admin_home import carrier_names

        return await carrier_names(db, tenant_id)

    async def pickup():
        return await _pickup(db, tenant_id)

    async def domain():
        from app.services import brand_domain

        d = await brand_domain.get(db, tenant_id)
        return {"host": d.get("domain") or None}

    await guard("branding", branding, {})
    await guard("products", products, {"count": 0, "gang_sheet": 0})
    await guard("supplier", supplier, False)
    await guard("stripe", stripe, {"connected": False, "charges_enabled": False, "details_submitted": False})
    await guard("carriers", carriers, [])
    await guard("pickup", pickup, {"enabled": True, "address": "", "set": False, "saved": {}})
    await guard("domain", domain, {"host": None})

    out["done"] = summarise(out, progress)
    return out


def summarise(found: dict[str, Any], progress: dict[str, Any] | None) -> dict[str, bool]:
    """The go-live checklist (design screen 11) from what was found."""
    b = found.get("branding") or {}
    name = str(b.get("store_name") or b.get("company_name") or "").strip()
    colour = str(b.get("primary_color") or "").strip().lower()
    progress = progress or {}
    return {
        "business": bool(name and progress.get("business_type")),
        "branded": bool(str(b.get("logo_url") or "").strip() or (colour and colour != DEFAULT_PRIMARY)),
        "product": int((found.get("products") or {}).get("count") or 0) > 0,
        "payments": bool((found.get("stripe") or {}).get("charges_enabled")),
        "shipping": bool(found.get("carriers")) or bool((found.get("pickup") or {}).get("set")),
        # Whether a custom domain's DNS has caught up is a live lookup, made by
        # the page (as Home does); here it is only whether there is one.
        "domain": False,
    }


async def trial_days(db: AsyncSession, tenant_id: Any) -> int | None:
    from app.services import trial

    try:
        s = await trial.status(db, tenant_id)
    except Exception:  # noqa: BLE001
        await db.rollback()
        return None
    return s.get("days_left") if s.get("ends_at") else None


async def state(db: AsyncSession, tenant_id: Any) -> dict[str, Any]:
    """Everything the wizard draws, in one answer."""
    from app.services.brand_urls import for_tenant

    progress = await read_progress(db, tenant_id)
    found = await checks(db, tenant_id, progress)
    slug = (await db.execute(text("SELECT slug FROM tenants WHERE id = CAST(:t AS uuid)"),
                             {"t": str(tenant_id)})).scalar()
    b = found["branding"] or {}
    p = progress or initial(None, None, step=1)
    return {
        "started": progress is not None,
        "step": int(p.get("step") or 1),
        "reached": int(p.get("reached") or 1),
        "business_type": p.get("business_type"),
        "country": p.get("country"),
        "finished_at": p.get("finished_at"),
        "sanmar_notify": bool(p.get("sanmar_notify")),
        "shop_name": str(b.get("store_name") or b.get("company_name") or "").strip(),
        "slug": slug,
        "shop_url": await for_tenant(db, tenant_id, "/"),
        "trial_days": await trial_days(db, tenant_id),
        "branding": {
            "logo_url": b.get("logo_url") or None,
            "primary_color": b.get("primary_color") or None,
            "font_heading": b.get("font_heading") or None,
            "font_body": b.get("font_body") or None,
        },
        "products": found["products"],
        "supplier_connected": found["supplier"],
        "stripe": found["stripe"],
        "carriers": found["carriers"],
        "pickup": found["pickup"],
        "domain": found["domain"],
        "done": found["done"],
    }


async def unfinished(db: AsyncSession, tenant_id: Any) -> bool:
    """A shop that started the wizard and has not finished it (Home asks it to)."""
    progress = await read_progress(db, tenant_id)
    return bool(progress) and not progress.get("finished_at")
