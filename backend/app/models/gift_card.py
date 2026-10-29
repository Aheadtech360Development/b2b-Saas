"""Gift cards, what checkouts set aside on them, and every change to them
(migration 0069_gift_cards). `services/gift_cards.py` is the only writer."""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin


class GiftCard(TenantMixin, BaseModel):
    __tablename__ = "gift_cards"

    # SHA-256 of the shop and the normalised code; the code itself is never kept.
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    code_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    initial_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="usd")
    # active | disabled | voided | expired
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # purchase | manual | store_credit
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    purchase_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    buyer_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    buyer_email: Mapped[str | None] = mapped_column(String(255))
    recipient_name: Mapped[str | None] = mapped_column(String(120))
    recipient_email: Mapped[str | None] = mapped_column(String(255))
    message: Mapped[str | None] = mapped_column(String(500))
    sender_name: Mapped[str | None] = mapped_column(String(120))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Why it was disabled, voided or turned back on, in the admin's words.
    status_reason: Mapped[str | None] = mapped_column(String(300))
    note: Mapped[str | None] = mapped_column(String(500))


class GiftCardHold(TenantMixin, BaseModel):
    __tablename__ = "gift_card_holds"

    gift_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gift_cards.id", ondelete="CASCADE"), nullable=False
    )
    # The checkout attempt that set it aside (the page's attempt key).
    checkout_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    payment_intent_id: Mapped[str | None] = mapped_column(String(100))
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # held | captured | released
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="held")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class GiftCardLedger(TenantMixin, BaseModel):
    __tablename__ = "gift_card_ledger"

    gift_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gift_cards.id", ondelete="CASCADE"), nullable=False
    )
    # issue | hold | release | capture | refund | adjust | void | expire
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    hold_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gift_card_holds.id", ondelete="SET NULL")
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    actor_name: Mapped[str | None] = mapped_column(String(255))
    reason: Mapped[str | None] = mapped_column(String(300))
    idempotency_key: Mapped[str] = mapped_column(String(150), nullable=False)
