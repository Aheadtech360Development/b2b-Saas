"""The owner's daily briefing — "what should I do today?"

Computed straight from the brand's own tables, not generated. The list is the
part an owner acts on, so every number on it has to be exactly what the matching
admin screen would show; a model is never asked to produce one. The copilot chat
reads this same list through a tool when it needs it.

Every query is tenant-scoped by TenantMixin, like the rest of the admin, and each
runs on its own so a single failing check cannot blank the whole briefing.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.inventory import InventoryRecord
from app.models.order import AbandonedCart, Order
from app.models.product import ProductVariant
from app.models.rma import RMARequest

logger = logging.getLogger(__name__)

# Orders in these states need nothing more from the brand.
CLOSED_ORDER_STATES = ("delivered", "cancelled", "refunded")
# Paid, but not yet out of the door.
UNSHIPPED_STATES = ("pending", "confirmed", "processing")
# How long an unshipped paid order may sit before it is flagged as at risk.
SHIP_RISK_DAYS = 3
# How long a revision may wait on the customer before it is worth a nudge.
REVISION_STALE_DAYS = 2
# Abandoned carts older than this are history, not a recovery opportunity.
ABANDONED_WINDOW_DAYS = 7

SEVERITY_ORDER = {"urgent": 0, "attention": 1, "info": 2}


def _money(v) -> float:
    return float(Decimal(str(v or 0)).quantize(Decimal("0.01")))


async def build_briefing(db: AsyncSession) -> dict:
    now = datetime.now(UTC)
    items: list[dict] = []

    async def run(label: str, fn):
        try:
            await fn()
        except Exception as exc:  # one broken check must not hide the others
            logger.warning("briefing check %s failed: %s", label, exc)
            try:
                await db.rollback()
            except Exception:
                pass

    # ── Print jobs waiting on the brand ──────────────────────────────────────
    async def print_jobs():
        from app.api.v1.gang_sheets import (
            STATUS_IN_REVIEW, STATUS_REVISION, GangSheetOrder,
        )
        waiting = (await db.execute(
            select(func.count(GangSheetOrder.id)).where(GangSheetOrder.status == STATUS_IN_REVIEW)
        )).scalar_one() or 0
        if waiting:
            items.append({
                "key": "print_jobs_review", "severity": "urgent", "count": int(waiting),
                "title": f"{waiting} print job{'s' if waiting != 1 else ''} waiting for artwork review",
                "detail": "Paid gang sheets and upload-by-size jobs that can't go to production until someone approves them.",
                "href": "/admin/gang-sheets",
            })
        stale = (await db.execute(
            select(func.count(GangSheetOrder.id)).where(
                GangSheetOrder.status == STATUS_REVISION,
                GangSheetOrder.updated_at < now - timedelta(days=REVISION_STALE_DAYS),
            )
        )).scalar_one() or 0
        if stale:
            items.append({
                "key": "print_jobs_revision_stale", "severity": "info", "count": int(stale),
                "title": f"{stale} revision request{'s' if stale != 1 else ''} with no reply in {REVISION_STALE_DAYS}+ days",
                "detail": "The customer was asked to fix their artwork and hasn't resubmitted. A reminder may unblock them.",
                "href": "/admin/gang-sheets",
            })

    # ── Money not collected ──────────────────────────────────────────────────
    async def unpaid():
        # Delivered orders stay in: an order on net-30 is delivered first and paid
        # after, so leaving "delivered" out hid exactly the money a B2B store is
        # waiting on. Part-payments count for what is left, not the full total.
        owed = Order.total - func.coalesce(Order.amount_paid, 0)
        row = (await db.execute(
            select(func.count(Order.id), func.coalesce(func.sum(owed), 0)).where(
                Order.payment_status.notin_(("paid", "refunded")),
                Order.status.notin_(("cancelled", "refunded")),
                owed > 0,
            )
        )).one()
        count, amount = int(row[0] or 0), _money(row[1])
        if count:
            items.append({
                "key": "unpaid_orders", "severity": "attention", "count": count, "amount": amount,
                "title": f"{count} unpaid order{'s' if count != 1 else ''} — ${amount:,.2f} outstanding",
                "detail": "Orders not yet fully paid, including delivered orders on payment terms.",
                "href": "/admin/orders",
            })

    # ── Paid orders at risk of shipping late ─────────────────────────────────
    async def ship_risk():
        count = (await db.execute(
            select(func.count(Order.id)).where(
                Order.payment_status == "paid",
                Order.status.in_(UNSHIPPED_STATES),
                Order.shipped_at.is_(None),
                Order.created_at < now - timedelta(days=SHIP_RISK_DAYS),
            )
        )).scalar_one() or 0
        if count:
            items.append({
                "key": "ship_risk", "severity": "urgent", "count": int(count),
                "title": f"{count} paid order{'s' if count != 1 else ''} not shipped after {SHIP_RISK_DAYS}+ days",
                "detail": "Paid more than three days ago and still not marked shipped.",
                "href": "/admin/orders",
            })

    # ── New orders to confirm ────────────────────────────────────────────────
    async def new_orders():
        count = (await db.execute(
            select(func.count(Order.id)).where(Order.status == "pending")
        )).scalar_one() or 0
        if count:
            items.append({
                "key": "new_orders", "severity": "attention", "count": int(count),
                "title": f"{count} new order{'s' if count != 1 else ''} to confirm",
                "detail": "Orders still at Pending.",
                "href": "/admin/orders",
            })

    # ── Customers waiting for account approval ───────────────────────────────
    async def approvals():
        count = (await db.execute(
            select(func.count(Company.id)).where(Company.status == "pending")
        )).scalar_one() or 0
        if count:
            items.append({
                "key": "account_approvals", "severity": "attention", "count": int(count),
                "title": f"{count} wholesale account{'s' if count != 1 else ''} waiting for approval",
                "detail": "They can't order at wholesale prices until approved.",
                "href": "/admin/customers",
            })

    # ── Returns waiting ──────────────────────────────────────────────────────
    async def returns():
        count = (await db.execute(
            select(func.count(RMARequest.id)).where(RMARequest.status == "pending")
        )).scalar_one() or 0
        if count:
            items.append({
                "key": "returns_pending", "severity": "attention", "count": int(count),
                "title": f"{count} return request{'s' if count != 1 else ''} to review",
                "detail": "Customers are waiting on a decision.",
                "href": "/admin/returns",
            })

    # ── Stock running out ────────────────────────────────────────────────────
    async def low_stock():
        rows = (await db.execute(
            select(ProductVariant.sku, ProductVariant.color, ProductVariant.size, InventoryRecord.quantity)
            .join(ProductVariant, ProductVariant.id == InventoryRecord.variant_id)
            .where(InventoryRecord.quantity <= InventoryRecord.low_stock_threshold)
            .order_by(InventoryRecord.quantity.asc())
            .limit(50)
        )).all()
        if rows:
            out = [r for r in rows if (r.quantity or 0) <= 0]
            examples = ", ".join(
                f"{r.sku}{' ' + r.color if r.color else ''}{' ' + r.size if r.size else ''} ({r.quantity})"
                for r in rows[:3]
            )
            items.append({
                "key": "low_stock", "severity": "urgent" if out else "attention", "count": len(rows),
                "title": (f"{len(rows)} variant{'s' if len(rows) != 1 else ''} low on stock"
                          + (f" — {len(out)} already out" if out else "")),
                "detail": f"Lowest: {examples}.",
                "href": "/admin/inventory",
            })

    # ── Carts left behind ────────────────────────────────────────────────────
    async def abandoned():
        row = (await db.execute(
            select(func.count(AbandonedCart.id), func.coalesce(func.sum(AbandonedCart.total), 0)).where(
                and_(AbandonedCart.is_recovered.is_(False),
                     AbandonedCart.created_at >= now - timedelta(days=ABANDONED_WINDOW_DAYS))
            )
        )).one()
        count, amount = int(row[0] or 0), _money(row[1])
        if count:
            items.append({
                "key": "abandoned_carts", "severity": "info", "count": count, "amount": amount,
                "title": f"${amount:,.2f} in {count} abandoned cart{'s' if count != 1 else ''} this week",
                "detail": "Not recovered yet — a follow-up can bring some back.",
                "href": "/admin/abandoned-carts",
            })

    for label, fn in (
        ("print_jobs", print_jobs), ("ship_risk", ship_risk), ("unpaid", unpaid),
        ("new_orders", new_orders), ("approvals", approvals), ("returns", returns),
        ("low_stock", low_stock), ("abandoned", abandoned),
    ):
        await run(label, fn)

    items.sort(key=lambda i: (SEVERITY_ORDER.get(i["severity"], 9), -(i.get("count") or 0)))

    # Yesterday-vs-today pulse, so the briefing opens with where things stand.
    pulse = {"orders_today": 0, "revenue_today": 0.0, "orders_7d": 0, "revenue_7d": 0.0}
    async def headline():
        start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        for key, since in (("today", start_today), ("7d", now - timedelta(days=7))):
            row = (await db.execute(
                select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(
                    Order.created_at >= since,
                    Order.status.notin_(("cancelled", "refunded")),
                )
            )).one()
            pulse[f"orders_{key}"] = int(row[0] or 0)
            pulse[f"revenue_{key}"] = _money(row[1])
    await run("headline", headline)

    return {"generated_at": now.isoformat(), "pulse": pulse, "items": items}
