"""The store's own products and collections, as cards.

Where the website builder's product grids, collection grids and collection
pages get what they show: the things this store actually sells, in one shape
("title", "price", "image", "url"). The name is from the imported themes this
was first written for; those are gone, and the builder (services/builder/
resolve.py) is who calls it now.

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


def _product_card(product: Product, sheet_from: float | None = None) -> dict[str, Any]:
    prices = [
        float(v.retail_price)
        for v in (product.variants or [])
        if v.status == "active" and v.retail_price is not None
    ]
    if not prices and product.base_price is not None:
        prices = [float(product.base_price)]
    if not prices and sheet_from:
        prices = [sheet_from]  # a gang sheet is priced by its cheapest sheet
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


async def _cards(db: AsyncSession, items: list[Product]) -> list[dict[str, Any]]:
    """Cards for these products, each with a price it really has.

    A gang-sheet product has no variants to take a price from, so the cheapest
    sheet the brand set up for it is fetched for the whole batch at once.
    """
    gang = [p.id for p in items if getattr(p, "gang_sheet_enabled", False)]
    cheapest: dict[Any, float] = {}
    if gang:
        from app.api.v1.gang_sheets import GangSheetSize

        for pid, per_sheet, mode, per_inch, min_len in (await db.execute(
            select(GangSheetSize.product_id, GangSheetSize.price_per_sheet, GangSheetSize.pricing_mode,
                   GangSheetSize.price_per_inch, GangSheetSize.min_length_in)
            .where(GangSheetSize.product_id.in_(gang), GangSheetSize.is_active.is_(True))
        )).all():
            price = (
                float(per_inch or 0) * float(min_len or 0)
                if (mode or "fixed") == "custom_length"
                else float(per_sheet or 0)
            )
            if price > 0 and price < cheapest.get(pid, float("inf")):
                cheapest[pid] = price
    return [_product_card(p, cheapest.get(p.id)) for p in items]


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
        return (await _cards(db, [by_id[str(i)] for i in wanted if str(i) in by_id]))[:limit]

    if collection_slug:
        collection = (await db.execute(
            select(Collection).where(Collection.slug == collection_slug, Collection.is_active.is_(True))
        )).scalar_one_or_none()
        if collection is None:
            return []
        from app.services import collection_service

        rows = await collection_service.list_products(
            db, collection, offset=0, limit=limit, active_only=True
        )
        ids_in_order = [p.id for p in rows]
        if not ids_in_order:
            return []
        loaded = (await db.execute(query.where(Product.id.in_(ids_in_order)))).scalars().unique().all()
        by_id = {p.id: p for p in loaded}
        return (await _cards(db, [by_id[i] for i in ids_in_order if i in by_id]))[:limit]

    if sort == "name":
        query = query.order_by(Product.name)
    elif sort in {"price_low", "price_high"}:
        query = query.order_by(Product.created_at.desc())  # price sort happens below
    else:
        query = query.order_by(Product.created_at.desc())

    rows = (await db.execute(query.limit(limit if sort not in {"price_low", "price_high"} else MAX_ITEMS))).scalars().unique().all()
    cards = await _cards(db, list(rows))
    if sort in {"price_low", "price_high"}:
        def key(card: dict) -> float:
            digits = "".join(ch for ch in card["price"] if ch.isdigit() or ch == ".")
            return float(digits) if digits else 0.0
        cards.sort(key=key, reverse=(sort == "price_high"))
    return cards[:limit]


async def cards_in_order(db: AsyncSession, ids: list[uuid.UUID]) -> list[dict[str, Any]]:
    """Cards for these products, in this order, from one fetch — a page of a
    listing, however far down it is. Anything not on sale is left out."""
    if not ids:
        return []
    loaded = (await db.execute(
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id.in_(ids), Product.status == "active")
    )).scalars().unique().all()
    by_id = {p.id: p for p in loaded}
    return await _cards(db, [by_id[i] for i in ids if i in by_id])


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


async def collection_page(db: AsyncSession, slug: str, *, page: int = 1, page_size: int = 12,
                          sort: str = "") -> dict[str, Any] | None:
    """One collection, and the page of its products a shopper asked for."""
    from app.services import collection_service

    collection = (await db.execute(
        select(Collection).where(Collection.slug == slug, Collection.is_active.is_(True))
    )).scalar_one_or_none()
    if collection is None:
        return None

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 12), MAX_ITEMS))
    total = await collection_service.count_products(db, collection, active_only=True)
    # "Load more" adds to what is already on screen rather than replacing it,
    # so page 2 means the first two pages' worth.
    rows = await collection_service.list_products(
        db, collection, offset=0, limit=page * page_size, active_only=True
    )
    loaded = (await db.execute(
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id.in_([p.id for p in rows]))
    )).scalars().unique().all() if rows else []
    by_id = {p.id: p for p in loaded}
    cards = await _cards(db, [by_id[p.id] for p in rows if p.id in by_id])
    if sort == "name":
        cards.sort(key=lambda c: c["title"].lower())

    return {
        "collection": {
            "name": collection.name,
            "slug": collection.slug,
            "description": collection.description or "",
            "image": collection.image_url or "",
            "seo_title": collection.seo_title or collection.name,
            "seo_description": collection.seo_description or collection.description or "",
        },
        "items": cards,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": len(cards) < total,
    }
