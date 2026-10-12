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
