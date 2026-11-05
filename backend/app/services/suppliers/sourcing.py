"""One product, several sources: the shop's own stock first, then its suppliers.

A colour/size of one of the shop's own products can be linked to the same item
at S&S and at SanMar (`VariantSource`). The buyer sees one product, with the
stock of every source together. At checkout a line takes the shop's own stock
first, then the cheapest supplier that has it, then the next; what a supplier
covers is written down per line (`OrderItemSource`). S&S is sent its share
(suppliers/orders.py); SanMar's is ordered by hand until SanMar orders exist.

The rules, chosen 2026-11-05 when the owner said to apply what is most proper:
own stock first; then suppliers cheapest first, more stock breaking a tie; a
line may be split; one selling price whatever the source; each supplier's
safety stock (Inventory Settings) applies; the product keeps its own SKUs.

Each supplier's stock for linked products sits in one location of its own
(`warehouses.supplier`), made on first use, and a sync only ever writes there:
never over a number the shop counted itself. Products imported from a
supplier before this are left exactly as they were.
"""
from __future__ import annotations

import difflib
import logging
import re
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.suppliers import sources

logger = logging.getLogger(__name__)

# Each supplier's location for linked stock: its name in the admin, and its code.
_LOCATION = {
    sources.SS: ("S&S Activewear stock", "SUP-SS"),
    sources.SANMAR: ("SanMar stock", "SUP-SANMAR"),
}
SUPPLIERS = tuple(_LOCATION)
# Below this a colour name is not the same colour (Denim Sapphaire = Denim Sapphire).
_CLOSE = 0.85
# Styles per supplier call during a sync, as for imported products (jobs.py).
_BATCH = 10


class SourceError(ValueError):
    """A link the shop asked for that cannot be made."""


# ── Locations ────────────────────────────────────────────────────────────────

async def supplier_location(db: AsyncSession, supplier: str):
    """The location that holds this supplier's stock for linked products."""
    from app.models.inventory import Warehouse

    wh = (await db.execute(select(Warehouse).where(Warehouse.supplier == supplier))).scalar_one_or_none()
    if wh is not None:
        return wh
    name, code = _LOCATION[supplier]
    taken = set((await db.execute(select(Warehouse.code).where(Warehouse.code.like(f"{code}%")))).scalars().all())
    final, n = code, 1
    while final in taken:
        n += 1
        final = f"{code}-{n}"
    wh = Warehouse(name=name, code=final, country="US", is_active=True, supplier=supplier)
    db.add(wh)
    await db.flush()
    return wh


# ── Matching a supplier's rows to the product's variants ────────────────────

def _text_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _size_key(value: Any) -> tuple:
    """The same size however it is written: 2XL and XXL, Small and S."""
    from app.services.size_order import size_rank

    rank = size_rank(str(value or ""))
    return ("rank", *rank) if rank else ("text", _text_key(value))


def match(variants: list[dict], rows: list[dict]) -> dict:
    """Pair each variant ({id, color, size, gtin?}) with one supplier row.

    By colour and size first; then by barcode, when another supplier gave the
    variant one; then by a close colour name in the same size. A row pairs
    once. Returns {pairs: [(variant, row, how)], unmatched: [variant], spare}.
    """
    free = list(rows)
    by_key: dict[tuple, dict] = {}
    by_gtin: dict[str, dict] = {}
    for r in free:
        by_key.setdefault((_text_key(r.get("colorName")), _size_key(r.get("sizeName"))), r)
        gtin = str(r.get("gtin") or "").strip()
        if gtin:
            by_gtin.setdefault(gtin, r)
    used: set[int] = set()
    pairs, unmatched = [], []

    def take(v, r, how):
        used.add(id(r))
        pairs.append((v, r, how))

    for v in variants:
        r = by_key.get((_text_key(v.get("color")), _size_key(v.get("size"))))
        if r is not None and id(r) not in used:
            take(v, r, "exact")
            continue
        r = by_gtin.get(str(v.get("gtin") or "").strip()) if v.get("gtin") else None
        if r is not None and id(r) not in used:
            take(v, r, "barcode")
            continue
        size = _size_key(v.get("size"))
        want = _text_key(v.get("color"))
        close = [(difflib.SequenceMatcher(None, want, _text_key(r.get("colorName"))).ratio(), r)
                 for r in free if id(r) not in used and _size_key(r.get("sizeName")) == size]
        close = sorted((c for c in close if c[0] >= _CLOSE), key=lambda c: -c[0])
        if close and (len(close) == 1 or close[0][0] > close[1][0]):
            take(v, close[0][1], "close")
        else:
            unmatched.append(v)
    return {"pairs": pairs, "unmatched": unmatched, "spare": len(free) - len(used)}


def stock_of(row: dict, safety: int) -> int:
    """What a linked variant shows from this supplier: every warehouse but
    drop-ship, less the supplier's safety stock."""
    from app.services.suppliers import ss_products

    return max(0, (ss_products.stock_from(row, "all_except_ds") or 0) - max(0, safety))


def cost_of(row: dict) -> float | None:
    try:
        cost = float(row.get("customerPrice") or row.get("piecePrice") or 0)
    except (TypeError, ValueError):
        return None
    return round(cost, 2) if cost > 0 else None


def _safety(cfg: dict) -> int:
    try:
        return max(0, int((cfg.get("inventory") or {}).get("safety_stock") or 0))
    except (TypeError, ValueError):
        return 0


# ── Linking ──────────────────────────────────────────────────────────────────

async def linkable(db: AsyncSession, product_id: uuid.UUID):
    """The product, if sources can be added to it: one of the shop's own
    stocked products. A product imported from a supplier is that supplier's
    already, and a made-to-order one has no stock to count."""
    from app.models.product import Product

    product = await db.get(Product, product_id)
    if product is None:
        raise SourceError("Product not found.")
    if product.supplier:
        raise SourceError(f"This product was imported from {sources.label(product.supplier)}, so it is that "
                          "supplier's already. Add sources to your own products.")
    if product.gang_sheet_enabled or product.pricing_mode == "configurable":
        raise SourceError("A made-to-order product has no stock to take from a supplier.")
    return product


async def _variants(db: AsyncSession, product_id: uuid.UUID) -> list[dict]:
    from app.models.product import ProductVariant
    from app.models.supplier import VariantSource

    rows = (await db.execute(
        select(ProductVariant.id, ProductVariant.color, ProductVariant.size)
        .where(ProductVariant.product_id == product_id, ProductVariant.status != "discontinued")
        .order_by(ProductVariant.sort_order, ProductVariant.created_at)
    )).all()
    gtins: dict[uuid.UUID, str] = {}
    for vid, gtin in (await db.execute(
        select(VariantSource.variant_id, VariantSource.gtin)
        .where(VariantSource.variant_id.in_([r[0] for r in rows] or [uuid.uuid4()]), VariantSource.gtin.isnot(None))
    )).all():
        gtins.setdefault(vid, gtin)
    return [{"id": vid, "color": color, "size": size, "gtin": gtins.get(vid)} for vid, color, size in rows]


async def duplicates(db: AsyncSession, supplier: str, style_id: str) -> list[dict]:
    """The same style imported from this supplier as a product of its own:
    the shirt shows twice until the shop hides or deletes that one."""
    from app.models.product import Product

    rows = (await db.execute(
        select(Product.id, Product.name, Product.slug, Product.status)
        .where(Product.supplier == supplier, Product.supplier_ref == str(style_id))
    )).all()
    return [{"id": str(pid), "name": name, "slug": slug, "status": status} for pid, name, slug, status in rows]


async def preview(db: AsyncSession, product_id: uuid.UUID, supplier: str, style: dict, rows: list[dict]) -> dict:
    """What linking this supplier style would do, without doing it."""
    await linkable(db, product_id)
    variants = await _variants(db, product_id)
    found = match(variants, rows)
    taken = await _taken_elsewhere(db, supplier, product_id, [r.get("sku") for _, r, _ in found["pairs"]])
    return {
        "supplier": supplier, "label": sources.label(supplier), "style_id": str(style.get("style_id") or ""),
        "style": " ".join(p for p in (style.get("brand"), style.get("style_name")) if p),
        "variants": len(variants), "supplier_rows": len(rows),
        "pairs": [{"variant_id": str(v["id"]), "color": v["color"], "size": v["size"],
                   "supplier_sku": str(r.get("sku") or ""), "supplier_color": r.get("colorName"),
                   "supplier_size": r.get("sizeName"), "how": how, "stock": stock_of(r, 0), "cost": cost_of(r),
                   "taken_by": taken.get(str(r.get("sku") or ""))}
                  for v, r, how in found["pairs"]],
        "unmatched": [{"variant_id": str(v["id"]), "color": v["color"], "size": v["size"]} for v in found["unmatched"]],
        "spare": found["spare"],
        "duplicates": await duplicates(db, supplier, str(style.get("style_id") or "")),
        # Every colour/size the supplier has in this style, to pick one by hand.
        "rows": [{"sku": str(r.get("sku") or ""), "color": r.get("colorName"), "size": r.get("sizeName"),
                  "taken_by": taken.get(str(r.get("sku") or ""))}
                 for r in rows if r.get("sku")],
    }


def apply_manual(pairs: list[tuple[dict, dict]], variants: list[dict], rows: list[dict],
                 manual: dict[str, str | None]) -> list[tuple[dict, dict]]:
    """The shop's own choices over the automatic match: a variant id maps to
    the supplier SKU it is, or to None for "not at this supplier"."""
    if not manual:
        return pairs
    by_sku = {str(r.get("sku") or ""): r for r in rows if r.get("sku")}
    by_id = {str(v["id"]): v for v in variants}
    for vid, sku in manual.items():
        if vid not in by_id:
            raise SourceError("A colour or size you picked is not on this product.")
        if sku and sku not in by_sku:
            raise SourceError(f"{sku} is not in that supplier style.")
    chosen = {sku for sku in manual.values() if sku}
    kept = [(v, r) for v, r in pairs if str(v["id"]) not in manual and str(r.get("sku") or "") not in chosen]
    picked = [(by_id[vid], by_sku[sku]) for vid, sku in manual.items() if sku]
    if len({sku for _, r in picked for sku in [str(r["sku"])]}) < len(picked):
        raise SourceError("Each supplier colour and size can go with one of yours only.")
    return kept + picked


async def _taken_elsewhere(db: AsyncSession, supplier: str, product_id: uuid.UUID, skus: list) -> dict[str, str]:
    """Supplier SKUs already linked to another product's variant: name of that product."""
    from app.models.product import Product, ProductVariant
    from app.models.supplier import VariantSource

    skus = [str(s) for s in skus if s]
    if not skus:
        return {}
    rows = (await db.execute(
        select(VariantSource.supplier_sku, Product.name)
        .join(ProductVariant, ProductVariant.id == VariantSource.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(VariantSource.supplier == supplier, VariantSource.supplier_sku.in_(skus), Product.id != product_id)
    )).all()
    return {sku: name for sku, name in rows}


async def link(db: AsyncSession, product_id: uuid.UUID, supplier: str, style: dict, rows: list[dict], cfg: dict,
               *, manual: dict[str, str | None] | None = None) -> dict:
    """Link this supplier style to the product: one source per matched variant,
    and that supplier's stock for each in its location. `manual` is the shop's
    own pick where the automatic match missed or was wrong. Replaces any link
    the product had to this supplier. Flushes, doesn't commit."""
    from app.models.inventory import InventoryRecord
    from app.models.supplier import VariantSource

    if supplier not in SUPPLIERS:
        raise SourceError("Unknown supplier.")
    await linkable(db, product_id)
    variants = await _variants(db, product_id)
    found = match(variants, rows)
    chosen = apply_manual([(v, r) for v, r, _ in found["pairs"]], variants, rows, manual or {})
    taken = await _taken_elsewhere(db, supplier, product_id, [r.get("sku") for _, r in chosen])
    pairs = [(v, r) for v, r in chosen if str(r.get("sku") or "") and str(r.get("sku")) not in taken]
    if not pairs:
        raise SourceError(f"None of this product's colours and sizes were found in that {sources.label(supplier)} style.")

    await unlink(db, product_id, supplier)
    wh = await supplier_location(db, supplier)
    safety = _safety(cfg)
    style_id = str(style.get("style_id") or rows[0].get("styleID") or "")
    part = str(style.get("part_number") or "") or None
    for v, r in pairs:
        db.add(VariantSource(
            variant_id=v["id"], supplier=supplier, supplier_sku=str(r["sku"])[:100], style_ref=style_id[:100],
            part_number=part, gtin=(str(r.get("gtin") or "").strip() or None), cost=cost_of(r),
        ))
        db.add(InventoryRecord(variant_id=v["id"], warehouse_id=wh.id, quantity=stock_of(r, safety),
                               low_stock_threshold=10))
    await db.flush()
    return {"linked": len(pairs), "unmatched": len(variants) - len(pairs), "skipped_taken": len(taken),
            "stock": sum(stock_of(r, safety) for _, r in pairs)}


async def unlink(db: AsyncSession, product_id: uuid.UUID, supplier: str) -> int:
    """Remove this supplier from the product, and its stock with it."""
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.product import ProductVariant
    from app.models.supplier import VariantSource

    ids = select(ProductVariant.id).where(ProductVariant.product_id == product_id)
    gone = (await db.execute(
        delete(VariantSource).where(VariantSource.supplier == supplier, VariantSource.variant_id.in_(ids))
        .execution_options(synchronize_session=False)
    )).rowcount or 0
    await db.execute(
        delete(InventoryRecord)
        .where(InventoryRecord.variant_id.in_(ids),
               InventoryRecord.warehouse_id.in_(select(Warehouse.id).where(Warehouse.supplier == supplier)))
        .execution_options(synchronize_session=False)
    )
    return gone


async def convert(db: AsyncSession, product_id: uuid.UUID, style: dict, rows: list[dict], cfg: dict) -> dict:
    """Make a product imported from a supplier one of the shop's own, with that
    supplier as its source: the same product, page and SKUs, its stock still
    the supplier's, and room now for the shop's own stock and another supplier.

    The supplier's stock leaves the locations its feed wrote to (a sync
    overwrote it there anyway) for the supplier's own location; stock in any
    other location is the shop's and stays. Flushes, doesn't commit."""
    from app.models.inventory import InventoryRecord
    from app.models.product import Product, ProductVariant
    from app.models.supplier import VariantSource
    from app.services.suppliers import ss_catalog, ss_products

    product = await db.get(Product, product_id)
    if product is None:
        raise SourceError("Product not found.")
    supplier = product.supplier
    if not supplier:
        raise SourceError("This is one of your own products already.")
    if supplier not in SUPPLIERS:
        raise SourceError(f"{sources.label(supplier)} can't be a product's source yet.")
    as_ss = ss_catalog.as_ss(style)
    by_store_sku: dict[str, dict] = {}
    for r in rows:
        by_store_sku.setdefault(ss_products.mapped_sku(cfg, as_ss, r), r)
    variants = (await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product_id)
    )).scalars().all()
    feed = [wid for wid, _ in await ss_products.locations(db, cfg)]
    wh = await supplier_location(db, supplier)
    safety = _safety(cfg)
    taken = await _taken_elsewhere(db, supplier, product_id, [r.get("sku") for r in rows])
    # A size already a source of another product would lose the supplier's
    # stock here and be sold out: refuse before anything changes.
    clash = sorted({taken[str(r["sku"])] for v in variants
                    if (r := by_store_sku.get(v.sku)) is not None and str(r.get("sku") or "") in taken})
    if clash:
        raise SourceError(
            f"Some sizes are already {sources.label(supplier)} sources of {', '.join(clash)}. "
            f"Remove {sources.label(supplier)} from that product first (its Sources, Remove), then try again."
        )
    style_id = str(product.supplier_ref or style.get("style_id") or "")
    part = str(style.get("part_number") or "") or None
    linked = 0
    for v in variants:
        for rec in (await db.execute(
            select(InventoryRecord).where(InventoryRecord.variant_id == v.id,
                                          InventoryRecord.warehouse_id.in_(feed or [uuid.uuid4()]))
        )).scalars().all():
            rec.quantity = 0
        r = by_store_sku.get(v.sku)
        if r is None or str(r.get("sku") or "") in taken or not r.get("sku"):
            continue
        db.add(VariantSource(
            variant_id=v.id, supplier=supplier, supplier_sku=str(r["sku"])[:100], style_ref=style_id[:100],
            part_number=part, gtin=(str(r.get("gtin") or "").strip() or None), cost=cost_of(r),
        ))
        db.add(InventoryRecord(variant_id=v.id, warehouse_id=wh.id, quantity=stock_of(r, safety),
                               low_stock_threshold=10))
        linked += 1
    if not linked:
        raise SourceError(f"None of this product's colours and sizes are in {sources.label(supplier)}'s style any more.")
    product.supplier = None
    product.supplier_ref = None
    await db.flush()
    return {"converted": supplier, "linked": linked, "unmatched": len(variants) - linked}


async def product_sources(db: AsyncSession, product_id: uuid.UUID) -> dict:
    """The product's sources, colour by colour: the shop's own stock and each
    supplier's, with the supplier's SKU and cost."""
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.product import Product, ProductVariant
    from app.models.supplier import VariantSource

    product = await db.get(Product, product_id)
    if product is None:
        raise SourceError("Product not found.")
    variants = (await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product_id, ProductVariant.status != "discontinued")
        .order_by(ProductVariant.sort_order, ProductVariant.created_at)
    )).scalars().all()
    ids = [v.id for v in variants] or [uuid.uuid4()]
    own: dict[uuid.UUID, int] = defaultdict(int)
    held: dict[tuple[uuid.UUID, str], int] = {}
    for vid, qty, sup in (await db.execute(
        select(InventoryRecord.variant_id, InventoryRecord.quantity, Warehouse.supplier)
        .join(Warehouse, Warehouse.id == InventoryRecord.warehouse_id)
        .where(InventoryRecord.variant_id.in_(ids))
    )).all():
        if sup:
            held[(vid, sup)] = held.get((vid, sup), 0) + int(qty or 0)
        else:
            own[vid] += max(0, int(qty or 0))
    links = (await db.execute(select(VariantSource).where(VariantSource.variant_id.in_(ids)))).scalars().all()
    by_variant: dict[uuid.UUID, dict[str, Any]] = defaultdict(dict)
    summary: dict[str, dict] = {}
    for s in links:
        stock = held.get((s.variant_id, s.supplier), 0)
        by_variant[s.variant_id][s.supplier] = {"sku": s.supplier_sku, "stock": stock,
                                                "cost": float(s.cost) if s.cost is not None else None}
        row = summary.setdefault(s.supplier, {"supplier": s.supplier, "label": sources.label(s.supplier),
                                              "style_id": s.style_ref, "linked": 0, "stock": 0, "costs": []})
        row["linked"] += 1
        row["stock"] += stock
        if s.cost is not None:
            row["costs"].append(float(s.cost))
    suppliers = []
    for sup in SUPPLIERS:
        if sup in summary:
            row = summary[sup]
            costs = row.pop("costs")
            row.update(cost_min=min(costs) if costs else None, cost_max=max(costs) if costs else None)
            suppliers.append(row)
    return {
        "product_id": str(product.id), "imported_from": product.supplier,
        "suppliers": suppliers,
        "variants": [{"variant_id": str(v.id), "color": v.color, "size": v.size, "own": own.get(v.id, 0),
                      "sources": by_variant.get(v.id, {})} for v in variants],
    }


# ── Checkout: which source a line comes from ─────────────────────────────────

def order_records(records: list[tuple[Any, str | None]], costs: dict[str, float | None], want: int = 0,
                  first: str | None = None) -> list[tuple[Any, str | None]]:
    """Own stock first (most stock first, as it always was), then suppliers.

    By default the cheapest supplier comes first (more stock breaks a tie),
    except that one able to send all the line still needs after own stock is
    moved ahead of cheaper ones that cannot: one parcel, not two. A shop can
    instead put one supplier first, always (`first`, the shop's rule).
    """
    own = sorted((r for r in records if not r[1]), key=lambda r: -int(r[0].quantity or 0))
    theirs = sorted((r for r in records if r[1]),
                    key=lambda r: (costs.get(r[1]) is None, costs.get(r[1]) or 0, -int(r[0].quantity or 0)))
    if first in {sup for _, sup in theirs}:
        return own + [r for r in theirs if r[1] == first] + [r for r in theirs if r[1] != first]
    rest = want - sum(max(0, int(r[0].quantity or 0)) for r in own)
    if rest > 0:
        whole = next((r for r in theirs if int(r[0].quantity or 0) >= rest), None)
        if whole is not None:
            theirs = [whole] + [r for r in theirs if r is not whole]
    return own + theirs


RULE_KEY = "sourcing_rule"
RULES = ("cheapest", *SUPPLIERS)


async def rule(db: AsyncSession) -> str:
    """The shop's rule once its own stock runs out: "cheapest", or one supplier first."""
    from app.core.tenant_settings import get_setting

    value = (await get_setting(db, RULE_KEY) or "").strip()
    return value if value in RULES else "cheapest"


async def set_rule(db: AsyncSession, value: str) -> str:
    from app.core.tenant_settings import set_setting

    if value not in RULES:
        raise SourceError("Choose the cheapest supplier, or which supplier comes first.")
    await set_setting(db, RULE_KEY, value)
    return value


async def take_stock(db: AsyncSession, variant_id, quantity: int) -> list[tuple[str, int]]:
    """Take a line's quantity off the shelves, own stock first. Returns what
    came from each supplier's stock, [(supplier, qty)]."""
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.supplier import VariantSource

    want = int(quantity or 0)
    records = (await db.execute(
        select(InventoryRecord, Warehouse.supplier)
        .join(Warehouse, Warehouse.id == InventoryRecord.warehouse_id)
        .where(InventoryRecord.variant_id == variant_id)
    )).all()
    costs: dict[str, float | None] = {}
    first = None
    if any(sup for _, sup in records):
        for sup, cost in (await db.execute(
            select(VariantSource.supplier, VariantSource.cost).where(VariantSource.variant_id == variant_id)
        )).all():
            costs[sup] = float(cost) if cost is not None else None
        shop_rule = await rule(db)
        first = shop_rule if shop_rule != "cheapest" else None
    shares: dict[str, int] = defaultdict(int)
    for record, sup in order_records(list(records), costs, want, first):
        if want <= 0:
            break
        have = int(record.quantity or 0)
        took = min(have, want)
        if took > 0:
            await db.execute(
                update(InventoryRecord).where(InventoryRecord.id == record.id).values(quantity=have - took)
            )
            want -= took
            if sup:
                shares[sup] += took
    return list(shares.items())


async def record_shares(db: AsyncSession, order_item, shares: list[tuple[str, int]]) -> None:
    """Note what each supplier covers of this order line, and what it cost there."""
    from app.models.supplier import OrderItemSource, VariantSource

    shares = [(sup, int(qty)) for sup, qty in shares if qty > 0]
    if not shares:
        return
    costs = dict((await db.execute(
        select(VariantSource.supplier, VariantSource.cost).where(VariantSource.variant_id == order_item.variant_id)
    )).all())
    # The line goes in first: nothing tells the session these rows point at it.
    await db.flush()
    for sup, qty in shares:
        db.add(OrderItemSource(order_id=order_item.order_id, order_item_id=order_item.id,
                               variant_id=order_item.variant_id, supplier=sup, quantity=qty,
                               unit_cost=costs.get(sup)))


async def order_shares(db: AsyncSession, order_ids: list, supplier: str | None = None) -> dict:
    """Per order, the lines (or parts of lines) a supplier covers."""
    from app.models.order import OrderItem
    from app.models.supplier import OrderItemSource, VariantSource

    if not order_ids:
        return {}
    q = (
        select(OrderItemSource.order_id, OrderItemSource.order_item_id, OrderItemSource.supplier,
               OrderItemSource.quantity, OrderItemSource.variant_id, OrderItem.product_name, OrderItem.color,
               OrderItem.size, VariantSource.supplier_sku, VariantSource.style_ref, OrderItemSource.unit_cost)
        .join(OrderItem, OrderItem.id == OrderItemSource.order_item_id)
        .outerjoin(VariantSource, (VariantSource.variant_id == OrderItemSource.variant_id)
                   & (VariantSource.supplier == OrderItemSource.supplier))
        .where(OrderItemSource.order_id.in_(order_ids))
    )
    if supplier:
        q = q.where(OrderItemSource.supplier == supplier)
    out: dict = defaultdict(list)
    for oid, item_id, sup, qty, vid, name, color, size, sku, ref, cost in (await db.execute(q)).all():
        out[oid].append({"order_item_id": str(item_id), "supplier": sup, "label": sources.label(sup),
                         "variant_id": str(vid) if vid else None, "sku": sku, "style_id": ref,
                         "qty": int(qty or 0), "name": name, "color": color, "size": size, "linked": True,
                         "unit_cost": float(cost) if cost is not None else None})
    return out


# ── Sync: each supplier's stock and cost for linked variants ────────────────

async def linked_styles(db: AsyncSession, supplier: str) -> set[str]:
    from app.models.supplier import VariantSource

    return {str(s) for s in (await db.execute(
        select(VariantSource.style_ref).where(VariantSource.supplier == supplier).distinct()
    )).scalars().all()}


async def sync(supplier: str, styles: list[dict], svc, cfg: dict, step, *, with_cost: bool) -> dict:
    """Bring linked variants' stock (and, on a full sync, cost) in line with
    the supplier. A failed call changes nothing; an item the supplier stopped
    selling, or a style it no longer lists, goes to zero."""
    from app.core.database import AsyncSessionLocal
    from app.models.inventory import InventoryRecord
    from app.models.supplier import VariantSource

    async with AsyncSessionLocal() as db:
        links = (await db.execute(select(VariantSource).where(VariantSource.supplier == supplier))).scalars().all()
        if not links:
            return {"sources": 0, "sources_changed": 0}
        wh_id = (await supplier_location(db, supplier)).id
        await db.commit()
    safety = _safety(cfg)
    catalogue = {str(s["style_id"]): s for s in styles}
    by_style: dict[str, list] = defaultdict(list)
    for s in links:
        by_style[s.style_ref].append((s.id, s.variant_id, s.supplier_sku))
    listed = [ref for ref in by_style if ref in catalogue]
    gone = [ref for ref in by_style if ref not in catalogue]
    # A catalogue that suddenly lost most linked styles is far likelier a bad
    # answer than a real change (the same guard as imported products).
    if gone and len(gone) > 20 and len(gone) > len(by_style) / 2:
        logger.warning("%s catalogue is missing %d of %d linked styles; not zeroing them",
                       sources.label(supplier), len(gone), len(by_style))
        gone = []

    async def write(pairs: list[tuple[uuid.UUID, uuid.UUID, int, float | None]]) -> int:
        """(source id, variant id, stock, cost or None) → records changed."""
        if not pairs:
            return 0
        changed = 0
        async with AsyncSessionLocal() as db:
            have = {r.variant_id: r for r in (await db.execute(
                select(InventoryRecord).where(InventoryRecord.warehouse_id == wh_id,
                                              InventoryRecord.variant_id.in_([p[1] for p in pairs]))
            )).scalars().all()}
            for sid, vid, qty, cost in pairs:
                rec = have.get(vid)
                if rec is None:
                    db.add(InventoryRecord(variant_id=vid, warehouse_id=wh_id, quantity=qty, low_stock_threshold=10))
                    changed += 1
                elif rec.quantity != qty:
                    rec.quantity = qty
                    changed += 1
                if cost is not None:
                    await db.execute(update(VariantSource).where(VariantSource.id == sid).values(cost=cost))
            await db.commit()
        return changed

    checked = changed = 0
    parts = {ref: str(catalogue[ref].get("part_number") or "") for ref in listed}
    refs = [ref for ref in listed if parts[ref]]
    for i in range(0, len(refs), _BATCH):
        batch = refs[i:i + _BATCH]
        await step(i, len(refs), f"Checking {sources.label(supplier)} stock for linked products "
                                 f"({min(i + len(batch), len(refs))} of {len(refs)} styles)")
        try:
            fetch = svc.fetch_products_for_parts if with_cost else svc.fetch_inventory_for_parts
            rows = await fetch([parts[ref] for ref in batch])
        except Exception as exc:
            logger.warning("%s linked stock batch failed: %s", sources.label(supplier), exc)
            continue
        by_sku = {str(r.get("sku") or ""): r for r in rows}
        answered = {str(r.get("styleID") or "") for r in rows}
        pairs = []
        for ref in batch:
            # A style that came back with no rows at all is a bad answer, not
            # a style with nothing left.
            if ref not in answered and not any(sku in by_sku for _, _, sku in by_style[ref]):
                continue
            for sid, vid, sku in by_style[ref]:
                row = by_sku.get(sku)
                pairs.append((sid, vid, stock_of(row, safety) if row else 0, cost_of(row) if (row and with_cost) else None))
        checked += len(pairs)
        changed += await write(pairs)
    if gone:
        changed += await write([(sid, vid, 0, None) for ref in gone for sid, vid, _ in by_style[ref]])
    return {"sources": checked, "sources_changed": changed}
