"""Admin API — the words on a shop's written pages, and where a link can point.

Two things every shop's admin needs, which used to sit inside the imported
theme's API. That API went when imported themes did; these stayed:

  GET/PUT /admin/storefront/theme/pages   Contact, Get a quote and the four
                                          policies, as this brand wrote them
  GET     /admin/storefront/theme/links   everywhere a menu link or a button
                                          can point: pages, products, collections

The addresses keep the prefix they had — the menus and the website builder
call them there — though nothing about them is a theme any more.

Sits under /admin/storefront so it takes the "storefront" permission, like the
rest of the store's design.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin

router = APIRouter(prefix="/admin/storefront/theme", tags=["admin", "storefront"])


def _tenant(request: Request) -> uuid.UUID:
    raw = getattr(request.state, "tenant_id", None)
    if not raw:
        raise HTTPException(status_code=400, detail="Open a brand's admin to work on its pages.")
    return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))


@router.get("/pages")
async def get_written_pages(request: Request, _: None = Depends(require_admin),
                            db: AsyncSession = Depends(get_db)) -> dict:
    """The shop's written pages, as this brand has them."""
    from app.services import storefront_pages

    return {"pages": await storefront_pages.load(db, _tenant(request))}


class WrittenPagesIn(BaseModel):
    pages: dict


@router.put("/pages")
async def save_written_pages(payload: WrittenPagesIn, request: Request,
                             _: None = Depends(require_admin),
                             db: AsyncSession = Depends(get_db)) -> dict:
    """Save the words. Which pages exist, and which carry a form, does not
    change — the brand writes them, it does not invent them."""
    from app.services import storefront_pages

    tenant_id = _tenant(request)
    saved = await storefront_pages.save(db, tenant_id, payload.pages)
    await db.commit()
    return {"pages": saved}


@router.get("/links")
async def link_targets(request: Request, q: str = "", _: None = Depends(require_admin),
                       db: AsyncSession = Depends(get_db)) -> dict:
    """Everywhere a link could point, from this store.

    So an admin picks "Premium Cotton Tee" rather than typing a URL and hoping
    it is the right one. Cart and checkout are here because buttons genuinely
    point at them; they are ordinary storefront pages.
    """
    from app.models.collection import Collection
    from app.models.product import Product
    from app.services import storefront_pages

    tenant_id = _tenant(request)
    needle = f"%{q.strip()}%" if q.strip() else None

    pages = [
        {"label": "Home", "url": "/"},
        {"label": "All products", "url": "/products"},
        {"label": "Quick order", "url": "/quick-order"},
        {"label": "Cart", "url": "/cart"},
        {"label": "Track order", "url": "/track-order"},
        {"label": "Sign in", "url": "/login"},
        {"label": "Create an account", "url": "/create-account?next=/account"},
        {"label": "My account", "url": "/account"},
        {"label": "Blog", "url": "/blog"},
    ]
    # Contact, quote and the footer's policies.
    pages += [{"label": p["label"], "url": p["href"]} for p in storefront_pages.links()]

    # The brand's own built pages, if it has any.
    try:
        rows = (await db.execute(text(
            "SELECT title, slug FROM tenant_pages WHERE tenant_id = CAST(:t AS uuid) AND is_published = true ORDER BY title"
        ), {"t": str(tenant_id)})).all()
        pages += [{"label": r[0], "url": f"/{r[1]}"} for r in rows]
    except Exception:
        pass
    if needle:
        low = q.strip().lower()
        pages = [p for p in pages if low in p["label"].lower() or low in p["url"].lower()]

    product_q = select(Product.name, Product.slug).where(Product.status == "active").order_by(Product.name).limit(30)
    if needle:
        product_q = product_q.where(Product.name.ilike(needle))
    products = [{"label": r[0], "url": f"/products/{r[1]}"} for r in (await db.execute(product_q)).all()]

    collection_q = select(Collection.name, Collection.slug).where(Collection.is_active.is_(True)).order_by(Collection.name).limit(30)
    if needle:
        collection_q = collection_q.where(Collection.name.ilike(needle))
    collections = [{"label": r[0], "url": f"/collections/{r[1]}"} for r in (await db.execute(collection_q)).all()]

    menus = [
        {"id": str(r[0]), "label": r[1]}
        for r in (await db.execute(text(
            "SELECT id, name FROM tenant_menus WHERE tenant_id = CAST(:t AS uuid) ORDER BY name"
        ), {"t": str(tenant_id)})).all()
    ]
    return {"pages": pages, "products": products, "collections": collections, "menus": menus}
