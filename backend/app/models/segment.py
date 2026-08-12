"""Customer intelligence: per-customer metrics + saved segments.

The "customer" in this B2B platform is the Company (orders, tags, tier, tax
status and addresses all hang off it). CustomerMetrics is a denormalised,
per-company rollup of order-derived facts (spend, counts, dates, purchased
product/category ids) so segment queries never re-aggregate the orders table on
every read. CustomerSegment stores a reusable condition tree evaluated by the
shared filter engine (see app.services.segment_engine).

Both are tenant-scoped through TenantMixin like everything else.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin


class CustomerMetrics(TenantMixin, BaseModel):
    """One row per company — the order-derived facts segments filter on. Rebuilt
    for a single company whenever one of its orders changes (never the whole
    table), by app.services.metrics_service.recompute_company_metrics."""

    __tablename__ = "customer_metrics"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )

    total_spend: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    order_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)         # revenue-counting orders
    paid_order_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    aov: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    first_order_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_order_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    refunded_order_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    refunded_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    cancelled_order_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Distinct product / category ids ever purchased (string uuids), for the
    # "products purchased" / "categories purchased" filters via JSONB containment.
    purchased_product_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    purchased_category_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CustomerSegment(TenantMixin, BaseModel):
    """A saved, named filter. `definition` is a condition tree the shared engine
    turns into a query — the same evaluation path preview uses, so a saved
    segment and its live preview can never diverge."""

    __tablename__ = "customer_segments"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Condition tree: {"op": "and"|"or", "conditions": [ <group> | {field, operator, value} ]}
    definition: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
