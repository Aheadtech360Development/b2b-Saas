"""The store's own products and collections, as cards for a theme.

A design shows a row of example cards. The store fills that row with what it
actually sells: this is where those items come from, and the shape they take
("title", "price", "image", "url") is what services/theme_render.py knows how
to put into the design's own card.

Everything here runs inside the brand's tenant scope, so a row of cards can
only ever be filled with that brand's catalogue.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.collection import Collection
from app.models.product import Product, ProductCategory, ProductVariant

MAX_ITEMS = 24
DEFAULT_LIMIT = 6

# What a row of cards can be told to show.
SOURCES = {"products", "collections"}
PRODUCT_SORTS = {"newest", "name", "price_low", "price_high"}


def _money(value: Decimal | float | None) -> str:
    if value is None:
        return ""
    return f"${float(value):,.2f}"


def _product_card(product: Product) -> dict[str, Any]:
    prices = [
        float(v.retail_price)
        for v in (product.variants or [])
        if v.status == "active" and v.retail_price is not None
    ]
    if not prices and product.base_price is not None:
        prices = [float(product.base_price)]
    image = None
    images = sorted(product.images or [], key=lambda i: (not getattr(i, "is_primary", False),))
    if images:
        image = getattr(images[0], "url_medium", None) or getattr(images[0], "url_large", None)
    compare = [float(v.compare_price) for v in (product.variants or []) if v.compare_price]
    on_sale = bool(compare and prices and min(compare) > min(prices))
    return {
        "title": product.name,
        "url": f"/products/{product.slug}",
        "image": image or "",
        "price": f"From {_money(min(prices))}" if prices else "",
        "badge": "Sale" if on_sale else "",
        "text": product.short_description or "",
    }


def _collection_card(collection: Collection, count: int) -> dict[str, Any]:
    return {
        "title": collection.name,
        "url": f"/collections/{collection.slug}",
        "image": collection.image_url or "",
        "price": "",
        "badge": "",
        "text": collection.description or (f"{count} products" if count else ""),
    }


async def products(
    db: AsyncSession,
    *,
    limit: int = DEFAULT_LIMIT,
    collection_slug: str = "",
    ids: list[str] | None = None,
    sort: str = "newest",
) -> list[dict[str, Any]]:
    """Cards for the store's own products.

    `ids` wins when given (the admin picked these products by hand, and their
    order is kept); otherwise the newest active products, optionally only those
    in one collection.
    """
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_ITEMS))
    query = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.status == "active")
    )

    if ids:
        wanted = []
        for raw in ids[:MAX_ITEMS]:
            try:
                wanted.append(uuid.UUID(str(raw)))
            except (ValueError, AttributeError):
                continue
        if not wanted:
            return []
        rows = (await db.execute(query.where(Product.id.in_(wanted)))).scalars().unique().all()
        by_id = {str(p.id): p for p in rows}
        # Hand-picked means in the order they were picked, minus anything that
        # has since been deleted or unpublished.
        return [_product_card(by_id[str(i)]) for i in wanted if str(i) in by_id][:limit]

    if collection_slug:
        collection = (await db.execute(
            select(Collection).where(Collection.slug == collection_slug, Collection.is_active.is_(True))
        )).scalar_one_or_none()
        if collection is None:
            return []
        from app.services import collection_service

        found = await collection_service.list_products(
            db, collection, page=1, page_size=limit, active_only=True
        )
        rows = found[0] if isinstance(found, tuple) else found
        ids_in_order = [p.id if hasattr(p, "id") else p for p in rows]
        if not ids_in_order:
            return []
        loaded = (await db.execute(query.where(Product.id.in_(ids_in_order)))).scalars().unique().all()
        by_id = {p.id: p for p in loaded}
        return [_product_card(by_id[i]) for i in ids_in_order if i in by_id][:limit]

    if sort == "name":
        query = query.order_by(Product.name)
    elif sort in {"price_low", "price_high"}:
        query = query.order_by(Product.created_at.desc())  # price sort happens below
    else:
        query = query.order_by(Product.created_at.desc())

    rows = (await db.execute(query.limit(limit if sort not in {"price_low", "price_high"} else MAX_ITEMS))).scalars().unique().all()
    cards = [_product_card(p) for p in rows]
    if sort in {"price_low", "price_high"}:
        def key(card: dict) -> float:
            digits = "".join(ch for ch in card["price"] if ch.isdigit() or ch == ".")
            return float(digits) if digits else 0.0
        cards.sort(key=key, reverse=(sort == "price_high"))
    return cards[:limit]


async def collections(db: AsyncSession, *, limit: int = DEFAULT_LIMIT, ids: list[str] | None = None) -> list[dict[str, Any]]:
    """Cards for the store's own collections."""
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_ITEMS))
    query = select(Collection).where(Collection.is_active.is_(True)).order_by(Collection.position, Collection.name)
    rows = (await db.execute(query)).scalars().unique().all()
    if ids:
        order = [str(i) for i in ids]
        by_id = {str(c.id): c for c in rows}
        rows = [by_id[i] for i in order if i in by_id]
    rows = rows[:limit]
    if not rows:
        return []

    counts = dict((await db.execute(
        select(ProductCategory.category_id, func.count(ProductCategory.product_id))
        .group_by(ProductCategory.category_id)
    )).all())
    return [_collection_card(c, counts.get(c.id, 0)) for c in rows]


async def menu(db: AsyncSession, *, menu_id: str = "", limit: int = 12) -> list[dict[str, Any]]:
    """A store menu as link items, or the store's collections when none is picked.

    Sub-menus are flattened: the design decides how a menu looks, and a list
    that was drawn flat stays flat rather than growing a dropdown it has no
    styling for.
    """
    import json as _json

    from sqlalchemy import text as _text

    limit = max(1, min(int(limit or 12), MAX_ITEMS))
    rows: list[dict[str, Any]] = []
    if menu_id:
        raw = (await db.execute(
            _text("SELECT items FROM tenant_menus WHERE id = CAST(:mid AS uuid)"), {"mid": str(menu_id)}
        )).scalar()
        items = _json.loads(raw) if isinstance(raw, str) else (raw or [])
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            rows.append({"title": str(item.get("label") or item.get("title") or ""),
                         "url": str(item.get("href") or item.get("url") or "#")})
            for child in (item.get("children") or []):
                if isinstance(child, dict):
                    rows.append({"title": str(child.get("label") or ""), "url": str(child.get("href") or "#")})
        rows = [r for r in rows if r["title"]]
    if not rows:
        rows = [{"title": c["title"], "url": c["url"]} for c in await collections(db, limit=limit)]
    return [{**r, "image": "", "price": "", "badge": "", "text": ""} for r in rows[:limit]]


async def items_for(db: AsyncSession, spec: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The cards one row should show, from what the admin chose for it."""
    spec = spec or {}
    source = spec.get("source") or "products"
    limit = spec.get("limit") or DEFAULT_LIMIT
    ids = [str(i) for i in (spec.get("ids") or [])]
    if source == "menu":
        return await menu(db, menu_id=str(spec.get("menu") or ""), limit=limit)
    if source == "collections":
        return await collections(db, limit=limit, ids=ids)
    if source == "none":
        return []
    return await products(
        db, limit=limit, collection_slug=str(spec.get("collection") or ""),
        ids=ids, sort=str(spec.get("sort") or "newest"),
    )


async def page_items(db: AsyncSession, state: dict[str, Any] | None, page_key: str) -> dict[str, list[dict[str, Any]]]:
    """Every row of cards on this page, filled — keyed "<section>|<row>"."""
    page_state = ((state or {}).get("pages") or {}).get(page_key) or {}
    out: dict[str, list[dict[str, Any]]] = {}
    for section_id, slots in (page_state.get("dynamic") or {}).items():
        if not isinstance(slots, dict):
            continue
        for slot_key, spec in slots.items():
            # "none" means this row keeps the design's own example cards, so it
            # gets no entry at all — an empty list would wipe the row instead.
            if (spec or {}).get("source") == "none":
                continue
            out[f"{section_id}|{slot_key}"] = await items_for(db, spec)
    return out
