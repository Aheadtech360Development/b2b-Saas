"""Duplicate a product (Products → a product → Duplicate), as Shopify's does.

The copy is a new product with the name and status the admin chose (a draft
unless they say otherwise) and everything the original is made of:

- every field of the product: description, SEO, organisation, kind, page
  template, metafields, gang sheet and t-shirt designer settings, bulk form;
- its variants, each with its prices, colour, size, weight and status, under a
  new SKU of its own (a SKU is unique in a shop: "<sku>-COPY");
- its pictures (the same files: deleting one deletes a row, never the file),
  flyers, categories and collections;
- a made to order product's options and choices, their rules, its price grid
  and its quantity breaks, each pointing at the copy's own choices;
- its wholesale prices (product and variant, per customer group);
- its own gang sheet sizes.

Left behind, as Shopify leaves them: reviews, and stock unless the admin asks
for it (and then only the shop's own locations: a supplier's stock is the
supplier's). A supplier's link (S&S, SanMar) stays with the original: the copy
is the shop's own product, so its new SKUs are never sent to a supplier.
"""
from __future__ import annotations

import uuid
from copy import deepcopy
from typing import Any

from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

COPY_PREFIX = "Copy of "
STATUSES = ("draft", "active")
_ALWAYS_SKIP = {"id", "created_at", "updated_at", "search_vector"}


class DuplicateError(ValueError):
    """Something the admin can be told, in these words."""


def _fields(obj: Any, skip: set[str] = frozenset()) -> dict[str, Any]:
    """Every mapped column of `obj` but its identity and what `skip` names, so
    a column added to the model later is copied without anyone remembering to."""
    return {a.key: deepcopy(getattr(obj, a.key)) for a in inspect(type(obj)).column_attrs
            if a.key not in _ALWAYS_SKIP and a.key not in skip}


def copy_title(name: str) -> str:
    """Shopify's suggestion for the copy's name."""
    return f"{COPY_PREFIX}{(name or '').strip()}"[:255]


def copy_sku(sku: str, taken: set[str]) -> str:
    """A SKU for the copy of `sku` that the shop does not use yet: "<sku>-COPY",
    then "-COPY2" and on. Recorded in `taken` so two variants never share one."""
    base = (sku or "SKU").strip()
    n = 1
    while True:
        tail = "-COPY" if n == 1 else f"-COPY{n}"
        candidate = f"{base[: 100 - len(tail)]}{tail}"
        if candidate not in taken:
            taken.add(candidate)
            return candidate
        n += 1


def remap_key(key: str, value_map: dict[str, str], option_map: dict[str, str]) -> str:
    """A price grid key ("<option>:<value>|…") spelt with the copy's own ids."""
    from app.services.combinations import combo_key, parse_key

    return combo_key((option_map.get(o, o), value_map.get(v, v)) for o, v in parse_key(key))


async def duplicate(
    db: AsyncSession,
    source_id: uuid.UUID,
    *,
    name: str,
    status: str = "draft",
    images: bool = True,
    stock: bool = False,
    slug: str,
) -> Any:
    """Make the copy (see the module's note). `slug` is a free web address the
    caller found. Flushes; the caller commits."""
    from app.api.v1.gang_sheets import GangSheetSize
    from app.models.collection import CollectionProduct
    from app.models.discount_group import VariantLevelPricingOverride, VariantPricingOverride
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.product import Product, ProductAsset, ProductCategory, ProductImage, ProductVariant
    from app.models.product_option import (
        ProductOption,
        ProductOptionCombination,
        ProductOptionRule,
        ProductOptionValue,
        ProductQtyTier,
    )

    name = (name or "").strip()
    if not name:
        raise DuplicateError("Give the copy a name.")
    if status not in STATUSES:
        raise DuplicateError("A copy starts as a draft or active.")

    src = (await db.execute(
        select(Product).where(Product.id == source_id).options(
            selectinload(Product.variants).selectinload(ProductVariant.inventory_records),
            selectinload(Product.images),
            selectinload(Product.assets),
            selectinload(Product.category_links),
            selectinload(Product.options).selectinload(ProductOption.values),
            selectinload(Product.qty_tiers),
            selectinload(Product.option_rules),
        )
    )).scalar_one_or_none()
    if src is None:
        raise DuplicateError("That product could not be found.")

    copy = Product(**_fields(src, {"name", "slug", "status", "supplier", "supplier_ref"}),
                   name=name[:255], slug=slug, status=status)
    db.add(copy)
    await db.flush()

    # Variants, each under a SKU of its own.
    taken = set((await db.execute(select(ProductVariant.sku).where(ProductVariant.sku.like("%-COPY%")))).scalars().all())
    taken |= {v.sku for v in src.variants}
    variant_map: dict[str, uuid.UUID] = {}
    new_variants = []
    for v in src.variants:
        nv = ProductVariant(**_fields(v, {"product_id", "sku", "qb_item_id"}),
                            product_id=copy.id, sku=copy_sku(v.sku, taken))
        db.add(nv)
        new_variants.append((v, nv))
    await db.flush()
    for v, nv in new_variants:
        variant_map[str(v.id)] = nv.id

    # Stock, when asked for: the shop's own locations only.
    if stock:
        own = set((await db.execute(select(Warehouse.id).where(Warehouse.supplier.is_(None)))).scalars().all())
        for v, nv in new_variants:
            for rec in v.inventory_records:
                if rec.warehouse_id in own and (rec.quantity or 0) > 0:
                    db.add(InventoryRecord(variant_id=nv.id, warehouse_id=rec.warehouse_id,
                                           quantity=rec.quantity, low_stock_threshold=rec.low_stock_threshold))

    if images:
        for img in src.images:
            db.add(ProductImage(**_fields(img, {"product_id"}), product_id=copy.id))
    for asset in src.assets:
        db.add(ProductAsset(**_fields(asset, {"product_id"}), product_id=copy.id))
    for link in src.category_links:
        db.add(ProductCategory(product_id=copy.id, category_id=link.category_id))

    # The same collections, at the end of each.
    for member in (await db.execute(select(CollectionProduct).where(CollectionProduct.product_id == src.id))).scalars().all():
        last = (await db.execute(select(func.coalesce(func.max(CollectionProduct.position), 0))
                                 .where(CollectionProduct.collection_id == member.collection_id))).scalar() or 0
        db.add(CollectionProduct(collection_id=member.collection_id, product_id=copy.id, position=int(last) + 1))

    # A made to order product's options and choices, then what points at them.
    option_map: dict[str, str] = {}
    value_map: dict[str, str] = {}
    new_values = []
    for opt in src.options:
        no = ProductOption(**_fields(opt, {"product_id"}), product_id=copy.id)
        db.add(no)
        await db.flush()
        option_map[str(opt.id)] = str(no.id)
        for val in opt.values:
            nv = ProductOptionValue(**_fields(val, {"option_id"}), option_id=no.id)
            db.add(nv)
            new_values.append((val, nv))
    await db.flush()
    for val, nv in new_values:
        value_map[str(val.id)] = str(nv.id)

    def _id(mapping: dict[str, str], old: Any) -> uuid.UUID | None:
        return uuid.UUID(mapping[str(old)]) if old is not None and str(old) in mapping else None

    for rule in src.option_rules:
        when = _id(value_map, rule.when_value_id)
        if when is None:
            continue
        db.add(ProductOptionRule(**_fields(rule, {"product_id", "when_value_id", "target_option_id", "target_value_id"}),
                                 product_id=copy.id, when_value_id=when,
                                 target_option_id=_id(option_map, rule.target_option_id),
                                 target_value_id=_id(value_map, rule.target_value_id)))
    for tier in src.qty_tiers:
        db.add(ProductQtyTier(**_fields(tier, {"product_id"}), product_id=copy.id))
    for row in (await db.execute(
        select(ProductOptionCombination).where(ProductOptionCombination.product_id == src.id)
    )).scalars().all():
        db.add(ProductOptionCombination(
            **_fields(row, {"product_id", "combo_key", "value_ids"}), product_id=copy.id,
            combo_key=remap_key(row.combo_key, value_map, option_map),
            value_ids=[uuid.UUID(value_map[str(v)]) for v in (row.value_ids or []) if str(v) in value_map],
        ))

    # Wholesale prices, per customer group.
    for ov in (await db.execute(
        select(VariantPricingOverride).where(VariantPricingOverride.product_id == str(src.id))
    )).scalars().all():
        db.add(VariantPricingOverride(**_fields(ov, {"product_id"}), product_id=str(copy.id)))
    if variant_map:
        for ov in (await db.execute(
            select(VariantLevelPricingOverride).where(VariantLevelPricingOverride.variant_id.in_(list(variant_map)))
        )).scalars().all():
            db.add(VariantLevelPricingOverride(**_fields(ov, {"variant_id"}), variant_id=str(variant_map[ov.variant_id])))

    # Its own gang sheet sizes (the shop's default set belongs to no product).
    for size in (await db.execute(select(GangSheetSize).where(GangSheetSize.product_id == src.id))).scalars().all():
        db.add(GangSheetSize(**_fields(size, {"product_id"}), product_id=copy.id))

    await db.flush()
    return copy
