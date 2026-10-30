"""The products file (Products → Export): every product as Shopify lays out its
product CSV, with what Shopify has no column for after it.

The file used to carry eight columns (name, slug, moq, status, sku, color,
size, price): no description, category, weight, images, stock, cost, SEO or
options. Shopify's own columns now come first, under Shopify's names and in
its order (help.shopify.com, "Using CSV files to import and export
products"), so the file reads like a Shopify export and Shopify's import takes
it. Ours follow: kind, minimum order, product code, fabric, the options of a
made to order product with their prices, quantity breaks, sheet sizes.

Layout, as Shopify's: one row per variant. The first row carries the
product's own fields, the others repeat only the URL handle. Images go one
per row, the first beside the first variant; images past the last variant get
rows of their own holding only the handle and the image. A product with no
options is one variant, "Title" / "Default Title".

What a variant is here:
- stocked products: their variants, Color and Size as Option1 and Option2;
- gang sheets: the sheet sizes (the product's own, else the shop's default set);
- made to order: one row at the base price, every option and value in the
  Options column. Shopify allows three options and has no price table; the
  table itself downloads from the product's Pricing (Price table says how big).
  Options (data) holds the same options in full (input type, swatches, SKU
  parts, rules) as JSON, so Import can make them again (services/product_import).
"""
from __future__ import annotations

import csv
import io
import json
from decimal import Decimal, InvalidOperation
from typing import Any

SHOPIFY_COLUMNS = [
    "Title", "URL handle", "Description", "Vendor", "Product category", "Type", "Tags",
    "Published on online store", "Status", "SKU", "Barcodes",
    "Option1 name", "Option1 value", "Option1 LinkedTo",
    "Option2 name", "Option2 value", "Option2 LinkedTo",
    "Option3 name", "Option3 value", "Option3 LinkedTo",
    "Price", "Compare-at price", "Cost per item", "Charge tax",
    "Inventory tracker", "Inventory quantity", "Continue selling when out of stock",
    "Weight value (grams)", "Weight unit for display",
    "Packed product length", "Packed product width", "Packed product height", "Packed product dimension unit",
    "Requires shipping", "Fulfillment service",
    "Product image URL", "Image position", "Image alt text", "Variant image URL",
    "Gift card", "SEO title", "SEO description",
    # Shopify's one optional extra column: the shop's own grouping. Ours are categories.
    "Collection",
]

OUR_COLUMNS = [
    "Kind", "Bulk order form", "Minimum order quantity", "Product code", "Short description", "Fabric", "Gender",
    "Care instructions", "Supplier", "Supplier reference",
    "Variant status", "Color hex", "MSRP", "Country of origin",
    "Base price", "Quantity price breaks", "Options", "Options (data)", "Price table", "Sheet details",
]

COLUMNS = SHOPIFY_COLUMNS + OUR_COLUMNS

# The words the admin's product list uses (frontend lib/productKinds KIND_WORDS).
KIND_WORDS = {
    "stocked": "Stocked", "made": "Made to order", "gang_sheet": "Gang sheet",
    "upload_by_size": "Upload by size", "upload_own": "Upload your own sheet",
}
SHEET_KINDS = ("gang_sheet", "upload_by_size", "upload_own")


def _dec(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        d = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() else None


def _amount(value: Any, places: int = 2) -> str:
    """12.5 → "12.50"; a sub-cent price keeps its digits (0.025 → "0.025")."""
    d = _dec(value)
    if d is None:
        return ""
    text = f"{d.quantize(Decimal(1).scaleb(-4)):f}".rstrip("0")
    whole, _, cents = text.partition(".")
    return f"{whole}.{cents.ljust(places, '0')}"


def _number(value: Any) -> str:
    """180.0 → "180", 2.5 → "2.5"."""
    d = _dec(value)
    if d is None:
        return ""
    text = f"{d:f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _yes(flag: bool) -> str:
    return "true" if flag else "false"


def _ordered_images(images: list) -> list:
    # The order the shop sees: the primary image first, then by position.
    return sorted(images, key=lambda i: (not i.is_primary, i.sort_order or 0))


def _option_words(options: list) -> str:
    """Paper (required): Gloss, Matte (+$2.00 per order) | Size: 8.5 x 11, 11 x 17 (+$0.05 each)."""
    parts = []
    for opt in sorted(options, key=lambda o: o.position or 0):
        values = []
        for v in sorted(opt.values or [], key=lambda x: x.position or 0):
            word = v.label
            delta = _dec(v.price_delta) or Decimal(0)
            if delta:
                sign = "+" if delta > 0 else "-"
                if v.price_mode == "percent":
                    word += f" ({sign}{_number(abs(delta))}%)"
                elif v.price_mode == "per_unit":
                    word += f" ({sign}${_amount(abs(delta))} each)"
                else:
                    word += f" ({sign}${_amount(abs(delta))} per order)"
            if not v.enabled:
                word += " (off)"
            values.append(word)
        name = opt.name + (" (required)" if opt.required else "") + ("" if opt.is_active else " (off)")
        parts.append(f"{name}: {', '.join(values)}")
    return " | ".join(parts)


def _options_data(options: list, rules: list) -> str:
    """The options in full, as JSON, for Import to make them again. Rules name
    their options and values, since the ids mean nothing in another shop."""
    if not options:
        return ""
    names: dict = {}  # value id → (option name, value label)
    option_names: dict = {}
    out = []
    for opt in sorted(options, key=lambda o: o.position or 0):
        option_names[opt.id] = opt.name
        values = []
        for v in sorted(opt.values or [], key=lambda x: x.position or 0):
            names[v.id] = (opt.name, v.label)
            values.append({
                "label": v.label, "price": _number(v.price_delta) or "0", "mode": v.price_mode,
                "enabled": bool(v.enabled), "default": bool(v.is_default),
                "swatch": v.swatch_hex, "image": v.image_url, "sku": v.sku_suffix,
            })
        out.append({
            "name": opt.name, "type": opt.input_type, "required": bool(opt.required), "active": bool(opt.is_active),
            "help": opt.help_text, "matrix": bool(opt.in_price_matrix), "values": values,
        })
    said = []
    for r in rules or []:
        when = names.get(r.when_value_id)
        if not when:
            continue
        rule: dict = {"when": list(when), "action": r.action}
        if r.target_value_id in names:
            rule["option"], rule["value"] = names[r.target_value_id]
        elif r.target_option_id in option_names:
            rule["option"] = option_names[r.target_option_id]
        else:
            continue
        if r.note:
            rule["note"] = r.note
        said.append(rule)
    return json.dumps({"options": out, "rules": said}, separators=(",", ":"), ensure_ascii=False)


def _tier_words(tiers: list) -> str:
    """12+: $5.00; 24+: $4.50."""
    return "; ".join(f"{t.min_qty}+: ${_amount(t.unit_price)}" for t in sorted(tiers, key=lambda t: t.min_qty))


def _sheet(size: Any) -> tuple[str, str]:
    """A sheet size's price for the Price column, and its details in words."""
    width, height = _number(size.width_in), _number(size.height_in)
    if (size.pricing_mode or "fixed") == "fixed":
        return _amount(size.price_per_sheet), f"{width} x {height} in"
    # Priced by length: the shortest sheet's price, as the product list shows it.
    per_inch = _dec(size.price_per_inch) or Decimal(0)
    shortest = _dec(size.min_length_in) or Decimal(0)
    return (_amount(per_inch * shortest),
            f"{width} in wide, ${_amount(per_inch, 4)} per inch, "
            f"{_number(size.min_length_in)} to {_number(size.max_length_in)} in long")


def rows_for(p: Any, *, kind: str, variants: list, stock: dict, sheet_sizes: list,
             price_table: int, rules: list | None = None) -> list[dict]:
    """Every row of one product, as dicts keyed by COLUMNS."""
    images = _ordered_images(list(p.images or []))
    product_grams = _number(p.weight)
    tracked = bool(p.track_inventory) and kind == "stocked"

    def image_for(color: str | None) -> str:
        if not color:
            return ""
        key = color.strip().lower()
        # The product editor ties an image to a colour through its alt text.
        match = next((i for i in images if (i.alt_text or "").strip().lower() == key), None)
        return match.url_large if match else ""

    # Each variant row: its option values and the variant's own columns.
    lines: list[tuple[list[str], dict]] = []
    names: list[str] = []
    if kind == "stocked" and variants:
        has_color = any((v.color or "").strip() for v in variants)
        has_size = any((v.size or "").strip() for v in variants)
        names = (["Color"] if has_color else []) + (["Size"] if has_size else [])
        for n, v in enumerate(variants, start=1):
            values = ([v.color or ""] if has_color else []) + ([v.size or ""] if has_size else [])
            if not names:
                values = ["Default Title" if len(variants) == 1 else (v.sku or f"Variant {n}")]
            lines.append((values, {
                "SKU": v.sku or "",
                "Price": _amount(v.retail_price),
                "Compare-at price": _amount(v.compare_price),
                "Cost per item": _amount(v.cost_per_item),
                "Inventory tracker": "shopify" if tracked else "",
                "Inventory quantity": str(int(stock.get(v.id) or 0)) if tracked else "",
                "Continue selling when out of stock": "deny" if tracked else "continue",
                "Weight value (grams)": _number(v.weight_grams) or product_grams,
                "Variant image URL": image_for(v.color),
                "Variant status": v.status or "",
                "Color hex": v.color_hex or "",
                "MSRP": _amount(v.msrp),
                "Country of origin": v.country_of_origin or "",
            }))
        if not names:
            names = ["Title"]
    elif kind in SHEET_KINDS and sheet_sizes:
        names = ["Sheet size"]
        for s in sheet_sizes:
            price, details = _sheet(s)
            lines.append(([s.name], {
                "Price": price, "Sheet details": details,
                "Continue selling when out of stock": "continue",
                "Weight value (grams)": product_grams,
            }))
    else:
        # Made to order, or a product with nothing to choose yet: one row.
        names = ["Title"]
        lines.append((["Default Title"], {
            "Price": _amount(p.base_price),
            "Continue selling when out of stock": "continue",
            "Weight value (grams)": product_grams,
        }))

    categories = sorted({link.category.name for link in (p.category_links or []) if getattr(link, "category", None)})
    first = {
        "Title": p.name,
        "Description": p.description or "",
        "Vendor": p.vendor or "",
        "Type": p.product_type or "",
        "Tags": ", ".join(t for t in (p.tags or []) if t),
        "Published on online store": _yes(p.status == "active"),
        "Status": p.status or "",
        "Gift card": "false",
        "SEO title": p.meta_title or "",
        "SEO description": p.meta_description or "",
        "Collection": ", ".join(categories),
        "Kind": KIND_WORDS.get(kind, kind),
        # Sold on the bulk order form, and what its colour cards show. Blank: the usual buy box.
        "Bulk order form": (("Swatches" if p.bulk_cards == "swatches" else "Pictures")
                            if kind == "stocked" and getattr(p, "bulk_order", False) else ""),
        "Minimum order quantity": str(p.moq) if p.moq is not None else "",
        "Product code": p.product_code or "",
        "Short description": p.short_description or "",
        "Fabric": p.fabric or "",
        "Gender": p.gender or "",
        "Care instructions": p.care_instructions or "",
        "Supplier": p.supplier or "",
        "Supplier reference": p.supplier_ref or "",
        "Base price": _amount(p.base_price) if kind == "made" else "",
        "Quantity price breaks": _tier_words(list(p.qty_tiers or [])),
        "Options": _option_words(list(p.options or [])),
        "Options (data)": _options_data(list(p.options or []), list(rules or [])),
        "Price table": f"{price_table} prices" if price_table else "",
    }

    rows: list[dict] = []
    for n in range(max(len(lines), len(images))):
        row: dict = {"URL handle": p.slug}
        if n == 0:
            row.update(first)
        if n < len(lines):
            values, own = lines[n]
            for i, value in enumerate(values[:3], start=1):
                if n == 0:
                    row[f"Option{i} name"] = names[i - 1]
                row[f"Option{i} value"] = value
            row.update({
                "Charge tax": "true", "Weight unit for display": "g",
                "Requires shipping": "true", "Fulfillment service": "manual",
            })
            row.update(own)
        if n < len(images):
            row["Product image URL"] = images[n].url_large
            row["Image position"] = str(n + 1)
            row["Image alt text"] = images[n].alt_text or ""
        rows.append(row)
    return rows


def write_csv(rows: list[dict]) -> str:
    """The file, with a byte order mark so Excel reads it as UTF-8."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, restval="", extrasaction="raise")
    writer.writeheader()
    writer.writerows(rows)
    return "﻿" + buf.getvalue()


async def export_csv(db, ids: list | None = None) -> str:
    """The shop's products as the products file: all of them, or only `ids`
    (the ones ticked in the list, or the one product open)."""
    from sqlalchemy import func, select
    from sqlalchemy.orm import selectinload

    from app.api.v1.gang_sheets import GangSheetSize
    from app.models.inventory import InventoryRecord
    from app.models.product import Product, ProductCategory
    from app.models.product_option import ProductOption, ProductOptionCombination
    from app.services.product_catalog import kind_of

    stmt = select(Product).options(
        selectinload(Product.variants),
        selectinload(Product.images),
        selectinload(Product.category_links).selectinload(ProductCategory.category),
        selectinload(Product.options).selectinload(ProductOption.values),
        selectinload(Product.qty_tiers),
        selectinload(Product.option_rules),
    ).order_by(Product.name, Product.slug)
    if ids is not None:
        stmt = stmt.where(Product.id.in_(ids))
    products = list((await db.execute(stmt)).scalars().all())

    variant_ids = [v.id for p in products for v in p.variants]
    stock: dict = {}
    if variant_ids:
        stock = {vid: total for vid, total in (await db.execute(
            select(InventoryRecord.variant_id, func.sum(InventoryRecord.quantity))
            .where(InventoryRecord.variant_id.in_(variant_ids)).group_by(InventoryRecord.variant_id)
        )).all()}

    tables: dict = {}
    if products:
        tables = {pid: int(n) for pid, n in (await db.execute(
            select(ProductOptionCombination.product_id, func.count(ProductOptionCombination.id))
            .where(ProductOptionCombination.product_id.in_([p.id for p in products]))
            .group_by(ProductOptionCombination.product_id)
        )).all()}

    own_sizes: dict = {}
    shop_sizes: list = []
    for s in (await db.execute(
        select(GangSheetSize).where(GangSheetSize.is_active.is_(True))
        .order_by(GangSheetSize.sort_order, GangSheetSize.name)
    )).scalars().all():
        (own_sizes.setdefault(s.product_id, []) if s.product_id else shop_sizes).append(s)

    rows: list[dict] = []
    for p in products:
        kind = kind_of(p.pricing_mode, p.gang_sheet_enabled, p.gang_sheet_type)
        # The order the shop set (sort_order), then the order they were made.
        variants = sorted(p.variants, key=lambda v: (v.sort_order or 0, v.created_at.timestamp() if v.created_at else 0.0))
        rows.extend(rows_for(
            p, kind=kind, variants=variants, stock=stock,
            # A sheet product with no sizes of its own sells from the shop's default set.
            sheet_sizes=(own_sizes.get(p.id) or shop_sizes) if kind in SHEET_KINDS else [],
            price_table=tables.get(p.id, 0), rules=list(p.option_rules or []),
        ))
    return write_csv(rows)
