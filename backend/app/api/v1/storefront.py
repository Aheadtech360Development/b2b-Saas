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
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

public_router = APIRouter(prefix="/storefront", tags=["storefront"])
admin_router = APIRouter(prefix="/admin/storefront", tags=["storefront-admin"])
# Multi-page builder. Prefix sits under /admin/storefront so RBAC maps it to the
# "storefront" scope (Admin/Manager/Editor write, Viewer read-only).
admin_pages_router = APIRouter(prefix="/admin/storefront/pages", tags=["storefront-pages"])
# Contact-form submissions inbox (mapped to the "customers" scope in permissions).
admin_contact_router = APIRouter(prefix="/admin/contact-submissions", tags=["contact-admin"])
# Named navigation menus (Shopify-style) — under /admin/storefront → "storefront" scope.
admin_menus_router = APIRouter(prefix="/admin/storefront/menus", tags=["storefront-menus"])

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
    "footer_menu_items": [],
    "header_menu_id": None,
    "footer_menu_id": None,
    # Navbar layout
    "header_layout": "logo_left",
    "show_cart": True,
    # Typography + active starter theme
    "font_heading": "'Fraunces', serif",
    "font_body": "'DM Sans', sans-serif",
    "active_theme": None,
    # Theme style — what makes themes look different beyond colour
    "card_style": "bordered",
    "button_radius": 4,
    "corner_radius": 6,
    "section_spacing": "normal",
    # Hero section
    "show_hero": True,
    "hero_heading": "",
    "hero_subheading": "",
    "hero_image_url": None,
    "hero_cta_text": "Shop Now",
    "hero_cta_link": "/products",
    "hero_bg_color": "#F8F8F6",
    "hero_text_color": "#1A1A1A",
    "hero_image_radius": 4,
    "hero_image_opacity": 100,
    # Featured sections
    "show_featured_categories": True,
    "featured_categories_heading": "Shop by Category",
    "featured_category_ids": [],
    "featured_categories_view_all_text": "View all",
    "featured_categories_view_all_link": "/products",
    "featured_categories_limit": 4,
    "show_featured_products": True,
    "featured_products_heading": "Featured Products",
    "featured_product_ids": [],
    "featured_products_view_all_text": "View all",
    "featured_products_view_all_link": "/products",
    "featured_products_limit": 4,
    # Homepage section order
    "section_order": ["hero", "featured_categories", "featured_products"],
    # Homepage flexible sections (image_text, gallery, newsletter, rich_text)
    "home_sections": [],
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
        "footer_menu_items": [],
        "header_menu_id": str(d["header_menu_id"]) if d.get("header_menu_id") else None,
        "footer_menu_id": str(d["footer_menu_id"]) if d.get("footer_menu_id") else None,
        "header_layout": d.get("header_layout") or "logo_left",
        "show_cart": _bool(d.get("show_cart"), True),
        "font_heading": d.get("font_heading") or "'Fraunces', serif",
        "font_body": d.get("font_body") or "'DM Sans', sans-serif",
        "active_theme": d.get("active_theme"),
        "card_style": d.get("card_style") or "bordered",
        "button_radius": d.get("button_radius") if d.get("button_radius") is not None else 4,
        "corner_radius": d.get("corner_radius") if d.get("corner_radius") is not None else 6,
        "section_spacing": d.get("section_spacing") or "normal",
        # Hero
        "show_hero": _bool(d.get("show_hero"), True),
        "hero_heading": d.get("hero_heading") or "",
        "hero_subheading": d.get("hero_subheading") or "",
        "hero_image_url": d.get("hero_image_url"),
        "hero_cta_text": d.get("hero_cta_text") or "Shop Now",
        "hero_cta_link": d.get("hero_cta_link") or "/products",
        "hero_bg_color": d.get("hero_bg_color") or "#F8F8F6",
        "hero_text_color": d.get("hero_text_color") or "#1A1A1A",
        "hero_image_radius": d.get("hero_image_radius") if d.get("hero_image_radius") is not None else 4,
        "hero_image_opacity": d.get("hero_image_opacity") if d.get("hero_image_opacity") is not None else 100,
        # Featured
        "show_featured_categories": _bool(d.get("show_featured_categories"), True),
        "featured_categories_heading": d.get("featured_categories_heading") or "Shop by Category",
        "featured_category_ids": _json_field(d.get("featured_category_ids"), []),
        "featured_categories_view_all_text": d.get("featured_categories_view_all_text") or "View all",
        "featured_categories_view_all_link": d.get("featured_categories_view_all_link") or "/products",
        "featured_categories_limit": d.get("featured_categories_limit") or 4,
        "show_featured_products": _bool(d.get("show_featured_products"), True),
        "featured_products_heading": d.get("featured_products_heading") or "Featured Products",
        "featured_product_ids": _json_field(d.get("featured_product_ids"), []),
        "featured_products_view_all_text": d.get("featured_products_view_all_text") or "View all",
        "featured_products_view_all_link": d.get("featured_products_view_all_link") or "/products",
        "featured_products_limit": d.get("featured_products_limit") or 4,
        # Order
        "section_order": section_order or ["hero", "featured_categories", "featured_products"],
        "home_sections": _json_field(d.get("home_sections"), []),
        # Footer + support
        "footer_text": d.get("footer_text") or "",
        "tagline": d.get("tagline") or "",
        "support_email": d.get("support_email") or "",
        "support_phone": d.get("support_phone") or "",
        "email_sender_name": d.get("email_sender_name") or "",
    }


async def _menu_items(db: AsyncSession, tenant_id: uuid.UUID, menu_id: Any) -> list | None:
    """Resolve a named menu's items (or None if it doesn't exist)."""
    if not menu_id:
        return None
    res = await db.execute(
        text("SELECT items FROM tenant_menus WHERE tenant_id = :tid AND id = :mid"),
        {"tid": str(tenant_id), "mid": str(menu_id)},
    )
    row = res.first()
    if not row:
        return None
    items = row[0]
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except Exception:
            items = []
    return items or []


async def _fetch_branding(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    result = await db.execute(
        text("SELECT * FROM tenant_branding WHERE tenant_id = :tid"),
        {"tid": str(tenant_id)},
    )
    row = result.mappings().first()
    if not row:
        return dict(_DEFAULT_BRANDING)
    branding = _row_to_branding(row)
    # Resolve the assigned header/footer menus (Shopify-style named menus). The
    # header menu overrides the legacy inline menu_items when set.
    header_items = await _menu_items(db, tenant_id, row.get("header_menu_id"))
    if header_items is not None:
        branding["menu_items"] = header_items
    footer_items = await _menu_items(db, tenant_id, row.get("footer_menu_id"))
    branding["footer_menu_items"] = footer_items or []
    return branding


def _resolve_tenant_id(request: Request) -> uuid.UUID | None:
    """Tenant id from JWT (admin) or resolved subdomain context."""
    raw = getattr(request.state, "tenant_id", None)
    if raw:
        return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))
    return None


async def _tenant_id_from_slug(db: AsyncSession, slug: str | None) -> uuid.UUID | None:
    if not slug:
        return None
    res = await db.execute(
        text("SELECT id FROM tenants WHERE slug = :s AND status = 'active'"), {"s": slug}
    )
    row = res.first()
    return row[0] if row else None


# ── Public: storefront pages (multi-page builder) ─────────────────────────────
@public_router.get("/pages")
async def list_storefront_pages(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Published pages for the current brand (for nav + routing)."""
    tid = await _tenant_id_from_slug(db, getattr(request.state, "tenant_slug", None))
    if not tid:
        return []
    res = await db.execute(text("""
        SELECT slug, title, show_in_nav, sort_order
        FROM tenant_pages WHERE tenant_id = :tid AND is_published = true
        ORDER BY sort_order, title
    """), {"tid": str(tid)})
    return [dict(r) for r in res.mappings().all()]


@public_router.get("/pages/{slug}")
async def get_storefront_page(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """A single published page's sections."""
    tid = await _tenant_id_from_slug(db, getattr(request.state, "tenant_slug", None))
    if not tid:
        raise HTTPException(status_code=404, detail="Page not found")
    res = await db.execute(text("""
        SELECT slug, title, sections FROM tenant_pages
        WHERE tenant_id = :tid AND slug = :slug AND is_published = true
    """), {"tid": str(tid), "slug": slug})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    d = dict(row)
    sec = d.get("sections")
    if isinstance(sec, str):
        try:
            sec = json.loads(sec)
        except Exception:
            sec = []
    d["sections"] = sec or []
    return d


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
    header_menu_id: str | None = None
    footer_menu_id: str | None = None
    header_layout: str | None = None
    show_cart: bool | None = None
    font_heading: str | None = None
    font_body: str | None = None
    active_theme: str | None = None
    card_style: str | None = None
    button_radius: int | None = None
    corner_radius: int | None = None
    section_spacing: str | None = None
    # Hero
    show_hero: bool | None = None
    hero_heading: str | None = None
    hero_subheading: str | None = None
    hero_image_url: str | None = None
    hero_cta_text: str | None = None
    hero_cta_link: str | None = None
    hero_bg_color: str | None = None
    hero_text_color: str | None = None
    hero_image_radius: int | None = None
    hero_image_opacity: int | None = None
    # Featured
    show_featured_categories: bool | None = None
    featured_categories_heading: str | None = None
    featured_category_ids: list | None = None
    featured_categories_view_all_text: str | None = None
    featured_categories_view_all_link: str | None = None
    featured_categories_limit: int | None = None
    show_featured_products: bool | None = None
    featured_products_heading: str | None = None
    featured_product_ids: list | None = None
    featured_products_view_all_text: str | None = None
    featured_products_view_all_link: str | None = None
    featured_products_limit: int | None = None
    # Order + footer
    section_order: list[str] | None = None
    home_sections: list[dict] | None = None
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

    _JSONB_FIELDS = {"menu_items", "section_order", "featured_product_ids", "featured_category_ids", "home_sections"}
    _UUID_FIELDS = {"header_menu_id", "footer_menu_id"}
    set_parts = []
    params: dict[str, Any] = {"tid": str(tenant_id)}
    for key, val in updates.items():
        if key in _JSONB_FIELDS:
            set_parts.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps(val)
        elif key in _UUID_FIELDS:
            # Empty string clears the assignment; otherwise cast to uuid.
            if val:
                set_parts.append(f"{key} = CAST(:{key} AS uuid)")
                params[key] = val
            else:
                set_parts.append(f"{key} = NULL")
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


# ══════════════════════════════════════════════════════════════════════════════
# Admin: multi-page storefront builder (Pages)
# ══════════════════════════════════════════════════════════════════════════════

# Slugs that would collide with built-in storefront routes and never render.
_RESERVED_SLUGS = {
    "products", "product", "cart", "checkout", "account", "login", "logout",
    "wholesale", "quick-order", "admin", "platform", "blog", "blogs", "reviews",
    "search", "register", "forgot-password", "reset-password", "activate-account",
}


def _slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return s or "page"


async def _unique_page_slug(
    db: AsyncSession, tenant_id: uuid.UUID, base: str, exclude_id: uuid.UUID | None = None
) -> str:
    base = _slugify(base)
    candidate = base
    n = 1
    while True:
        params: dict[str, Any] = {"tid": str(tenant_id), "slug": candidate}
        sql = "SELECT id FROM tenant_pages WHERE tenant_id = :tid AND slug = :slug"
        if exclude_id:
            sql += " AND id <> :eid"
            params["eid"] = str(exclude_id)
        row = (await db.execute(text(sql), params)).first()
        if not row:
            return candidate
        n += 1
        candidate = f"{base}-{n}"


def _page_row(row: Any) -> dict[str, Any]:
    d = dict(row)
    sec = d.get("sections")
    if isinstance(sec, str):
        try:
            sec = json.loads(sec)
        except Exception:
            sec = []
    return {
        "id": str(d["id"]),
        "slug": d["slug"],
        "title": d["title"],
        "sections": sec or [],
        "is_published": bool(d.get("is_published", True)),
        "show_in_nav": bool(d.get("show_in_nav", True)),
        "sort_order": d.get("sort_order", 0),
    }


class PageCreate(BaseModel):
    title: str
    slug: str | None = None
    # Optional starter sections (used when creating from a built-in template).
    sections: list[dict] | None = None


class PageUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    sections: list[dict] | None = None
    is_published: bool | None = None
    show_in_nav: bool | None = None
    sort_order: int | None = None


@admin_pages_router.get("")
async def list_admin_pages(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """All pages (published or not) for the current brand."""
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        return []
    res = await db.execute(text("""
        SELECT id, slug, title, sections, is_published, show_in_nav, sort_order
        FROM tenant_pages WHERE tenant_id = :tid
        ORDER BY sort_order, title
    """), {"tid": str(tenant_id)})
    return [_page_row(r) for r in res.mappings().all()]


@admin_pages_router.get("/{page_id}")
async def get_admin_page(page_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=404, detail="Page not found")
    res = await db.execute(text("""
        SELECT id, slug, title, sections, is_published, show_in_nav, sort_order
        FROM tenant_pages WHERE tenant_id = :tid AND id = :pid
    """), {"tid": str(tenant_id), "pid": str(page_id)})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    return _page_row(row)


@admin_pages_router.post("")
async def create_admin_page(data: PageCreate, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    base = data.slug or data.title
    if _slugify(base) in _RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail=f"'{_slugify(base)}' is a reserved page name. Pick another.")
    slug = await _unique_page_slug(db, tenant_id, base)
    # Place new pages at the end of the nav.
    res = await db.execute(
        text("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM tenant_pages WHERE tenant_id = :tid"),
        {"tid": str(tenant_id)},
    )
    sort_order = res.scalar() or 1
    res = await db.execute(text("""
        INSERT INTO tenant_pages (tenant_id, slug, title, sections, sort_order)
        VALUES (:tid, :slug, :title, CAST(:sections AS jsonb), :so)
        RETURNING id, slug, title, sections, is_published, show_in_nav, sort_order
    """), {
        "tid": str(tenant_id),
        "slug": slug,
        "title": data.title.strip() or "Untitled",
        "sections": json.dumps(data.sections or []),
        "so": sort_order,
    })
    row = res.mappings().first()
    await db.commit()
    return _page_row(row)


@admin_pages_router.put("/{page_id}")
async def update_admin_page(page_id: uuid.UUID, data: PageUpdate, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")

    # Ensure the page belongs to this tenant.
    exists = await db.execute(
        text("SELECT id FROM tenant_pages WHERE tenant_id = :tid AND id = :pid"),
        {"tid": str(tenant_id), "pid": str(page_id)},
    )
    if not exists.first():
        raise HTTPException(status_code=404, detail="Page not found")

    updates = data.model_dump(exclude_none=True)
    set_parts: list[str] = []
    params: dict[str, Any] = {"tid": str(tenant_id), "pid": str(page_id)}

    if "slug" in updates:
        if _slugify(updates["slug"]) in _RESERVED_SLUGS:
            raise HTTPException(status_code=400, detail=f"'{_slugify(updates['slug'])}' is a reserved page name.")
        set_parts.append("slug = :slug")
        params["slug"] = await _unique_page_slug(db, tenant_id, updates["slug"], exclude_id=page_id)
    if "title" in updates:
        set_parts.append("title = :title")
        params["title"] = updates["title"].strip() or "Untitled"
    if "sections" in updates:
        set_parts.append("sections = CAST(:sections AS jsonb)")
        params["sections"] = json.dumps(updates["sections"])
    for flag in ("is_published", "show_in_nav", "sort_order"):
        if flag in updates:
            set_parts.append(f"{flag} = :{flag}")
            params[flag] = updates[flag]

    if set_parts:
        set_parts.append("updated_at = now()")
        await db.execute(
            text(f"UPDATE tenant_pages SET {', '.join(set_parts)} WHERE tenant_id = :tid AND id = :pid"),
            params,
        )
        await db.commit()

    res = await db.execute(text("""
        SELECT id, slug, title, sections, is_published, show_in_nav, sort_order
        FROM tenant_pages WHERE tenant_id = :tid AND id = :pid
    """), {"tid": str(tenant_id), "pid": str(page_id)})
    return _page_row(res.mappings().first())


@admin_pages_router.delete("/{page_id}")
async def delete_admin_page(page_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    res = await db.execute(
        text("DELETE FROM tenant_pages WHERE tenant_id = :tid AND id = :pid"),
        {"tid": str(tenant_id), "pid": str(page_id)},
    )
    await db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# Contact form submissions
# ══════════════════════════════════════════════════════════════════════════════

class ContactSubmissionIn(BaseModel):
    page_slug: str | None = None
    form_name: str | None = None
    data: dict[str, Any]


def _submission_row(row: Any) -> dict[str, Any]:
    d = dict(row)
    data = d.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = {}
    created = d.get("created_at")
    return {
        "id": str(d["id"]),
        "page_slug": d.get("page_slug"),
        "form_name": d.get("form_name"),
        "data": data or {},
        "is_read": bool(d.get("is_read", False)),
        "created_at": created.isoformat() if created is not None else None,
    }


@public_router.post("/contact")
async def submit_contact_form(
    payload: ContactSubmissionIn, request: Request, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    """Public: a storefront visitor submits a contact form. Saved to the brand's inbox."""
    tid = await _tenant_id_from_slug(db, getattr(request.state, "tenant_slug", None))
    if not tid:
        raise HTTPException(status_code=404, detail="Store not found")
    # Ignore empty values and cap size so the inbox stays clean.
    clean = {
        str(k)[:100]: (str(v)[:5000] if v is not None else "")
        for k, v in list(payload.data.items())[:40]
        if str(v).strip()
    }
    if not clean:
        raise HTTPException(status_code=400, detail="Please fill in the form.")
    await db.execute(text("""
        INSERT INTO contact_submissions (tenant_id, page_slug, form_name, data)
        VALUES (:tid, :ps, :fn, CAST(:data AS jsonb))
    """), {
        "tid": str(tid),
        "ps": (payload.page_slug or "")[:100] or None,
        "fn": (payload.form_name or "")[:150] or None,
        "data": json.dumps(clean),
    })
    await db.commit()
    return {"status": "received"}


@admin_contact_router.get("")
async def list_contact_submissions(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Admin: list this brand's form submissions (newest first) + unread count."""
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        return {"items": [], "unread": 0}
    res = await db.execute(text("""
        SELECT id, page_slug, form_name, data, is_read, created_at
        FROM contact_submissions WHERE tenant_id = :tid
        ORDER BY created_at DESC LIMIT 500
    """), {"tid": str(tenant_id)})
    items = [_submission_row(r) for r in res.mappings().all()]
    unread = sum(1 for i in items if not i["is_read"])
    return {"items": items, "unread": unread}


@admin_contact_router.patch("/{submission_id}/read")
async def mark_submission_read(
    submission_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    await db.execute(
        text("UPDATE contact_submissions SET is_read = true WHERE tenant_id = :tid AND id = :sid"),
        {"tid": str(tenant_id), "sid": str(submission_id)},
    )
    await db.commit()
    return {"status": "ok"}


@admin_contact_router.delete("/{submission_id}")
async def delete_contact_submission(
    submission_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    res = await db.execute(
        text("DELETE FROM contact_submissions WHERE tenant_id = :tid AND id = :sid"),
        {"tid": str(tenant_id), "sid": str(submission_id)},
    )
    await db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# Named navigation menus (Shopify-style)
# ══════════════════════════════════════════════════════════════════════════════

def _menu_row(row: Any) -> dict[str, Any]:
    d = dict(row)
    items = d.get("items")
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except Exception:
            items = []
    return {"id": str(d["id"]), "name": d["name"], "items": items or []}


class MenuCreate(BaseModel):
    name: str


class MenuUpdate(BaseModel):
    name: str | None = None
    items: list[dict] | None = None


@admin_menus_router.get("")
async def list_menus(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        return []
    res = await db.execute(
        text("SELECT id, name, items FROM tenant_menus WHERE tenant_id = :tid ORDER BY created_at"),
        {"tid": str(tenant_id)},
    )
    return [_menu_row(r) for r in res.mappings().all()]


@admin_menus_router.post("")
async def create_menu(data: MenuCreate, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    res = await db.execute(text("""
        INSERT INTO tenant_menus (tenant_id, name, items) VALUES (:tid, :name, '[]'::jsonb)
        RETURNING id, name, items
    """), {"tid": str(tenant_id), "name": (data.name.strip() or "Menu")[:150]})
    row = res.mappings().first()
    await db.commit()
    return _menu_row(row)


@admin_menus_router.put("/{menu_id}")
async def update_menu(menu_id: uuid.UUID, data: MenuUpdate, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    exists = await db.execute(
        text("SELECT id FROM tenant_menus WHERE tenant_id = :tid AND id = :mid"),
        {"tid": str(tenant_id), "mid": str(menu_id)},
    )
    if not exists.first():
        raise HTTPException(status_code=404, detail="Menu not found")

    updates = data.model_dump(exclude_none=True)
    set_parts: list[str] = []
    params: dict[str, Any] = {"tid": str(tenant_id), "mid": str(menu_id)}
    if "name" in updates:
        set_parts.append("name = :name")
        params["name"] = (updates["name"].strip() or "Menu")[:150]
    if "items" in updates:
        set_parts.append("items = CAST(:items AS jsonb)")
        params["items"] = json.dumps(updates["items"])
    if set_parts:
        set_parts.append("updated_at = now()")
        await db.execute(
            text(f"UPDATE tenant_menus SET {', '.join(set_parts)} WHERE tenant_id = :tid AND id = :mid"),
            params,
        )
        await db.commit()

    res = await db.execute(
        text("SELECT id, name, items FROM tenant_menus WHERE tenant_id = :tid AND id = :mid"),
        {"tid": str(tenant_id), "mid": str(menu_id)},
    )
    return _menu_row(res.mappings().first())


@admin_menus_router.delete("/{menu_id}")
async def delete_menu(menu_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    tenant_id = _resolve_tenant_id(request)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    # Clear any branding references first so nothing points at a dead menu.
    await db.execute(text("""
        UPDATE tenant_branding SET header_menu_id = NULL WHERE tenant_id = :tid AND header_menu_id = :mid;
    """), {"tid": str(tenant_id), "mid": str(menu_id)})
    await db.execute(text("""
        UPDATE tenant_branding SET footer_menu_id = NULL WHERE tenant_id = :tid AND footer_menu_id = :mid;
    """), {"tid": str(tenant_id), "mid": str(menu_id)})
    res = await db.execute(
        text("DELETE FROM tenant_menus WHERE tenant_id = :tid AND id = :mid"),
        {"tid": str(tenant_id), "mid": str(menu_id)},
    )
    await db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    return {"status": "deleted"}
