"""InventoryService — warehouse stock management with adjustment logging."""
import csv
import io
import logging
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.inventory import InventoryAdjustment, InventoryRecord, Warehouse
from app.models.product import ProductVariant

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Can this be sold?
# ------------------------------------------------------------------
#
# Whether a product counts its stock is its own switch, products.track_inventory
# (migration 0063). Counted: what its variants have on hand is all that can be
# sold, and a variant with no stock record has none. Not counted: it sells
# without a limit, as anything made to order does. Checkout, the cart and the
# product page all read it through sellable_stock.

async def stock_on_hand(db: AsyncSession, variant_id: UUID) -> int | None:
    """Units on hand across every location, or None when the variant has no
    stock record at all."""
    rows = (await db.execute(
        select(InventoryRecord.quantity).where(InventoryRecord.variant_id == variant_id)
    )).scalars().all()
    if not rows:
        return None
    return sum(int(q or 0) for q in rows)


async def sellable_stock(db: AsyncSession, variant: ProductVariant, *, tracked: bool | None = None) -> int | None:
    """What may be sold of `variant`: None when its product does not count stock
    (no limit), otherwise the units on hand, 0 when it has no stock record.

    `tracked` is the product's track_inventory when the caller has the product
    already; otherwise it is read.
    """
    if tracked is None:
        from app.models.product import Product

        tracked = bool((await db.execute(
            select(Product.track_inventory).where(Product.id == variant.product_id)
        )).scalar())
    if not tracked:
        return None
    return await stock_on_hand(db, variant.id) or 0


async def default_warehouse(db: AsyncSession) -> Warehouse:
    """The brand's first warehouse, made ("Main") when it has none.

    A brand that never set one up could not save a stock number at all ("Add a
    warehouse before setting stock"), so switching on stock counting led
    nowhere. The session is the brand's, so the warehouse is stamped with it.
    """
    warehouse = (await db.execute(
        select(Warehouse).order_by(Warehouse.created_at).limit(1)
    )).scalar_one_or_none()
    if warehouse is None:
        warehouse = Warehouse(name="Main", code="MAIN", country="US", is_active=True)
        db.add(warehouse)
        await db.flush()
    return warehouse


def stock_problem(available: int | None, wanted: int, label: str) -> str | None:
    """Why `wanted` units cannot be sold, or None when they can."""
    if available is None or available >= wanted:
        return None
    if available <= 0:
        return f"{label} is out of stock."
    return f"Only {available} of {label} left in stock."


class InventoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Warehouse management
    # ------------------------------------------------------------------

    async def list_warehouses(self) -> list[Warehouse]:
        result = await self.db.execute(select(Warehouse).order_by(Warehouse.name))
        return list(result.scalars().all())

    async def get_warehouse(self, warehouse_id: UUID) -> Warehouse:
        result = await self.db.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id)
        )
        wh = result.scalar_one_or_none()
        if not wh:
            raise NotFoundError(f"Warehouse {warehouse_id} not found")
        return wh

    async def create_warehouse(
        self,
        name: str,
        code: str,
        address_line1: str | None = None,
        city: str | None = None,
        state: str | None = None,
        postal_code: str | None = None,
        country: str = "US",
    ) -> Warehouse:
        wh = Warehouse(
            name=name,
            code=code,
            address_line1=address_line1,
            city=city,
            state=state,
            postal_code=postal_code,
            country=country,
        )
        self.db.add(wh)
        await self.db.flush()
        await self.db.refresh(wh)
        return wh

    async def update_warehouse(self, warehouse_id: UUID, data: dict) -> Warehouse:
        wh = await self.get_warehouse(warehouse_id)
        for field, value in data.items():
            if hasattr(wh, field):
                setattr(wh, field, value)
        await self.db.flush()
        await self.db.refresh(wh)
        return wh

    # ------------------------------------------------------------------
    # Inventory queries
    # ------------------------------------------------------------------

    async def get_inventory_by_variant(self, variant_id: UUID) -> list[dict]:
        result = await self.db.execute(
            select(InventoryRecord, Warehouse)
            .join(Warehouse, InventoryRecord.warehouse_id == Warehouse.id)
            .where(InventoryRecord.variant_id == variant_id)
        )
        return [
            {
                "warehouse_id": str(wh.id),
                "warehouse_name": wh.name,
                "quantity": rec.quantity,
                "low_stock_threshold": rec.low_stock_threshold,
                "is_low_stock": rec.quantity <= rec.low_stock_threshold,
            }
            for rec, wh in result.all()
        ]

    async def get_summed_stock_by_variant(self, variant_id: UUID) -> int:
        result = await self.db.execute(
            select(func.coalesce(func.sum(InventoryRecord.quantity), 0)).where(
                InventoryRecord.variant_id == variant_id
            )
        )
        return result.scalar_one()

    async def get_low_stock_variants(self, threshold_override: int | None = None) -> list[dict]:
        """Return variants where any warehouse record is at or below threshold."""
        result = await self.db.execute(
            select(InventoryRecord, ProductVariant)
            .join(ProductVariant, InventoryRecord.variant_id == ProductVariant.id)
            .where(
                InventoryRecord.quantity <= (
                    threshold_override
                    if threshold_override is not None
                    else InventoryRecord.low_stock_threshold
                )
            )
            .order_by(InventoryRecord.quantity)
        )
        return [
            {
                "variant_id": str(v.id),
                "sku": v.sku,
                "color": v.color,
                "size": v.size,
                "quantity": rec.quantity,
                "threshold": rec.low_stock_threshold,
            }
            for rec, v in result.all()
        ]

    # ------------------------------------------------------------------
    # Stock adjustment
    # ------------------------------------------------------------------

    async def adjust_stock_with_log(
        self,
        variant_id: UUID,
        warehouse_id: UUID,
        quantity_delta: int,
        reason: str,
        adjusted_by: UUID | None = None,
        notes: str | None = None,
    ) -> InventoryRecord:
        """Adjust stock by delta (positive = add, negative = remove). Creates adjustment log."""
        # Get or create inventory record
        result = await self.db.execute(
            select(InventoryRecord).where(
                InventoryRecord.variant_id == variant_id,
                InventoryRecord.warehouse_id == warehouse_id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            record = InventoryRecord(
                variant_id=variant_id,
                warehouse_id=warehouse_id,
                quantity=0,
                low_stock_threshold=10,
            )
            self.db.add(record)
            await self.db.flush()

        quantity_before = record.quantity
        quantity_after = max(0, quantity_before + quantity_delta)
        record.quantity = quantity_after

        # Log adjustment
        adj = InventoryAdjustment(
            inventory_record_id=record.id,
            reason=reason,
            quantity_before=quantity_before,
            quantity_after=quantity_after,
            adjusted_by_id=adjusted_by,
            notes=notes,
        )
        self.db.add(adj)
        await self.db.flush()


        # Invalidate Redis product detail cache so updated stock shows on all pages
        try:
            from app.core.redis import redis_delete_pattern as _rdp, tenant_cache_key as _tk
            from app.models.product import Product as _Product
            pv = (await self.db.execute(
                select(ProductVariant).where(ProductVariant.id == variant_id)
            )).scalar_one_or_none()
            if pv:
                prod = (await self.db.execute(
                    select(_Product).where(_Product.id == pv.product_id)
                )).scalar_one_or_none()
                if prod:
                    # Per brand — see the note in guest checkout.
                    await _rdp(_tk(f"products:detail:{prod.slug}:*"))
                    await _rdp(_tk("products:list:*"))
        except Exception as _exc:
            logger.warning("Product cache invalidation failed: %s", _exc)

        return record

    async def bulk_import_csv(self, csv_content: str, adjusted_by: UUID | None = None) -> dict:
        """Import inventory levels from CSV: sku, warehouse_code, quantity."""
        reader = csv.DictReader(io.StringIO(csv_content))
        imported = skipped = 0
        errors: list[str] = []

        for i, row in enumerate(reader, start=2):
            try:
                sku = row.get("sku", "").strip()
                warehouse_code = row.get("warehouse_code", "").strip()
                quantity = int(row.get("quantity", 0))

                # Lookup variant
                variant_result = await self.db.execute(
                    select(ProductVariant).where(ProductVariant.sku == sku)
                )
                variant = variant_result.scalar_one_or_none()
                if not variant:
                    errors.append(f"Row {i}: SKU '{sku}' not found")
                    skipped += 1
                    continue

                # Lookup warehouse
                wh_result = await self.db.execute(
                    select(Warehouse).where(Warehouse.code == warehouse_code)
                )
                warehouse = wh_result.scalar_one_or_none()
                if not warehouse:
                    errors.append(f"Row {i}: Warehouse code '{warehouse_code}' not found")
                    skipped += 1
                    continue

                # Set absolute quantity (reason = migration)
                existing_result = await self.db.execute(
                    select(InventoryRecord).where(
                        InventoryRecord.variant_id == variant.id,
                        InventoryRecord.warehouse_id == warehouse.id,
                    )
                )
                existing = existing_result.scalar_one_or_none()
                if existing:
                    delta = quantity - existing.quantity
                else:
                    delta = quantity

                await self.adjust_stock_with_log(
                    variant_id=variant.id,
                    warehouse_id=warehouse.id,
                    quantity_delta=delta,
                    reason="migration",
                    adjusted_by=adjusted_by,
                )
                imported += 1
            except Exception as exc:
                errors.append(f"Row {i}: {exc}")
                skipped += 1

        await self.db.flush()
        return {"imported": imported, "skipped": skipped, "errors": errors}
