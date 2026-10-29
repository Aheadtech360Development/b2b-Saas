"""Loyalty points and buyer referrals (migration 0071_loyalty).
`services/loyalty.py` is the only writer."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin


class LoyaltyAccount(TenantMixin, BaseModel):
    __tablename__ = "loyalty_accounts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lifetime_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # What the buyer shares: the shop's address with ?bref=CODE.
    referral_code: Mapped[str] = mapped_column(String(16), nullable=False)


class LoyaltyLedger(TenantMixin, BaseModel):
    __tablename__ = "loyalty_ledger"

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loyalty_accounts.id", ondelete="CASCADE"), nullable=False
    )
    # earn | reverse | redeem | referral | adjust | expire | restore
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    # On rows that add points: how many are still unspent (spent oldest first).
    remaining: Mapped[int | None] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expiry_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    discount_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discount_codes.id", ondelete="SET NULL")
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    actor_name: Mapped[str | None] = mapped_column(String(255))
    reason: Mapped[str | None] = mapped_column(String(300))
    idempotency_key: Mapped[str] = mapped_column(String(150), nullable=False)


class BuyerReferral(TenantMixin, BaseModel):
    __tablename__ = "buyer_referrals"

    referrer_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loyalty_accounts.id", ondelete="CASCADE"), nullable=False
    )
    referred_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    referred_email: Mapped[str | None] = mapped_column(String(255))
    # pending | qualified | rewarded | blocked
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    block_reason: Mapped[str | None] = mapped_column(String(300))
    first_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    rewarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
