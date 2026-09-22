"""Admin API — collections.

Gated behind the "collections" permission (core/permissions.py), which is
separate from "products": somebody who curates the storefront does not
necessarily get to change prices.

Every read and write is tenant-scoped by the session, and each handler also
checks that the collection it was handed belongs to this brand — an id in a URL
is a guess anybody can make.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.collection import (
    MATCH_TYPES,
    RULES_MATCH,
    SORT_OPTIONS,
    Collection,
    CollectionProduct,
)
from app.models.product import Product
from app.services import collection_rules as rules_engine
from app.services import collection_service as svc

router = APIRouter(prefix="/admin/collections", tags=["admin", "collections"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class RuleIn(BaseModel):
    field: str
    operator: str
    value: Optional[str] = None


class CollectionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=1000)
    match_type: str = "manual"
    rules_match: str = "all"
    rules: list[RuleIn] = Field(default_factory=list)
    sort_by: str = "manual"
    is_active: bool = True
    position: int = 0
    seo_title: Optional[str] = Field(None, max_length=255)
    seo_description: Optional[str] = Field(None, max_length=500)


class CollectionPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=1000)
    match_type: Optional[str] = None
    rules_match: Optional[str] = None
    rules: Optional[list[RuleIn]] = None
    sort_by: Optional[str] = None
    is_active: Optional[bool] = None
    position: Optional[int] = None
    seo_title: Optional[str] = Field(None, max_length=255)
    seo_description: Optional[str] = Field(None, max_length=500)


class PreviewIn(BaseModel):
    match_type: str = "automatic"
    rules_match: str = "all"
    rules: list[RuleIn] = Field(default_factory=list)


class MembersIn(BaseModel):
    """Products to add or remove by hand."""

    product_ids: list[uuid.UUID] = Field(default_factory=list)


class ReorderIn(BaseModel):
    product_ids: list[uuid.UUID] = Field(default_factory=list)


def _row(c: Collection, product_count: int | None = None) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "slug": c.slug,
        "description": c.description,
        "image_url": c.image_url,
        "match_type": c.match_type,
        "rules_match": c.rules_match,
        "rules": list(c.rules or []),
        "rules_explained": [rules_engine.describe(r) for r in (c.rules or [])],
        "sort_by": c.sort_by,
        "is_active": bool(c.is_active),
        "published_at": c.published_at.isoformat() if c.published_at else None,
        "position": c.position,
        "seo_title": c.seo_title,
        "seo_description": c.seo_description,
        "product_count": product_count,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


async def _load(db: AsyncSession, collection_id: uuid.UUID) -> Collection:
    """This brand's collection, or a 404.

    The session is tenant-scoped, so another brand's id simply is not found —
    which is the right answer, and says nothing about whether it exists.
    """
    collection = (await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )).scalar_one_or_none()
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def _apply(collection: Collection, data: dict) -> None:
    if "match_type" in data and data["match_type"] not in MATCH_TYPES:
        raise HTTPException(status_code=400, detail='A collection is "manual" or "automatic".')
    if "rules_match" in data and data["rules_match"] not in RULES_MATCH:
        raise HTTPException(status_code=400, detail='Conditions are combined with "all" or "any".')
    if "sort_by" in data and data["sort_by"] not in SORT_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown sort order '{data['sort_by']}'")

    for key, value in data.items():
        if key == "rules":
            continue
        setattr(collection, key, value)


def _validated_rules(rules, rules_match: str) -> list[dict]:
    try:
        return rules_engine.validate(
            [r.model_dump() if hasattr(r, "model_dump") else r for r in (rules or [])],
            rules_match,
        )
    except rules_engine.RuleError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/rule-options")
async def rule_options(_: None = Depends(require_admin)) -> dict:
    """What the condition builder can offer — fields and their operators."""
    return rules_engine.catalogue()


@router.get("")
async def list_collections(
    q: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    include_counts: bool = Query(True),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    query = select(Collection).order_by(Collection.position, func.lower(Collection.name))
    if q:
        query = query.where(Collection.name.ilike(f"%{q.strip()}%"))
    if active is not None:
        query = query.where(Collection.is_active == active)

    rows = list((await db.execute(query)).scalars().all())
    out = []
    for collection in rows:
        # Counting an automatic collection runs its rules, so it is optional:
        # a list of fifty collections should not be fifty catalogue scans
        # unless somebody asked to see the numbers.
        count = await svc.count_products(db, collection) if include_counts else None
        out.append(_row(collection, count))
    return out


@router.post("", status_code=201)
async def create_collection(
    payload: CollectionIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    rules = _validated_rules(payload.rules, payload.rules_match)

    collection = Collection(name=payload.name)
    data.pop("name", None)
    slug = data.pop("slug", None)
    _apply(collection, data)
    collection.rules = rules
    collection.slug = (
        svc.slugify(slug) if slug else await svc.unique_slug(db, payload.name)
    )
    # Read from the payload, not from the model: `exclude_unset` drops a field
    # the caller left at its default, so the attribute is still unset here and
    # a collection created without saying `is_active` would never be dated.
    collection.is_active = payload.is_active
    if payload.is_active:
        collection.published_at = datetime.now(timezone.utc)

    db.add(collection)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f'You already have a collection at "{collection.slug}".',
        )
    await db.refresh(collection)
    return _row(collection, await svc.count_products(db, collection))


@router.get("/{collection_id}")
async def get_collection(
    collection_id: uuid.UUID,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    collection = await _load(db, collection_id)
    return _row(collection, await svc.count_products(db, collection))


@router.patch("/{collection_id}")
async def update_collection(
    collection_id: uuid.UUID,
    payload: CollectionPatch,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    collection = await _load(db, collection_id)
    data = payload.model_dump(exclude_unset=True)

    if "rules" in data or "rules_match" in data:
        match = data.get("rules_match", collection.rules_match)
        rules = _validated_rules(
            data.get("rules", collection.rules), match
        )
    else:
        rules = None

    was_active = collection.is_active
    slug = data.pop("slug", None)
    _apply(collection, data)
    if rules is not None:
        collection.rules = rules
    if slug:
        collection.slug = svc.slugify(slug)

    # First time it goes live, and only the first time: switching it off and on
    # again should not rewrite when it started showing.
    if collection.is_active and not was_active and collection.published_at is None:
        collection.published_at = datetime.now(timezone.utc)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f'You already have a collection at "{collection.slug}".',
        )
    await db.refresh(collection)
    return _row(collection, await svc.count_products(db, collection))


@router.delete("/{collection_id}", status_code=200)
async def delete_collection(
    collection_id: uuid.UUID,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    collection = await _load(db, collection_id)
    name = collection.name
    # Products are not touched. A collection is a way of looking at the
    # catalogue; deleting the view must never delete what it was looking at.
    await db.delete(collection)
    await db.commit()
    return {"success": True, "message": f'"{name}" deleted. Its products were not.'}


@router.get("/{collection_id}/products")
async def list_collection_products(
    collection_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    collection = await _load(db, collection_id)
    total = await svc.count_products(db, collection)
    rows = await svc.list_products(
        db, collection, offset=(page - 1) * page_size, limit=page_size
    )
    return {
        "total": total, "page": page, "page_size": page_size,
        "automatic": collection.match_type == "automatic",
        "items": [
            {
                "id": str(p.id), "name": p.name, "slug": p.slug, "status": p.status,
                "product_type": p.product_type, "vendor": p.vendor,
                "tags": list(p.tags or []),
            }
            for p in rows
        ],
    }


@router.post("/{collection_id}/products")
async def add_products(
    collection_id: uuid.UUID,
    payload: MembersIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Put products in a collection by hand.

    Refused on an automatic collection: its membership is decided by its rules,
    and a hand-picked product would be dropped again the moment the rules were
    next read. Saying so is better than pretending it worked.
    """
    collection = await _load(db, collection_id)
    if collection.match_type == "automatic":
        raise HTTPException(
            status_code=400,
            detail="This collection fills itself from its conditions. "
                   "Switch it to manual to choose products yourself.",
        )
    if not payload.product_ids:
        return {"added": 0}

    # Only this brand's products: the session is scoped, so anything belonging
    # to another brand simply does not come back.
    owned = set((await db.execute(
        select(Product.id).where(Product.id.in_(payload.product_ids))
    )).scalars().all())
    if not owned:
        raise HTTPException(status_code=404, detail="None of those products were found")

    existing = set((await db.execute(
        select(CollectionProduct.product_id)
        .where(CollectionProduct.collection_id == collection.id)
    )).scalars().all())
    next_position = (await db.execute(
        select(func.coalesce(func.max(CollectionProduct.position), -1))
        .where(CollectionProduct.collection_id == collection.id)
    )).scalar_one() + 1

    added = 0
    for product_id in payload.product_ids:
        if product_id not in owned or product_id in existing:
            continue
        db.add(CollectionProduct(
            collection_id=collection.id, product_id=product_id, position=next_position,
        ))
        next_position += 1
        added += 1

    await db.commit()
    return {"added": added, "skipped": len(payload.product_ids) - added}


@router.delete("/{collection_id}/products")
async def remove_products(
    collection_id: uuid.UUID,
    payload: MembersIn = Body(...),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    collection = await _load(db, collection_id)
    if collection.match_type == "automatic":
        raise HTTPException(
            status_code=400,
            detail="This collection fills itself from its conditions. "
                   "Change the conditions to change what is in it.",
        )
    if not payload.product_ids:
        return {"removed": 0}

    result = await db.execute(
        delete(CollectionProduct).where(
            CollectionProduct.collection_id == collection.id,
            CollectionProduct.product_id.in_(payload.product_ids),
        )
    )
    await db.commit()
    return {"removed": result.rowcount or 0}


@router.patch("/{collection_id}/reorder")
async def reorder_products(
    collection_id: uuid.UUID,
    payload: ReorderIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The order products appear in, for a hand-picked collection."""
    collection = await _load(db, collection_id)
    if collection.match_type == "automatic":
        raise HTTPException(
            status_code=400,
            detail="An automatic collection is ordered by its sort setting, not by hand.",
        )
    rows = {
        row.product_id: row for row in (await db.execute(
            select(CollectionProduct).where(CollectionProduct.collection_id == collection.id)
        )).scalars().all()
    }
    for position, product_id in enumerate(payload.product_ids):
        row = rows.get(product_id)
        if row is not None:
            row.position = position
    collection.sort_by = "manual"
    await db.commit()
    return {"success": True, "ordered": len(payload.product_ids)}


@router.post("/preview")
async def preview_rules(
    payload: PreviewIn,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """What these conditions would hold, without saving them."""
    rules = _validated_rules(payload.rules, payload.rules_match)
    return await svc.preview(db, payload.match_type, rules, payload.rules_match)
