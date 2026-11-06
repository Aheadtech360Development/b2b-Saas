"""Products → T-shirt designer: which products customers can design, what
decoration costs, and what is left to set up before the designer sells.

The designs customers send in are the t-shirt designs' own admin routes
(api/v1/tshirt_designs.py); the rules and prices are services/tshirt_designer.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.models.product import Product
from app.services import tshirt_designer as td
from app.services.product_catalog import kind_of

router = APIRouter(prefix="/admin/tshirt-designer", tags=["admin", "tshirt-designer"],
                   dependencies=[Depends(require_admin)])


def _tenant() -> Any:
    tid = get_current_tenant_id()
    if not tid:
        raise HTTPException(status_code=400, detail="Open this from your shop's admin.")
    return tid


def _thumb(p: Product) -> str | None:
    imgs = sorted(p.images or [], key=lambda i: (not i.is_primary, i.sort_order))
    return (imgs[0].url_thumbnail or imgs[0].url_medium) if imgs else None


def _why_not(p: Product) -> str | None:
    """Why a product cannot be designed, in the shop's words; None when it can."""
    kind = kind_of(p.pricing_mode, p.gang_sheet_enabled, p.gang_sheet_type)
    if kind == "made":
        return "This product is made to order. The designer works on products sold by colour and size."
    if kind != "stocked":
        return "This product is a gang sheet. The designer works on products sold by colour and size."
    if not any((v.status or "active") == "active" and v.retail_price is not None for v in p.variants or []):
        return "This product has no colour and size on sale yet. Add its variants first."
    return None


def _row(p: Product) -> dict[str, Any]:
    cfg = td.clean_config(p.designer_config)
    garment = td.garment_of(p)
    return {
        "id": str(p.id),
        "name": p.name,
        "slug": p.slug,
        "status": p.status,
        "image": _thumb(p),
        "enabled": bool(p.designer_enabled),
        "silhouette": cfg["silhouette"],
        "embroidery": cfg["embroidery"],
        "colours": len(garment["colors"]) if garment else 0,
        "sizes": garment["sizes"] if garment else [],
        "from_price": garment["basePrice"] if garment else None,
        "problem": _why_not(p),
    }


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict:
    """The decoration prices, whether the shop has set its own, and the garment shapes."""
    s = await td.settings_for(db, _tenant())
    return {**s, "silhouettes": [{"key": k, "label": v} for k, v in td.SILHOUETTES.items()]}


class RatesIn(BaseModel):
    rates: dict[str, Any]


@router.put("/settings")
async def put_settings(payload: RatesIn, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        saved = await td.save_rates(db, _tenant(), payload.rates)
    except td.DesignerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await db.commit()
    return {**saved, "silhouettes": [{"key": k, "label": v} for k, v in td.SILHOUETTES.items()]}


@router.get("/products")
async def list_products(
    q: str = Query("", max_length=100),
    pick: bool = Query(False, description="Products that could be added, for the Add products picker"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The products customers can design; or, with pick, the shop's other
    products sold by colour and size, to add."""
    _tenant()
    query = select(Product).options(selectinload(Product.variants), selectinload(Product.images))
    if pick:
        query = query.where(Product.designer_enabled.is_(False), Product.gang_sheet_enabled.is_(False),
                            Product.pricing_mode != "configurable", Product.status != "archived")
        words = q.strip()
        if words:
            like = f"%{words.replace('%', '').replace('_', '')}%"
            query = query.where(or_(Product.name.ilike(like), Product.product_code.ilike(like),
                                    Product.vendor.ilike(like)))
        query = query.order_by(Product.updated_at.desc()).limit(40)
    else:
        query = query.where(Product.designer_enabled.is_(True)).order_by(Product.name)
    rows = (await db.execute(query)).scalars().all()
    return {"items": [_row(p) for p in rows]}


class ProductIn(BaseModel):
    enabled: Optional[bool] = None
    silhouette: Optional[str] = None
    embroidery: Optional[bool] = None


@router.patch("/products/{product_id}")
async def update_product(product_id: uuid.UUID, payload: ProductIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Switch the designer on or off for a product, or change how it is drawn and decorated."""
    _tenant()
    p = (await db.execute(select(Product).options(selectinload(Product.variants), selectinload(Product.images))
                          .where(Product.id == product_id))).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    if payload.silhouette is not None and payload.silhouette not in td.SILHOUETTES:
        raise HTTPException(status_code=422, detail="Choose one of the garment shapes offered.")
    if payload.enabled:
        problem = _why_not(p)
        if problem:
            raise HTTPException(status_code=422, detail=problem)
    cfg = td.clean_config(p.designer_config)
    if payload.silhouette is not None:
        cfg["silhouette"] = payload.silhouette
    if payload.embroidery is not None:
        cfg["embroidery"] = bool(payload.embroidery)
    p.designer_config = cfg
    if payload.enabled is not None:
        p.designer_enabled = bool(payload.enabled)
    await db.flush()
    out = _row(p)  # read before the commit expires what was loaded
    await db.commit()
    # The product's page is cached: drop it, so "Design your own" comes and goes at once.
    from app.core.redis import redis_delete_pattern, tenant_cache_key

    try:
        await redis_delete_pattern(tenant_cache_key(f"products:detail:{out['slug']}:*"))
    except Exception:  # noqa: BLE001  (the cache runs out by itself; the switch is saved)
        pass
    return out


@router.get("/setup")
async def setup(db: AsyncSession = Depends(get_db)) -> dict:
    """What is left before the designer sells: a product, the shop's own prices, a first design."""
    from app.api.v1.tshirt_designs import TShirtDesign

    tid = _tenant()
    products = (await db.execute(select(func.count(Product.id)).where(Product.designer_enabled.is_(True)))).scalar() or 0
    designs = (await db.execute(select(func.count(TShirtDesign.id)))).scalar() or 0
    return {
        "has_products": products > 0,
        "prices_saved": (await td.settings_for(db, tid))["saved"],
        "has_designs": designs > 0,
        "available": await td.active(db, tid),
    }
