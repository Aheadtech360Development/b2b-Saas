"""Products from a products file (Products → Import, or Import on one product).

Takes the file Export writes (services/product_export), or a product CSV from
Shopify, under Shopify's current column names or its older ones (Handle,
Body (HTML), Variant SKU…). Columns neither knows are ignored.

Products are matched by URL handle, as Shopify does. A new handle is a new
product. A handle the shop has is updated only when the admin ticks "Update
products that already exist" (Shopify's own rule); otherwise it is skipped.
Import on one product's page reads only that product's rows and updates it.

What an update changes: the product's fields for the columns the file has (a
blank cell clears an optional field, a column the file lacks leaves it
alone); variants matched by SKU, else by colour and size, and created when
new; images whose web address the product does not have yet. Nothing is
deleted: variants and images the file does not list stay as they are.

Made to order: a new product gets its options from Options (data), the column
Export writes; an existing one keeps its options, since its price table
points at them. Gang sheets (and upload by size / your own sheet): an
existing one gets its fields; a new one is made in Gang sheet setup.

Everything is planned first, with nothing written (the preview); applying
writes each product in a savepoint of its own, so one bad product never stops
the others.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.product_export import COLUMNS, KIND_WORDS, SHEET_KINDS

logger = logging.getLogger(__name__)

MAX_BYTES = 10 * 1024 * 1024
MAX_PRODUCTS = 5000
MAX_NEW_IMAGES = 250

STATUSES = ("active", "draft", "archived")
COLOR_NAMES = {"color", "colour", "colors", "colours"}
SIZE_NAMES = {"size", "sizes"}
KINDS_BY_WORD = {word.lower(): kind for kind, word in KIND_WORDS.items()}

# Header names, lower case, to ours: every column Export writes, and the
# names Shopify used before it renamed them.
ALIASES: dict[str, str] = {name.lower(): name for name in COLUMNS}
ALIASES.update({
    "handle": "URL handle", "body (html)": "Description", "published": "Published on online store",
    "variant sku": "SKU", "variant price": "Price", "variant compare at price": "Compare-at price",
    "variant grams": "Weight value (grams)", "variant inventory tracker": "Inventory tracker",
    "variant inventory qty": "Inventory quantity", "variant inventory policy": "Continue selling when out of stock",
    "variant image": "Variant image URL", "image src": "Product image URL", "variant barcode": "Barcodes",
    "variant taxable": "Charge tax", "variant requires shipping": "Requires shipping",
})

# Product columns kept as text: column → (product attribute, longest it may be).
TEXT_FIELDS: dict[str, tuple[str, int | None]] = {
    "Description": ("description", None),
    "Vendor": ("vendor", 255),
    "Type": ("product_type", 100),
    "SEO title": ("meta_title", 255),
    "SEO description": ("meta_description", 500),
    "Product code": ("product_code", 100),
    "Short description": ("short_description", 500),
    "Fabric": ("fabric", 255),
    "Gender": ("gender", 50),
    "Care instructions": ("care_instructions", None),
    "Supplier": ("supplier", 40),
    "Supplier reference": ("supplier_ref", 100),
}

# Variant columns → the variant field the admin's own editor checks them as.
VARIANT_FIELDS = {
    "Price": "retail_price", "Compare-at price": "compare_price", "Cost per item": "cost_per_item",
    "MSRP": "msrp", "Weight value (grams)": "weight_grams", "Country of origin": "country_of_origin",
    "Variant status": "status",
}


class ImportFileError(ValueError):
    """The file as a whole cannot be read."""


@dataclass
class VariantPlan:
    line: int
    label: str
    values: dict
    match_id: Any = None
    stock: int | None = None


@dataclass
class ImagePlan:
    url: str
    alt: str | None
    match_id: Any = None  # an image the product has, given new alt text


@dataclass
class ProductPlan:
    handle: str
    name: str
    action: str  # create | update | skip | error
    kind: str = "stocked"
    fields: dict = field(default_factory=dict)
    categories: list[str] | None = None
    variants: list[VariantPlan] = field(default_factory=list)
    images: list[ImagePlan] = field(default_factory=list)
    tiers: list[tuple[int, Decimal]] | None = None
    options: dict | None = None
    notes: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def summary(self) -> dict:
        return {
            "handle": self.handle, "name": self.name, "action": self.action, "kind": KIND_WORDS.get(self.kind, self.kind),
            "variants_new": sum(1 for v in self.variants if v.match_id is None),
            "variants_changed": sum(1 for v in self.variants if v.match_id is not None),
            "images_new": sum(1 for i in self.images if i.match_id is None),
            "notes": self.notes, "errors": self.errors,
        }


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:255]


def cell(row: dict, column: str) -> str:
    return (row.get(column) or "").strip()


def read_file(text: str) -> tuple[set[str], list[tuple[int, dict]]]:
    """The columns the file has (our names) and its rows, by line number."""
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    try:
        header = next(reader)
    except StopIteration:
        raise ImportFileError("The file is empty.") from None
    columns = [ALIASES.get(h.strip().lower()) for h in header]
    if "URL handle" not in columns:
        raise ImportFileError(
            "This is not a products file: it has no URL handle (or Handle) column. "
            "Use a file from Export, or a product CSV from Shopify."
        )
    rows: list[tuple[int, dict]] = []
    for line, values in enumerate(reader, start=2):
        if not any((v or "").strip() for v in values):
            continue
        row: dict = {}
        for column, value in zip(columns, values, strict=False):  # a short row's missing cells are blank
            if column and column not in row:
                row[column] = value
        rows.append((line, row))
    return {c for c in columns if c}, rows


def group_rows(rows: list[tuple[int, dict]]) -> tuple[dict[str, list[tuple[int, dict]]], list[str]]:
    """Rows by product handle, in file order; rows with no handle are named."""
    groups: dict[str, list[tuple[int, dict]]] = {}
    problems: list[str] = []
    for line, row in rows:
        handle = slugify(cell(row, "URL handle"))
        if not handle:
            problems.append(f"Line {line}: no URL handle, so it belongs to no product.")
            continue
        groups.setdefault(handle, []).append((line, row))
    return groups, problems


def _dec(text: str) -> Decimal | None:
    try:
        d = Decimal(text.replace(",", "").replace("$", "").strip())
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() else None


def parse_tiers(text: str) -> list[tuple[int, Decimal]]:
    """"12+: $5.00; 24+: $4.50" (the Quantity price breaks column) → [(12, 5.00), (24, 4.50)]."""
    tiers: dict[int, Decimal] = {}
    for part in (p.strip() for p in text.split(";")):
        if not part:
            continue
        m = re.fullmatch(r"(\d+)\s*\+?\s*:\s*\$?\s*([\d.,]+)", part)
        price = _dec(m.group(2)) if m else None
        if not m or price is None or int(m.group(1)) < 1:
            raise ValueError(f'"{part}" is not a quantity price break (write it as 12+: $5.00).')
        tiers[int(m.group(1))] = price
    return sorted(tiers.items())


def parse_options(text: str) -> dict:
    """The Options (data) column: options, their values and rules, checked."""
    from app.models.product_option import INPUT_TYPES, PRICE_MODES, RULE_ACTIONS

    try:
        data = json.loads(text)
    except ValueError:
        raise ValueError("Options (data) is not readable: use the column as Export wrote it.") from None
    options = data.get("options") if isinstance(data, dict) else None
    if not isinstance(options, list):
        raise ValueError("Options (data) has no options.")
    names = set()
    for opt in options:
        name = str(opt.get("name") or "").strip()
        if not name or name.lower() in names:
            raise ValueError(f'An option in Options (data) has no name, or "{name}" is there twice.')
        names.add(name.lower())
        if opt.get("type", "select") not in INPUT_TYPES:
            raise ValueError(f'Option "{name}": "{opt.get("type")}" is not an option type.')
        for v in opt.get("values") or []:
            if not str(v.get("label") or "").strip():
                raise ValueError(f'Option "{name}" has a value with no name.')
            if v.get("mode", "flat") not in PRICE_MODES or _dec(str(v.get("price") or "0")) is None:
                raise ValueError(f'Option "{name}", {v.get("label")}: the price is not readable.')
    for rule in data.get("rules") or []:
        if rule.get("action") not in RULE_ACTIONS:
            raise ValueError(f'A rule in Options (data) does "{rule.get("action")}", which is not a rule.')
    return {"options": options, "rules": list(data.get("rules") or [])}


def _status(first: dict, present: set[str], plan: ProductPlan) -> str | None:
    if "Status" in present and cell(first, "Status"):
        status = cell(first, "Status").lower()
        if status not in STATUSES:
            plan.errors.append(f'Status "{cell(first, "Status")}" is not active, draft or archived.')
            return None
        return status
    if "Published on online store" in present and cell(first, "Published on online store"):
        return "active" if cell(first, "Published on online store").lower() in ("true", "yes", "1") else "draft"
    return None


def _plan_fields(plan: ProductPlan, first: dict, present: set[str], creating: bool) -> None:
    name = cell(first, "Title")
    if name:
        if len(name) > 255:
            plan.errors.append("The title is longer than 255 characters.")
        plan.fields["name"] = name[:255]
    elif creating:
        plan.errors.append("No title: a new product needs one.")
    for column, (attr, longest) in TEXT_FIELDS.items():
        if column not in present:
            continue
        value = cell(first, column)
        if longest and len(value) > longest:
            plan.errors.append(f"{column} is longer than {longest} characters.")
        plan.fields[attr] = value or None
    if "Tags" in present:
        tags = list(dict.fromkeys(t.strip() for t in cell(first, "Tags").split(",") if t.strip()))
        if any(len(t) > 100 for t in tags):
            plan.errors.append("A tag is longer than 100 characters.")
        plan.fields["tags"] = tags[:250] or None
    status = _status(first, present, plan)
    if status:
        plan.fields["status"] = status
    elif creating:
        plan.fields["status"] = "draft"
    if "Minimum order quantity" in present and cell(first, "Minimum order quantity"):
        moq = cell(first, "Minimum order quantity")
        if not moq.isdigit() or int(moq) < 1:
            plan.errors.append(f'Minimum order quantity "{moq}" is not a whole number of 1 or more.')
        else:
            plan.fields["moq"] = int(moq)


def _role(name: str) -> str | None:
    low = name.strip().lower()
    if low in COLOR_NAMES:
        return "color"
    if low in SIZE_NAMES:
        return "size"
    if low == "title":
        return "title"
    return None


def _make_sku(handle: str, color: str | None, size: str | None, taken: set[str]) -> str:
    base = re.sub(r"[^A-Z0-9]+", "-", "-".join(x for x in (handle, color, size) if x).upper()).strip("-")[:90] or "SKU"
    sku, n = base, 2
    while sku.lower() in taken:
        sku, n = f"{base}-{n}", n + 1
    taken.add(sku.lower())
    return sku


def _plan_variants(plan: ProductPlan, lines: list[tuple[int, dict]], present: set[str], existing: Any,
                   sku_owner: dict) -> None:
    from app.api.v1.admin.products import (
        STOCK_FIELD,
        VariantEditError,
        _clean_hex,
        _coerce_variant_field,
    )

    first = lines[0][1]
    roles = []
    for i in (1, 2, 3):
        raw = cell(first, f"Option{i} name")
        role = _role(raw) if raw else None
        if raw and role is None:
            plan.errors.append(f'Option "{raw}" cannot be imported: a stocked product\'s options are Color and Size.')
        roles.append(role)
    if roles.count("color") > 1 or roles.count("size") > 1:
        plan.errors.append("Two options are both Color, or both Size.")
        return

    # A variant row has a SKU, a price or a colour or size. "Default Title" alone
    # is the row Export (and Shopify) writes for a product with no variants.
    rows = [(ln, r) for ln, r in lines
            if cell(r, "SKU") or cell(r, "Price")
            or any(cell(r, f"Option{i} value") for i, role in enumerate(roles, start=1) if role in ("color", "size"))]
    if not rows:
        if existing is None:
            plan.notes.append("No variants in the file: add them on the product.")
        return

    have = list(existing.variants) if existing is not None else []
    by_sku = {v.sku.lower(): v for v in have if v.sku}
    by_pair = {((v.color or "").lower(), (v.size or "").lower()): v for v in have}
    taken = {v.sku.lower() for v in have if v.sku} | {k for k in sku_owner}
    seen_skus: set[str] = set()
    seen_pairs: set[tuple[str, str]] = set()
    tracked_column = "Inventory tracker" in present
    any_tracked = counted = False

    for position, (line, row) in enumerate(rows):
        color = size = None
        for i, role in enumerate(roles, start=1):
            value = cell(row, f"Option{i} value")
            if role == "color":
                color = value or None
            elif role == "size":
                size = value or None
        sku = cell(row, "SKU")
        label = " / ".join(x for x in (color, size) if x) or sku or f"line {line}"
        pair = ((color or "").lower(), (size or "").lower())
        if (color or size) and pair in seen_pairs:
            plan.errors.append(f"{label} is in the file twice.")
            continue
        seen_pairs.add(pair)
        if sku:
            if sku.lower() in seen_skus:
                plan.errors.append(f"SKU {sku} is in the file twice.")
                continue
            seen_skus.add(sku.lower())

        match = by_sku.get(sku.lower()) if sku else None
        if match is None and (color or size):
            match = by_pair.get(pair)
        if match is None and not (color or size) and len(have) == 1 and len(rows) == 1:
            match = have[0]  # a product of one variant
        owner = sku_owner.get(sku.lower()) if sku else None
        if owner and (existing is None or owner[0] != existing.id):
            plan.errors.append(f"SKU {sku} is already used by {owner[1]}.")
            continue

        values: dict = {}
        try:
            if sku:
                values["sku"] = _coerce_variant_field("sku", sku)
            if "color" in roles:
                values["color"] = color[:100] if color else None
            if "size" in roles:
                values["size"] = size[:100] if size else None
            for column, attr in VARIANT_FIELDS.items():
                if column not in present:
                    continue
                raw = cell(row, column)
                if not raw and (attr == "status" or (attr == "retail_price" and match is not None)):
                    continue  # blank keeps what the variant has (a new one is active)
                values[attr] = _coerce_variant_field(attr, raw)
            if "Color hex" in present:
                values["color_hex"] = _clean_hex(cell(row, "Color hex"))
            stock = None
            if tracked_column:
                tracked = bool(cell(row, "Inventory tracker"))
                any_tracked = any_tracked or tracked
                if tracked and "Inventory quantity" in present and cell(row, "Inventory quantity"):
                    stock = _coerce_variant_field(STOCK_FIELD, cell(row, "Inventory quantity"))
                    counted = True
        except VariantEditError as exc:
            plan.errors.append(f"{label}: {exc}")
            continue

        if match is None:
            if "retail_price" not in values:
                plan.errors.append(f"{label}: no price.")
                continue
            if "sku" not in values:
                values["sku"] = _make_sku(plan.handle, color, size, taken)
            values.setdefault("status", "active")
            values["sort_order"] = position
        plan.variants.append(VariantPlan(line=line, label=label, values=values,
                                         match_id=match.id if match is not None else None, stock=stock))
    if tracked_column:
        if any_tracked and not counted:
            # Counting stock with no numbers sells nothing (no record is 0). A
            # Shopify shop with several locations exports no quantities.
            plan.notes.append("Stock not counted: the file tracks inventory but gives no quantities. "
                              "Turn on Count stock on the product once they are in.")
        else:
            plan.fields["track_inventory"] = any_tracked


def _plan_made(plan: ProductPlan, first: dict, present: set[str], creating: bool) -> None:
    price = cell(first, "Base price") or cell(first, "Price")
    if price:
        value = _dec(price)
        if value is None or value < 0:
            plan.errors.append(f'Base price "{price}" is not a price.')
        else:
            plan.fields["base_price"] = value
    if "Quantity price breaks" in present:
        try:
            plan.tiers = parse_tiers(cell(first, "Quantity price breaks"))
        except ValueError as exc:
            plan.errors.append(str(exc))
    if "Weight value (grams)" in present:
        grams = cell(first, "Weight value (grams)")
        if grams and _dec(grams) is None:
            plan.errors.append(f'Weight "{grams}" is not a number of grams.')
        else:
            plan.fields["weight"] = grams or None
    data = cell(first, "Options (data)")
    if not creating:
        if data or cell(first, "Options"):
            plan.notes.append("Options kept as they are: the price table depends on them. Change them on the product.")
    elif data:
        try:
            plan.options = parse_options(data)
        except ValueError as exc:
            plan.errors.append(str(exc))
    elif cell(first, "Options"):
        plan.notes.append("Options not made: only a file from Export carries them in full (Options (data)).")
    if cell(first, "Price table"):
        plan.notes.append("The price table is not in this file: import it on the product's Pricing.")


def _plan_images(plan: ProductPlan, lines: list[tuple[int, dict]], existing: Any,
                 variant_images: dict[str, tuple[int, str | None]]) -> None:
    """Images by position. `variant_images`: a variant's image address → (line, its colour). The
    colour goes in the alt text, which is how the product editor ties an image to a colour."""
    have: dict = {}
    for img in (existing.images if existing is not None else []):
        for url in (img.url_large, img.url_medium, img.url_thumbnail):
            if url:
                have.setdefault(url, img)
    wanted: list[tuple[int, int, str, str | None]] = []
    for line, row in lines:
        url = cell(row, "Product image URL")
        if url:
            position = cell(row, "Image position")
            wanted.append((int(position) if position.isdigit() else 10**6, line, url, cell(row, "Image alt text") or None))
    listed = {w[2] for w in wanted}
    for url, (line, color) in variant_images.items():
        if url not in listed:  # a variant's own image the image rows did not list
            wanted.append((10**6, line, url, color))
            listed.add(url)
    planned: set[str] = set()
    for _, line, url, alt in sorted(wanted, key=lambda w: (w[0], w[1])):
        # A web address, or a picture the platform itself serves ("/media/…").
        if not (url.lower().startswith(("http://", "https://")) or (url.startswith("/") and not url.startswith("//"))) \
                or len(url) > 1000:
            plan.notes.append(f"Image on line {line} left out: not a web address.")
            continue
        if url in planned:
            continue
        planned.add(url)
        alt = (alt or variant_images.get(url, (0, None))[1] or "")[:255] or None
        if url in have:
            if alt and alt != have[url].alt_text:
                plan.images.append(ImagePlan(url=url, alt=alt, match_id=have[url].id))
            continue
        if sum(1 for i in plan.images if i.match_id is None) >= MAX_NEW_IMAGES:
            plan.notes.append(f"Images past {MAX_NEW_IMAGES} left out.")
            break
        plan.images.append(ImagePlan(url=url, alt=alt))


def plan_product(handle: str, lines: list[tuple[int, dict]], present: set[str], *, existing: Any = None,
                 update_existing: bool = False, sku_owner: dict | None = None) -> ProductPlan:
    """What importing one product's rows would do. Writes nothing."""
    from app.services.product_catalog import kind_of

    first = lines[0][1]
    plan = ProductPlan(handle=handle, name=cell(first, "Title") or (existing.name if existing is not None else handle),
                       action="update" if existing is not None else "create")
    if existing is not None and not update_existing:
        plan.action = "skip"
        plan.notes.append("Already in your shop. Tick “Update products that already exist” to change it.")
        return plan

    said = cell(first, "Kind")
    file_kind = KINDS_BY_WORD.get(said.lower()) if said else None
    if said and file_kind is None:
        plan.errors.append(f'Kind "{said}" is not one of: {", ".join(KIND_WORDS.values())}.')
    if existing is not None:
        plan.kind = kind_of(existing.pricing_mode, existing.gang_sheet_enabled, existing.gang_sheet_type)
        if file_kind and file_kind != plan.kind:
            plan.notes.append(f"Stays {KIND_WORDS[plan.kind]}: an import does not change what kind a product is.")
    else:
        plan.kind = file_kind or "stocked"
        if plan.kind in SHEET_KINDS:
            plan.action = "error"
            plan.errors.append(f"{KIND_WORDS[plan.kind]} products are made in Gang sheet setup; an import can only update one that exists.")
            return plan

    creating = existing is None
    _plan_fields(plan, first, present, creating)
    if "Collection" in present:
        plan.categories = list(dict.fromkeys(n.strip()[:100] for n in cell(first, "Collection").split(",") if n.strip()))

    variant_images: dict[str, tuple[int, str | None]] = {}
    if plan.kind == "stocked":
        _plan_variants(plan, lines, present, existing, sku_owner or {})
        colors = {v.line: v.values.get("color") for v in plan.variants}
        for line, row in lines:
            url = cell(row, "Variant image URL")
            if url and not (variant_images.get(url, (0, None))[1]):
                variant_images[url] = (line, colors.get(line))
    elif plan.kind == "made":
        _plan_made(plan, first, present, creating)
    else:
        plan.notes.append("Sheet sizes stay as they are: they are set in Gang sheet setup.")
    _plan_images(plan, lines, existing, variant_images)

    if plan.errors:
        plan.action = "error"
    return plan


async def _category_ids(db, names: list[str], cache: dict, made: list[str]) -> list:
    from sqlalchemy import func, select

    from app.models.product import Category

    ids = []
    for name in names:
        key = name.lower()
        if key not in cache:
            found = (await db.execute(select(Category.id).where(func.lower(Category.name) == key))).scalars().first()
            if found is None:
                base = slugify(name)[:90] or "category"
                slug, n = base, 2
                while (await db.execute(select(Category.id).where(Category.slug == slug))).first():
                    slug, n = f"{base}-{n}", n + 1
                category = Category(name=name, slug=slug)
                db.add(category)
                await db.flush()
                found = category.id
                made.append(name)
            cache[key] = found
        ids.append(cache[key])
    return list(dict.fromkeys(ids))


async def _apply(db, plan: ProductPlan, existing: Any, categories: dict, made_categories: list[str]) -> None:
    from sqlalchemy import delete, func, select

    from app.api.v1.admin.products import _set_variant_stock
    from app.models.product import Product, ProductCategory, ProductImage, ProductVariant
    from app.models.product_option import (
        ProductOption,
        ProductOptionRule,
        ProductOptionValue,
        ProductQtyTier,
    )

    if existing is None:
        product = Product(slug=plan.handle, pricing_mode="configurable" if plan.kind == "made" else "variant",
                          **{"moq": 1, **plan.fields})
        db.add(product)
        await db.flush()
    else:
        product = await db.get(Product, existing.id)
        for attr, value in plan.fields.items():
            if not value and not getattr(product, attr):
                continue  # empty stays as it was: no None turned into "" or []
            setattr(product, attr, value)

    if plan.categories is not None:
        ids = await _category_ids(db, plan.categories, categories, made_categories)
        await db.execute(delete(ProductCategory).where(ProductCategory.product_id == product.id))
        for category_id in ids:
            db.add(ProductCategory(product_id=product.id, category_id=category_id))

    for vp in plan.variants:
        if vp.match_id is not None:
            variant = await db.get(ProductVariant, vp.match_id)
            for attr, value in vp.values.items():
                setattr(variant, attr, value)
        else:
            variant = ProductVariant(product_id=product.id, **vp.values)
            db.add(variant)
        await db.flush()
        if vp.stock is not None:
            await _set_variant_stock(db, variant.id, vp.stock)

    count = (await db.execute(select(func.count(ProductImage.id)).where(ProductImage.product_id == product.id))).scalar() or 0
    for ip in plan.images:
        if ip.match_id is not None:
            (await db.get(ProductImage, ip.match_id)).alt_text = ip.alt
            continue
        db.add(ProductImage(product_id=product.id, url_thumbnail=ip.url, url_medium=ip.url, url_large=ip.url,
                            alt_text=ip.alt, is_primary=count == 0, sort_order=count))
        count += 1

    if plan.tiers is not None:
        await db.execute(delete(ProductQtyTier).where(ProductQtyTier.product_id == product.id))
        for min_qty, price in plan.tiers:
            db.add(ProductQtyTier(product_id=product.id, min_qty=min_qty, unit_price=price))

    if plan.options:
        values_by_name: dict = {}
        option_ids: dict = {}
        for position, opt in enumerate(plan.options["options"]):
            option = ProductOption(
                product_id=product.id, name=str(opt["name"]).strip()[:150], input_type=opt.get("type") or "select",
                required=bool(opt.get("required")), is_active=opt.get("active", True) is not False,
                help_text=opt.get("help") or None, in_price_matrix=bool(opt.get("matrix")), position=position,
            )
            db.add(option)
            await db.flush()
            option_ids[option.name.lower()] = option.id
            for vpos, v in enumerate(opt.get("values") or []):
                value = ProductOptionValue(
                    option_id=option.id, label=str(v["label"]).strip(), price_delta=_dec(str(v.get("price") or "0")),
                    price_mode=v.get("mode") or "flat", enabled=v.get("enabled", True) is not False,
                    is_default=bool(v.get("default")), swatch_hex=v.get("swatch") or None,
                    image_url=v.get("image") or None, sku_suffix=v.get("sku") or None, position=vpos,
                )
                db.add(value)
                await db.flush()
                values_by_name[(option.name.lower(), value.label.lower())] = value.id
        for rule in plan.options["rules"]:
            when = values_by_name.get(tuple(str(x).lower() for x in (rule.get("when") or [])[:2]))
            target_option = option_ids.get(str(rule.get("option") or "").lower())
            target_value = values_by_name.get((str(rule.get("option") or "").lower(), str(rule.get("value") or "").lower()))
            if when is None or (target_option is None and target_value is None):
                plan.notes.append("A rule naming an option or value the file does not have was left out.")
                continue
            db.add(ProductOptionRule(
                product_id=product.id, when_value_id=when, action=rule["action"],
                target_option_id=None if rule["action"] == "disable_value" else target_option,
                target_value_id=target_value if rule["action"] == "disable_value" else None,
                note=rule.get("note") or None,
            ))
    await db.flush()


def _clash_words(exc: Exception) -> str:
    text = str(getattr(exc, "orig", exc))
    if "sku" in text.lower():
        return "Not saved: a SKU in it is already used by another product."
    if "slug" in text.lower():
        return "Not saved: another product already has this URL handle."
    return "Not saved: the database refused it."


async def run(db, text: str, *, update_existing: bool, dry_run: bool, only_handle: str | None = None) -> dict:
    """Plan the file's products and, unless dry_run, write them."""
    from sqlalchemy import func, select
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import selectinload

    from app.models.product import Category, Product, ProductVariant

    present, rows = read_file(text)
    groups, problems = group_rows(rows)
    ignored = 0
    if only_handle:
        ignored = sum(1 for h in groups if h != only_handle)
        groups = {h: g for h, g in groups.items() if h == only_handle}
        update_existing = True
        if not groups:
            problems.append("The file has no rows for this product (its URL handle is not in it).")
    if len(groups) > MAX_PRODUCTS:
        raise ImportFileError(f"The file has {len(groups):,} products; import up to {MAX_PRODUCTS:,} at a time.")

    existing = {p.slug: p for p in (await db.execute(
        select(Product).where(Product.slug.in_(list(groups)))
        .options(selectinload(Product.variants), selectinload(Product.images))
    )).scalars().all()} if groups else {}

    skus = {cell(r, "SKU").lower() for g in groups.values() for _, r in g if cell(r, "SKU")}
    sku_owner: dict = {}
    if skus:
        for sku, pid, pname in (await db.execute(
            select(ProductVariant.sku, Product.id, Product.name)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(func.lower(ProductVariant.sku).in_(list(skus)))
        )).all():
            sku_owner[sku.lower()] = (pid, pname)

    plans = [plan_product(h, g, present, existing=existing.get(h), update_existing=update_existing, sku_owner=sku_owner)
             for h, g in groups.items()]

    named = {n.lower() for p in plans if p.action in ("create", "update") for n in (p.categories or [])}
    if named:
        known = {n.lower() for n in (await db.execute(
            select(Category.name).where(func.lower(Category.name).in_(list(named)))
        )).scalars().all()}
        for p in plans:
            new = [n for n in (p.categories or []) if n.lower() not in known]
            if new and p.action in ("create", "update"):
                p.notes.append("New categor" + ("ies: " if len(new) > 1 else "y: ") + ", ".join(new))

    made_categories: list[str] = []
    if not dry_run:
        categories: dict = {}
        for plan in plans:
            if plan.action not in ("create", "update"):
                continue
            try:
                async with db.begin_nested():
                    await _apply(db, plan, existing.get(plan.handle), categories, made_categories)
            except IntegrityError as exc:
                plan.action = "error"
                plan.errors.append(_clash_words(exc))
                categories.clear()  # a category made in the failed savepoint is gone with it
            except Exception:  # noqa: BLE001 - one product's failure is not the others'
                logger.exception("Product import failed for %s", plan.handle)
                plan.action = "error"
                plan.errors.append("Not saved: something went wrong with this product. The others were not affected.")
                categories.clear()
        await db.commit()
        await _forget(db, [p.handle for p in plans if p.action in ("create", "update")], bool(made_categories))

    counts = {a: sum(1 for p in plans if p.action == a) for a in ("create", "update", "skip", "error")}
    return {"dry_run": dry_run, "counts": counts, "products": [p.summary() for p in plans],
            "problems": problems, "ignored": ignored}


async def _forget(db, handles: list[str], categories_changed: bool) -> None:
    """Drop the cached pages of what changed; a cache that will not clear must not fail an import."""
    from app.core.redis import redis_delete, tenant_cache_key
    from app.services.product_service import ProductService

    try:
        svc = ProductService(db)
        for handle in handles:
            await svc.invalidate_product_cache(handle)
        if categories_changed:
            await redis_delete(tenant_cache_key("categories:tree"))
    except Exception:  # noqa: BLE001
        logger.warning("Product import: caches not cleared", exc_info=True)
