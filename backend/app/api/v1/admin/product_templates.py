"""Admin API — product templates.

Lives under /admin/storefront so it takes the "storefront" permission, like the
page builder it extends (core/permissions.py maps the prefix). Assigning a
template from the product editor goes through the products PATCH instead, which
takes the "products" permission.

Every query is tenant-scoped by the session; each handler also loads the
template it was handed through that scope, so an id from another brand is a
plain 404.

Save and Publish are separate on purpose: PUT stores the editor's draft, and
only POST /{id}/publish changes what shoppers see.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.product import Product
from app.models.product_template import ProductTemplate
from app.services import product_templates as tpl

router = APIRouter(prefix="/admin/storefront/product-templates", tags=["admin", "product-templates"])

MAX_ASSIGN = 500


# ── Schemas ──────────────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    # Start from a copy of another template's draft.
    copy_from: uuid.UUID | None = None


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    draft: dict | None = None


class DefaultIn(BaseModel):
    is_default: bool


class ProductIds(BaseModel):
    product_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=MAX_ASSIGN)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _tenant(request: Request) -> uuid.UUID:
    raw = getattr(request.state, "tenant_id", None)
    if not raw:
        # A template belongs to a brand; the platform account has no storefront.
        raise HTTPException(status_code=400, detail="Open a brand's admin to manage its product templates.")
    return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))


async def _get(db: AsyncSession, template_id: uuid.UUID, tenant_id: uuid.UUID) -> ProductTemplate:
    t = (await db.execute(
        select(ProductTemplate).where(ProductTemplate.id == template_id, ProductTemplate.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


def _status(t: ProductTemplate) -> str:
    if t.published is None:
        return "draft"  # never published — shoppers don't see it
    if tpl.normalise_stored(t.draft) != tpl.normalise_stored(t.published):
        return "changes"  # published, with unpublished edits
    return "published"


def _row(t: ProductTemplate, product_count: int = 0) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "is_default": t.is_default,
        "status": _status(t),
        "product_count": product_count,
        "published_at": t.published_at.isoformat() if t.published_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _detail(t: ProductTemplate, product_count: int) -> dict:
    return {
        **_row(t, product_count),
        "draft": tpl.normalise_stored(t.draft),
        "published": tpl.normalise_stored(t.published) if t.published is not None else None,
    }


async def _count(db: AsyncSession, template_id: uuid.UUID) -> int:
    return (await db.execute(
        select(func.count(Product.id)).where(Product.template_id == template_id)
    )).scalar_one()


def _bad(e: tpl.TemplateError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(e))


# ── Catalogue for the editor ────────────────────────────────────────────────

@router.get("/meta")
async def editor_meta(request: Request, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Block types, and the metafield keys this brand's products already use."""
    _tenant(request)
    keys = (await db.execute(
        select(func.jsonb_object_keys(Product.metafields)).distinct().limit(200)
    )).scalars().all()
    return {
        "standard_blocks": tpl.STANDARD_BLOCKS,
        "custom_blocks": tpl.CUSTOM_BLOCKS,
        "metafield_keys": sorted(keys),
        "limits": {"code_bytes": tpl.MAX_CODE_BYTES, "blocks": tpl.MAX_BLOCKS, "sections": tpl.MAX_SECTIONS},
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("")
async def list_templates(request: Request, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    tid = _tenant(request)
    rows = (await db.execute(
        select(ProductTemplate).where(ProductTemplate.tenant_id == tid)
        .order_by(ProductTemplate.is_default.desc(), ProductTemplate.name)
    )).scalars().all()
    counts = dict((await db.execute(
        select(Product.template_id, func.count(Product.id))
        .where(Product.template_id.is_not(None)).group_by(Product.template_id)
    )).all())
    return [_row(t, counts.get(t.id, 0)) for t in rows]


@router.post("", status_code=201)
async def create_template(data: TemplateCreate, request: Request, _: None = Depends(require_admin),
                          db: AsyncSession = Depends(get_db)) -> dict:
    tid = _tenant(request)
    draft = {"blocks": tpl.default_blocks(), "sections": []}
    if data.copy_from:
        src = await _get(db, data.copy_from, tid)
        draft = tpl.normalise_stored(src.draft)
    t = ProductTemplate(tenant_id=tid, name=data.name.strip(), draft=draft, is_default=False)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _detail(t, 0)


@router.get("/{template_id}")
async def get_template(template_id: uuid.UUID, request: Request, _: None = Depends(require_admin),
                       db: AsyncSession = Depends(get_db)) -> dict:
    t = await _get(db, template_id, _tenant(request))
    return _detail(t, await _count(db, t.id))


@router.put("/{template_id}")
async def save_draft(template_id: uuid.UUID, data: TemplateUpdate, request: Request,
                     _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Save the editor's copy. Shoppers see nothing new until Publish."""
    t = await _get(db, template_id, _tenant(request))
    if data.name is not None:
        t.name = data.name.strip()
    if data.draft is not None:
        try:
            t.draft = tpl.clean_layout(data.draft)
        except tpl.TemplateError as e:
            raise _bad(e)
    t.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(t)
    return _detail(t, await _count(db, t.id))


@router.post("/{template_id}/publish")
async def publish(template_id: uuid.UUID, request: Request, _: None = Depends(require_admin),
                  db: AsyncSession = Depends(get_db)) -> dict:
    """Make the saved draft live."""
    t = await _get(db, template_id, _tenant(request))
    try:
        # Re-validate: the draft may predate a rule, and this is what goes live.
        t.published = tpl.clean_layout(t.draft)
    except tpl.TemplateError as e:
        raise _bad(e)
    t.draft = t.published
    now = datetime.now(timezone.utc)
    t.published_at = now
    t.updated_at = now
    await db.commit()
    await db.refresh(t)
    return _detail(t, await _count(db, t.id))


@router.post("/{template_id}/discard")
async def discard_changes(template_id: uuid.UUID, request: Request, _: None = Depends(require_admin),
                          db: AsyncSession = Depends(get_db)) -> dict:
    """Throw away unpublished edits — back to what shoppers see."""
    t = await _get(db, template_id, _tenant(request))
    if t.published is None:
        raise HTTPException(status_code=400, detail="This template has never been published, so there is nothing to go back to.")
    t.draft = t.published
    t.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(t)
    return _detail(t, await _count(db, t.id))


@router.post("/{template_id}/default")
async def set_default(template_id: uuid.UUID, data: DefaultIn, request: Request,
                      _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Use this template for every product that doesn't have one of its own."""
    tid = _tenant(request)
    t = await _get(db, template_id, tid)
    if data.is_default:
        await db.execute(
            update(ProductTemplate)
            .where(ProductTemplate.tenant_id == tid, ProductTemplate.id != t.id, ProductTemplate.is_default.is_(True))
            .values(is_default=False)
        )
        await db.flush()
    t.is_default = data.is_default
    t.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(t)
    return _detail(t, await _count(db, t.id))


@router.delete("/{template_id}")
async def delete_template(template_id: uuid.UUID, request: Request, _: None = Depends(require_admin),
                          db: AsyncSession = Depends(get_db)) -> dict:
    """Delete; its products go back to the default template (or the plain page)."""
    t = await _get(db, template_id, _tenant(request))
    moved = await _count(db, t.id)
    await db.execute(update(Product).where(Product.template_id == t.id).values(template_id=None))
    await db.delete(t)
    await db.commit()
    return {"status": "deleted", "products_reset": moved}


# ── Assignment ───────────────────────────────────────────────────────────────

@router.get("/{template_id}/products")
async def assigned_products(template_id: uuid.UUID, request: Request, _: None = Depends(require_admin),
                            db: AsyncSession = Depends(get_db)) -> list[dict]:
    t = await _get(db, template_id, _tenant(request))
    rows = (await db.execute(
        select(Product.id, Product.name, Product.slug, Product.status)
        .where(Product.template_id == t.id).order_by(Product.name).limit(1000)
    )).all()
    return [{"id": str(r.id), "name": r.name, "slug": r.slug, "status": r.status} for r in rows]


async def _set_template(db: AsyncSession, tenant_id: uuid.UUID, ids: list[uuid.UUID],
                        template_id: uuid.UUID | None, only_from: uuid.UUID | None = None) -> int:
    q = select(Product).where(Product.id.in_(ids), Product.tenant_id == tenant_id)
    if only_from is not None:
        q = q.where(Product.template_id == only_from)
    products = (await db.execute(q)).scalars().all()
    for p in products:
        p.template_id = template_id
    await db.commit()
    # No cache to clear: the cached product detail doesn't carry the layout —
    # the storefront asks /products/{slug}/template for it, uncached.
    return len(products)


@router.post("/{template_id}/products")
async def assign_products(template_id: uuid.UUID, data: ProductIds, request: Request,
                          _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Give these products this template. Ids that aren't this brand's are skipped."""
    tid = _tenant(request)
    t = await _get(db, template_id, tid)
    n = await _set_template(db, tid, data.product_ids, t.id)
    return {"assigned": n, "product_count": await _count(db, t.id)}


@router.post("/{template_id}/products/remove")
async def unassign_products(template_id: uuid.UUID, data: ProductIds, request: Request,
                            _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Send these products back to the default template."""
    tid = _tenant(request)
    t = await _get(db, template_id, tid)
    n = await _set_template(db, tid, data.product_ids, None, only_from=t.id)
    return {"removed": n, "product_count": await _count(db, t.id)}
