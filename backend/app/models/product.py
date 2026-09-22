"""Product catalog models: Category, Product, Variant, Image, Asset."""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TenantMixin

if TYPE_CHECKING:
    from app.models.inventory import InventoryRecord
    from app.models.order import CartItem, OrderItem
    from app.models.product_option import ProductOption, ProductOptionRule, ProductQtyTier


class Category(TenantMixin, BaseModel):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    parent: Mapped["Category | None"] = relationship("Category", remote_side="Category.id")
    children: Mapped[list["Category"]] = relationship("Category", back_populates="parent", foreign_keys=[parent_id])
    product_links: Mapped[list["ProductCategory"]] = relationship("ProductCategory", back_populates="category")


class Product(TenantMixin, BaseModel):
    __tablename__ = "products"
    # slug is unique PER TENANT (not globally) so two brands can each import the
    # same supplier style / share a slug. Storefront lookups are tenant-scoped,
    # so each brand resolves its own product. See migration 0028.
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_products_tenant_slug"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    short_description: Mapped[str | None] = mapped_column(String(500))
    highlight_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # When true, this product's page shows the gang sheet builder (column added in
    # migration 0011; mapped here so the API can read and set it).
    gang_sheet_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Which builder this gang-sheet product uses: 'gang_sheet' (combine designs on
    # a fixed-size sheet) or 'upload_by_size' (upload art + pick a size, area-priced).
    # NULL until configured. See migration 0030.
    gang_sheet_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Type-specific builder config (migration 0031). For 'upload_by_size':
    # {printer_width, max_height, tiers:[{max_height, max_area, price_per_sqin, discount}]}.
    # Gang-sheet fixed sizes live in gang_sheet_sizes (per product_id), not here.
    gang_sheet_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Business rules
    moq: Mapped[int] = mapped_column(Integer, default=1, nullable=False, comment="Minimum order quantity")

    # Status: draft | active | archived
    status: Mapped[str] = mapped_column(
        Enum("draft", "active", "archived", name="product_status"),
        default="draft",
        nullable=False,
        index=True,
    )

    # SEO
    meta_title: Mapped[str | None] = mapped_column(String(255))
    meta_description: Mapped[str | None] = mapped_column(String(500))

    # Organization
    product_type: Mapped[str | None] = mapped_column(String(100))
    vendor: Mapped[str | None] = mapped_column(String(255))
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String(100)), nullable=True)

    fabric: Mapped[str | None] = mapped_column(String(255), nullable=True)
    product_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Which supplier style this product was imported from (e.g. "ss_activewear",
    # S&S styleID). Null for products the brand made itself.
    supplier: Mapped[str | None] = mapped_column(String(40), nullable=True)
    supplier_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    weight: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Tab content fields
    care_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    print_guide: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    size_chart_data: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Full-text search vector (updated via PostgreSQL trigger)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR)

    # ── Relationships ─────────────────────────────────────────────────────────
    # ── Pricing mode ─────────────────────────────────────────────────────────
    # 'variant'      → stocked matrix (Colour × Size) priced per ProductVariant.
    # 'configurable' → unlimited options priced live from base_price + the
    #                  selected choices' deltas (combinations are never stored).
    # See app/models/product_option.py and migration 0032.
    pricing_mode: Mapped[str] = mapped_column(String(20), default="variant", nullable=False)
    # Starting unit price for a configurable product, before option deltas.
    base_price: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)

    # ── Product page template (migration 0047) ───────────────────────────────
    # NULL → the brand's default template, or the plain product page if it has
    # none. The template only adds content around the standard product info.
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_templates.id", ondelete="SET NULL"), nullable=True
    )
    # Flat key → value data a template can print: {{ product.metafields.key }}
    metafields: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False, server_default="{}")

    options: Mapped[list["ProductOption"]] = relationship(
        "ProductOption", back_populates="product", cascade="all, delete-orphan",
        order_by="ProductOption.position",
    )
    qty_tiers: Mapped[list["ProductQtyTier"]] = relationship(
        "ProductQtyTier", back_populates="product", cascade="all, delete-orphan",
        order_by="ProductQtyTier.min_qty",
    )
    option_rules: Mapped[list["ProductOptionRule"]] = relationship(
        "ProductOptionRule", back_populates="product", cascade="all, delete-orphan",
    )

    variants: Mapped[list["ProductVariant"]] = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )
    images: Mapped[list["ProductImage"]] = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order",
    )
    assets: Mapped[list["ProductAsset"]] = relationship(
        "ProductAsset", back_populates="product", cascade="all, delete-orphan"
    )
    category_links: Mapped[list["ProductCategory"]] = relationship(
        "ProductCategory", back_populates="product", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["ProductReview"]] = relationship(
        "ProductReview", back_populates="product", cascade="all, delete-orphan",
    )

    # ── Computed properties for schema compatibility ───────────────────────────
    @property
    def primary_image(self) -> "ProductImage | None":
        if not self.images:
            return None
        for img in self.images:
            if img.is_primary:
                return img
        return self.images[0]

    @property
    def categories(self) -> list:
        return [link.category for link in self.category_links if getattr(link, "category", None)]


class ProductVariant(TenantMixin, BaseModel):
    __tablename__ = "product_variants"
    # sku is unique PER TENANT (not globally) so two brands can each carry the
    # same supplier SKU (e.g. both selling Gildan 2000). All variant-by-sku
    # lookups run inside a tenant-scoped session. See migration 0028.
    __table_args__ = (
        UniqueConstraint("tenant_id", "sku", name="uq_product_variants_tenant_sku"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    color: Mapped[str | None] = mapped_column(String(100))
    # Real swatch hex (e.g. "#B31B1B") from the supplier, so the storefront shows
    # the true colour instead of guessing from the colour name. See migration 0029.
    color_hex: Mapped[str | None] = mapped_column(String(9), nullable=True)
    size: Mapped[str | None] = mapped_column(String(50))
    retail_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    compare_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    msrp: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)  # kept for guest pricing logic; hidden from admin UI
    cost_per_item: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    country_of_origin: Mapped[str | None] = mapped_column(String(100), nullable=True)
    weight_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Status: active | discontinued | out_of_stock
    status: Mapped[str] = mapped_column(
        Enum("active", "discontinued", "out_of_stock", name="variant_status"),
        default="active",
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    qb_item_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    product: Mapped["Product"] = relationship("Product", back_populates="variants")
    inventory_records: Mapped[list["InventoryRecord"]] = relationship(
        "InventoryRecord", back_populates="variant", cascade="all, delete-orphan"
    )


class ProductImage(TenantMixin, BaseModel):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # S3/CDN keys for each size
    url_thumbnail: Mapped[str] = mapped_column(String(1000), nullable=False)  # 150px
    url_medium: Mapped[str] = mapped_column(String(1000), nullable=False)     # 400px
    url_large: Mapped[str] = mapped_column(String(1000), nullable=False)      # 800px
    url_webp_thumbnail: Mapped[str | None] = mapped_column(String(1000))
    url_webp_medium: Mapped[str | None] = mapped_column(String(1000))
    url_webp_large: Mapped[str | None] = mapped_column(String(1000))
    alt_text: Mapped[str | None] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="images")

    # ── Schema field-name aliases ──────────────────────────────────────────────
    @property
    def position(self) -> int:
        return self.sort_order

    @property
    def url_thumbnail_webp(self) -> str | None:
        return self.url_webp_thumbnail

    @property
    def url_medium_webp(self) -> str | None:
        return self.url_webp_medium

    @property
    def url_large_webp(self) -> str | None:
        return self.url_webp_large


class ProductAsset(TenantMixin, BaseModel):
    """Marketing flyers, spec sheets, etc."""

    __tablename__ = "product_assets"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_type: Mapped[str] = mapped_column(
        Enum("flyer", "spec_sheet", "size_chart", "other", name="asset_type"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="assets")


class ProductCategory(TenantMixin, BaseModel):
    """Many-to-many Product ↔ Category."""

    __tablename__ = "product_categories"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )

    product: Mapped["Product"] = relationship("Product", back_populates="category_links")
    category: Mapped["Category"] = relationship("Category", back_populates="product_links")


class ProductReview(TenantMixin, BaseModel):
    """A customer review — written on the site, or imported from Google.

    `product_id` is null for a store review: one about the business rather than
    a product, which is what every Google review is. See migration 0045 and
    services/google_reviews.py.
    """

    __tablename__ = "product_reviews"

    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    reviewer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    reviewer_company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # 'site' (written on the storefront) or 'google' (imported). An imported
    # review keeps its id at Google so a re-sync updates it rather than adding
    # a copy, plus what Google requires shown with it: the author's photo and
    # profile link, and the owner's reply.
    source: Mapped[str] = mapped_column(String(20), default="site", nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewer_photo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    reply_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When the review was written, which for an import is Google's date rather
    # than the moment we fetched it.
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    product: Mapped["Product | None"] = relationship("Product", back_populates="reviews")
