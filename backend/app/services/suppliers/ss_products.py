"""Create and update store products from S&S styles, following the brand's setup.

One place decides what an S&S style becomes in the store, used by the one-off
"Import now", the filtered import and every sync:

* Match Fields (mapping.py) say which S&S field fills which product field.
* Inventory Settings say which S&S warehouses feed which store location, less
  the adjustment quantity.
* Automatic Sync says how many variants a product may have, and what a sync may
  change on products that already exist.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.suppliers import config as cfgmod
from app.services.suppliers import mapping

logger = logging.getLogger(__name__)

SUPPLIER = "ss_activewear"
DROPSHIP = "DS"


class SkipProduct(Exception):
    """This style is not imported under the brand's settings (e.g. variant limit)."""


# ── Stock ────────────────────────────────────────────────────────────────────

def warehouse_qty(row: dict) -> dict[str, int]:
    """S&S stock per warehouse code for one SKU row."""
    out: dict[str, int] = {}
    for w in row.get("warehouses") or []:
        code = str(w.get("warehouseAbbr") or "").upper()
        if code:
            try:
                out[code] = out.get(code, 0) + int(w.get("qty") or 0)
            except (TypeError, ValueError):
                pass
    return out


def stock_from(row: dict, source: str) -> int | None:
    """Stock a store location gets from this SKU; None when it isn't fed."""
    if source == "none":
        return None
    per = warehouse_qty(row)
    if not per:
        # Some payloads carry only the combined figure.
        if source in ("all", "all_except_ds"):
            try:
                return int(row.get("qty") or 0)
            except (TypeError, ValueError):
                return 0
        return 0
    if source == "all":
        return sum(per.values())
    if source == "all_except_ds":
        return sum(q for c, q in per.items() if c != DROPSHIP)
    return per.get(source.upper(), 0)


async def locations(db: AsyncSession, cfg: dict, *, create_default: bool = False) -> list[tuple[uuid.UUID, str]]:
    """(store location, S&S source) pairs that receive stock.

    With nothing saved, the first active location takes every warehouse except
    drop-ship — what the store has always done. `create_default` makes a
    location when the brand has none yet (first import)."""
    from app.models.inventory import Warehouse

    rows = (await db.execute(
        select(Warehouse).where(Warehouse.is_active.is_(True)).order_by(Warehouse.created_at)
    )).scalars().all()
    if not rows and create_default:
        wh = Warehouse(name="Default Warehouse", code=f"WH-{uuid.uuid4().hex[:8].upper()}", country="US")
        db.add(wh)
        await db.flush()
        rows = [wh]
    saved = ((cfg.get("inventory") or {}).get("locations")) or {}
    if not saved:
        return [(rows[0].id, "all_except_ds")] if rows else []
    return [(w.id, saved[str(w.id)]) for w in rows if saved.get(str(w.id), "none") != "none"]


def _stock_values(row: dict, locs: list[tuple[uuid.UUID, str]], safety: int) -> dict[uuid.UUID, int]:
    out = {}
    for wid, src in locs:
        q = stock_from(row, src)
        if q is not None:
            out[wid] = max(0, q - safety)
    return out


# ── Building ─────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:200] or "product"


def _norm(v: Any) -> str:
    return str(v or "").strip().lower()


def pricer(cfg: dict, style: dict):
    """Cost → selling price with the brand's markup rules and rounding: the most
    specific active rule wins (style, brand, category, all); none = cost + 40%."""
    rules = [r for r in (cfg.get("pricing") or {}).get("rules") or [] if r.get("active", True)]
    round_to = (cfg.get("pricing") or {}).get("round_to")
    brand = _norm(style.get("brandName"))
    cats = {_norm(c) for c in str(style.get("baseCategory") or "").split(",") if c.strip()}
    names = {_norm(style.get("styleID")), _norm(style.get("styleName")), _norm(style.get("partNumber")),
             _norm(f"{style.get('brandName') or ''} {style.get('styleName') or ''}")}
    rank = {"style": 3, "brand": 2, "category": 1, "all": 0}
    best, best_rank = None, -1
    for r in rules:
        v = _norm(r.get("value"))
        scope = r.get("scope")
        hit = (scope == "all" or (scope == "style" and v in names)
               or (scope == "brand" and v == brand) or (scope == "category" and v in cats))
        if hit and rank.get(scope, -1) > best_rank:
            best, best_rank = r, rank[scope]

    def price(cost: float) -> float:
        if best is None:
            p = cost * 1.40
        else:
            p = cost * (1 + float(best.get("markup_pct") or 0) / 100) + float(best.get("markup_fixed") or 0)
        return cfgmod.apply_rounding(max(0.0, p), round_to)

    return price


def limit_skus(skus: list[dict], cfg: dict, existing: int = 0) -> list[dict]:
    """Apply the variant limit: keep the first N, or skip the product."""
    auto = cfg.get("automatic_sync") or {}
    cap = int(auto.get("max_variants") or 0)
    if not cap or existing + len(skus) <= cap:
        return skus
    if auto.get("variant_limit") == "skip" and existing == 0:
        raise SkipProduct(f"has {len(skus)} variants, more than your limit of {cap}")
    return skus[: max(0, cap - existing)]


def _fields(cfg: dict) -> list[dict]:
    return (cfg.get("product") or {}).get("fields") or mapping.DEFAULT_FIELDS


def _image_rows(product, skus: list[dict], name: str) -> list:
    from app.models.product import ProductImage
    from app.services.ss_activewear_service import ss_image_url

    seen, out = set(), []
    for row in skus:
        color = row.get("colorName") or "Default"
        path = row.get("colorFrontImage")
        if color in seen or not path:
            continue
        seen.add(color)
        large = ss_image_url(path, "large")
        out.append(ProductImage(
            product_id=product.id,
            url_thumbnail=ss_image_url(path, "small") or large,
            url_medium=ss_image_url(path, "medium") or large,
            url_large=large,
            alt_text=f"{name} - {color}"[:255],
            is_primary=not out,
            sort_order=len(out),
        ))
    return out


def _variant_values(fields, style, row, price_fn) -> dict:
    vals = mapping.apply(fields, style, row, level="variant", price_fn=price_fn)
    sku = vals.get("sku") or str(row.get("sku") or row.get("gtin") or "") or \
        f"{style.get('styleID')}-{row.get('colorCode', '')}-{row.get('sizeCode', '')}"
    hexv = str(row.get("color1") or "").strip()
    return {
        "sku": sku[:100],
        "color": (row.get("colorName") or "Default")[:100],
        "color_hex": hexv if hexv.startswith("#") and len(hexv) <= 9 else None,
        "size": (row.get("sizeName") or "OS")[:50],
        "retail_price": vals.get("retail_price") if vals.get("retail_price") is not None
        else price_fn(float(row.get("customerPrice") or row.get("piecePrice") or 0)),
        **{k: vals.get(k) for k in ("compare_price", "msrp", "cost_per_item", "weight_grams", "country_of_origin") if k in vals},
    }


async def create_product(db: AsyncSession, style: dict, skus: list[dict], cfg: dict):
    """A new store product for an S&S style, with every allowed variant, one
    image per colour and stock in each fed location. Flushes, doesn't commit."""
    from app.models.inventory import InventoryRecord
    from app.models.product import Product, ProductVariant

    if not skus:
        raise SkipProduct("S&S returned no variants for it")
    skus = limit_skus(skus, cfg)
    fields = _fields(cfg)
    price_fn = pricer(cfg, style)
    pvals = mapping.apply(fields, style, skus[0], level="product", price_fn=price_fn)
    style_id = str(style.get("styleID") or skus[0].get("styleID") or "")
    name = pvals.get("name") or " ".join(p for p in (style.get("brandName"), style.get("styleName")) if p) or style_id

    base_slug = _slugify(f"{name}-{style_id}")
    slug, n = base_slug, 1
    while (await db.execute(select(Product.id).where(Product.slug == slug))).first():
        slug, n = f"{base_slug}-{n}", n + 1

    product = Product(
        name=name, slug=slug, product_code=style_id, supplier=SUPPLIER, supplier_ref=style_id,
        status=(cfg.get("product") or {}).get("status", "active"),
        **{k: v for k, v in pvals.items() if k != "name" and v not in (None, [])},
    )
    if not product.vendor:
        product.vendor = style.get("brandName") or "S&S Activewear"
    db.add(product)
    await db.flush()

    for img in _image_rows(product, skus, name):
        db.add(img)

    locs = await locations(db, cfg, create_default=True)
    safety = int((cfg.get("inventory") or {}).get("safety_stock") or 0)
    for i, row in enumerate(skus):
        v = ProductVariant(product_id=product.id, status="active", sort_order=i,
                           **_variant_values(fields, style, row, price_fn))
        db.add(v)
        await db.flush()
        for wid, qty in _stock_values(row, locs, safety).items():
            db.add(InventoryRecord(variant_id=v.id, warehouse_id=wid, quantity=qty, low_stock_threshold=10))
    return product


async def set_stock(db: AsyncSession, variant_ids_rows: list[tuple[uuid.UUID, dict]],
                    locs: list[tuple[uuid.UUID, str]], safety: int, *, zero: bool = False) -> int:
    """Write stock for (variant, S&S row) pairs into every fed location.
    Returns how many records changed."""
    from app.models.inventory import InventoryRecord

    if not variant_ids_rows or not locs:
        return 0
    ids = [vid for vid, _ in variant_ids_rows]
    existing = {(r.variant_id, r.warehouse_id): r for r in (await db.execute(
        select(InventoryRecord).where(InventoryRecord.variant_id.in_(ids))
    )).scalars().all()}
    changed = 0
    for vid, row in variant_ids_rows:
        values = {wid: 0 for wid, _ in locs} if zero else _stock_values(row, locs, safety)
        for wid, qty in values.items():
            rec = existing.get((vid, wid))
            if rec is None:
                db.add(InventoryRecord(variant_id=vid, warehouse_id=wid, quantity=qty, low_stock_threshold=10))
                changed += 1
            elif rec.quantity != qty:
                rec.quantity = qty
                changed += 1
    return changed


async def update_product(db: AsyncSession, product, style: dict, skus: list[dict], cfg: dict, *,
                         locs, update: str, create_variants: bool, refresh_images: bool,
                         on_unavailable: str) -> dict:
    """Bring an existing product in line with S&S under the sync settings."""
    from app.models.product import ProductImage, ProductVariant

    stats = {"fields": 0, "prices": 0, "stock": 0, "new_variants": 0, "unavailable": 0}
    fields = _fields(cfg)
    price_fn = pricer(cfg, style)
    safety = int((cfg.get("inventory") or {}).get("safety_stock") or 0)
    variants = (await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id)
    )).scalars().all()
    by_sku = {v.sku: v for v in variants}
    rows_by_sku: dict[str, dict] = {}
    for row in skus:
        rows_by_sku[_variant_values(fields, style, row, price_fn)["sku"]] = row

    # Product-level fields only on "update everything".
    if update == "all" and skus:
        pvals = mapping.apply(fields, style, skus[0], level="product", price_fn=price_fn)
        for k, v in pvals.items():
            if v not in (None, []) and getattr(product, k, None) != v:
                setattr(product, k, v)
                stats["fields"] += 1

    # Variant fields and prices.
    if update in ("inventory_price", "all"):
        for sku, row in rows_by_sku.items():
            v = by_sku.get(sku)
            if v is None:
                continue
            vals = _variant_values(fields, style, row, price_fn)
            keys = [k for k in vals if k in mapping.PRICE_TARGETS] if update == "inventory_price" \
                else [k for k in vals if k != "sku"]
            for k in keys:
                new = vals[k]
                if new is None:
                    continue
                old = getattr(v, k, None)
                if (float(old) if isinstance(new, float) and old is not None else old) != new:
                    setattr(v, k, new)
                    stats["prices" if k in mapping.PRICE_TARGETS else "fields"] += 1

    # New variants S&S added to the style.
    if create_variants:
        new_rows = [r for s, r in rows_by_sku.items() if s not in by_sku]
        if new_rows:
            try:
                new_rows = limit_skus(new_rows, cfg, existing=len(variants))
            except SkipProduct:
                new_rows = []
            start = max((v.sort_order for v in variants), default=-1) + 1
            for i, row in enumerate(new_rows):
                v = ProductVariant(product_id=product.id, status="active", sort_order=start + i,
                                   **_variant_values(fields, style, row, price_fn))
                db.add(v)
                await db.flush()
                by_sku[v.sku] = v
                stats["new_variants"] += 1
                stats["stock"] += await set_stock(db, [(v.id, row)], locs, safety)

    # Stock.
    if update != "none":
        pairs = [(by_sku[s].id, r) for s, r in rows_by_sku.items() if s in by_sku]
        stats["stock"] += await set_stock(db, pairs, locs, safety)

    # Variants S&S no longer sells, and ones that came back.
    gone = [v for v in variants if v.sku not in rows_by_sku]
    if on_unavailable != "none" and gone:
        stats["unavailable"] = len(gone)
        stats["stock"] += await set_stock(db, [(v.id, {}) for v in gone], locs, safety, zero=True)
        if on_unavailable in ("draft", "archive"):
            for v in gone:
                v.status = "discontinued"
    if on_unavailable in ("draft", "archive"):
        for v in variants:
            if v.status == "discontinued" and v.sku in rows_by_sku:
                v.status = "active"

    if refresh_images and skus:
        want = _image_rows(product, skus, product.name)
        have = (await db.execute(
            select(ProductImage.url_large).where(ProductImage.product_id == product.id).order_by(ProductImage.sort_order)
        )).scalars().all()
        if [i.url_large for i in want] != list(have):
            await db.execute(delete(ProductImage).where(ProductImage.product_id == product.id))
            for img in want:
                db.add(img)
            stats["fields"] += 1
    return stats


def mapped_sku(cfg: dict, style: dict, row: dict) -> str:
    """The store SKU an S&S row maps to (Match Fields can reshape SKUs)."""
    return _variant_values(_fields(cfg), style, row, lambda c: c)["sku"]
