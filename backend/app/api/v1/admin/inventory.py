from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.inventory import (
    AdjustmentResult,
    BulkImportResult,
    InventoryAdjustRequest,
    WarehouseCreate,
    WarehouseOut,
)
from app.services.inventory_service import InventoryService

router = APIRouter(prefix="/admin", tags=["admin", "inventory"])


@router.get("/warehouses", response_model=list[WarehouseOut])
async def list_warehouses(db: AsyncSession = Depends(get_db)):
    svc = InventoryService(db)
    return await svc.list_warehouses()


@router.post("/warehouses", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
async def create_warehouse(payload: WarehouseCreate, db: AsyncSession = Depends(get_db)):
    svc = InventoryService(db)
    wh = await svc.create_warehouse(
        payload.name,
        payload.code,
        address_line1=payload.address_line1,
        city=payload.city,
        state=payload.state,
        postal_code=payload.postal_code,
        country=payload.country,
    )
    await db.commit()
    return wh


@router.patch("/warehouses/{warehouse_id}", response_model=WarehouseOut)
async def update_warehouse(
    warehouse_id: UUID,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
):
    svc = InventoryService(db)
    wh = await svc.update_warehouse(warehouse_id, payload)
    await db.commit()
    return wh


@router.get("/inventory")
async def list_inventory(
    variant_id: UUID | None = None,
    warehouse_id: UUID | None = None,
    low_stock_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    svc = InventoryService(db)
    if variant_id:
        return await svc.get_inventory_by_variant(variant_id)
    if low_stock_only:
        return await svc.get_low_stock_variants()
    # Return all — left join so variants without inventory records also appear
    from sqlalchemy import select
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.product import Product, ProductVariant

    result = await db.execute(
        select(ProductVariant, InventoryRecord, Warehouse, Product.name.label("product_name"))
        .join(Product, ProductVariant.product_id == Product.id)
        .outerjoin(InventoryRecord, InventoryRecord.variant_id == ProductVariant.id)
        .outerjoin(Warehouse, InventoryRecord.warehouse_id == Warehouse.id)
        .where(ProductVariant.status != "discontinued")
        .order_by(Product.name, ProductVariant.color, ProductVariant.size)
        .limit(500)
    )
    return [
        {
            "variant_id": str(v.id),
            "sku": v.sku,
            "color": v.color,
            "size": v.size,
            "product_name": product_name,
            "warehouse_id": str(wh.id) if wh else None,
            "warehouse_name": wh.name if wh else "—",
            "quantity": rec.quantity if rec else 0,
            "low_stock_threshold": rec.low_stock_threshold if rec else 10,
        }
        for v, rec, wh, product_name in result.all()
    ]


@router.get("/inventory/board")
async def inventory_board(
    q: str | None = None,
    product: str | None = None,
    warehouse: str | None = None,
    stock: str = "all",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The Inventory screen (services/stock_view.py): every SKU of the stocked
    products, with what it has, what open orders hold, and the numbers over it."""
    from app.core.tenant_context import get_current_tenant_id
    from app.services import stock_view

    return await stock_view.board(db, get_current_tenant_id(), q=q, product_id=_uuid_or_none(product),
                                  warehouse_id=_uuid_or_none(warehouse), stock=stock, page=page, page_size=page_size)


@router.get("/inventory/board/export")
async def inventory_board_export(
    q: str | None = None, product: str | None = None, warehouse: str | None = None, stock: str = "all",
    db: AsyncSession = Depends(get_db),
):
    """The list as it is filtered, as a spreadsheet."""
    import csv
    import io

    from fastapi.responses import Response

    from app.core.tenant_context import get_current_tenant_id
    from app.services import stock_view

    rows = await stock_view.everything(db, get_current_tenant_id(), q=q, product_id=_uuid_or_none(product),
                                       warehouse_id=_uuid_or_none(warehouse), stock=stock)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Product", "SKU", "Colour", "Size", "On hand", "Reserved", "Available", "Low stock at"])
    for r in rows:
        w.writerow([r["product_name"], r["sku"], r["color"] or "", r["size"] or "", r["on_hand"],
                    "" if r["reserved"] is None else r["reserved"], r["available"], r["threshold"]])
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="inventory.csv"'})


@router.get("/inventory/history/{variant_id}")
async def inventory_history(variant_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """One SKU's count in each warehouse and every change made to it."""
    from fastapi import HTTPException

    from app.core.tenant_context import get_current_tenant_id
    from app.services import stock_view

    found = await stock_view.history(db, get_current_tenant_id(), variant_id)
    if not found:
        raise HTTPException(status_code=404, detail="SKU not found")
    return found


@router.patch("/inventory/threshold")
async def set_low_stock_line(payload: dict = Body(...), db: AsyncSession = Depends(get_db)) -> dict:
    """Where a SKU counts as low in one warehouse: {variant_id, warehouse_id, threshold}."""
    from fastapi import HTTPException
    from sqlalchemy import select

    from app.models.inventory import InventoryRecord

    try:
        variant_id, warehouse_id = UUID(str(payload["variant_id"])), UUID(str(payload["warehouse_id"]))
        threshold = int(payload["threshold"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Give the SKU, the warehouse and a whole number.")
    if threshold < 0 or threshold > 1_000_000:
        raise HTTPException(status_code=422, detail="The low stock line is a number from 0 up.")
    rec = (await db.execute(select(InventoryRecord).where(
        InventoryRecord.variant_id == variant_id, InventoryRecord.warehouse_id == warehouse_id))).scalar_one_or_none()
    if rec is None:
        rec = InventoryRecord(variant_id=variant_id, warehouse_id=warehouse_id, quantity=0, low_stock_threshold=threshold)
        db.add(rec)
    else:
        rec.low_stock_threshold = threshold
    await db.commit()
    return {"variant_id": str(variant_id), "warehouse_id": str(warehouse_id), "threshold": threshold}


def _uuid_or_none(v: str | None):
    try:
        return UUID(v) if v else None
    except ValueError:
        return None
def made_to_order(product) -> str | None:
    """Why a product has no stock to count, or None when it can count one.

    A gang sheet (built, uploaded by size, or the buyer's own sheet) and a
    product priced from its options are printed when ordered: there is nothing
    on a shelf. Anything sold by colour and size can count its stock, a blank
    tee or a sign printed from the buyer's file alike; the brand decides.
    """
    if getattr(product, "gang_sheet_enabled", False):
        return {
            "upload_by_size": "Upload by size",
            "upload_own": "Buyer's own gang sheet",
        }.get(getattr(product, "gang_sheet_type", None) or "", "Gang sheet")
    if (getattr(product, "pricing_mode", None) or "variant") == "configurable":
        return "Made to order from its options"
    return None


def stock_state(quantity: int, threshold: int) -> str:
    if quantity <= 0:
        return "out"
    return "low" if quantity <= threshold else "in_stock"


_SHOW = ("all", "counted", "low", "out", "not_counted", "made")


@router.get("/inventory/products")
async def inventory_by_product(
    q: str | None = None,
    show: str = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Every product with what it holds: whether it counts its stock, and how
    many of each colour and size it has (the Inventory screen's main view).

    A product that counts its stock and has no record for a variant has none
    of it, as the checkout reads it. One that does not count it sells without
    a limit, whatever its records say.
    """
    from sqlalchemy import func, or_, select
    from sqlalchemy.orm import selectinload

    from app.models.inventory import InventoryRecord
    from app.models.product import Product

    if show not in _SHOW:
        show = "all"
    query = (
        select(Product)
        .where(Product.status != "archived")
        .options(selectinload(Product.variants), selectinload(Product.images))
        .order_by(Product.name)
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Product.name.ilike(like), Product.product_code.ilike(like)))
    products = (await db.execute(query)).scalars().all()

    variant_ids = [v.id for p in products for v in (p.variants or [])]
    on_hand: dict = {}
    if variant_ids:
        for vid, total, threshold in (await db.execute(
            select(InventoryRecord.variant_id, func.sum(InventoryRecord.quantity),
                   func.min(InventoryRecord.low_stock_threshold))
            .where(InventoryRecord.variant_id.in_(variant_ids))
            .group_by(InventoryRecord.variant_id)
        )).all():
            on_hand[vid] = (int(total or 0), int(threshold if threshold is not None else 10))

    rows = []
    for p in products:
        reason = made_to_order(p)
        variants = [v for v in (p.variants or []) if v.status != "discontinued"]
        item = {
            "id": str(p.id), "name": p.name, "slug": p.slug, "status": p.status,
            "image": next((getattr(i, "url_thumbnail", None) or getattr(i, "url_medium", None)
                           for i in (p.images or [])), None),
            "made_to_order": reason,
            "track_inventory": bool(p.track_inventory),
            "variants": [],
            "total": 0,
        }
        if reason:
            item["state"] = "made"
        elif not p.track_inventory:
            item["state"] = "not_counted"
        else:
            states = []
            for v in sorted(variants, key=lambda v: (v.sort_order or 0, v.color or "", v.size or "")):
                qty, threshold = on_hand.get(v.id, (0, 10))
                state = stock_state(qty, threshold)
                states.append(state)
                item["total"] += max(qty, 0)
                item["variants"].append({
                    "id": str(v.id), "sku": v.sku, "color": v.color, "size": v.size,
                    "quantity": qty, "low_stock_threshold": threshold, "state": state,
                })
            item["state"] = ("out" if not states or all(s == "out" for s in states)
                             else "low" if any(s != "in_stock" for s in states) else "in_stock")
        if not reason and not p.track_inventory:
            # Shown so a brand can see what it would be counting before it
            # switches counting on.
            item["variants"] = [
                {"id": str(v.id), "sku": v.sku, "color": v.color, "size": v.size,
                 "quantity": on_hand.get(v.id, (0, 10))[0], "low_stock_threshold": on_hand.get(v.id, (0, 10))[1],
                 "state": "not_counted"}
                for v in sorted(variants, key=lambda v: (v.sort_order or 0, v.color or "", v.size or ""))
            ]
        rows.append(item)

    def shown(item: dict, tab: str) -> bool:
        state = item["state"]
        return {
            "all": True,
            "counted": state in ("in_stock", "low", "out"),
            "low": state == "low",
            "out": state == "out",
            "not_counted": state == "not_counted",
            "made": state == "made",
        }[tab]

    counts = {tab: sum(1 for r in rows if shown(r, tab)) for tab in _SHOW}
    listed = [r for r in rows if shown(r, show)]
    start = (page - 1) * page_size
    return {
        "items": listed[start:start + page_size],
        "counts": counts,
        "total": len(listed),
        "page": page,
        "pages": max(1, (len(listed) + page_size - 1) // page_size),
    }


@router.post("/inventory/adjust", response_model=AdjustmentResult)
async def adjust_inventory(
    payload: InventoryAdjustRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    svc = InventoryService(db)
    # Who made the change: the history says every change, who made it and why.
    who = getattr(request.state, "user_id", None)
    try:
        who = UUID(str(who)) if who else None
    except ValueError:
        who = None
    record = await svc.adjust_stock_with_log(
        variant_id=payload.variant_id,
        warehouse_id=payload.warehouse_id,
        quantity_delta=payload.quantity_delta,
        reason=payload.reason,
        adjusted_by=who,
        notes=payload.notes,
    )
    await db.commit()
    # The shop's cached copy of the product would go on showing the old count.
    try:
        from sqlalchemy import select

        from app.models.product import Product, ProductVariant
        from app.services.product_service import ProductService

        slug = (await db.execute(
            select(Product.slug).join(ProductVariant, ProductVariant.product_id == Product.id)
            .where(ProductVariant.id == payload.variant_id)
        )).scalar()
        await ProductService(db).invalidate_product_cache(slug)
    except Exception:
        pass
    return AdjustmentResult(
        variant_id=record.variant_id,
        warehouse_id=record.warehouse_id,
        quantity_after=record.quantity,
    )


@router.post("/inventory/import-csv", response_model=BulkImportResult)
async def import_inventory_csv(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    content = await file.read()
    svc = InventoryService(db)
    result = await svc.bulk_import_csv(content.decode("utf-8"))
    await db.commit()
    return BulkImportResult(**result)
