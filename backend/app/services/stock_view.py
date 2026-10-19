"""Inventory, as the shop counts it: every SKU of the products it stocks.

Only stocked products have stock (services/product_catalog.kind_of: pricing
mode "variant" and no gang sheet builder). Made to order products and gang
sheets are never counted here.

For each SKU, from what the data says:
- Available is what is left to sell: the stock records' quantity. Checkout
  takes an order's units off it as the order is placed (order_service,
  guest checkout).
- Reserved is what open orders still hold: units on orders placed and not
  shipped yet (pending, confirmed, processing, ready for pickup; drafts are
  not orders yet). Those units were taken off Available when ordered.
- On hand is the two together: what should be on the shelf.

Whether a SKU is limited by its stock is its product's Count stock switch
(products.track_inventory, services/inventory_service.sellable_stock):
- counted: it sells only what it has, and at 0 (or with no stock record) it
  is sold out;
- not counted: it sells without a limit, whatever its records say ("free").

Incoming is what purchase orders sent to a supplier have still to bring: each
line's quantity ordered, less what was received against it.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

OPEN_ORDER = "('pending', 'confirmed', 'processing', 'ready_for_pickup')"
STOCKS = ("all", "zero", "low", "in", "free")

# Every SKU of a stocked product, with its stock, what open orders hold and the
# lowest low-stock line its records set. :t is the shop; :wh one warehouse or ''.
_SKUS = f"""
WITH sku AS (
    SELECT pv.id, pv.product_id, pv.sku, pv.color, pv.size, p.name AS product_name, p.slug,
           COALESCE(p.track_inventory, false) AS counted
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE pv.tenant_id = CAST(:t AS uuid) AND p.tenant_id = CAST(:t AS uuid)
      AND CAST(pv.status AS text) <> 'discontinued'
      AND CAST(p.status AS text) <> 'archived'
      AND COALESCE(p.pricing_mode, 'variant') = 'variant'
      AND NOT COALESCE(p.gang_sheet_enabled, false)
),
stock AS (
    SELECT variant_id, sum(quantity) AS qty, min(low_stock_threshold) AS threshold
    FROM inventory
    WHERE tenant_id = CAST(:t AS uuid) AND (:wh = '' OR warehouse_id = CAST(NULLIF(:wh, '') AS uuid))
    GROUP BY variant_id
),
held AS (
    SELECT oi.variant_id, sum(oi.quantity) AS qty
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.tenant_id = CAST(:t AS uuid) AND oi.variant_id IS NOT NULL
      AND CAST(o.status AS text) IN {OPEN_ORDER}
      AND o.order_number NOT LIKE 'DRAFT-%'
    GROUP BY oi.variant_id
),
rows AS (
    SELECT sku.*, COALESCE(stock.qty, 0) AS available, COALESCE(held.qty, 0) AS reserved,
           COALESCE(stock.threshold, 10) AS threshold
    FROM sku LEFT JOIN stock ON stock.variant_id = sku.id LEFT JOIN held ON held.variant_id = sku.id
)
"""

_WHERE = """
WHERE (:q = '' OR product_name ILIKE :like OR sku ILIKE :like OR color ILIKE :like OR size ILIKE :like)
  AND (:product = '' OR CAST(product_id AS text) = :product)
  AND (:stock = 'all'
       OR (:stock = 'zero' AND counted AND available <= 0)
       OR (:stock = 'low' AND counted AND available > 0 AND available <= threshold)
       OR (:stock = 'in' AND counted AND available > threshold)
       OR (:stock = 'free' AND NOT counted))
"""


def state(available: int, threshold: int, counted: bool = True) -> str:
    """free (not counted: sells without a limit), zero (sold out), low (at or
    under its line), or in."""
    if not counted:
        return "free"
    if available <= 0:
        return "zero"
    return "low" if available <= threshold else "in"


def _in_order(rows) -> list:
    """Products and colours by name, sizes on the size chart (XS, S, M, L, XL)
    as the shop lists them (services/size_order), then the SKU."""
    from app.services.size_order import sort_sizes

    chart = {size: i for i, size in enumerate(sort_sizes(r["size"] for r in rows))}
    return sorted(rows, key=lambda r: ((r["product_name"] or "").lower(), (r["color"] or "").lower(),
                                       chart.get(r["size"], len(chart)), r["sku"] or ""))


def _params(tenant_id, q, product_id, warehouse_id, stock) -> dict[str, Any]:
    q = (q or "").strip()
    return {
        "t": str(tenant_id), "q": q, "like": f"%{q}%",
        "product": str(product_id or ""), "wh": str(warehouse_id or ""),
        "stock": stock if stock in STOCKS else "all",
    }


def _row(m, by_warehouse: bool) -> dict[str, Any]:
    available, reserved, threshold = int(m["available"] or 0), int(m["reserved"] or 0), int(m["threshold"] or 10)
    return {
        "variant_id": str(m["id"]),
        "product_id": str(m["product_id"]),
        "product_name": m["product_name"],
        "product_slug": m["slug"],
        "sku": m["sku"],
        "color": m["color"],
        "size": m["size"],
        "available": available,
        # Open orders are not kept per warehouse: in one warehouse's view what
        # they hold is not split, and on hand is that warehouse's own count.
        "reserved": None if by_warehouse else reserved,
        "on_hand": available if by_warehouse else available + reserved,
        "threshold": threshold,
        "counted": bool(m["counted"]),
        "state": state(available, threshold, bool(m["counted"])),
    }


async def incoming(db: AsyncSession, tenant_id) -> dict[str, int]:
    m = (await db.execute(text("""
        SELECT COALESCE(sum(GREATEST(li.qty_ordered - COALESCE(r.got, 0), 0)), 0) AS units,
               count(DISTINCT po.id) FILTER (WHERE li.qty_ordered - COALESCE(r.got, 0) > 0) AS pos
        FROM purchase_orders po
        JOIN po_line_items li ON li.po_id = po.id
        LEFT JOIN (SELECT po_line_item_id, sum(qty_received) AS got FROM po_receiving_items
                   WHERE tenant_id = CAST(:t AS uuid) GROUP BY po_line_item_id) r ON r.po_line_item_id = li.id
        WHERE po.tenant_id = CAST(:t AS uuid) AND po.status IN ('sent', 'partial')
    """), {"t": str(tenant_id)})).mappings().first()
    return {"units": int(m["units"] or 0), "orders": int(m["pos"] or 0)}


async def board(db: AsyncSession, tenant_id, *, q=None, product_id=None, warehouse_id=None,
                stock: str = "all", page: int = 1, page_size: int = 50) -> dict[str, Any]:
    """One page of SKUs, with the numbers over the list (from the same rows)."""
    params = _params(tenant_id, q, product_id, warehouse_id, stock)
    page, page_size = max(1, int(page)), max(1, min(int(page_size), 200))
    # Sizes go in chart order, which SQL cannot sort by: every match is read
    # and the page is cut here.
    every = _in_order((await db.execute(text(_SKUS + "SELECT * FROM rows" + _WHERE), params)).mappings().all())
    matched = len(every)
    rows = every[(page - 1) * page_size:page * page_size]
    totals = (await db.execute(text(_SKUS + """
        SELECT count(*) AS skus,
               count(*) FILTER (WHERE counted) AS counted,
               count(*) FILTER (WHERE counted AND available <= 0) AS zero,
               count(*) FILTER (WHERE counted AND available > 0 AND available <= threshold) AS low,
               COALESCE(sum(available), 0) AS available, COALESCE(sum(reserved), 0) AS reserved
        FROM rows"""), {**params, "q": "", "like": "%%", "product": "", "stock": "all"})).mappings().first()
    products = [{"id": str(i), "name": n} for i, n in (await db.execute(text(
        _SKUS + "SELECT DISTINCT product_id, product_name FROM rows ORDER BY product_name"),
        {**params, "wh": ""})).all()]
    warehouses = [{"id": str(i), "name": n} for i, n in (await db.execute(text(
        "SELECT id, name FROM warehouses WHERE tenant_id = CAST(:t AS uuid) AND is_active ORDER BY name"),
        {"t": str(tenant_id)})).all()]
    by_wh = bool(params["wh"])
    return {
        "items": [_row(r, by_wh) for r in rows],
        "total": matched,
        "page": page,
        "page_size": page_size,
        "stats": {
            "skus": int(totals["skus"] or 0),
            "counted": int(totals["counted"] or 0),
            "zero": int(totals["zero"] or 0),
            "low": int(totals["low"] or 0),
            "available": int(totals["available"] or 0),
            "reserved": int(totals["reserved"] or 0),
            "incoming": await incoming(db, tenant_id),
        },
        "products": products,
        "warehouses": warehouses,
    }


async def everything(db: AsyncSession, tenant_id, *, q=None, product_id=None, warehouse_id=None, stock="all") -> list[dict]:
    params = _params(tenant_id, q, product_id, warehouse_id, stock)
    rows = _in_order((await db.execute(text(_SKUS + "SELECT * FROM rows" + _WHERE), params)).mappings().all())
    return [_row(r, bool(params["wh"])) for r in rows]


async def history(db: AsyncSession, tenant_id, variant_id, limit: int = 100) -> dict[str, Any] | None:
    """One SKU: its count in each warehouse and every change made to it, by
    whom and why. Orders take their units at checkout and are not changes
    listed here."""
    head = (await db.execute(text(
        "SELECT pv.sku, pv.color, pv.size, p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id "
        "WHERE pv.id = CAST(:v AS uuid) AND pv.tenant_id = CAST(:t AS uuid)"),
        {"v": str(variant_id), "t": str(tenant_id)})).first()
    if head is None:
        return None
    places = [{"warehouse_id": str(w), "warehouse": n, "quantity": int(q or 0), "threshold": int(th or 10)}
              for w, n, q, th in (await db.execute(text("""
        SELECT w.id, w.name, i.quantity, i.low_stock_threshold
        FROM warehouses w LEFT JOIN inventory i ON i.warehouse_id = w.id AND i.variant_id = CAST(:v AS uuid)
        WHERE w.tenant_id = CAST(:t AS uuid) AND w.is_active ORDER BY w.name
    """), {"v": str(variant_id), "t": str(tenant_id)})).all()]
    changes = [{
        "at": m["created_at"].isoformat() if m["created_at"] else None,
        "warehouse": m["warehouse"],
        "before": int(m["quantity_before"]),
        "after": int(m["quantity_after"]),
        "change": int(m["quantity_after"]) - int(m["quantity_before"]),
        "reason": m["reason"],
        "notes": m["notes"],
        "by": (" ".join(x for x in (m["first_name"], m["last_name"]) if x).strip() or m["email"]) if m["email"] else None,
    } for m in (await db.execute(text("""
        SELECT a.created_at, w.name AS warehouse, a.quantity_before, a.quantity_after, CAST(a.reason AS text) AS reason,
               a.notes, u.first_name, u.last_name, u.email
        FROM inventory_adjustments a
        JOIN inventory i ON i.id = a.inventory_record_id
        JOIN warehouses w ON w.id = i.warehouse_id
        LEFT JOIN users u ON u.id = a.adjusted_by_id
        WHERE i.variant_id = CAST(:v AS uuid) AND a.tenant_id = CAST(:t AS uuid)
        ORDER BY a.created_at DESC LIMIT :n
    """), {"v": str(variant_id), "t": str(tenant_id), "n": limit})).mappings().all()]
    held = int((await db.execute(text(f"""
        SELECT COALESCE(sum(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.tenant_id = CAST(:t AS uuid) AND oi.variant_id = CAST(:v AS uuid)
          AND CAST(o.status AS text) IN {OPEN_ORDER} AND o.order_number NOT LIKE 'DRAFT-%'
    """), {"v": str(variant_id), "t": str(tenant_id)})).scalar() or 0)
    return {
        "variant_id": str(variant_id), "sku": head[0], "color": head[1], "size": head[2], "product_name": head[3],
        "warehouses": places, "reserved": held, "changes": changes,
    }
