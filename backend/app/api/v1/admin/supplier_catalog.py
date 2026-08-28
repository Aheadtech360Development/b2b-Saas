"""Admin: S&S Activewear supplier catalog management.

Endpoints:
  GET  /admin/supplier-catalog/categories          — list categories
  GET  /admin/supplier-catalog/products            — browse catalog
  GET  /admin/supplier-catalog/products/{style_id} — product detail + variants
  POST /admin/supplier-catalog/products/{style_id}/import
                                                    — one-click import to tenant catalog
  GET  /admin/supplier-catalog/sync-status         — recent sync logs
  POST /admin/supplier-catalog/sync/trigger        — manual sync trigger
  GET  /admin/supplier-catalog/markup-rules        — list markup rules
  POST /admin/supplier-catalog/markup-rules        — create/update markup rule
  PUT  /admin/supplier-catalog/markup-rules/{id}   — update a rule
  DELETE /admin/supplier-catalog/markup-rules/{id} — delete a rule
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel as PydanticModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.redis import redis_delete_pattern, tenant_cache_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/supplier-catalog", tags=["admin", "supplier-catalog"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SSCategoryOut(PydanticModel):
    id: str
    name: str
    gender: str | None
    product_count: int
    is_active: bool

    class Config:
        from_attributes = True


class SSProductListItem(PydanticModel):
    id: str
    style_id: str
    style_name: str
    brand_name: str | None
    category_name: str | None
    gender_name: str | None
    piece_price: float | None
    case_price: float | None
    case_size: int | None
    front_image: str | None
    color_count: int
    is_imported: bool
    imported_product_id: str | None
    last_synced_at: str | None

    class Config:
        from_attributes = True


class SSVariantOut(PydanticModel):
    id: str
    sku: str
    color_name: str | None
    color_code: str | None
    size_name: str | None
    piece_price: float | None
    front_image: str | None
    back_image: str | None
    side_image: str | None
    color_swatch: str | None
    qty_on_hand: int
    last_inventory_sync: str | None

    class Config:
        from_attributes = True


class SSProductDetailOut(SSProductListItem):
    description: str | None
    keywords: str | None
    variants: list[SSVariantOut] = []


class SSMarkupRuleOut(PydanticModel):
    id: str
    rule_type: str
    target_value: str | None
    markup_pct: float
    markup_fixed: float
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


class MarkupRuleCreate(PydanticModel):
    rule_type: str  # global | category | brand | product
    target_value: str | None = None
    markup_pct: float = 0.0
    markup_fixed: float = 0.0
    is_active: bool = True


class SyncLogOut(PydanticModel):
    id: str
    sync_type: str
    status: str
    started_at: str
    completed_at: str | None
    records_fetched: int
    records_upserted: int
    error_message: str | None

    class Config:
        from_attributes = True


class ImportResult(PydanticModel):
    success: bool
    product_id: str | None = None
    product_slug: str | None = None
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def _to_str(v: object) -> str | None:
    return str(v) if v is not None else None


def _apply_best_markup(
    wholesale: float,
    rules: list,
    category: str | None,
    brand: str | None,
    style_id: str,
) -> float:
    best = None
    best_priority = -1
    for rule in rules:
        if not rule.is_active:
            continue
        rt = rule.rule_type
        tv = rule.target_value or ""
        if rt == "product" and tv == style_id:
            priority = 3
        elif rt == "brand" and tv == brand:
            priority = 2
        elif rt == "category" and tv == category:
            priority = 1
        elif rt == "global":
            priority = 0
        else:
            continue
        if priority > best_priority:
            best_priority = priority
            best = rule
    if best is None:
        return round(wholesale * 1.40, 2)
    pct = float(best.markup_pct or 0)
    fixed = float(best.markup_fixed or 0)
    return round(wholesale * (1 + pct / 100) + fixed, 2)


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[SSCategoryOut])
async def list_ss_categories(
    db: AsyncSession = Depends(get_db),
    is_active: bool = True,
):
    from app.models.supplier import SSCategory
    result = await db.execute(
        select(SSCategory)
        .where(SSCategory.is_active == is_active)
        .order_by(SSCategory.name)
    )
    rows = result.scalars().all()
    return [SSCategoryOut(
        id=str(r.id),
        name=r.name,
        gender=r.gender,
        product_count=r.product_count,
        is_active=r.is_active,
    ) for r in rows]


# ── Products browse ───────────────────────────────────────────────────────────

@router.get("/products", response_model=dict)
async def list_ss_products(
    db: AsyncSession = Depends(get_db),
    q: str | None = None,
    category: str | None = None,
    brand: str | None = None,
    gender: str | None = None,
    imported_only: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 48,
):
    from app.models.supplier import SSProduct

    query = select(SSProduct)

    if q:
        query = query.where(
            or_(
                SSProduct.style_name.ilike(f"%{q}%"),
                SSProduct.style_id.ilike(f"%{q}%"),
                SSProduct.brand_name.ilike(f"%{q}%"),
                SSProduct.keywords.ilike(f"%{q}%"),
            )
        )
    if category:
        query = query.where(SSProduct.category_name == category)
    if brand:
        query = query.where(SSProduct.brand_name == brand)
    if gender:
        query = query.where(SSProduct.gender_name.ilike(f"%{gender}%"))
    if imported_only:
        query = query.where(SSProduct.is_imported.is_(True))

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    query = query.order_by(SSProduct.brand_name, SSProduct.style_name)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    products = result.scalars().all()

    items = [SSProductListItem(
        id=str(p.id),
        style_id=p.style_id,
        style_name=p.style_name,
        brand_name=p.brand_name,
        category_name=p.category_name,
        gender_name=p.gender_name,
        piece_price=float(p.piece_price) if p.piece_price is not None else None,
        case_price=float(p.case_price) if p.case_price is not None else None,
        case_size=p.case_size,
        front_image=p.front_image,
        color_count=p.color_count,
        is_imported=p.is_imported,
        imported_product_id=_to_str(p.imported_product_id),
        last_synced_at=p.last_synced_at.isoformat() if p.last_synced_at else None,
    ) for p in products]

    return {
        "items": [i.model_dump() for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


@router.get("/products/{style_id}", response_model=SSProductDetailOut)
async def get_ss_product(style_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.supplier import SSProduct

    result = await db.execute(
        select(SSProduct)
        .options(selectinload(SSProduct.variants))
        .where(SSProduct.style_id == style_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found in supplier catalog")

    return SSProductDetailOut(
        id=str(p.id),
        style_id=p.style_id,
        style_name=p.style_name,
        brand_name=p.brand_name,
        category_name=p.category_name,
        gender_name=p.gender_name,
        description=p.description,
        keywords=p.keywords,
        piece_price=float(p.piece_price) if p.piece_price is not None else None,
        case_price=float(p.case_price) if p.case_price is not None else None,
        case_size=p.case_size,
        front_image=p.front_image,
        color_count=p.color_count,
        is_imported=p.is_imported,
        imported_product_id=_to_str(p.imported_product_id),
        last_synced_at=p.last_synced_at.isoformat() if p.last_synced_at else None,
        variants=[
            SSVariantOut(
                id=str(v.id),
                sku=v.sku,
                color_name=v.color_name,
                color_code=v.color_code,
                size_name=v.size_name,
                piece_price=float(v.piece_price) if v.piece_price is not None else None,
                front_image=v.front_image,
                back_image=v.back_image,
                side_image=v.side_image,
                color_swatch=v.color_swatch,
                qty_on_hand=v.qty_on_hand,
                last_inventory_sync=v.last_inventory_sync.isoformat() if v.last_inventory_sync else None,
            )
            for v in p.variants
        ],
    )


# ── One-click import ──────────────────────────────────────────────────────────

_LBS_TO_GRAMS = 453.59237


@router.post("/products/{style_id}/import", response_model=ImportResult)
async def import_ss_product(style_id: str, db: AsyncSession = Depends(get_db)):
    """Import an S&S style into THIS brand's catalog with every colour/size variant.

    The S&S Products API returns a FLAT list of SKUs (one object per colour+size),
    not a nested colours→sizes tree. We therefore:
      1. Pull the style header (title/description/brand/category) from the Styles API.
      2. Pull every SKU for the style from the Products API (?styleid=).
      3. Group SKUs by colour → one ProductImage per colour, one ProductVariant per SKU.
      4. Map real fields: customerPrice→cost, markup→retail, retailPrice→msrp,
         unitWeight(lbs)→weight_grams, qty→stock, image paths→absolute URLs.

    The "already imported" check is per-brand (Product is tenant-scoped), so two
    brands can each import the same style.
    """
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.product import Product, ProductImage, ProductVariant
    from app.models.supplier import SSMarkupRule, SSProduct
    from app.services.ss_activewear_service import SSActivewearService, ss_image_url

    # Per-brand guard: has THIS brand already imported this style? Product is a
    # TenantMixin model, so this query only ever sees the current brand's rows.
    already = (await db.execute(
        select(Product).where(Product.product_code == style_id)
    )).scalar_one_or_none()
    if already:
        return ImportResult(
            success=True, product_id=str(already.id), product_slug=already.slug,
            message="Already imported",
        )

    # Optional cached catalog row — used only for markup category/brand hints.
    ss_product = (await db.execute(
        select(SSProduct).where(SSProduct.style_id == style_id)
    )).scalar_one_or_none()

    # ── Fetch live from S&S: style header + every SKU ─────────────────────────
    svc = SSActivewearService()
    try:
        style = await svc.fetch_style(style_id) or {}
        skus = await svc.fetch_products_by_style(style_id)
    finally:
        await svc.close()

    if not skus:
        raise HTTPException(
            status_code=502,
            detail="Could not fetch this style's products from S&S. Check the API key / VPN and that the style ID is valid.",
        )

    first = skus[0]
    brand = style.get("brandName") or first.get("brandName") or (ss_product.brand_name if ss_product else None)
    style_name = style.get("styleName") or first.get("styleName") or style_id
    title = style.get("title")
    description = style.get("description") or title
    base_category = style.get("baseCategory") or (ss_product.category_name if ss_product else None)
    product_name = " ".join(p for p in (brand, style_name) if p).strip() or str(style_id)

    markup_rules = (await db.execute(
        select(SSMarkupRule).where(SSMarkupRule.is_active.is_(True))
    )).scalars().all()

    # Unique slug (slug is globally unique on products).
    base_slug = _slugify(f"{product_name}-{style_id}")
    slug = base_slug
    counter = 1
    while (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none():
        slug = f"{base_slug}-{counter}"
        counter += 1

    new_product = Product(
        name=product_name,
        slug=slug,
        description=description,
        short_description=title,
        vendor=brand or "S&S Activewear",
        product_code=style_id,
        product_type=base_category,
        status="active",
    )
    db.add(new_product)
    await db.flush()

    # Default warehouse for this brand (created on first import if none exists).
    warehouse = (await db.execute(
        select(Warehouse).where(Warehouse.is_active.is_(True)).limit(1)
    )).scalar_one_or_none()
    if not warehouse:
        warehouse = Warehouse(name="Default Warehouse", code=f"WH-{str(new_product.id)[:8]}", country="US")
        db.add(warehouse)
        await db.flush()

    # ── One image per colour + one variant per SKU ────────────────────────────
    seen_colors: dict[str, bool] = {}
    image_sort = 0
    variant_sort = 0

    for sku in skus:
        color_name = sku.get("colorName") or "Default"

        if color_name not in seen_colors:
            seen_colors[color_name] = True
            large = ss_image_url(sku.get("colorFrontImage"), "large")
            if large:
                db.add(ProductImage(
                    product_id=new_product.id,
                    url_thumbnail=ss_image_url(sku.get("colorFrontImage"), "small") or large,
                    url_medium=ss_image_url(sku.get("colorFrontImage"), "medium") or large,
                    url_large=large,
                    alt_text=f"{product_name} - {color_name}",
                    is_primary=(image_sort == 0),
                    sort_order=image_sort,
                ))
                image_sort += 1

        real_sku = str(
            sku.get("sku") or sku.get("gtin")
            or f"{style_id}-{sku.get('colorCode', '')}-{sku.get('sizeCode', '')}"
        )
        cost = float(sku.get("customerPrice") or sku.get("piecePrice") or 0)
        retail = _apply_best_markup(cost, markup_rules, base_category, brand, style_id)
        msrp = float(sku.get("retailPrice") or 0) or None

        weight_g = None
        if sku.get("unitWeight"):
            try:
                weight_g = round(float(sku["unitWeight"]) * _LBS_TO_GRAMS, 2)
            except (TypeError, ValueError):
                weight_g = None

        # Inventory: combined qty when present, else sum across warehouses.
        qty = sku.get("qty")
        if qty is None:
            qty = sum(int(w.get("qty") or 0) for w in (sku.get("warehouses") or []))
        qty = int(qty or 0)

        pv = ProductVariant(
            product_id=new_product.id,
            sku=real_sku,
            color=color_name,
            size=sku.get("sizeName") or "OS",
            retail_price=retail,
            cost_per_item=cost,
            msrp=msrp,
            compare_price=msrp,
            country_of_origin=sku.get("countryOfOrigin"),
            weight_grams=weight_g,
            status="active",
            sort_order=variant_sort,
        )
        db.add(pv)
        await db.flush()
        variant_sort += 1

        db.add(InventoryRecord(
            variant_id=pv.id,
            warehouse_id=warehouse.id,
            quantity=qty,
            low_stock_threshold=10,
        ))

    # Best-effort: point the global catalog cache at the first importer.
    if ss_product is not None and not ss_product.is_imported:
        ss_product.is_imported = True
        ss_product.imported_product_id = new_product.id

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        # SKU/slug are unique PER BRAND now (migration 0028), so two brands can
        # import the same style. A collision here means THIS brand already has a
        # product/variant using one of these SKUs (a manual product or a partial
        # re-import) — report it clearly rather than 500.
        logger.warning("S&S import commit failed for style %s: %s", style_id, exc)
        raise HTTPException(
            status_code=409,
            detail="Couldn't import — one of this style's SKUs already exists in your catalog (a manual product or an earlier import). Remove the duplicate and try again.",
        )
    await db.refresh(new_product)

    try:
        await redis_delete_pattern(tenant_cache_key("products:*"))
    except Exception:
        pass

    logger.info(
        "Imported S&S style %s → product %s (%d variants, %d colours)",
        style_id, new_product.id, variant_sort, len(seen_colors),
    )
    return ImportResult(
        success=True,
        product_id=str(new_product.id),
        product_slug=new_product.slug,
        message=f"Imported '{product_name}' — {variant_sort} variants across {len(seen_colors)} colour(s).",
    )


# ── Live import picker: search S&S styles without a full sync ──────────────────
@router.get("/search")
async def search_ss_styles(
    q: Annotated[str, Query(min_length=2)],
    db: AsyncSession = Depends(get_db),
):
    """Live-search S&S styles (brand / name / number) so the admin can import any
    specific style directly, without depending on a full catalogue sync.

    Marks styles this brand has already imported (by product_code)."""
    from app.models.product import Product
    from app.services.ss_activewear_service import SSActivewearService, ss_image_url

    svc = SSActivewearService()
    try:
        styles = await svc.search_styles(q)
    finally:
        await svc.close()

    # Which of these has THIS brand already imported? (tenant-scoped)
    style_ids = [str(s.get("styleID")) for s in styles if s.get("styleID") is not None]
    imported: set[str] = set()
    if style_ids:
        rows = (await db.execute(
            select(Product.product_code).where(Product.product_code.in_(style_ids))
        )).scalars().all()
        imported = {str(r) for r in rows if r}

    out = []
    for s in styles[:60]:
        sid = str(s.get("styleID")) if s.get("styleID") is not None else None
        out.append({
            "style_id": sid,
            "part_number": s.get("partNumber"),
            "brand_name": s.get("brandName"),
            "style_name": s.get("styleName"),
            "title": s.get("title"),
            "image": ss_image_url(s.get("styleImage"), "medium"),
            "is_imported": sid in imported,
        })
    return {"items": out, "total": len(out)}


# ── Sync status & manual trigger ──────────────────────────────────────────────

@router.get("/sync-status", response_model=dict)
async def get_sync_status(
    db: AsyncSession = Depends(get_db),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    from app.models.supplier import SSSyncLog

    result = await db.execute(
        select(SSSyncLog)
        .order_by(desc(SSSyncLog.started_at))
        .limit(limit)
    )
    logs = result.scalars().all()

    # Latest per type
    latest: dict[str, dict] = {}
    for log in logs:
        if log.sync_type not in latest:
            latest[log.sync_type] = {
                "status": log.status,
                "last_run": log.started_at.isoformat() if log.started_at else None,
                "completed_at": log.completed_at.isoformat() if log.completed_at else None,
                "records_upserted": log.records_upserted,
                "error": log.error_message,
            }

    history = [SyncLogOut(
        id=str(l.id),
        sync_type=l.sync_type,
        status=l.status,
        started_at=l.started_at.isoformat(),
        completed_at=l.completed_at.isoformat() if l.completed_at else None,
        records_fetched=l.records_fetched,
        records_upserted=l.records_upserted,
        error_message=l.error_message,
    ).model_dump() for l in logs]

    return {"latest_by_type": latest, "history": history}


@router.post("/sync/trigger")
async def trigger_manual_sync(sync_type: str = Query("products")):
    """Enqueue an immediate Celery sync task."""
    allowed = {"categories", "products", "inventory"}
    if sync_type not in allowed:
        raise HTTPException(status_code=400, detail=f"sync_type must be one of {allowed}")

    from app.tasks.supplier_sync_tasks import (
        sync_ss_categories,
        sync_ss_inventory,
        sync_ss_products,
    )

    task_map = {
        "categories": sync_ss_categories,
        "products": sync_ss_products,
        "inventory": sync_ss_inventory,
    }
    task = task_map[sync_type]
    result = task.delay()

    return {"status": "queued", "task_id": result.id, "sync_type": sync_type}


# ── Markup rules CRUD ─────────────────────────────────────────────────────────

@router.get("/markup-rules", response_model=list[SSMarkupRuleOut])
async def list_markup_rules(db: AsyncSession = Depends(get_db)):
    from app.models.supplier import SSMarkupRule
    result = await db.execute(
        select(SSMarkupRule).order_by(SSMarkupRule.rule_type, SSMarkupRule.target_value)
    )
    rows = result.scalars().all()
    return [SSMarkupRuleOut(
        id=str(r.id),
        rule_type=r.rule_type,
        target_value=r.target_value,
        markup_pct=float(r.markup_pct),
        markup_fixed=float(r.markup_fixed),
        is_active=r.is_active,
        created_at=r.created_at.isoformat() if r.created_at else "",
    ) for r in rows]


@router.post("/markup-rules", response_model=SSMarkupRuleOut, status_code=201)
async def create_markup_rule(body: MarkupRuleCreate, db: AsyncSession = Depends(get_db)):
    from app.models.supplier import SSMarkupRule

    valid_types = {"global", "category", "brand", "product"}
    if body.rule_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"rule_type must be one of {valid_types}")

    rule = SSMarkupRule(
        rule_type=body.rule_type,
        target_value=body.target_value,
        markup_pct=body.markup_pct,
        markup_fixed=body.markup_fixed,
        is_active=body.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    return SSMarkupRuleOut(
        id=str(rule.id),
        rule_type=rule.rule_type,
        target_value=rule.target_value,
        markup_pct=float(rule.markup_pct),
        markup_fixed=float(rule.markup_fixed),
        is_active=rule.is_active,
        created_at=rule.created_at.isoformat() if rule.created_at else "",
    )


@router.put("/markup-rules/{rule_id}", response_model=SSMarkupRuleOut)
async def update_markup_rule(
    rule_id: str,
    body: MarkupRuleCreate,
    db: AsyncSession = Depends(get_db),
):
    from app.models.supplier import SSMarkupRule

    try:
        uid = uuid.UUID(rule_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rule_id")

    res = await db.execute(select(SSMarkupRule).where(SSMarkupRule.id == uid))
    rule = res.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    rule.rule_type = body.rule_type
    rule.target_value = body.target_value
    rule.markup_pct = body.markup_pct
    rule.markup_fixed = body.markup_fixed
    rule.is_active = body.is_active
    await db.commit()
    await db.refresh(rule)

    return SSMarkupRuleOut(
        id=str(rule.id),
        rule_type=rule.rule_type,
        target_value=rule.target_value,
        markup_pct=float(rule.markup_pct),
        markup_fixed=float(rule.markup_fixed),
        is_active=rule.is_active,
        created_at=rule.created_at.isoformat() if rule.created_at else "",
    )


@router.delete("/markup-rules/{rule_id}", status_code=204)
async def delete_markup_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.supplier import SSMarkupRule

    try:
        uid = uuid.UUID(rule_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rule_id")

    res = await db.execute(select(SSMarkupRule).where(SSMarkupRule.id == uid))
    rule = res.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.delete(rule)
    await db.commit()
