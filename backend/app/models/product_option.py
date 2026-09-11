"""Configurable-product option engine.

Two product modes live side by side (see `Product.pricing_mode`):

* ``variant``       — the classic matrix (Colour × Size → real `ProductVariant`
                      rows with their own SKU, stock and image). Right for
                      stocked apparel, where inventory must be tracked per combo.
* ``configurable``  — UNLIMITED options whose combinations are **never stored**.
                      A print product like Business Cards has ~14 option groups;
                      as a matrix that is ~5·10⁸ rows, which is exactly why
                      Shopify caps at 3 options / 100 variants. Instead each
                      choice carries a price effect and the price is computed on
                      demand, so a brand can add any field (Paper Stock, Coating,
                      Rounded Corners, …) and the storefront renders it
                      automatically.

Pricing for a configurable product is resolved server-side only — the client's
figure is never trusted (see `app.services.configurator_service`).
"""
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TenantMixin

if TYPE_CHECKING:
    from app.models.product import Product


# How a choice changes the price.
#   flat      → added once to the unit price       (e.g. +$5 setup)
#   per_unit  → added to every unit                (e.g. +$0.02 per card)
#   percent   → % applied to the running unit price(e.g. +10% for rush stock)
PRICE_MODES = ("flat", "per_unit", "percent")

# How the choice is presented on the storefront.
INPUT_TYPES = ("select", "radio", "swatch", "checkbox", "number", "text")

# What a conditional rule does when its trigger choice is selected.
#   hide_option    → the target option disappears entirely
#   disable_option → shown but greyed with the rule's note ("N/A with UV Coating")
#   disable_value  → one choice inside the target option becomes unpickable
RULE_ACTIONS = ("hide_option", "disable_option", "disable_value")


class ProductOption(TenantMixin, BaseModel):
    """One configurable field on a product — e.g. "Paper Stock"."""

    __tablename__ = "product_options"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # select | radio | swatch | checkbox | number | text
    input_type: Mapped[str] = mapped_column(String(20), default="select", nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Shown as the "?" tooltip next to the field, like the reference configurators.
    help_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="options")
    values: Mapped[list["ProductOptionValue"]] = relationship(
        "ProductOptionValue",
        back_populates="option",
        cascade="all, delete-orphan",
        order_by="ProductOptionValue.position",
    )


class ProductOptionValue(TenantMixin, BaseModel):
    """One choice within an option — e.g. "Coated Semigloss 2 Sides (C2S)"."""

    __tablename__ = "product_option_values"

    option_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_options.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    # Price effect of picking this choice; interpreted per `price_mode`.
    price_delta: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)
    price_mode: Mapped[str] = mapped_column(String(12), default="flat", nullable=False)
    # Optional swatch/preview shown next to the choice.
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    swatch_hex: Mapped[str | None] = mapped_column(String(9), nullable=True)
    # Appended to the generated SKU so production can read the configuration.
    sku_suffix: Mapped[str | None] = mapped_column(String(40), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    option: Mapped["ProductOption"] = relationship("ProductOption", back_populates="values")


class ProductQtyTier(TenantMixin, BaseModel):
    """Quantity break for a configurable product — "QTY 50 · UNIT $0.57".

    The highest tier whose `min_qty` the order meets wins. Tiers are optional;
    without any, the product's base price is the unit price at every quantity.
    """

    __tablename__ = "product_qty_tiers"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="qty_tiers")


class ProductOptionRule(TenantMixin, BaseModel):
    """A dependency between choices — "Laminating is N/A with UV Coating".

    One trigger, one action, one target. Complex logic is expressed by adding
    several rows rather than one clever rule, which keeps each one readable in
    the admin and trivial to evaluate on both sides.
    """

    __tablename__ = "product_option_rules"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The choice that triggers this rule.
    when_value_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_option_values.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(20), default="disable_option", nullable=False)
    target_option_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_options.id", ondelete="CASCADE"), nullable=True
    )
    target_value_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_option_values.id", ondelete="CASCADE"), nullable=True
    )
    # Shown to the buyer in place of the disabled field.
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)

    product: Mapped["Product"] = relationship("Product", back_populates="option_rules")
