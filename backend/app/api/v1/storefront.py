"""
Storefront branding API.

Public:
  GET  /api/v1/storefront/branding   → current brand's storefront config (by subdomain)

Tenant admin:
  GET  /api/v1/admin/storefront       → read own branding
  PUT  /api/v1/admin/storefront       → update own branding

Every brand runs its own white-label storefront: logo, name, colors, menu,
announcement bar. No shared/hardcoded branding.
"""
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

public_router = APIRouter(prefix="/storefront", tags=["storefront"])
admin_router = APIRouter(prefix="/admin/storefront", tags=["storefront-admin"])

# Neutral platform default (root domain / no tenant) — deliberately generic.
_DEFAULT_BRANDING: dict[str, Any] = {
    "store_name": "Wholesale Store",
    "logo_url": None,
    "favicon_url": None,
    "primary_color": "#1C3557",
    "secondary_color": "#F8F8F6",
    "accent_color": "#E8B84B",
    # Announcement bar
    "announcement_text": "",
    "show_announcement": False,
    "announcement_bg_color": "#1C3557",
    "announcement_text_color": "#FFFFFF",
    # Navigation (supports nested children)
    "menu_items": [{"label": "Shop All", "href": "/products"}],
    # Hero section
    "show_hero": True,
    "hero_heading": "",
    "hero_subheading": "",
    "hero_image_url": None,
    "hero_cta_text": "Shop Now",
    "hero_cta_link": "/products",
    "hero_bg_color": "#F8F8F6",
    "hero_text_color": "#1A1A1A",
    # Featured sections
    "show_featured_categories": True,
    "featured_categories_heading": "Shop by Category",
    "show_featured_products": True,
    "featured_products_heading": "Featured Products",
    # Homepage section order
    "section_order": ["hero", "featured_categories", "featured_products"],
    # Footer + support
    "footer_text": "",
    "tagline": "",
    "support_email": "",
    "support_phone": "",
    "email_sender_name": "",
}


def _json_field(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return fallback
    return value if value is not None else fallback


def _bool(value: Any, default: bool) -> bool:
    return bool(value) if value is not None else default


def _row_to_branding(row: Any) -> dict[str, Any]:
    d = dict(row)
    menu = _json_field(d.get("menu_items"), [])
    section_order = _json_field(d.get("section_order"), ["hero", "featured_categories", "featured_products"])
    primary = d.get("primary_color") or "#1C3557"
    return {
        "store_name": d.get("store_name") or d.get("company_name") or "Store",
        "logo_url": d.get("logo_url"),
        "favicon_url": d.get("favicon_url"),
        "primary_color": primary,
        "secondary_color": d.get("secondary_color") or "#F8F8F6",
        "accent_color": d.get("accent_color") or "#E8B84B",
        # Announcement
        "announcement_text": d.get("announcement_text") or "",
        "show_announcement": _bool(d.get("show_announcement"), True),
        "announcement_bg_color": d.get("announcement_bg_color") or primary,
        "announcement_text_color": d.get("announcement_text_color") or "#FFFFFF",
        # Nav
        "menu_items": menu or [],
        # Hero
        "show_hero": _bool(d.get("show_hero"), True),
        "hero_heading": d.get("hero_heading") or "",
        "hero_subheading": d.get("hero_subheading") or "",
        "hero_image_url": d.get("hero_image_url"),
        "hero_cta_text": d.get("hero_cta_text") or "Shop Now",
        "hero_cta_link": d.get("hero_cta_link") or "/products",
        "hero_bg_color": d.get("hero_bg_color") or "#F8F8F6",
        "hero_text_color": d.get("hero_text_color") or "#1A1A1A",
        # Featured
        "show_featured_categories": _bool(d.get("show_featured_categories"), True),
        "featured_categories_heading": d.get("featured_categories_heading") or "Shop by Category",
        "show_featured_products": _bool(d.get("show_featured_products"), True),
        "featured_products_heading": d.get("featured_products_heading") or "Featured Products",
        # Order
        "section_order": section_order or ["hero", "featured_categories", "featured_products"],
        # Footer + support
        "footer_text": d.get("footer_text") or "",
        "tagline": d.get("tagline") or "",
        "support_email": d.get("support_email") or "",
        "support_phone": d.get("support_phone") or "",
        "email_sender_name": d.get("email_sender_name") or "",
    }


async def _fetch_branding(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    result = await db.execute(
        text("SELECT * FROM tenant_branding WHERE tenant_id = :tid"),
        {"tid": str(tenant_id)},
    )
    row = result.mappings().first()
    if not row:
        return dict(_DEFAULT_BRANDING)
    return _row_to_branding(row)


def _resolve_tenant_id(request: Request) -> uuid.UUID | None:
    """Tenant id from JWT (admin) or resolved subdomain context."""
    raw = getattr(request.state, "tenant_id", None)
    if raw:
        return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))
    return None


# ── Public: storefront branding by subdomain ──────────────────────────────────
@public_router.get("/branding")
async def get_storefront_branding(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # Public request → tenant resolved from subdomain slug.
    slug = getattr(request.state, "tenant_slug", None)
    if not slug:
        return dict(_DEFAULT_BRANDING)
    res = await db.execute(
        text("SELECT id FROM tenants WHERE slug = :s AND status = 'active'"),
        {"s": slug},
    )
    row = res.first()
    if not row:
        return dict(_DEFAULT_BRANDING)
    return await _fetch_branding(db, row[0])


# ── Admin: read own branding ──────────────────────────────────────────────────
@admin_router.get("")
async def get_admin_branding(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        return dict(_DEFAULT_BRANDING)
    return await _fetch_branding(db, tenant_id)


class BrandingUpdate(BaseModel):
    store_name: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    # Announcement
    announcement_text: str | None = None
    show_announcement: bool | None = None
    announcement_bg_color: str | None = None
    announcement_text_color: str | None = None
    # Nav
    menu_items: list[dict] | None = None
    # Hero
    show_hero: bool | None = None
    hero_heading: str | None = None
    hero_subheading: str | None = None
    hero_image_url: str | None = None
    hero_cta_text: str | None = None
    hero_cta_link: str | None = None
    hero_bg_color: str | None = None
    hero_text_color: str | None = None
    # Featured
    show_featured_categories: bool | None = None
    featured_categories_heading: str | None = None
    show_featured_products: bool | None = None
    featured_products_heading: str | None = None
    # Order + footer
    section_order: list[str] | None = None
    footer_text: str | None = None
    tagline: str | None = None
    support_email: str | None = None
    support_phone: str | None = None
    favicon_url: str | None = None
    email_sender_name: str | None = None


# ── Admin: update own branding ────────────────────────────────────────────────
@admin_router.put("")
async def update_admin_branding(
    data: BrandingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        from app.core.exceptions import UnauthorizedError
        raise UnauthorizedError("No tenant context")

    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await _fetch_branding(db, tenant_id)

    # Ensure a row exists.
    await db.execute(
        text("""
            INSERT INTO tenant_branding (tenant_id) VALUES (:tid)
            ON CONFLICT (tenant_id) DO NOTHING
        """),
        {"tid": str(tenant_id)},
    )

    _JSONB_FIELDS = {"menu_items", "section_order"}
    set_parts = []
    params: dict[str, Any] = {"tid": str(tenant_id)}
    for key, val in updates.items():
        if key in _JSONB_FIELDS:
            set_parts.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps(val)
        else:
            set_parts.append(f"{key} = :{key}")
            params[key] = val
    set_parts.append("updated_at = now()")

    await db.execute(
        text(f"UPDATE tenant_branding SET {', '.join(set_parts)} WHERE tenant_id = :tid"),
        params,
    )
    await db.commit()
    return await _fetch_branding(db, tenant_id)
