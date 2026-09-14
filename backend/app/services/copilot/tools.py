"""What the copilot can look at.

Phase 1 is read-only: no tool here writes anything. Two separate tool sets:

* Owner tools see the whole brand — the same scope as the admin screens, and
  only ever reachable behind require_admin.
* Customer tools see one buyer's own orders. Who that buyer is comes from the
  signed-in session and is bound into the handler here, never from the model's
  input — a prompt cannot talk its way into another customer's orders.

Tenant scoping is the same TenantMixin filter every admin query already relies
on, so neither set can see another brand.

Tool results are compact JSON with only what a reply needs. Money is rounded,
dates are ISO, and lists are capped, so a large brand cannot blow the context.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Awaitable, Callable

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Company
from app.models.inventory import InventoryRecord
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductVariant
from app.services.copilot.briefing import build_briefing
from app.services.copilot.guide import INDEX as GUIDE_INDEX, TOPICS as GUIDE_TOPICS, lookup as guide_lookup

Handler = Callable[[dict], Awaitable[Any]]

MAX_ROWS = 25


def _money(v) -> float:
    return float(Decimal(str(v or 0)).quantize(Decimal("0.01")))


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _days(n, default: int, cap: int = 365) -> int:
    try:
        return max(1, min(int(n), cap))
    except (TypeError, ValueError):
        return default


def _order_brief(o: Order, company_name: str | None = None, *, admin: bool = True) -> dict:
    return {
        "order_number": o.order_number,
        # Where this order opens. Both detail pages take the order number, not
        # the id. Handing the link over means the copilot never has to build one.
        ("admin_link" if admin else "link"): (
            f"/admin/orders/{o.order_number}" if admin else f"/account/orders/{o.order_number}"
        ),
        "customer": company_name or o.guest_name or o.guest_email,
        "placed": _iso(o.created_at),
        "status": o.status,
        "payment_status": o.payment_status,
        "total": _money(o.total),
        "carrier": o.carrier or o.courier,
        "tracking_number": o.tracking_number,
        "shipped_at": _iso(o.shipped_at),
    }


async def _print_jobs_for_order(db: AsyncSession, order_id) -> list[dict]:
    from app.api.v1.gang_sheets import GangSheetOrder

    rows = (await db.execute(
        select(GangSheetOrder).where(GangSheetOrder.order_id == order_id)
    )).scalars().all()
    return [{
        "reference": g.reference,
        "kind": "gang_sheet" if g.sheet_size_id else "upload_by_size",
        "name": g.sheet_name,
        "status": g.status,
        "note_to_customer": g.supplier_notes,
    } for g in rows]


async def _order_detail(db: AsyncSession, o: Order) -> dict:
    company = None
    if o.company_id:
        company = (await db.execute(select(Company.name).where(Company.id == o.company_id))).scalar_one_or_none()
    data = _order_brief(o, company)
    data.update({
        "items": [{
            "product": i.product_name, "sku": i.sku, "color": i.color, "size": i.size,
            "quantity": i.quantity, "line_total": _money(i.line_total),
        } for i in (o.items or [])][:MAX_ROWS],
        "tracking_url": o.tracking_url,
        "shipping_method": o.courier_service or o.shipping_method,
        "print_jobs": await _print_jobs_for_order(db, o.id),
    })
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Owner tools
# ─────────────────────────────────────────────────────────────────────────────

OWNER_TOOLS: list[dict] = [
    {
        "name": "get_briefing",
        "description": (
            "Returns today's priority list for the store: print jobs waiting for artwork review, "
            "paid orders at risk of shipping late, unpaid orders and the amount outstanding, new "
            "orders to confirm, wholesale accounts awaiting approval, pending returns, low-stock "
            "variants and abandoned carts from the last 7 days, plus orders and revenue for today "
            "and the last 7 days. Use it for 'what should I do today', 'what needs attention', or "
            "any overview of the store's current state. The numbers are exact counts from the database."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "how_to",
        "description": (
            "How to do something in this admin — the real screens, menu paths and button names. "
            "Use it for ANY 'how do I…' or 'where do I…' question (adding a product or customer, "
            "building product options, approving wholesale accounts, the gang sheet builder, "
            "inventory, suppliers, shipping and carriers, email, discounts, staff users, the "
            "storefront, purchase orders, returns, tax, billing). Never answer one of these from "
            "memory: menu paths you have not read here are guesses and will send the owner to a "
            "screen that does not exist.\n\nTopics:\n" + GUIDE_INDEX
        ),
        "input_schema": {
            "type": "object",
            "properties": {"topic": {"type": "string", "enum": list(GUIDE_TOPICS)}},
            "required": ["topic"],
        },
    },
    {
        "name": "catalog_summary",
        "description": (
            "What the store holds right now, as exact counts: products by status (active, draft, "
            "archived), how many are stocked-variant versus made-to-order configurable, how many "
            "have the gang sheet or upload-by-size builder switched on, total variants, how many "
            "variants are low on stock or out of stock, total units in stock, and customer accounts "
            "by status. Use it for 'how many products do I have', 'how many SKUs', 'how big is my "
            "catalogue', 'how many customers' and anything else about the size of the store."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_products",
        "description": (
            "Lists products, at most 25, newest first. Filter by part of a product name or SKU, by "
            "status, and by whether they are low on stock. Each row gives the name, status, whether "
            "it is a stocked or configurable product, its variant count, its price range and its "
            "total stock. Use it to find a product or answer 'which products are out of stock'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Part of a product name or a variant SKU."},
                "status": {"type": "string", "enum": ["active", "draft", "archived"]},
                "low_stock_only": {"type": "boolean", "description": "Only products with a variant at or below its low-stock threshold."},
            },
        },
    },
    {
        "name": "sales_summary",
        "description": (
            "Sales for the last N days: order count, revenue, average order value, orders by status, "
            "the top products by revenue and the top customers by spend. Cancelled and refunded orders "
            "are excluded from revenue. Use it for questions like 'what happened this week', 'how are "
            "sales', 'best sellers' or 'biggest customers'. It does not know costs or margins."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Look-back window in days, 1-365. Default 7."}},
        },
    },
    {
        "name": "search_orders",
        "description": (
            "Lists orders, newest first, at most 25. Filter by order status, payment status, a customer "
            "name or email fragment, and a look-back window in days. Use it to find specific orders "
            "('unpaid orders from Acme', 'what shipped yesterday'). Returns order number, customer, "
            "date, status, payment status, total and tracking."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["pending", "confirmed", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled", "refunded"]},
                "payment_status": {"type": "string", "enum": ["unpaid", "pending", "paid", "refunded", "failed"]},
                "customer": {"type": "string", "description": "Part of a company name, guest name or email."},
                "days": {"type": "integer", "description": "Only orders placed in the last N days."},
            },
        },
    },
    {
        "name": "get_order",
        "description": (
            "Full detail for one order by its order number (for example 1043 or #1043): customer, "
            "items, totals, payment, shipping, tracking, and the status of any gang sheet or "
            "upload-by-size print jobs on it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"order_number": {"type": "string"}},
            "required": ["order_number"],
        },
    },
    {
        "name": "list_print_jobs",
        "description": (
            "Lists gang sheet and upload-by-size print jobs, newest first, at most 25, optionally by "
            "status: submitted (not yet paid), in_review, approved, production, revision_requested, "
            "rejected, completed. Returns reference, kind, name, customer contact, status, paid flag "
            "and total."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"status": {"type": "string", "enum": ["submitted", "in_review", "approved", "production", "revision_requested", "rejected", "completed"]}},
        },
    },
    {
        "name": "find_customer",
        "description": (
            "Looks up wholesale customer accounts by part of the company name. For each: account "
            "status, number of orders, total spent (excluding cancelled and refunded), and the date "
            "of their last order. Use it for questions about a specific customer or who has gone quiet."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
    },
]


def owner_handlers(db: AsyncSession) -> dict[str, Handler]:
    async def get_briefing(_: dict):
        return await build_briefing(db)

    async def catalog_summary(_: dict):
        by_status = dict((await db.execute(
            select(Product.status, func.count(Product.id)).group_by(Product.status)
        )).all())
        configurable = (await db.execute(
            select(func.count(Product.id)).where(Product.pricing_mode == "configurable")
        )).scalar_one() or 0
        builder = dict((await db.execute(
            select(Product.gang_sheet_type, func.count(Product.id))
            .where(Product.gang_sheet_enabled.is_(True)).group_by(Product.gang_sheet_type)
        )).all())
        variants = (await db.execute(select(func.count(ProductVariant.id)))).scalar_one() or 0
        units, low, out = (await db.execute(select(
            func.coalesce(func.sum(InventoryRecord.quantity), 0),
            func.count(InventoryRecord.id).filter(InventoryRecord.quantity <= InventoryRecord.low_stock_threshold),
            func.count(InventoryRecord.id).filter(InventoryRecord.quantity <= 0),
        ))).one()
        customers = dict((await db.execute(
            select(Company.status, func.count(Company.id)).group_by(Company.status)
        )).all())
        total = sum(int(v) for v in by_status.values())
        return {
            "products_total": total,
            "products_by_status": {k: int(v) for k, v in by_status.items()},
            "products_stocked": max(0, total - int(configurable)),
            "products_configurable": int(configurable),
            "products_with_builder": {(k or "gang_sheet"): int(v) for k, v in builder.items()},
            "variants_total": int(variants),
            "variants_low_stock": int(low or 0),
            "variants_out_of_stock": int(out or 0),
            "units_in_stock": int(units or 0),
            "customer_accounts_by_status": {k: int(v) for k, v in customers.items()},
        }

    async def search_products(args: dict):
        stock = (
            select(
                ProductVariant.product_id.label("pid"),
                func.count(ProductVariant.id).label("variants"),
                func.min(ProductVariant.retail_price).label("min_price"),
                func.max(ProductVariant.retail_price).label("max_price"),
                func.coalesce(func.sum(InventoryRecord.quantity), 0).label("units"),
                func.count(InventoryRecord.id).filter(
                    InventoryRecord.quantity <= InventoryRecord.low_stock_threshold
                ).label("low"),
            )
            .outerjoin(InventoryRecord, InventoryRecord.variant_id == ProductVariant.id)
            .group_by(ProductVariant.product_id)
            .subquery()
        )
        stmt = select(Product, stock).outerjoin(stock, stock.c.pid == Product.id)
        if args.get("status"):
            stmt = stmt.where(Product.status == args["status"])
        if (q := (args.get("query") or "").strip()):
            like = f"%{q}%"
            skus = select(ProductVariant.product_id).where(ProductVariant.sku.ilike(like))
            stmt = stmt.where(or_(Product.name.ilike(like), Product.id.in_(skus)))
        if args.get("low_stock_only"):
            stmt = stmt.where(stock.c.low > 0)
        rows = (await db.execute(stmt.order_by(Product.created_at.desc()).limit(MAX_ROWS))).all()

        out = []
        for row in rows:
            p = row[0]
            configurable = (getattr(p, "pricing_mode", "variant") or "variant") == "configurable"
            item = {
                "name": p.name,
                "admin_link": f"/admin/products/{p.slug}/edit",
                "status": p.status,
                "type": "configurable" if configurable else "stocked",
                "variants": int(row.variants or 0),
                "units_in_stock": int(row.units or 0),
                "variants_low_stock": int(row.low or 0),
            }
            if row.min_price is not None:
                lo, hi = _money(row.min_price), _money(row.max_price)
                item["price"] = f"${lo:.2f}" if lo == hi else f"${lo:.2f}-${hi:.2f}"
            if getattr(p, "gang_sheet_enabled", False):
                item["builder"] = getattr(p, "gang_sheet_type", None) or "gang_sheet"
            out.append(item)
        return {"products": out, "shown": len(out), "limit": MAX_ROWS}

    async def sales_summary(args: dict):
        days = _days(args.get("days"), 7)
        since = datetime.now(UTC) - timedelta(days=days)
        live = (Order.created_at >= since, Order.status.notin_(("cancelled", "refunded")))

        count, revenue = (await db.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(*live)
        )).one()
        by_status = dict((await db.execute(
            select(Order.status, func.count(Order.id)).where(Order.created_at >= since).group_by(Order.status)
        )).all())
        top_products = [
            {"product": name, "units": int(units or 0), "revenue": _money(rev)}
            for name, units, rev in (await db.execute(
                select(OrderItem.product_name, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total))
                .join(Order, Order.id == OrderItem.order_id).where(*live)
                .group_by(OrderItem.product_name).order_by(func.sum(OrderItem.line_total).desc()).limit(5)
            )).all()
        ]
        top_customers = [
            {"customer": name, "orders": int(n or 0), "spent": _money(total)}
            for name, n, total in (await db.execute(
                select(Company.name, func.count(Order.id), func.sum(Order.total))
                .join(Company, Company.id == Order.company_id).where(*live)
                .group_by(Company.name).order_by(func.sum(Order.total).desc()).limit(5)
            )).all()
        ]
        count = int(count or 0)
        return {
            "days": days, "orders": count, "revenue": _money(revenue),
            "average_order_value": _money(Decimal(str(revenue or 0)) / count) if count else 0.0,
            "orders_by_status": {k: int(v) for k, v in by_status.items()},
            "top_products": top_products, "top_customers": top_customers,
        }

    async def search_orders(args: dict):
        stmt = select(Order, Company.name).outerjoin(Company, Company.id == Order.company_id)
        if args.get("status"):
            stmt = stmt.where(Order.status == args["status"])
        if args.get("payment_status"):
            stmt = stmt.where(Order.payment_status == args["payment_status"])
        if args.get("days"):
            stmt = stmt.where(Order.created_at >= datetime.now(UTC) - timedelta(days=_days(args["days"], 30)))
        if (q := (args.get("customer") or "").strip()):
            like = f"%{q}%"
            stmt = stmt.where(or_(Company.name.ilike(like), Order.guest_name.ilike(like), Order.guest_email.ilike(like)))
        rows = (await db.execute(stmt.order_by(Order.created_at.desc()).limit(MAX_ROWS))).all()
        return {"orders": [_order_brief(o, name) for o, name in rows], "shown": len(rows), "limit": MAX_ROWS}

    async def get_order(args: dict):
        number = str(args.get("order_number") or "").strip().lstrip("#")
        if not number:
            return {"error": "Give an order number."}
        o = (await db.execute(
            select(Order).options(selectinload(Order.items)).where(Order.order_number == number)
        )).scalar_one_or_none()
        if not o:
            return {"error": f"No order #{number} in this store."}
        return await _order_detail(db, o)

    async def list_print_jobs(args: dict):
        from app.api.v1.gang_sheets import GangSheetOrder

        stmt = select(GangSheetOrder)
        if args.get("status"):
            stmt = stmt.where(GangSheetOrder.status == args["status"])
        rows = (await db.execute(stmt.order_by(GangSheetOrder.created_at.desc()).limit(MAX_ROWS))).scalars().all()
        return {"print_jobs": [{
            "reference": g.reference,
            "admin_link": "/admin/gang-sheets",
            "kind": "gang_sheet" if g.sheet_size_id else "upload_by_size",
            "name": g.sheet_name,
            "customer": g.contact_name or g.contact_email,
            "status": g.status,
            "paid": bool(g.paid_at),
            "total": _money(g.subtotal),
            "created": _iso(g.created_at),
        } for g in rows]}

    async def find_customer(args: dict):
        q = (args.get("name") or "").strip()
        if not q:
            return {"error": "Give part of a company name."}
        live = Order.status.notin_(("cancelled", "refunded"))
        rows = (await db.execute(
            select(
                Company.id, Company.name, Company.status,
                func.count(Order.id).filter(live),
                func.coalesce(func.sum(Order.total).filter(live), 0),
                func.max(Order.created_at),
            )
            .outerjoin(Order, Order.company_id == Company.id)
            .where(Company.name.ilike(f"%{q}%"))
            .group_by(Company.id, Company.name, Company.status)
            .limit(10)
        )).all()
        return {"customers": [{
            "name": name, "admin_link": f"/admin/customers/{cid}", "account_status": status,
            "orders": int(n or 0), "total_spent": _money(spent), "last_order": _iso(last),
        } for cid, name, status, n, spent, last in rows]}

    async def how_to(args: dict):
        return guide_lookup(str(args.get("topic") or ""))

    return {
        "get_briefing": get_briefing, "how_to": how_to, "sales_summary": sales_summary,
        "catalog_summary": catalog_summary, "search_products": search_products,
        "search_orders": search_orders, "get_order": get_order,
        "list_print_jobs": list_print_jobs, "find_customer": find_customer,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Customer tools — bound to one buyer
# ─────────────────────────────────────────────────────────────────────────────

CUSTOMER_TOOLS: list[dict] = [
    {
        "name": "my_recent_orders",
        "description": (
            "Lists this customer's own most recent orders, newest first, at most 10: order number, "
            "date, status, payment status, total, carrier and tracking number. Use it when they ask "
            "about 'my order' without giving a number, or want to see their orders."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "my_order_status",
        "description": (
            "Full status of one of this customer's own orders by order number: items, payment, "
            "shipping, tracking link, and where any gang sheet or upload-by-size print job on it "
            "stands (for example in review, needs a revision, in production). Only returns the order "
            "if it belongs to this customer."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"order_number": {"type": "string"}},
            "required": ["order_number"],
        },
    },
    {
        "name": "my_print_jobs",
        "description": (
            "Lists this customer's own gang sheet and upload-by-size print jobs, newest first, at most "
            "10, with status and any note the print team left for them. Use it for questions about "
            "artwork approval, revisions or production of their designs."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def customer_handlers(db: AsyncSession, *, user_id, company_id) -> dict[str, Handler]:
    def _as_uuid(v):
        if not v:
            return None
        try:
            return v if isinstance(v, uuid.UUID) else uuid.UUID(str(v))
        except (TypeError, ValueError):
            return None

    uid, cid = _as_uuid(user_id), _as_uuid(company_id)

    def owns_order():
        # A company buyer sees the company's orders; an individual sees their own.
        return Order.company_id == cid if cid else Order.placed_by_id == uid

    async def my_recent_orders(_: dict):
        if not (uid or cid):
            return {"error": "Not signed in."}
        rows = (await db.execute(
            select(Order).where(owns_order()).order_by(Order.created_at.desc()).limit(10)
        )).scalars().all()
        return {"orders": [_order_brief(o, admin=False) for o in rows]}

    async def my_order_status(args: dict):
        if not (uid or cid):
            return {"error": "Not signed in."}
        number = str(args.get("order_number") or "").strip().lstrip("#")
        o = (await db.execute(
            select(Order).options(selectinload(Order.items))
            .where(Order.order_number == number, owns_order())
        )).scalar_one_or_none()
        if not o:
            # Same answer whether it doesn't exist or isn't theirs.
            return {"error": f"No order #{number} on this account."}
        data = await _order_detail(db, o)
        data.pop("customer", None)
        data.pop("admin_link", None)
        data["link"] = f"/account/orders/{o.order_number}"
        return data

    async def my_print_jobs(_: dict):
        from app.api.v1.gang_sheets import GangSheetOrder

        if not (uid or cid):
            return {"error": "Not signed in."}
        owner = GangSheetOrder.company_id == cid if cid else GangSheetOrder.user_id == uid
        rows = (await db.execute(
            select(GangSheetOrder).where(owner).order_by(GangSheetOrder.created_at.desc()).limit(10)
        )).scalars().all()
        return {"print_jobs": [{
            "reference": g.reference,
            "link": "/account/gang-sheets",
            "kind": "gang_sheet" if g.sheet_size_id else "upload_by_size",
            "name": g.sheet_name,
            "status": g.status,
            "paid": bool(g.paid_at),
            "note_from_print_team": g.supplier_notes,
        } for g in rows]}

    return {
        "my_recent_orders": my_recent_orders,
        "my_order_status": my_order_status,
        "my_print_jobs": my_print_jobs,
    }
