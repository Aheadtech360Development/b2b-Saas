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
    style_names: tuple[str | None, ...] = (),
) -> float:
    """Most specific active rule wins: style, then brand, then category, then all.

    Names compare case-insensitively, and a style rule may name the style by
    S&S's internal id or by the number people actually know it by ("3001").
    """
    def norm(v) -> str:
        return str(v or "").strip().lower()

    styles = {norm(style_id), *(norm(n) for n in style_names if n)}
    best = None
    best_priority = -1
    for rule in rules:
        if not rule.is_active:
            continue
        rt = rule.rule_type
        tv = norm(rule.target_value)
        if rt == "product" and tv and tv in styles:
            priority = 3
        elif rt == "brand" and tv and tv == norm(brand):
            priority = 2
        elif rt == "category" and tv and tv in {norm(c) for c in str(category or "").split(",")}:
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
    from app.models.product import Product
    from app.models.supplier import SSProduct
    from app.services.ss_activewear_service import for_tenant as ss_for_tenant
    from app.services.suppliers import config as supplier_cfg
    from app.services.suppliers import ss_products

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

    # Optional cached catalog row — marked imported below, best-effort.
    ss_product = (await db.execute(
        select(SSProduct).where(SSProduct.style_id == style_id)
    )).scalar_one_or_none()

    # ── Fetch live from S&S: style header + every SKU ─────────────────────────
    svc = await ss_for_tenant(db)   # this brand's own S&S account
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
    style = {
        **style,
        "styleID": style.get("styleID") or style_id,
        "brandName": style.get("brandName") or first.get("brandName"),
        "styleName": style.get("styleName") or first.get("styleName") or style_id,
    }

    # Everything else — which fields, prices, variant limit, stock per
    # location — follows the brand's supplier setup, same as its syncs.
    cfg = await supplier_cfg.load(db, "ss_activewear")
    try:
        new_product = await ss_products.create_product(db, style, skus, cfg)
    except ss_products.SkipProduct as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Not imported — this style {exc}. Raise the limit in Suppliers → Edit → Automatic Sync.",
        )

    if ss_product is not None and not ss_product.is_imported:
        ss_product.is_imported = True
        ss_product.imported_product_id = new_product.id

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        # SKU/slug are unique PER BRAND (migration 0028). A collision here means
        # THIS brand already has a product/variant using one of these SKUs.
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

    n_variants = len(ss_products.limit_skus(skus, cfg))
    n_colors = len({r.get("colorName") for r in skus})
    logger.info("Imported S&S style %s → product %s (%d variants)", style_id, new_product.id, n_variants)
    return ImportResult(
        success=True,
        product_id=str(new_product.id),
        product_slug=new_product.slug,
        message=f"Imported '{new_product.name}' — {n_variants} variants across {n_colors} colour(s).",
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
    from app.services.ss_activewear_service import for_tenant as ss_for_tenant, ss_image_url

    svc = await ss_for_tenant(db)   # this brand's own S&S account
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
    """Enqueue an immediate sync of THIS brand's supplier catalogue."""
    from app.core.tenant_context import get_current_tenant_id
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
    # The worker has no request context, so the brand travels with the task —
    # it decides both which S&S account is read and who the rows belong to.
    tenant_id = get_current_tenant_id()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No store context on this request")

    task = task_map[sync_type]
    result = task.delay(str(tenant_id))

    return {"status": "queued", "task_id": result.id, "sync_type": sync_type}


# ── Markup rules CRUD ─────────────────────────────────────────────────────────

# These endpoints used the global ss_markup_rules table, which has no brand
# column: every brand saw, edited and was priced by every other brand's rules.
# They now read and write the brand's own pricing rules in its supplier setup,
# translating between the old rule_type names and the new scopes.

_TYPE_TO_SCOPE = {"global": "all", "brand": "brand", "category": "category", "product": "style"}
_SCOPE_TO_TYPE = {v: k for k, v in _TYPE_TO_SCOPE.items()}


def _rule_out(r: dict) -> SSMarkupRuleOut:
    return SSMarkupRuleOut(
        id=r["id"], rule_type=_SCOPE_TO_TYPE.get(r["scope"], "global"),
        target_value=r.get("value") or None,
        markup_pct=float(r.get("markup_pct") or 0), markup_fixed=float(r.get("markup_fixed") or 0),
        is_active=bool(r.get("active", True)), created_at="",
    )


def _rule_in(body: MarkupRuleCreate, rule_id: str | None = None) -> dict:
    if body.rule_type not in _TYPE_TO_SCOPE:
        raise HTTPException(status_code=400, detail=f"rule_type must be one of {set(_TYPE_TO_SCOPE)}")
    return {
        "id": rule_id or str(uuid.uuid4()), "scope": _TYPE_TO_SCOPE[body.rule_type],
        "value": body.target_value or "", "markup_pct": body.markup_pct,
        "markup_fixed": body.markup_fixed, "active": body.is_active,
    }


async def _save_rules(db: AsyncSession, rules: list[dict]) -> list[dict]:
    from app.services.suppliers import config as supplier_cfg

    cfg = await supplier_cfg.load(db, "ss_activewear")
    cfg["pricing"] = supplier_cfg.clean_pricing({**(cfg.get("pricing") or {}), "rules": rules})
    await supplier_cfg.save(db, "ss_activewear", cfg)
    await db.commit()
    return cfg["pricing"]["rules"]


async def _load_rules(db: AsyncSession) -> list[dict]:
    from app.services.suppliers import config as supplier_cfg

    return list(((await supplier_cfg.load(db, "ss_activewear")).get("pricing") or {}).get("rules") or [])


@router.get("/markup-rules", response_model=list[SSMarkupRuleOut])
async def list_markup_rules(db: AsyncSession = Depends(get_db)):
    return [_rule_out(r) for r in await _load_rules(db)]


@router.post("/markup-rules", response_model=SSMarkupRuleOut, status_code=201)
async def create_markup_rule(body: MarkupRuleCreate, db: AsyncSession = Depends(get_db)):
    new = _rule_in(body)
    saved = await _save_rules(db, [*(await _load_rules(db)), new])
    return _rule_out(next(r for r in saved if r["id"] == new["id"]))


@router.put("/markup-rules/{rule_id}", response_model=SSMarkupRuleOut)
async def update_markup_rule(rule_id: str, body: MarkupRuleCreate, db: AsyncSession = Depends(get_db)):
    rules = await _load_rules(db)
    if not any(r["id"] == rule_id for r in rules):
        raise HTTPException(status_code=404, detail="Rule not found")
    updated = _rule_in(body, rule_id)
    saved = await _save_rules(db, [updated if r["id"] == rule_id else r for r in rules])
    return _rule_out(next(r for r in saved if r["id"] == rule_id))


@router.delete("/markup-rules/{rule_id}", status_code=204)
async def delete_markup_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    rules = await _load_rules(db)
    if not any(r["id"] == rule_id for r in rules):
        raise HTTPException(status_code=404, detail="Rule not found")
    await _save_rules(db, [r for r in rules if r["id"] != rule_id])
