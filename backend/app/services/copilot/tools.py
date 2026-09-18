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
from app.services.copilot.quoting import (
    QuoteError, find_company, find_product, option_catalogue, quote_for,
)
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


def _period(args: dict, default_days: int) -> tuple[datetime, datetime, str]:
    """[start, end) for a question about a period.

    Explicit dates win: "last month" or "2025" is a calendar period, and "the
    last 30 days" is not the same thing — August has 31 days and the 30 days
    before today straddle two months. `end_date` is inclusive, as people say it.
    Without dates, the last N days up to now.
    """
    def parse(v):
        try:
            return datetime.strptime(str(v).strip()[:10], "%Y-%m-%d").replace(tzinfo=UTC)
        except (TypeError, ValueError):
            return None

    start, end = parse(args.get("start_date")), parse(args.get("end_date"))
    if start or end:
        now = datetime.now(UTC)
        start = start or datetime(2000, 1, 1, tzinfo=UTC)
        open_ended = end is None
        end = now if open_ended else end + timedelta(days=1)
        if end <= start:
            start, end = end - timedelta(days=1), start + timedelta(days=1)
            open_ended = False
        last_day = end if open_ended else end - timedelta(days=1)
        label = f"{start:%Y-%m-%d} to {last_day:%Y-%m-%d}"
        return start, end, label
    days = _days(args.get("days"), default_days, cap=3650)
    now = datetime.now(UTC)
    return now - timedelta(days=days), now, f"last {days} days"


# Written as "net_30", "net 45", "due_on_receipt"… → days until payment is due.
def _terms_days(terms: str | None) -> int:
    t = (terms or "").lower()
    digits = "".join(ch for ch in t if ch.isdigit())
    return int(digits) if digits else 0


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
        "name": "price_product",
        "description": (
            "What a product costs and what can be chosen on it. For a made-to-order product it "
            "returns the option groups and their choices (Size, Paper Stock, Turnaround…) so you "
            "can ask which ones the customer wants; for a stocked product, its variants' colours, "
            "sizes and prices. Use it before quoting when you don't know what the product offers."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"product": {"type": "string", "description": "Product name, slug or a variant SKU."}},
            "required": ["product"],
        },
    },
    {
        "name": "calculate_quote",
        "description": (
            "The real price for a quantity of a product, worked out by the same pricing engine the "
            "storefront and checkout use — never your own arithmetic. Pass the customer's choices by "
            "name, e.g. {\"Paper Stock\": \"Coated Semigloss\", \"Turnaround\": \"Next day\"}; "
            "anything not given falls back to that option's default. Returns unit price, one-off "
            "setup fees, the total, and a line-by-line breakdown of what each choice added. It also "
            "reports any choice it could not match and whether the quantity is below the product's "
            "minimum — say both out loud rather than quoting around them."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "product": {"type": "string"},
                "quantity": {"type": "integer"},
                "choices": {"type": "object", "additionalProperties": {"type": "string"},
                            "description": "Option name to chosen value, in the words the product uses."},
                "customer": {"type": "string",
                             "description": "Quote for this customer, so their tier or group pricing is used. Always pass it when you know who the quote is for."},
            },
            "required": ["product", "quantity"],
        },
    },
    {
        "name": "check_inventory",
        "description": (
            "Stock on hand for a product's variants: each colour and size with its quantity, its "
            "low-stock threshold and whether it is below it. Use it for 'do we have 40 black "
            "hoodies', before quoting a stocked product in quantity."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "product": {"type": "string"},
                "color": {"type": "string"},
                "size": {"type": "string"},
            },
            "required": ["product"],
        },
    },
    {
        "name": "sales_summary",
        "description": (
            "Sales for any period: order count, revenue, average order value, orders by status, the "
            "top products by revenue, the top customers by spend, and a month-by-month breakdown when "
            "the period is longer than a month. Cancelled and refunded orders are excluded from revenue. "
            "For a calendar period — 'last month', 'August', 'last year', '2025', 'this quarter' — pass "
            "start_date and end_date (YYYY-MM-DD, end inclusive), worked out from today's date. Use days "
            "only for 'the last N days'. For profit rather than revenue, use product_margins."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "First day of the period, YYYY-MM-DD."},
                "end_date": {"type": "string", "description": "Last day of the period, YYYY-MM-DD, inclusive."},
                "days": {"type": "integer", "description": "Only when no dates are given: the last N days. Default 7."},
            },
        },
    },
    {
        "name": "search_orders",
        "description": (
            "Lists orders, newest first, at most 25. Filter by order status, payment status, a customer "
            "name or email fragment, and a period (start_date/end_date as YYYY-MM-DD, or the last N days). "
            "Use it to find specific orders ('orders from Acme in March', 'what shipped yesterday'). "
            "Returns order number, customer, date, status, payment status, total and tracking. For who "
            "owes money and how much, use outstanding_balances instead — it totals every unpaid order, "
            "not just the first 25."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["pending", "confirmed", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled", "refunded"]},
                "payment_status": {"type": "string", "enum": ["unpaid", "pending", "paid", "refunded", "failed"]},
                "customer": {"type": "string", "description": "Part of a company name, guest name or email."},
                "start_date": {"type": "string", "description": "Placed on or after this day, YYYY-MM-DD."},
                "end_date": {"type": "string", "description": "Placed on or before this day, YYYY-MM-DD."},
                "days": {"type": "integer", "description": "Only orders placed in the last N days."},
            },
        },
    },
    {
        "name": "outstanding_balances",
        "description": (
            "Money owed to the store: every order not yet fully paid (unpaid, pending, failed, or "
            "part-paid), excluding cancelled and refunded ones, and including delivered orders on "
            "payment terms. Returns the grand total outstanding and how much of it is overdue, then "
            "each customer who owes money — how much, across how many orders, how much is overdue "
            "and since when — largest first. Due dates come from each order's payment terms (net 30 "
            "etc.) counted from when the invoice was sent, or from the order date if it wasn't. Pass "
            "customer to see that customer's unpaid orders one by one. Use it for 'who owes us', "
            "'outstanding balance', 'unpaid invoices', 'what is overdue', 'how much does X owe'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string", "description": "Part of a company name, guest name or email — lists that customer's unpaid orders."},
                "overdue_only": {"type": "boolean", "description": "Only count orders past their due date."},
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
        "name": "get_print_job",
        "description": (
            "One gang sheet or upload-by-size job by its reference (for example GS-202609-0003): "
            "what it is, its size and quantity, its price, its status, whether it is paid, the note "
            "left for the customer, its artwork files, and the order it was paid on."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"reference": {"type": "string"}},
            "required": ["reference"],
        },
    },
    {
        "name": "list_applications",
        "description": (
            "Wholesale account applications waiting for a decision — company name, business type, "
            "contact and when they applied. Use it for 'who is waiting for approval'. Approving one "
            "is an action, not a lookup."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "product_margins",
        "description": (
            "Profit by product over the last N days, for the products whose variants have a cost "
            "price filled in: revenue, cost, profit and margin %, plus how many sold items had no "
            "cost recorded. Cost is the variant's cost price as it is TODAY, not what it was when "
            "the order was placed, so treat the figures as a guide. Say clearly when coverage is "
            "partial — products with no cost recorded are missing from this entirely."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Look-back window in days, 1-365. Default 30."}},
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

    async def price_product(args: dict):
        try:
            product = await find_product(db, str(args.get("product") or ""))
        except QuoteError as exc:
            return {"error": str(exc)}
        configurable = (getattr(product, "pricing_mode", "variant") or "variant") == "configurable"
        data = {
            "product": product.name,
            "admin_link": f"/admin/products/{product.slug}/edit",
            "type": "configurable" if configurable else "stocked",
            "minimum_order_quantity": int(getattr(product, "moq", 1) or 1),
        }
        if configurable:
            data["options"] = option_catalogue(product)
            data["note"] = "Price depends on the choices — use calculate_quote once they are known."
            return data
        rows = (await db.execute(
            select(ProductVariant.sku, ProductVariant.color, ProductVariant.size, ProductVariant.retail_price)
            .where(ProductVariant.product_id == product.id, ProductVariant.status == "active")
            .order_by(ProductVariant.sort_order).limit(MAX_ROWS)
        )).all()
        data["variants"] = [{"sku": s, "color": c, "size": z, "price": _money(p)} for s, c, z, p in rows]
        return data

    async def calculate_quote(args: dict):
        try:
            product = await find_product(db, str(args.get("product") or ""))
            company = None
            if (who := (args.get("customer") or "").strip()):
                company = await find_company(db, who)
            return await quote_for(db, product, int(args.get("quantity") or 1),
                                   args.get("choices") or {}, company=company)
        except QuoteError as exc:
            return {"error": str(exc)}
        except (TypeError, ValueError):
            return {"error": "Quantity must be a number."}

    async def check_inventory(args: dict):
        try:
            product = await find_product(db, str(args.get("product") or ""))
        except QuoteError as exc:
            return {"error": str(exc)}
        stmt = (
            select(ProductVariant.sku, ProductVariant.color, ProductVariant.size,
                   func.coalesce(func.sum(InventoryRecord.quantity), 0),
                   func.max(InventoryRecord.low_stock_threshold))
            .outerjoin(InventoryRecord, InventoryRecord.variant_id == ProductVariant.id)
            .where(ProductVariant.product_id == product.id)
            .group_by(ProductVariant.id, ProductVariant.sku, ProductVariant.color, ProductVariant.size)
            .order_by(ProductVariant.sort_order)
        )
        if (c := (args.get("color") or "").strip()):
            stmt = stmt.where(ProductVariant.color.ilike(c))
        if (z := (args.get("size") or "").strip()):
            stmt = stmt.where(ProductVariant.size.ilike(z))
        rows = (await db.execute(stmt.limit(MAX_ROWS))).all()
        if not rows:
            return {"product": product.name, "variants": [],
                    "note": "No variants match that — a made-to-order product holds no stock."}
        return {
            "product": product.name,
            "admin_link": "/admin/inventory",
            "variants": [{
                "sku": sku, "color": color, "size": size,
                "in_stock": int(qty or 0),
                "low_stock_threshold": int(threshold or 0),
                "is_low": int(qty or 0) <= int(threshold or 0),
            } for sku, color, size, qty, threshold in rows],
        }

    async def sales_summary(args: dict):
        since, until, label = _period(args, 7)
        live = (Order.created_at >= since, Order.created_at < until,
                Order.status.notin_(("cancelled", "refunded")))

        count, revenue = (await db.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(*live)
        )).one()
        by_status = dict((await db.execute(
            select(Order.status, func.count(Order.id))
            .where(Order.created_at >= since, Order.created_at < until).group_by(Order.status)
        )).all())
        # A year is twelve numbers, not one: break long periods down by month.
        by_month = []
        if (until - since).days > 31:
            month = func.date_trunc("month", Order.created_at)
            by_month = [
                {"month": f"{m:%Y-%m}", "orders": int(n or 0), "revenue": _money(rev)}
                for m, n, rev in (await db.execute(
                    select(month, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
                    .where(*live).group_by(month).order_by(month)
                )).all() if m is not None
            ]
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
            "period": label, "orders": count, "revenue": _money(revenue),
            "average_order_value": _money(Decimal(str(revenue or 0)) / count) if count else 0.0,
            "orders_by_status": {k: int(v) for k, v in by_status.items()},
            "by_month": by_month,
            "top_products": top_products, "top_customers": top_customers,
        }

    async def search_orders(args: dict):
        stmt = select(Order, Company.name).outerjoin(Company, Company.id == Order.company_id)
        if args.get("status"):
            stmt = stmt.where(Order.status == args["status"])
        if args.get("payment_status"):
            stmt = stmt.where(Order.payment_status == args["payment_status"])
        if args.get("start_date") or args.get("end_date") or args.get("days"):
            since, until, _ = _period(args, 30)
            stmt = stmt.where(Order.created_at >= since, Order.created_at < until)
        if (q := (args.get("customer") or "").strip()):
            like = f"%{q}%"
            stmt = stmt.where(or_(Company.name.ilike(like), Order.guest_name.ilike(like), Order.guest_email.ilike(like)))
        rows = (await db.execute(stmt.order_by(Order.created_at.desc()).limit(MAX_ROWS))).all()
        return {"orders": [_order_brief(o, name) for o, name in rows], "shown": len(rows), "limit": MAX_ROWS}

    async def outstanding_balances(args: dict):
        now = datetime.now(UTC)
        paid = func.coalesce(Order.amount_paid, 0)
        owed = Order.total - paid
        stmt = (
            select(Order, Company.name)
            .outerjoin(Company, Company.id == Order.company_id)
            .where(
                Order.payment_status.notin_(("paid", "refunded")),
                Order.status.notin_(("cancelled", "refunded")),
                owed > 0,
            )
        )
        if (q := (args.get("customer") or "").strip()):
            like = f"%{q}%"
            stmt = stmt.where(or_(Company.name.ilike(like), Order.guest_name.ilike(like), Order.guest_email.ilike(like)))
        rows = (await db.execute(stmt.order_by(Order.created_at.asc()).limit(2000))).all()

        def due_of(o: Order) -> datetime:
            start = o.invoice_sent_at or o.created_at or now
            return start + timedelta(days=_terms_days(o.payment_terms))

        only_overdue = bool(args.get("overdue_only"))
        total = overdue_total = Decimal("0")
        per: dict[str, dict] = {}
        detail = []
        for o, company_name in rows:
            balance = Decimal(str(o.balance_due))
            due = due_of(o)
            late = due < now
            if only_overdue and not late:
                continue
            total += balance
            if late:
                overdue_total += balance
            who = company_name or o.guest_name or o.guest_email or "Guest"
            key = str(o.company_id) if o.company_id else f"guest:{(o.guest_email or who).lower()}"
            row = per.setdefault(key, {
                "customer": who,
                "admin_link": f"/admin/customers/{o.company_id}" if o.company_id else None,
                "orders": 0, "outstanding": Decimal("0"), "overdue": Decimal("0"),
                "oldest_unpaid": o.created_at,
            })
            row["orders"] += 1
            row["outstanding"] += balance
            if late:
                row["overdue"] += balance
            if q:
                detail.append({
                    "order_number": o.order_number,
                    "admin_link": f"/admin/orders/{o.order_number}",
                    "placed": _iso(o.created_at),
                    "status": o.status,
                    "payment_status": o.payment_status,
                    "total": _money(o.total),
                    "paid_so_far": _money(o.amount_paid),
                    "balance": _money(balance),
                    "terms": o.payment_terms,
                    "due": _iso(due),
                    "overdue_days": max(0, (now - due).days) if late else 0,
                })

        customers = sorted(per.values(), key=lambda r: r["outstanding"], reverse=True)
        out = {
            "total_outstanding": _money(total),
            "overdue": _money(overdue_total),
            "unpaid_orders": sum(r["orders"] for r in customers),
            "customers_owing": len(customers),
            "customers": [{
                **{k: v for k, v in r.items() if k not in ("outstanding", "overdue", "oldest_unpaid")},
                "outstanding": _money(r["outstanding"]),
                "overdue": _money(r["overdue"]),
                "oldest_unpaid": _iso(r["oldest_unpaid"]),
            } for r in customers[:MAX_ROWS]],
        }
        if q:
            out["orders"] = detail[:50]
        return out

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

    async def get_print_job(args: dict):
        from app.api.v1.gang_sheets import GangSheetArtwork, GangSheetOrder

        ref = (args.get("reference") or "").strip()
        if not ref:
            return {"error": "Give a print job reference, e.g. GS-202609-0003."}
        job = (await db.execute(
            select(GangSheetOrder).where(GangSheetOrder.reference.ilike(ref))
        )).scalar_one_or_none()
        if not job:
            return {"error": f"No print job {ref} in this store."}
        arts = (await db.execute(
            select(GangSheetArtwork)
            .where(GangSheetArtwork.gang_sheet_order_id == job.id)
            .order_by(GangSheetArtwork.sort_order)
        )).scalars().all()
        order_number = None
        if job.order_id:
            order_number = (await db.execute(
                select(Order.order_number).where(Order.id == job.order_id)
            )).scalar_one_or_none()
        return {
            "reference": job.reference,
            "admin_link": "/admin/gang-sheets",
            "kind": "gang_sheet" if job.sheet_size_id else "upload_by_size",
            "name": job.sheet_name,
            "size_in": f"{float(job.sheet_width_in)}x{float(job.sheet_height_in)}",
            "quantity": job.sheet_quantity,
            "total": _money(job.subtotal),
            "status": job.status,
            "paid": bool(job.paid_at),
            "revisions": job.revision_count,
            "customer": job.contact_name or job.contact_email,
            "note_to_customer": job.supplier_notes,
            "customer_notes": job.customer_notes,
            "artworks": [{"file_name": a.file_name, "size_in": f"{float(a.width_in)}x{float(a.height_in)}",
                          "quantity": a.quantity, "file_url": a.file_url} for a in arts],
            "paid_on_order": order_number,
            "order_link": f"/admin/orders/{order_number}" if order_number else None,
        }

    async def list_applications(_: dict):
        from app.models.wholesale import WholesaleApplication as WA

        rows = (await db.execute(
            select(WA).where(WA.status == "pending").order_by(WA.created_at.desc()).limit(MAX_ROWS)
        )).scalars().all()
        return {"applications": [{
            "company_name": a.company_name,
            "admin_link": "/admin/customers/applications",
            "business_type": getattr(a, "business_type", None),
            "contact_email": getattr(a, "company_email", None) or getattr(a, "email", None),
            "applied": _iso(a.created_at),
        } for a in rows]}

    async def product_margins(args: dict):
        days = _days(args.get("days"), 30)
        since = datetime.now(UTC) - timedelta(days=days)
        live = (Order.created_at >= since, Order.status.notin_(("cancelled", "refunded")))
        cost = ProductVariant.cost_per_item

        rows = (await db.execute(
            select(
                OrderItem.product_name,
                func.sum(OrderItem.line_total).filter(cost.isnot(None)),
                func.sum(OrderItem.quantity * cost).filter(cost.isnot(None)),
                func.sum(OrderItem.quantity).filter(cost.is_(None)),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .outerjoin(ProductVariant, ProductVariant.id == OrderItem.variant_id)
            .where(*live)
            .group_by(OrderItem.product_name)
            .limit(50)
        )).all()

        priced, uncosted_units = [], 0
        for name, revenue, item_cost, no_cost_units in rows:
            uncosted_units += int(no_cost_units or 0)
            if revenue is None or item_cost is None:
                continue
            rev, cst = _money(revenue), _money(item_cost)
            if rev <= 0:
                continue
            priced.append({
                "product": name, "revenue": rev, "cost": cst,
                "profit": _money(rev - cst), "margin_percent": round((rev - cst) / rev * 100, 1),
            })
        priced.sort(key=lambda r: r["profit"], reverse=True)
        return {
            "days": days,
            "products": priced[:10],
            "units_sold_without_a_cost_price": uncosted_units,
            "caveat": ("Uses each variant's cost price as it is today, and only covers products "
                       "where a cost price is filled in."),
        }

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
        "outstanding_balances": outstanding_balances,
        "catalog_summary": catalog_summary, "search_products": search_products,
        "get_print_job": get_print_job, "list_applications": list_applications,
        "price_product": price_product, "calculate_quote": calculate_quote,
        "check_inventory": check_inventory,
        "product_margins": product_margins,
        "search_orders": search_orders, "get_order": get_order,
        "list_print_jobs": list_print_jobs, "find_customer": find_customer,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Customer tools — bound to one buyer
# ─────────────────────────────────────────────────────────────────────────────

CUSTOMER_TOOLS: list[dict] = [
    {
        "name": "product_options_and_prices",
        "description": (
            "What a product offers and what it costs THIS customer. For a made-to-order product it "
            "returns the choices available (size, stock, finish, turnaround); for a stocked one, the "
            "colours, sizes and the price this customer pays after their own account pricing. Use it "
            "before quoting so you know what still needs asking."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"product": {"type": "string", "description": "Product name or SKU."}},
            "required": ["product"],
        },
    },
    {
        "name": "quote_price",
        "description": (
            "The real price for a quantity of a product for THIS customer — their own account "
            "pricing, worked out by the same engine used at checkout, never your own arithmetic. "
            "Pass their choices by name, e.g. {\"Size\": \"XL\", \"Turnaround\": \"Next day\"}; "
            "anything not given uses that option's default, so say which defaults you used. It "
            "reports any choice it could not match and whether the quantity is under the product's "
            "minimum — tell the customer both rather than quoting around them."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "product": {"type": "string"},
                "quantity": {"type": "integer"},
                "choices": {"type": "object", "additionalProperties": {"type": "string"}},
            },
            "required": ["product", "quantity"],
        },
    },
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
    """Tools for one signed-in buyer. Pricing is resolved against their own
    company, taken from the session — a buyer cannot ask for another account's
    price by naming it, because there is nowhere to name one."""
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

    async def _my_company() -> Company | None:
        if not cid:
            return None
        return (await db.execute(select(Company).where(Company.id == cid))).scalar_one_or_none()

    async def product_options_and_prices(args: dict):
        try:
            product = await find_product(db, str(args.get("product") or ""))
        except QuoteError as exc:
            return {"error": str(exc)}
        configurable = (getattr(product, "pricing_mode", "variant") or "variant") == "configurable"
        data = {
            "product": product.name,
            "link": f"/products/{product.slug}",
            "minimum_order_quantity": int(getattr(product, "moq", 1) or 1),
        }
        if configurable:
            data["options"] = option_catalogue(product)
            data["note"] = "Price depends on the choices — use quote_price once they are known."
            return data
        company = await _my_company()
        rows = (await db.execute(
            select(ProductVariant)
            .where(ProductVariant.product_id == product.id, ProductVariant.status == "active")
            .order_by(ProductVariant.sort_order).limit(MAX_ROWS)
        )).scalars().all()
        priced = []
        for v in rows:
            try:
                quote = await quote_for(db, product, 1, {"color": v.color or "", "size": v.size or ""},
                                        company=company)
                priced.append({"color": v.color, "size": v.size, "price": quote["unit_price"]})
            except QuoteError:
                continue
        data["variants"] = priced
        return data

    async def quote_price(args: dict):
        try:
            product = await find_product(db, str(args.get("product") or ""))
            quote = await quote_for(db, product, int(args.get("quantity") or 1),
                                    args.get("choices") or {}, company=await _my_company())
        except QuoteError as exc:
            return {"error": str(exc)}
        except (TypeError, ValueError):
            return {"error": "Quantity must be a number."}
        # The buyer has no use for the admin's screens.
        quote.pop("admin_link", None)
        quote.pop("quoted_for", None)
        quote["link"] = f"/products/{product.slug}"
        quote["note"] = ("This is your price. Taxes and delivery are worked out at checkout."
                         if quote["type"] == "stocked" else
                         "Taxes and delivery are worked out at checkout.")
        return quote

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
        "product_options_and_prices": product_options_and_prices,
        "quote_price": quote_price,
        "my_recent_orders": my_recent_orders,
        "my_order_status": my_order_status,
        "my_print_jobs": my_print_jobs,
    }
