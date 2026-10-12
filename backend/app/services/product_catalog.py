"""What each product is, what it sells from, its stock, and what needs a look
before it sells — said once, for the admin's product list.

A product is one of five kinds, read from the fields that already decide how it
is sold, so no new column says it:

    stocked         pricing_mode "variant": colour × size, a SKU and stock each
    made            pricing_mode "configurable": questions, choices, price breaks
    gang_sheet      gang_sheet_enabled, type "gang_sheet" (or none, the old default)
    upload_by_size  gang_sheet_enabled, type "upload_by_size": priced by area
    upload_own      gang_sheet_enabled, type "upload_own": a finished sheet, by size

Pure, apart from `load_catalog` at the foot, which reads a shop's products with
the few totals the list needs in a handful of queries.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

KINDS = ("stocked", "made", "gang_sheet", "upload_by_size", "upload_own")
STATUSES = ("active", "draft", "archived")


def kind_of(pricing_mode: str | None, gang_enabled: bool | None, gang_type: str | None) -> str:
    if gang_enabled:
        return gang_type if gang_type in ("upload_by_size", "upload_own") else "gang_sheet"
    return "made" if pricing_mode == "configurable" else "stocked"


@dataclass(frozen=True)
class Facts:
    kind: str
    status: str
    images: int = 0
    variants: int = 0
    min_variant_price: float | None = None
    stock: int = 0
    base_price: float | None = None
    options: int = 0
    sizes: int = 0
    min_size_price: float | None = None
    tiers: int = 0
    min_tier_price: float | None = None


def price_from(f: Facts) -> dict | None:
    """The least it sells from, and per what. None: no price set yet."""
    if f.kind == "stocked":
        return {"amount": f.min_variant_price, "per": "item"} if f.min_variant_price else None
    if f.kind == "made":
        return {"amount": f.base_price, "per": "item"} if f.base_price else None
    if f.kind == "upload_by_size":
        return {"amount": f.min_tier_price, "per": "sq in"} if f.min_tier_price else None
    return {"amount": f.min_size_price, "per": "sheet"} if f.min_size_price else None


def stock(f: Facts) -> dict:
    """Stock is counted for stocked items only; the rest are made when ordered."""
    if f.kind != "stocked":
        return {"label": "Not tracked", "tone": ""}
    if f.variants == 0:
        return {"label": "No variants", "tone": "amber"}
    if f.stock <= 0:
        return {"label": "Out of stock", "tone": "red"}
    return {"label": f"{f.stock:,} in stock", "tone": ""}


def attention(f: Facts) -> list[str]:
    """What stops it selling, or selling well, in the order to fix it."""
    out: list[str] = []
    if f.status == "draft":
        out.append("Draft")
    if f.kind == "stocked":
        if f.variants == 0:
            out.append("No variants")
        elif f.stock <= 0:
            out.append("Out of stock")
    if f.kind in ("gang_sheet", "upload_own") and f.sizes == 0:
        out.append("No sheet sizes")
    if f.kind == "upload_by_size" and f.tiers == 0:
        out.append("No pricing")
    if price_from(f) is None and not any(x in out for x in ("No variants", "No sheet sizes", "No pricing")):
        out.append("No price")
    if f.images == 0:
        out.append("No image")
    return out


def row(p: Any, f: Facts, image: str | None) -> dict:
    return {
        "id": str(p.id),
        "slug": p.slug,
        "name": p.name,
        "status": p.status,
        "kind": f.kind,
        "image": image,
        "product_code": getattr(p, "product_code", None),
        "price_from": price_from(f),
        "stock": stock(f),
        "attention": attention(f),
        "variants": f.variants,
        "updated_at": p.updated_at.isoformat() if getattr(p, "updated_at", None) else None,
    }


def page(rows: list[dict], *, status: str | None = None, attention_only: bool = False,
         page_no: int = 1, page_size: int = 50) -> dict:
    """Counts first (by status, before the status filter), then the page."""
    pool = [r for r in rows if r["attention"]] if attention_only else rows
    counts = {"all": len(pool), **{s: sum(1 for r in pool if r["status"] == s) for s in STATUSES}}
    shown = [r for r in pool if r["status"] == status] if status in STATUSES else pool
    start = max(page_no - 1, 0) * page_size
    return {
        "rows": shown[start:start + page_size],
        "total": len(shown),
        "counts": counts,
        "attention": sum(1 for r in rows if r["attention"]),
        "kinds": {k: sum(1 for r in rows if r["kind"] == k) for k in KINDS},
    }


# ── Reading a shop's products ─────────────────────────────────────────────────

def _f(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


async def load_catalog(db, *, q: str | None = None, kind: str | None = None) -> list[dict]:
    """Every product matching the search and kind, newest change first."""
    from sqlalchemy import exists, func, or_, select

    from app.api.v1.gang_sheets import GangSheetSize
    from app.models.inventory import InventoryRecord
    from app.models.product import Product, ProductImage, ProductVariant
    from app.models.product_option import ProductOption

    stmt = select(Product)
    words = (q or "").strip()
    if words:
        like = f"%{words}%"
        stmt = stmt.where(or_(
            Product.name.ilike(like),
            Product.product_code.ilike(like),
            exists(select(ProductVariant.id).where(ProductVariant.product_id == Product.id, ProductVariant.sku.ilike(like))),
        ))
    products = list((await db.execute(stmt.order_by(Product.updated_at.desc().nulls_last(), Product.name))).scalars().all())
    if not products:
        return []
    ids = [p.id for p in products]

    images: dict = {}
    for pid, thumb, count in (await db.execute(
        select(ProductImage.product_id, func.min(ProductImage.url_thumbnail), func.count(ProductImage.id))
        .where(ProductImage.product_id.in_(ids)).group_by(ProductImage.product_id)
    )).all():
        images[pid] = (thumb, int(count))
    # The primary image (or the first in order) is the one the list shows.
    first: dict = {}
    for pid, thumb in (await db.execute(
        select(ProductImage.product_id, ProductImage.url_thumbnail)
        .where(ProductImage.product_id.in_(ids))
        .order_by(ProductImage.product_id, ProductImage.is_primary.desc(), ProductImage.sort_order)
    )).all():
        first.setdefault(pid, thumb)

    live = ProductVariant.status != "discontinued"
    variants = {pid: (int(n), _f(low)) for pid, n, low in (await db.execute(
        select(ProductVariant.product_id, func.count(ProductVariant.id),
               func.min(func.nullif(ProductVariant.retail_price, 0)))
        .where(ProductVariant.product_id.in_(ids), live).group_by(ProductVariant.product_id)
    )).all()}
    stock = {pid: int(total or 0) for pid, total in (await db.execute(
        select(ProductVariant.product_id, func.sum(InventoryRecord.quantity))
        .join(InventoryRecord, InventoryRecord.variant_id == ProductVariant.id)
        .where(ProductVariant.product_id.in_(ids), live, InventoryRecord.quantity > 0)
        .group_by(ProductVariant.product_id)
    )).all()}
    options = {pid: int(n) for pid, n in (await db.execute(
        select(ProductOption.product_id, func.count(ProductOption.id))
        .where(ProductOption.product_id.in_(ids)).group_by(ProductOption.product_id)
    )).all()}

    def sheet_price(s):
        return s.price_per_sheet if (s.pricing_mode or "fixed") == "fixed" else (s.price_per_inch or 0) * (s.min_length_in or 0)

    sizes: dict = {}
    global_sizes: list = []
    for s in (await db.execute(select(GangSheetSize).where(GangSheetSize.is_active.is_(True)))).scalars().all():
        (sizes.setdefault(s.product_id, []) if s.product_id else global_sizes).append(_f(sheet_price(s)) or 0)

    out = []
    for p in products:
        k = kind_of(p.pricing_mode, p.gang_sheet_enabled, p.gang_sheet_type)
        if kind in KINDS and k != kind:
            continue
        # A sheet product with no sizes of its own sells from the shop's default set.
        own = sizes.get(p.id) or global_sizes
        tiers = [t for t in ((p.gang_sheet_config or {}).get("tiers") or []) if _f(t.get("price_per_sqin"))]
        n_var, low = variants.get(p.id, (0, None))
        f = Facts(
            kind=k, status=p.status, images=images.get(p.id, (None, 0))[1],
            variants=n_var, min_variant_price=low, stock=stock.get(p.id, 0),
            base_price=_f(p.base_price), options=options.get(p.id, 0),
            sizes=len(own), min_size_price=min((x for x in own if x > 0), default=None),
            tiers=len(tiers), min_tier_price=min((_f(t["price_per_sqin"]) for t in tiers), default=None),
        )
        out.append(row(p, f, first.get(p.id)))
    return out
