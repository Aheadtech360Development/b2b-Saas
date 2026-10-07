"""A product, loaded whole for the page that sells it.

Its pictures, its words, its prices, the choices it was actually given in the
admin, and how it is bought — one answer the website builder's product page
draws from (services/builder/resolve.py) and its buy box binds to.

The name is from the imported themes this was first written for, which also
had this module pour the product into a design's own HTML. Those are gone; the
loader is what is left.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.product_option import ProductOption, ProductQtyTier


async def load(db: AsyncSession, product_id: Any) -> dict[str, Any] | None:
    """Everything the design's product page could need about one product."""
    product = (await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.images),
            selectinload(Product.variants),
            selectinload(Product.options).selectinload(ProductOption.values),
        )
    )).scalar_one_or_none()
    if product is None:
        return None

    tiers = (await db.execute(
        select(ProductQtyTier).where(ProductQtyTier.product_id == product.id).order_by(ProductQtyTier.min_qty)
    )).scalars().all()

    # Stock lives in the warehouses, not on the variant. A variant nobody
    # tracks stock for is treated as available, which is what the rest of the
    # storefront does with it.
    from sqlalchemy import func as _func

    from app.models.inventory import InventoryRecord

    variant_ids = [v.id for v in (product.variants or [])]
    on_hand: dict[Any, int] = {}
    if variant_ids:
        on_hand = {
            row[0]: int(row[1] or 0)
            for row in (await db.execute(
                select(InventoryRecord.variant_id, _func.sum(InventoryRecord.quantity))
                .where(InventoryRecord.variant_id.in_(variant_ids))
                .group_by(InventoryRecord.variant_id)
            )).all()
        }

    images = sorted(product.images or [], key=lambda i: (not getattr(i, "is_primary", False), getattr(i, "sort_order", 0)))
    variants = [v for v in (product.variants or []) if v.status == "active"]
    prices = [float(v.retail_price) for v in variants if v.retail_price is not None]
    if not prices and product.base_price is not None:
        prices = [float(product.base_price)]

    # A gang-sheet product has no variant matrix: it is bought by the sheet, at
    # the sizes and prices this product was given in Gang Sheets -> Sheet Sizes.
    # Those are its real choices and its real prices, so the design's size row
    # and price line are filled from them rather than from variants it has none
    # of.
    sheets: list[dict[str, Any]] = []
    if product.gang_sheet_enabled:
        from app.api.v1.gang_sheets import GangSheetSize

        for s in (await db.execute(
            select(GangSheetSize)
            .where(GangSheetSize.product_id == product.id, GangSheetSize.is_active.is_(True))
            .order_by(GangSheetSize.sort_order, GangSheetSize.name)
        )).scalars().all():
            custom = (getattr(s, "pricing_mode", "fixed") or "fixed") == "custom_length"
            per_inch = float(getattr(s, "price_per_inch", 0) or 0)
            min_len = float(getattr(s, "min_length_in", 12) or 12)
            sheets.append({
                "sheet_id": str(s.id),
                "label": s.name,
                "width_in": float(s.width_in),
                "height_in": float(s.height_in),
                # What one sheet costs: flat for a fixed size, and for a
                # custom-length one the shortest length a buyer may order.
                "price": round(per_inch * min_len, 2) if custom else float(s.price_per_sheet),
                "custom_length": custom,
                "price_per_inch": per_inch,
                "min_length_in": min_len,
                "max_length_in": float(getattr(s, "max_length_in", 240) or 240),
            })
        if not prices:
            prices = [s["price"] for s in sheets if s["price"]]

    # Every buyable combination, so the page can price and add to cart from
    # what the store actually stocks rather than from what the design drew.
    combinations = [
        {
            "id": str(v.id),
            "colour": v.color or "",
            "size": v.size or "",
            "price": float(v.retail_price) if v.retail_price is not None else None,
            "stock": on_hand.get(v.id, 9999),
            "sku": v.sku,
        }
        for v in variants
    ]

    colours: list[dict[str, Any]] = []
    sizes: list[dict[str, Any]] = []
    for v in variants:
        if v.color and not any(c["label"] == v.color for c in colours):
            colours.append({"label": v.color, "hex": v.color_hex or "", "variant_id": str(v.id)})
        if v.size and not any(s["label"] == v.size for s in sizes):
            sizes.append({"label": v.size, "variant_id": str(v.id)})

    options = []
    for o in sorted(product.options or [], key=lambda x: x.position):
        if not o.is_active:
            continue
        values = [
            {"id": str(v.id), "label": v.label, "hex": v.swatch_hex or "", "image": v.image_url or "",
             "default": bool(v.is_default)}
            for v in sorted(o.values, key=lambda x: x.position) if v.enabled
        ]
        if values:
            options.append({"id": str(o.id), "name": o.name, "input_type": o.input_type,
                            "required": bool(o.required), "values": values})

    return {
        "id": str(product.id),
        "name": product.name,
        "slug": product.slug,
        "summary": (product.short_description or "").strip(),
        "description": (product.description or "").strip(),
        "pricing_mode": product.pricing_mode or "variant",
        "images": [
            {"url": getattr(i, "url_large", None) or getattr(i, "url_medium", ""), "alt": getattr(i, "alt_text", "") or product.name}
            for i in images
        ],
        "from_price": min(prices) if prices else None,
        "variants": combinations,
        "colours": colours,
        "sizes": sizes,
        "options": options,
        "qty_tiers": [{"min_qty": int(t.min_qty), "unit_price": float(t.unit_price)} for t in tiers],
        "review_count": int(getattr(product, "review_count", 0) or 0),
        "avg_rating": float(getattr(product, "avg_rating", 0) or 0),
        "size_chart": product.size_chart_data or [],
        "gang_sheet": bool(product.gang_sheet_enabled),
        "design_upload": bool(getattr(product, "allow_design_upload", False)),
        "gang_sheet_type": product.gang_sheet_type or "gang_sheet",
        "gang_sheet_config": product.gang_sheet_config or None,
        "sheets": sheets,
        # Where its button goes. An upload-by-size product is ordered from its
        # own page, where that upload opens; anything else opens the builder.
        "builder_href": (
            ""
            if not product.gang_sheet_enabled
            else f"/products/{product.slug}"
            if product.gang_sheet_type == "upload_by_size"
            else f"/gang-sheets?product={product.id}"
        ),
    }
