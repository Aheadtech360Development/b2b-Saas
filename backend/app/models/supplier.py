"""Supplier catalog models for S&S Activewear integration."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class SSCategory(BaseModel):
    __tablename__ = "ss_categories"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    gender: Mapped[str | None] = mapped_column(String(100))
    product_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    products: Mapped[list["SSProduct"]] = relationship("SSProduct", back_populates="category_obj")


class SSProduct(BaseModel):
    __tablename__ = "ss_products"

    style_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    style_name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_name: Mapped[str | None] = mapped_column(String(200), index=True)
    category_name: Mapped[str | None] = mapped_column(String(200), index=True)
    gender_name: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    keywords: Mapped[str | None] = mapped_column(Text)
    piece_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    case_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    case_size: Mapped[int | None] = mapped_column(Integer)
    front_image: Mapped[str | None] = mapped_column(String(1000))
    color_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    size_range: Mapped[str | None] = mapped_column(String(200))
    raw_data: Mapped[dict | None] = mapped_column(JSONB)

    is_imported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    imported_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ss_categories.id", ondelete="SET NULL"), nullable=True
    )

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    category_obj: Mapped["SSCategory | None"] = relationship("SSCategory", back_populates="products")
    variants: Mapped[list["SSVariant"]] = relationship(
        "SSVariant", back_populates="product", cascade="all, delete-orphan"
    )


class SSVariant(BaseModel):
    __tablename__ = "ss_variants"

    ss_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ss_products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    style_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    gtin: Mapped[str | None] = mapped_column(String(50))
    color_name: Mapped[str | None] = mapped_column(String(100))
    color_code: Mapped[str | None] = mapped_column(String(20))
    size_name: Mapped[str | None] = mapped_column(String(50))
    piece_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    front_image: Mapped[str | None] = mapped_column(String(1000))
    back_image: Mapped[str | None] = mapped_column(String(1000))
    side_image: Mapped[str | None] = mapped_column(String(1000))
    color_swatch: Mapped[str | None] = mapped_column(String(1000))

    qty_on_hand: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_inventory_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    product: Mapped["SSProduct"] = relationship("SSProduct", back_populates="variants")


class SSMarkupRule(BaseModel):
    __tablename__ = "ss_markup_rules"

    # rule_type: 'global' | 'category' | 'brand' | 'product'
    rule_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # For category/brand rules: the category/brand name. For product: the style_id.
    target_value: Mapped[str | None] = mapped_column(String(255))
    markup_pct: Mapped[float] = mapped_column(Numeric(6, 2), default=0, nullable=False)
    markup_fixed: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SSSyncLog(BaseModel):
    __tablename__ = "ss_sync_logs"

    # sync_type: 'categories' | 'products' | 'inventory' | 'full' | 'manual'
    sync_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # status: 'running' | 'completed' | 'failed'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    records_fetched: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_upserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
