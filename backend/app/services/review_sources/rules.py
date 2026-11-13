"""Who may write a review on the shop, and what "Verified buyer" means.

A review says "Verified buyer" only when the person writing it has an order for
that product that was paid for, or shipped or delivered (cash on delivery is
unpaid until the shop marks it). Being signed in is not enough: a badge that
says "bought it" about someone who did not is exactly what makes reviews look
fake, and it is a claim the shop is making to its customers.

The orders counted are the customer's own, their company's (a trade buyer
orders for the company), and guest orders placed under the same email.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

# An order in one of these states never counts as a purchase.
_NOT_BOUGHT = ("cancelled", "refunded")
# Shipped or delivered counts even while unpaid: cash on delivery.
_HANDED_OVER = ("shipped", "delivered")


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value else None
    except (TypeError, ValueError):
        return None


async def bought(db: AsyncSession, *, product_id: Any, user_id: Any, email: str | None = None) -> bool:
    """Has this customer bought this product from this shop?

    Runs on the request's own session, so it only ever sees this brand's orders.
    """
    from app.models.company import CompanyUser
    from app.models.order import Order, OrderItem
    from app.models.product import ProductVariant

    pid = _uuid(product_id)
    uid = _uuid(user_id)
    if pid is None or uid is None:
        return False

    companies = select(CompanyUser.company_id).where(CompanyUser.user_id == uid)
    whose = or_(Order.placed_by_id == uid, Order.company_id.in_(companies))
    if email and email.strip():
        whose = or_(whose, func.lower(Order.guest_email) == email.strip().lower())

    this_product = or_(
        OrderItem.product_id == pid,
        OrderItem.variant_id.in_(select(ProductVariant.id).where(ProductVariant.product_id == pid)),
    )
    counted = and_(
        Order.status.notin_(_NOT_BOUGHT),
        or_(Order.payment_status == "paid", Order.status.in_(_HANDED_OVER)),
    )
    row = (await db.execute(
        select(OrderItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(whose, this_product, counted)
        .limit(1)
    )).first()
    return row is not None


def refusal(rules: dict, *, signed_in: bool, is_buyer: bool) -> str | None:
    """Why this visitor may not write a review, or None when they may."""
    if not signed_in:
        return "Sign in to write a review."
    if rules.get("who") == "buyers" and not is_buyer:
        return "Only customers who bought this product can review it."
    return None
