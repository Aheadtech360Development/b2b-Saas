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
from app.core.redis import redis_delete_pattern

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

@router.post("/products/{style_id}/import", response_model=ImportResult)
async def import_ss_product(style_id: str, db: AsyncSession = Depends(get_db)):
    """
    Import an S&S catalog product into the tenant's product catalog.

    Flow:
    1. Fetch full product detail + variants from S&S API.
    2. Apply markup rules to set retail_price.
    3. Create Product + ProductVariants + ProductImages in existing tables.
    4. Create InventoryRecord rows with current S&S stock levels.
    5. Mark SSProduct.is_imported = True.
    """
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.product import Product, ProductCategory, ProductImage, ProductVariant
    from app.models.supplier import SSMarkupRule, SSProduct, SSVariant
    from app.services.ss_activewear_service import SSActivewearService

    # Check if already imported
    res = await db.execute(select(SSProduct).where(SSProduct.style_id == style_id))
    ss_product = res.scalar_one_or_none()
    if not ss_product:
        raise HTTPException(status_code=404, detail="Style not found in supplier catalog")
    if ss_product.is_imported and ss_product.imported_product_id:
        return ImportResult(
            success=True,
            product_id=str(ss_product.imported_product_id),
            message="Already imported",
        )

    # Fetch full detail from S&S API
    svc = SSActivewearService()
    try:
        detail = await svc.fetch_product_detail(style_id)
    finally:
        await svc.close()

    if not detail:
        raise HTTPException(status_code=502, detail="Could not fetch product detail from S&S API")

    # Load markup rules
    rules_res = await db.execute(
        select(SSMarkupRule).where(SSMarkupRule.is_active.is_(True))
    )
    markup_rules = rules_res.scalars().all()

    # ── Create Product ────────────────────────────────────────────────────────
    base_slug = _slugify(
        f"{detail.get('styleName') or detail.get('title') or style_id}-{style_id}"
    )
    # Ensure unique slug
    slug = base_slug
    counter = 1
    while True:
        existing = await db.execute(select(Product).where(Product.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    wholesale_price = float(
        detail.get("piecePrice") or detail.get("partPrice") or ss_product.piece_price or 0
    )
    retail_price = _apply_best_markup(
        wholesale_price,
        markup_rules,
        ss_product.category_name,
        ss_product.brand_name,
        style_id,
    )

    new_product = Product(
        name=detail.get("styleName") or detail.get("title") or style_id,
        slug=slug,
        description=detail.get("description"),
        vendor="S&S Activewear",
        product_code=style_id,
        product_type=detail.get("categoryName") or ss_product.category_name,
        gender=detail.get("genderName") or ss_product.gender_name,
        status="active",
    )
    db.add(new_product)
    await db.flush()  # get new_product.id

    # ── Get or create default warehouse ──────────────────────────────────────
    wh_res = await db.execute(select(Warehouse).where(Warehouse.is_active.is_(True)).limit(1))
    warehouse = wh_res.scalar_one_or_none()
    if not warehouse:
        warehouse = Warehouse(name="S&S Activewear", code="SS-DEFAULT", country="US")
        db.add(warehouse)
        await db.flush()

    # ── Build variants from colors/sizes ─────────────────────────────────────
    colors: list[dict] = detail.get("colors") or []
    image_sort = 0
    is_first_image = True
    ss_variant_rows: list[SSVariant] = []

    for color in colors:
        color_name = color.get("colorName") or color.get("color") or "N/A"
        color_code = color.get("colorCode") or color.get("code") or ""
        front_img = color.get("frontImage") or color.get("colorFrontImage")
        back_img = color.get("backImage") or color.get("colorBackImage")
        side_img = color.get("sideImage") or color.get("colorSideImage")
        swatch = color.get("colorSquareImage") or color.get("swatchImage")

        # Create ProductImage for this color
        if front_img:
            db.add(ProductImage(
                product_id=new_product.id,
                url_thumbnail=front_img,
                url_medium=front_img,
                url_large=front_img,
                alt_text=f"{new_product.name} - {color_name}",
                is_primary=is_first_image,
                sort_order=image_sort,
            ))
            image_sort += 1
            is_first_image = False

        sizes: list[dict] = color.get("sizes") or []
        size_sort = 0
        for size in sizes:
            sku = (
                size.get("sku")
                or size.get("gtin")
                or f"{style_id}-{color_code}-{size.get('sizeName', 'OS')}"
            )
            size_name = size.get("sizeName") or size.get("size") or "OS"
            v_price = float(size.get("piecePrice") or color.get("piecePrice") or wholesale_price or 0)
            retail = _apply_best_markup(
                v_price,
                markup_rules,
                ss_product.category_name,
                ss_product.brand_name,
                style_id,
            )

            pv = ProductVariant(
                product_id=new_product.id,
                sku=sku,
                color=color_name,
                size=size_name,
                retail_price=retail,
                cost_per_item=v_price,
                status="active",
                sort_order=size_sort,
            )
            db.add(pv)
            await db.flush()

            qty = int(size.get("qty") or size.get("onHandQty") or 0)
            db.add(InventoryRecord(
                variant_id=pv.id,
                warehouse_id=warehouse.id,
                quantity=qty,
                low_stock_threshold=10,
            ))

            # Track in ss_variants for ongoing inventory sync
            ss_var = SSVariant(
                ss_product_id=ss_product.id,
                style_id=style_id,
                sku=sku,
                gtin=size.get("gtin"),
                color_name=color_name,
                color_code=color_code,
                size_name=size_name,
                piece_price=v_price,
                front_image=front_img,
                back_image=back_img,
                side_image=side_img,
                color_swatch=swatch,
                qty_on_hand=qty,
                last_inventory_sync=datetime.now(timezone.utc),
            )
            db.add(ss_var)
            size_sort += 1

    # If no colors/sizes in detail, fall back to creating a single generic variant
    if not colors:
        pv = ProductVariant(
            product_id=new_product.id,
            sku=f"{style_id}-OS",
            retail_price=retail_price,
            cost_per_item=wholesale_price,
            status="active",
            sort_order=0,
        )
        db.add(pv)
        await db.flush()
        db.add(InventoryRecord(
            variant_id=pv.id,
            warehouse_id=warehouse.id,
            quantity=0,
            low_stock_threshold=10,
        ))
        db.add(SSVariant(
            ss_product_id=ss_product.id,
            style_id=style_id,
            sku=f"{style_id}-OS",
            qty_on_hand=0,
            last_inventory_sync=datetime.now(timezone.utc),
        ))

    # ── Mark as imported ──────────────────────────────────────────────────────
    ss_product.is_imported = True
    ss_product.imported_product_id = new_product.id

    await db.commit()
    await db.refresh(new_product)

    # Invalidate product cache
    try:
        await redis_delete_pattern("product:*")
    except Exception:
        pass

    logger.info("Imported S&S style %s → product %s (slug=%s)", style_id, new_product.id, new_product.slug)

    return ImportResult(
        success=True,
        product_id=str(new_product.id),
        product_slug=new_product.slug,
        message=f"Imported successfully as '{new_product.name}'",
    )


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
