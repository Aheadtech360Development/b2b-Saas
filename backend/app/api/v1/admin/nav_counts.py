"""Admin sidebar counts.

One endpoint rather than one request per section: the sidebar is on every admin
page, so five separate count calls would be five round trips on every navigation.
These are plain COUNT(*) queries against indexed tenant-scoped tables.

Counts are what the admin is looking at — the catalogue they manage, the orders
that need them — so each one is scoped the same way its own page is.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.company import Company
from app.models.order import Order
from app.models.product import Product
from app.models.rma import RMARequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

# Orders in these states are finished — the sidebar counts what is still live,
# which is what an admin actually wants to see at a glance. Every label here must
# exist in the order_status enum; Postgres rejects a comparison against one that
# doesn't.
_CLOSED_ORDER_STATES = ("delivered", "cancelled", "refunded")


@router.get("/nav-counts")
async def get_nav_counts(
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Counts shown beside the admin nav items."""

    async def _count(stmt) -> int:
        try:
            return int((await db.execute(stmt)).scalar_one() or 0)
        except Exception as exc:            # a missing table must not break the nav
            logger.warning("nav count failed: %s", exc)
            return 0

    products = await _count(
        select(func.count(Product.id)).where(Product.status != "archived")
    )
    orders = await _count(
        select(func.count(Order.id)).where(Order.status.notin_(_CLOSED_ORDER_STATES))
    )
    customers = await _count(select(func.count(Company.id)))
    returns = await _count(
        select(func.count(RMARequest.id)).where(RMARequest.status == "pending")
    )

    return {
        "products": products,
        "orders": orders,
        "customers": customers,
        "returns": returns,
    }
