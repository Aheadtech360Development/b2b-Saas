"""Return Merchandise Authorization (RMA) models."""
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TenantMixin

if TYPE_CHECKING:
    from app.models.order import Order, OrderItem
    from app.models.user import User


class RMARequest(TenantMixin, BaseModel):
    __tablename__ = "rma_requests"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"),
        nullable=False, index=True
    )
    # Empty for a guest's return (migration 0070): their email is guest_email.
    submitted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    rma_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)

    # pending (Requested) | approved | rejected (Declined) | completed, and
    # from the returns portal (0070): received | refunded | exchanged | closed.
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", "completed", "received", "refunded", "exchanged", "closed",
             name="rma_status"),
        default="pending",
        nullable=False,
        index=True,
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    admin_notes: Mapped[str | None] = mapped_column(Text)
    # The returns portal (services/returns_portal, migration 0070).
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="return")  # return | exchange
    refund_method: Mapped[str | None] = mapped_column(String(20))  # original | store_credit | exchange
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="account")  # account | guest | admin
    guest_email: Mapped[str | None] = mapped_column(String(255))
    refunded_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    exchange_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    store_credit_card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gift_cards.id", ondelete="SET NULL")
    )

    order: Mapped["Order"] = relationship("Order", foreign_keys=[order_id])
    submitted_by: Mapped["User"] = relationship("User")
    items: Mapped[list["RMAItem"]] = relationship(
        "RMAItem", back_populates="rma", cascade="all, delete-orphan"
    )


class RMAItem(TenantMixin, BaseModel):
    __tablename__ = "rma_items"

    rma_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rma_requests.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    order_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("order_items.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500))
    refund_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    # An exchange: what the buyer gets instead. What came back, and whether it
    # went back on the shelf.
    replacement_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL")
    )
    received_quantity: Mapped[int | None] = mapped_column(Integer)
    restock: Mapped[bool | None] = mapped_column(Boolean)

    rma: Mapped["RMARequest"] = relationship("RMARequest", back_populates="items")
    order_item: Mapped["OrderItem"] = relationship("OrderItem")


class RMAEvent(TenantMixin, BaseModel):
    """One status change of a return: who made it and their note (0070)."""
    __tablename__ = "rma_events"

    rma_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rma_requests.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_kind: Mapped[str] = mapped_column(String(10), nullable=False)  # buyer | staff | system
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    actor_name: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(String(2000))
