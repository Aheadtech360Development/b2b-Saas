"""Collections — a named group of products, chosen by hand or by rule.

A category files a product under one place; a collection is a view of the
catalogue, and a product belongs to as many as apply to it. An automatic
collection stores a question rather than an answer: its rules become a query
when it is read, so a product that gets a new tag or a lower price joins or
leaves the moment it is saved. Nothing to synchronise, and no membership table
that can drift away from the products it claims to describe.

`CollectionProduct` holds only hand-picked members, which is the one part that
really is a list. See services/collection_rules.py for the matching, and
migration 0044.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TenantMixin

# How membership is decided.
MATCH_TYPES = ("manual", "automatic")

# Whether every rule has to hold, or just one.
RULES_MATCH = ("all", "any")

# How the products read on the storefront.
SORT_OPTIONS = (
    "manual",          # the order somebody dragged them into (manual only)
    "best_selling",
    "title_asc", "title_desc",
    "price_asc", "price_desc",
    "created_desc", "created_asc",
)


class Collection(TenantMixin, BaseModel):
    __tablename__ = "collections"
    # A slug is a URL, and a brand's URLs are its own: two brands may both have
    # /collections/summer. Unique per brand, never across the platform.
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_collections_tenant_slug"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    match_type: Mapped[str] = mapped_column(String(12), default="manual", nullable=False)
    rules_match: Mapped[str] = mapped_column(String(4), default="all", nullable=False)
    # [{"field": "tag", "operator": "equals", "value": "summer"}, …]
    rules: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    sort_by: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Set the first time it goes live, so "when did this start showing?" has an
    # answer that survives it being switched off and on again.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    seo_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    members: Mapped[list["CollectionProduct"]] = relationship(
        "CollectionProduct", back_populates="collection",
        cascade="all, delete-orphan", order_by="CollectionProduct.position",
        lazy="noload",
    )


class CollectionProduct(TenantMixin, BaseModel):
    """One hand-picked product in a collection, in the order it was placed."""

    __tablename__ = "collection_products"
    __table_args__ = (
        UniqueConstraint("collection_id", "product_id", name="uq_collection_products_pair"),
    )

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    collection: Mapped["Collection"] = relationship("Collection", back_populates="members")
