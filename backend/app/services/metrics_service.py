"""Per-customer metric rollups for the segment engine.

recompute_company_metrics rebuilds ONE company's CustomerMetrics row from its
orders — never the whole table. It's cheap (a handful of aggregate queries
scoped to one company) so it can run inline on a request or in a background job
after any order change. Idempotent: running it twice yields the same row.

Revenue rules (kept explicit so filters mean what buyers expect):
  • order_count      — orders not cancelled (what "number of orders" counts)
  • total_spend      — sum of paid order totals ("amount spent")
  • aov              — total_spend / paid_order_count
  • first/last order — earliest/latest non-cancelled order date
  • refunded/cancelled — counted + summed separately for their own filters
"""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderItem
from app.models.product import ProductCategory, ProductVariant
from app.models.segment import CustomerMetrics

_CANCELLED = "cancelled"
_REFUNDED = "refunded"
_PAID = "paid"


async def recompute_company_metrics(db: AsyncSession, company_id: UUID) -> CustomerMetrics:
    """Rebuild and upsert one company's metrics row. Returns the row (flushed)."""
    not_cancelled = Order.status != _CANCELLED
    is_paid = Order.payment_status == _PAID
    is_refunded = or_(Order.payment_status == _REFUNDED, Order.status == _REFUNDED)

    row = (await db.execute(
        select(
            func.count().filter(not_cancelled),
            func.coalesce(func.sum(Order.total).filter(is_paid), 0),
            func.count().filter(is_paid),
            func.min(Order.created_at).filter(not_cancelled),
            func.max(Order.created_at).filter(not_cancelled),
            func.count().filter(is_refunded),
            func.coalesce(func.sum(Order.total).filter(is_refunded), 0),
            func.count().filter(Order.status == _CANCELLED),
        ).where(Order.company_id == company_id)
    )).one()
    (order_count, total_spend, paid_count, first_at, last_at,
     refunded_count, refunded_amt, cancelled_count) = row

    aov = (Decimal(str(total_spend)) / paid_count) if paid_count else Decimal("0")

    # Distinct products purchased across non-cancelled orders (skip variant-less
    # lines like gang sheets), then the categories those products belong to.
    prod_ids = (await db.execute(
        select(distinct(ProductVariant.product_id))
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .where(Order.company_id == company_id, not_cancelled, OrderItem.variant_id.isnot(None))
    )).scalars().all()
    product_ids = [str(p) for p in prod_ids if p]

    category_ids: list[str] = []
    if product_ids:
        cat_ids = (await db.execute(
            select(distinct(ProductCategory.category_id))
            .where(ProductCategory.product_id.in_([UUID(p) for p in product_ids]))
        )).scalars().all()
        category_ids = [str(c) for c in cat_ids]

    metrics = (await db.execute(
        select(CustomerMetrics).where(CustomerMetrics.company_id == company_id)
    )).scalar_one_or_none()
    if metrics is None:
        metrics = CustomerMetrics(company_id=company_id)
        db.add(metrics)

    metrics.order_count = order_count or 0
    metrics.total_spend = total_spend or 0
    metrics.paid_order_count = paid_count or 0
    metrics.aov = aov
    metrics.first_order_at = first_at
    metrics.last_order_at = last_at
    metrics.refunded_order_count = refunded_count or 0
    metrics.refunded_amount = refunded_amt or 0
    metrics.cancelled_order_count = cancelled_count or 0
    metrics.purchased_product_ids = product_ids
    metrics.purchased_category_ids = category_ids
    metrics.computed_at = datetime.now(timezone.utc)

    await db.flush()
    return metrics
