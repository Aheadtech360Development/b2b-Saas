"""Reading a collection's products — by hand-picked list, or by rule.

One function answers both kinds, so the admin preview, the admin product list
and the storefront can never disagree about what is in a collection. They call
the same thing; only the filters differ.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import Numeric, cast, false as sql_false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import Collection, CollectionProduct
from app.models.product import Product, ProductVariant
from app.services import collection_rules as rules_engine

logger = logging.getLogger(__name__)


def _sorted(query, sort_by: str, manual_order=None):
    """Apply the collection's ordering.

    "Manual" only means anything for a hand-picked collection; on an automatic
    one it falls through to newest first, because there is no order somebody
    dragged things into.
    """
    if sort_by == "title_asc":
        return query.order_by(func.lower(Product.name).asc())
    if sort_by == "title_desc":
        return query.order_by(func.lower(Product.name).desc())
    if sort_by == "created_asc":
        return query.order_by(Product.created_at.asc())
    if sort_by in ("price_asc", "price_desc"):
        # A product's price is the cheapest thing you can buy it for, which is
        # what the storefront shows and therefore what sorting must agree with.
        cheapest = (
            select(func.min(ProductVariant.retail_price))
            .where(ProductVariant.product_id == Product.id)
            .correlate(Product)
            .scalar_subquery()
        )
        price = func.coalesce(cheapest, cast(Product.base_price, Numeric(12, 4)))
        return query.order_by(price.asc() if sort_by == "price_asc" else price.desc())
    if sort_by == "manual" and manual_order is not None:
        return query.order_by(manual_order.asc(), Product.created_at.desc())
    return query.order_by(Product.created_at.desc())


def products_query(collection: Collection, *, active_only: bool = False):
    """The query for what is in this collection right now.

    An automatic collection with no conditions matches nothing. It is an
    unfinished collection, and reading it as "the whole catalogue" would put
    every product a brand has on a page they were still building.
    """
    if collection.match_type == "automatic":
        condition = rules_engine.build_condition(
            collection.rules or [], collection.rules_match or "all"
        )
        query = select(Product)
        if condition is None:
            # `false()` the construct, not `func.false()` — the latter renders
            # as a call to a function Postgres does not have.
            return query.where(sql_false())
        query = query.where(condition)
        if active_only:
            query = query.where(Product.status == "active")
        return _sorted(query, collection.sort_by or "created_desc")

    query = (
        select(Product)
        .join(CollectionProduct, CollectionProduct.product_id == Product.id)
        .where(CollectionProduct.collection_id == collection.id)
    )
    if active_only:
        query = query.where(Product.status == "active")
    return _sorted(query, collection.sort_by or "manual", CollectionProduct.position)


async def count_products(db: AsyncSession, collection: Collection, *,
                         active_only: bool = False) -> int:
    query = products_query(collection, active_only=active_only)
    return (await db.execute(
        select(func.count()).select_from(query.order_by(None).subquery())
    )).scalar_one() or 0


async def list_products(
    db: AsyncSession, collection: Collection, *,
    offset: int = 0, limit: int = 50, active_only: bool = False,
) -> list[Product]:
    query = products_query(collection, active_only=active_only)
    return list((await db.execute(query.offset(offset).limit(limit))).scalars().all())


async def preview(db: AsyncSession, match_type: str, rules: list[dict],
                  rules_match: str, *, limit: int = 20) -> dict:
    """What a rule set would hold, without saving it.

    The whole point of the builder: an admin should see the answer before
    committing to the question.
    """
    stand_in = Collection(
        name="preview", slug="preview", match_type=match_type,
        rules=rules, rules_match=rules_match, sort_by="created_desc",
    )
    query = products_query(stand_in)
    total = (await db.execute(
        select(func.count()).select_from(query.order_by(None).subquery())
    )).scalar_one() or 0
    rows = list((await db.execute(query.limit(limit))).scalars().all())
    return {
        "total": total,
        "explain": [rules_engine.describe(r) for r in (rules or [])],
        "match": rules_match,
        "products": [
            {
                "id": str(p.id), "name": p.name, "slug": p.slug,
                "status": p.status, "product_type": p.product_type,
                "vendor": p.vendor, "tags": list(p.tags or []),
            }
            for p in rows
        ],
    }


async def collections_for_product(db: AsyncSession, product_id: uuid.UUID) -> list[dict]:
    """Which collections this product is in — shown on the product page.

    Automatic ones are answered by running their rules against this one
    product, which is cheap and always current: there is no stored membership
    to be stale.
    """
    out: list[dict] = []
    for collection in (await db.execute(select(Collection))).scalars().all():
        if collection.match_type == "manual":
            member = (await db.execute(
                select(CollectionProduct.id).where(
                    CollectionProduct.collection_id == collection.id,
                    CollectionProduct.product_id == product_id,
                )
            )).first() is not None
        else:
            condition = rules_engine.build_condition(
                collection.rules or [], collection.rules_match or "all"
            )
            if condition is None:
                member = False
            else:
                member = (await db.execute(
                    select(Product.id).where(Product.id == product_id, condition)
                )).first() is not None
        if member:
            out.append({
                "id": str(collection.id), "name": collection.name,
                "slug": collection.slug, "automatic": collection.match_type == "automatic",
            })
    return out


def slugify(value: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:200] or "collection"


async def unique_slug(db: AsyncSession, name: str, *, exclude_id: Any = None) -> str:
    """A slug that is free for this brand. Two brands may share one."""
    base = slugify(name)
    candidate = base
    suffix = 2
    while True:
        query = select(Collection.id).where(Collection.slug == candidate)
        if exclude_id is not None:
            query = query.where(Collection.id != exclude_id)
        if (await db.execute(query)).first() is None:
            return candidate
        candidate = f"{base}-{suffix}"[:200]
        suffix += 1
