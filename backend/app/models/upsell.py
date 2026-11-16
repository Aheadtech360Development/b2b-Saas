"""A cart upsell: an offer a shop puts in front of buyers in its cart (0079)."""
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin


class UpsellOffer(TenantMixin, BaseModel):
    """One offer: a product, when it is shown, and at what price.

    trigger_kind: 'any' (every cart), 'products' or 'collections' (the cart
    holds one of trigger_ids). min/max_subtotal narrow it to a cart value,
    e.g. "under the free-shipping line". discount_type: 'none', 'percent' or
    'amount' (off each unit). The rules are read again on the server whenever
    the cart is priced, so an offer whose conditions stop holding stops
    discounting.
    """

    __tablename__ = "upsell_offers"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True
    )
    headline: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    discount_type: Mapped[str] = mapped_column(String(10), nullable=False, default="none")
    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    trigger_kind: Mapped[str] = mapped_column(String(12), nullable=False, default="any")
    trigger_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    min_subtotal: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    max_subtotal: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
