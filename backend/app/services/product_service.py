"""ProductService — product catalog with filters, full-text search, and tier pricing."""
import json
import logging
from decimal import Decimal
from uuid import UUID

from sqlalchemy import exists, func, inspect as sa_inspect, or_, select, text
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.redis import redis_delete, redis_delete_pattern, redis_get, redis_set, tenant_cache_key
from app.models.product import Category, Product, ProductAsset, ProductCategory, ProductVariant, ProductImage
from app.schemas.product import FilterParams

logger = logging.getLogger(__name__)

_LISTING_TTL = 300    # 5 min
_DETAIL_TTL = 600     # 10 min
_CATEGORY_TTL = 3600  # 1 hr


from app.core.tenant_context import get_current_tenant_id  # noqa: E402


def _csv(value: str | None) -> list[str]:
    """"red,Royal Blue" → ["red", "Royal Blue"]; empty entries dropped."""
    return [v.strip() for v in (value or "").split(",") if v.strip()]


class ProductService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Category tree
    # ------------------------------------------------------------------

    async def get_category_tree(self) -> list[Category]:
        cached = await redis_get(tenant_cache_key("categories:tree"))
        if cached:
            return json.loads(cached)  # returned as plain dicts for response

        result = await self.db.execute(
            select(Category).options(selectinload(Category.children)).order_by(Category.sort_order, Category.name)
        )
        all_cats = result.scalars().all()

        # Only top-level categories; children are already eagerly loaded via selectinload
        root = [c for c in all_cats if c.parent_id is None]

        await redis_set(tenant_cache_key("categories:tree"), json.dumps([_cat_to_dict(c) for c in root]), expire=_CATEGORY_TTL)
        return root

    # ------------------------------------------------------------------
    # Product listing
    # ------------------------------------------------------------------

    # ── Filter helpers ────────────────────────────────────────────────────
    async def _category_ids(self, slugs: list[str]) -> list:
        """These categories and everything under them, by slug or by name."""
        if not slugs:
            return []
        # Raw SQL, so the brand has to be named here: the ORM's automatic
        # tenant filter only rewrites ORM selects.
        tid = get_current_tenant_id()
        rows = await self.db.execute(
            text("""
                WITH RECURSIVE picked AS (
                    SELECT id FROM categories
                     WHERE (slug = ANY(:slugs) OR name = ANY(:slugs))
                       AND (CAST(:tid AS uuid) IS NULL OR tenant_id = CAST(:tid AS uuid))
                    UNION ALL
                    SELECT c.id FROM categories c JOIN picked p ON c.parent_id = p.id
                )
                SELECT DISTINCT id FROM picked
            """),
            {"slugs": slugs, "tid": str(tid) if tid else None},
        )
        return [r[0] for r in rows.all()]

    def _variant_conditions(self, params: FilterParams) -> list:
        """What one variant of the product has to look like, or [] for no filter."""
        from app.models.inventory import InventoryRecord

        colors, sizes = _csv(params.color), _csv(params.size)
        wants_stock = params.in_stock is True
        wants_price = params.price_min is not None or params.price_max is not None
        if not (colors or sizes or wants_stock or wants_price):
            return []

        conds = [
            ProductVariant.product_id == Product.id,
            ProductVariant.status == "active",
        ]
        if colors:
            conds.append(or_(*[ProductVariant.color.ilike(c) for c in colors]))
        if sizes:
            conds.append(or_(*[ProductVariant.size.ilike(s) for s in sizes]))
        if params.price_min is not None:
            conds.append(ProductVariant.retail_price >= params.price_min)
        if params.price_max is not None:
            conds.append(ProductVariant.retail_price <= params.price_max)
        if wants_stock:
            # A variant nobody tracks stock for counts as available — that is
            # what the product page shows for it. One that IS tracked has to
            # have some left.
            conds.append(or_(
                exists().where(
                    InventoryRecord.variant_id == ProductVariant.id,
                    InventoryRecord.quantity > 0,
                ),
                ~exists().where(InventoryRecord.variant_id == ProductVariant.id),
            ))
        return conds

    async def facets(self, params: FilterParams) -> dict:
        """What the filter sidebar should offer for the current search.

        Worked out over every product that matches, not just the page being
        shown, so a colour on page 3 still has a swatch. Colours carry the
        brand's own hex where a variant has one.
        """
        # Same again: this counts rows by hand, so it filters by brand by hand.
        where = ["p.status = 'active'"]
        args: dict = {}
        tid = get_current_tenant_id()
        if tid:
            where.append("p.tenant_id = CAST(:tid AS uuid)")
            args["tid"] = str(tid)
        if params.q:
            where.append("(p.name ILIKE :q OR p.product_code ILIKE :q)")
            args["q"] = f"%{params.q}%"
        if params.gender:
            where.append("(p.gender = :gender OR p.gender = 'unisex')")
            args["gender"] = params.gender.lower()
        scope = " AND ".join(where)

        colours = (await self.db.execute(text(f"""
            SELECT v.color AS name,
                   MAX(v.color_hex) FILTER (WHERE v.color_hex IS NOT NULL) AS hex,
                   COUNT(DISTINCT p.id) AS products
              FROM product_variants v JOIN products p ON p.id = v.product_id
             WHERE v.status = 'active' AND v.color IS NOT NULL AND v.color <> '' AND {scope}
             GROUP BY v.color ORDER BY v.color
        """), args)).mappings().all()

        sizes = (await self.db.execute(text(f"""
            SELECT DISTINCT v.size AS name FROM product_variants v
              JOIN products p ON p.id = v.product_id
             WHERE v.status = 'active' AND v.size IS NOT NULL AND v.size <> '' AND {scope}
        """), args)).scalars().all()

        cats = (await self.db.execute(text(f"""
            SELECT c.slug, COUNT(DISTINCT p.id) AS products
              FROM categories c
              JOIN product_categories pc ON pc.category_id = c.id
              JOIN products p ON p.id = pc.product_id
             WHERE {scope}
             GROUP BY c.slug
        """), args)).mappings().all()

        price = (await self.db.execute(text(f"""
            SELECT MIN(v.retail_price) AS low, MAX(v.retail_price) AS high
              FROM product_variants v JOIN products p ON p.id = v.product_id
             WHERE v.status = 'active' AND {scope}
        """), args)).mappings().first()

        return {
            "colors": [{"name": r["name"], "hex": r["hex"], "products": r["products"]} for r in colours],
            "sizes": list(sizes),
            "category_counts": {r["slug"]: r["products"] for r in cats},
            "price": {
                "min": float(price["low"]) if price and price["low"] is not None else None,
                "max": float(price["high"]) if price and price["high"] is not None else None,
            },
        }

    async def list_with_filters_and_search(
        self,
        params: FilterParams,
        discount_percent: Decimal = Decimal("0"),
        discount_group_id: str | None = None,
        is_guest: bool = False,
    ) -> tuple[list[Product], int]:
        cache_key = tenant_cache_key(
            f"products:list:{params.category}:{params.size}:{params.color}:"
            f"{params.price_min}:{params.price_max}:{params.q}:{params.page}:"
            f"{params.page_size}:{discount_percent}:{discount_group_id or 'none'}:{'g' if is_guest else 'a'}"
            f"{params.gender}:{params.fabric}:{params.weight}:{params.in_stock}:"
            f"{params.product_code}"
        )
        cached = await redis_get(cache_key)
        if cached:
            data = json.loads(cached)
            return data["items"], data["total"]

        query = (
            select(Product)
            .options(
                selectinload(Product.variants),
                selectinload(Product.images),
                selectinload(Product.assets),
                selectinload(Product.category_links).selectinload(
                    ProductCategory.category
                ).selectinload(Category.children),
            )
            .where(Product.status == "active")
        )

        if params.category:
            # Sub-categories count as their parent: picking "Apparel" shows the
            # products filed under "T-Shirts". EXISTS rather than a join, so a
            # product in three of the chosen categories is still one row and the
            # total stays right.
            cat_ids = await self._category_ids(_csv(params.category))
            if not cat_ids:
                return [], 0
            query = query.where(
                exists().where(
                    ProductCategory.product_id == Product.id,
                    ProductCategory.category_id.in_(cat_ids),
                )
            )

        if params.q:
            query = query.where(
                or_(
                    Product.search_vector.op("@@")(
                        func.plainto_tsquery("english", params.q)
                    ),
                    Product.name.ilike(f"%{params.q}%"),
                    Product.product_code.ilike(f"%{params.q}%"),
                )
            )

        # Colour, size, price and in-stock all describe ONE variant: asking for
        # a red XL under $20 means a red XL under $20 exists, not that the
        # product has something red and something XL somewhere.
        variant_conds = self._variant_conditions(params)
        if variant_conds:
            query = query.where(exists().where(*variant_conds))
        if params.gender:
            g = params.gender.lower().replace("'", "").replace(" ", "")
            if g in ("mens", "men", "male"):
                query = query.where(
                    or_(Product.gender == "mens", Product.gender == "unisex")
                )
            elif g in ("womens", "women", "female"):
                query = query.where(
                    or_(Product.gender == "womens", Product.gender == "unisex")
                )
            elif g == "unisex":
                query = query.where(Product.gender == "unisex")
            elif g in ("youth", "kids", "children"):
                query = query.where(Product.gender == "youth")
            else:
                query = query.where(func.lower(Product.gender) == g)

        if params.fabric:
            query = query.where(Product.fabric.ilike(f"%{params.fabric}%"))

        if params.weight:
            query = query.where(Product.weight == params.weight)

        if params.product_code:
            query = query.where(Product.product_code.ilike(f"%{params.product_code}%"))

        # Count — every filter is an EXISTS, so one product is one row here.
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar_one()

        # Paginate
        offset = (params.page - 1) * params.page_size
        query = query.offset(offset).limit(params.page_size).distinct()

        result = await self.db.execute(query)
        products = result.scalars().unique().all()

        # Apply pricing
        products = await self._attach_pricing_and_stock(list(products), discount_percent, discount_group_id, is_guest)

        await redis_set(
            cache_key,
            json.dumps({"items": [_product_to_dict(p) for p in products], "total": total}),
            expire=_LISTING_TTL,
        )
        return list(products), total

    # ------------------------------------------------------------------
    # Product detail
    # ------------------------------------------------------------------

    async def get_by_slug_with_variants(
        self, slug: str, discount_percent: Decimal = Decimal("0"),
        discount_group_id: str | None = None,
        is_guest: bool = False,
    ) -> Product:
        cache_key = tenant_cache_key(f"products:detail:{slug}:{discount_percent}:{discount_group_id or 'none'}:{'g' if is_guest else 'a'}")
        cached = await redis_get(cache_key)
        if cached:
            return json.loads(cached)

        result = await self.db.execute(
            select(Product)
            .options(
                selectinload(Product.variants),
                selectinload(Product.images),
                selectinload(Product.assets),
                selectinload(Product.category_links).selectinload(
                    ProductCategory.category
                ).selectinload(Category.children),
            )
            .where(Product.slug == slug, Product.status == "active")
        )
        product = result.scalar_one_or_none()
        if not product:
            raise NotFoundError(f"Product '{slug}' not found")

        products = await self._attach_pricing_and_stock([product], discount_percent, discount_group_id, is_guest)
        product = products[0]

        # Attach review stats
        from app.models.product import ProductReview as _ProductReview
        rv = (await self.db.execute(
            select(
                func.count(_ProductReview.id).label("cnt"),
                func.avg(_ProductReview.rating).label("avg"),
            ).where(
                _ProductReview.product_id == product.id,
                _ProductReview.is_approved == True,  # noqa: E712
            )
        )).first()
        product.review_count = int(rv.cnt or 0)
        product.avg_rating = round(float(rv.avg), 1) if rv.avg else 0.0

        await redis_set(cache_key, json.dumps(_product_to_dict(product)), expire=_DETAIL_TTL)
        return product

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    # async def _attach_pricing_and_stock(
    #     self, products: list[Product], discount_percent: Decimal
    # ) -> list[Product]:
    #     from app.services.pricing_service import PricingService

    #     pricing_svc = PricingService(self.db)

    #     for product in products:
    #         for variant in product.variants:
    #             variant.effective_price = pricing_svc.calculate_effective_price(
    #                 variant.retail_price, discount_percent
    #             )
    #             # No stock_quantity column on product_variants — default all active variants to 100
    #             variant.stock_quantity = 100

    #     return products

    async def _attach_pricing_and_stock(
        self, products: list[Product], discount_percent: Decimal,
        discount_group_id: str | None = None,
        is_guest: bool = False,
    ) -> list[Product]:
        from decimal import ROUND_HALF_UP
        from app.services.pricing_service import PricingService
        from app.models.inventory import InventoryRecord

        pricing_svc = PricingService(self.db)

        # Collect all variant IDs so we can batch the stock query
        variant_ids = [v.id for p in products for v in p.variants]
        stock_map: dict = {}
        if variant_ids:
            stock_result = await self.db.execute(
                select(InventoryRecord.variant_id, func.sum(InventoryRecord.quantity))
                .where(InventoryRecord.variant_id.in_(variant_ids))
                .group_by(InventoryRecord.variant_id)
            )
            for variant_id, total_qty in stock_result.all():
                stock_map[variant_id] = int(total_qty or 0)

        # Batch-load VariantPricingOverride (product-level) for this discount group
        override_map: dict = {}
        if discount_group_id:
            from app.models.discount_group import VariantPricingOverride
            from sqlalchemy import and_
            product_ids = [str(p.id) for p in products]
            ov_result = await self.db.execute(
                select(VariantPricingOverride).where(
                    and_(
                        VariantPricingOverride.product_id.in_(product_ids),
                        VariantPricingOverride.tier_id == discount_group_id,
                    )
                )
            )
            for row in ov_result.scalars().all():
                override_map[row.product_id] = row

        # Batch-load VariantLevelPricingOverride (per-variant) for this discount group
        vlp_map: dict = {}
        if discount_group_id:
            from app.models.discount_group import VariantLevelPricingOverride
            vlp_result = await self.db.execute(
                select(VariantLevelPricingOverride).where(
                    VariantLevelPricingOverride.variant_id.in_([str(vid) for vid in variant_ids]),
                    VariantLevelPricingOverride.group_id == discount_group_id,
                )
            )
            for row in vlp_result.scalars().all():
                vlp_map[row.variant_id] = row

        for product in products:
            ov = override_map.get(str(product.id))
            for variant in product.variants:
                vlp = vlp_map.get(str(variant.id))
                if is_guest:
                    # Guests see MSRP; fall back to retail_price if msrp not set
                    msrp = getattr(variant, "msrp", None)
                    variant.effective_price = (
                        Decimal(str(msrp)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                        if msrp is not None
                        else Decimal(str(variant.retail_price))
                    )
                elif vlp is not None and vlp.price is not None:
                    # Per-variant price override has highest priority
                    variant.effective_price = Decimal(str(vlp.price)).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                elif ov is not None and ov.price is not None:
                    # Absolute product-level price override
                    variant.effective_price = Decimal(str(ov.price)).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                elif ov is not None and ov.discount_percent is not None:
                    # Per-group discount % applied to each variant's retail price
                    multiplier = Decimal("1") - (
                        Decimal(str(ov.discount_percent)) / Decimal("100")
                    )
                    variant.effective_price = (variant.retail_price * multiplier).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                else:
                    # Fall back to flat tier discount
                    variant.effective_price = pricing_svc.calculate_effective_price(
                        variant.retail_price, discount_percent
                    )
                # Use real inventory; 0 in stock_map means no records → treat as unlimited (9999)
                qty = stock_map.get(variant.id)
                variant.stock_quantity = qty if qty is not None else 9999

        return products

    async def invalidate_product_cache(self, slug: str | None = None) -> None:
        if slug:
            await redis_delete_pattern(tenant_cache_key(f"products:detail:{slug}:*"))
        await redis_delete_pattern(tenant_cache_key("products:list:*"))

    # ------------------------------------------------------------------
    # Admin methods (T104 — Phase 10)
    # ------------------------------------------------------------------

    async def create_product(self, data) -> Product:
        from app.schemas.product import ProductCreate
        product = Product(
            name=data.name,
            slug=data.slug,
            description=data.description,
            moq=data.moq,
            fabric=data.fabric,
            product_code=data.product_code,
            weight=data.weight,
            gender=data.gender,
            status=data.status,
            meta_title=data.meta_title,
            meta_description=data.meta_description,
            gang_sheet_enabled=getattr(data, "gang_sheet_enabled", False),
            pricing_mode=getattr(data, "pricing_mode", "variant") or "variant",
        )
        self.db.add(product)
        await self.db.flush()

        for cat_id in data.category_ids:
            self.db.add(ProductCategory(product_id=product.id, category_id=cat_id))

        await self.db.flush()
        await self.db.refresh(product)
        return product

    async def update_product(self, product_id: UUID, data) -> Product:
        result = await self.db.execute(
            select(Product).where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()
        if not product:
            raise NotFoundError(f"Product {product_id} not found")

        update_data = data.model_dump(exclude_unset=True, exclude={"category_ids"})
        for field, value in update_data.items():
            setattr(product, field, value)

        if data.category_ids is not None:
            await self.db.execute(
                ProductCategory.__table__.delete().where(
                    ProductCategory.product_id == product_id
                )
            )
            for cat_id in data.category_ids:
                self.db.add(ProductCategory(product_id=product_id, category_id=cat_id))

        await self.db.flush()
        await self.db.refresh(product)
        await self.invalidate_product_cache(product.slug)
        return product

    async def bulk_generate_variants(
        self, product_id: UUID, colors: list[str], sizes: list[str], base_price: Decimal
    ) -> list[ProductVariant]:
        import itertools

        result = await self.db.execute(select(Product).where(Product.id == product_id))
        product = result.scalar_one_or_none()
        if not product:
            raise NotFoundError(f"Product {product_id} not found")

        variants = []
        for color, size in itertools.product(colors, sizes):
            sku = f"{product.slug[:20].upper()}-{color[:3].upper()}-{size.upper()}"
            variant = ProductVariant(
                product_id=product_id,
                sku=sku,
                color=color,
                size=size,
                retail_price=base_price,
                status="active",
            )
            self.db.add(variant)
            variants.append(variant)

        await self.db.flush()
        return variants

    async def delete_variant(self, variant_id: UUID) -> None:
        result = await self.db.execute(
            select(ProductVariant).where(ProductVariant.id == variant_id)
        )
        variant = result.scalar_one_or_none()
        if not variant:
            raise NotFoundError(f"Variant {variant_id} not found")
        variant.status = "discontinued"
        await self.db.flush()

    async def apply_bulk_action(self, ids: list[UUID], action: str) -> int:
        """publish | unpublish | delete | active | draft | archived."""
        from sqlalchemy import update

        status_map = {
            "publish": "active", "unpublish": "draft", "delete": "archived",
            "active": "active", "draft": "draft", "archived": "archived",
        }
        new_status = status_map.get(action)
        if not new_status:
            raise ValidationError(f"Unknown bulk action: {action}")

        await self.db.execute(
            update(Product).where(Product.id.in_(ids)).values(status=new_status)
        )
        await self.db.flush()
        return len(ids)

    async def import_from_csv(self, csv_content: str) -> dict:
        """Parse CSV rows; insert or update products + variants."""
        import csv
        import io

        reader = csv.DictReader(io.StringIO(csv_content))
        imported = skipped = 0
        errors: list[str] = []

        for i, row in enumerate(reader, start=2):  # row 1 = header
            try:
                name = row.get("name", "").strip()
                slug = row.get("slug", "").strip()
                sku = row.get("sku", "").strip()
                if not name or not sku:
                    skipped += 1
                    continue

                # Upsert product by slug
                product_result = await self.db.execute(
                    select(Product).where(Product.slug == slug)
                )
                product = product_result.scalar_one_or_none()
                if not product:
                    product = Product(
                        name=name,
                        slug=slug or name.lower().replace(" ", "-"),
                        moq=int(row.get("moq", 1)),
                        status=row.get("status", "draft"),
                    )
                    self.db.add(product)
                    await self.db.flush()

                # Upsert variant by SKU
                from decimal import Decimal

                variant_result = await self.db.execute(
                    select(ProductVariant).where(ProductVariant.sku == sku)
                )
                variant = variant_result.scalar_one_or_none()
                if not variant:
                    variant = ProductVariant(
                        product_id=product.id,
                        sku=sku,
                        color=row.get("color"),
                        size=row.get("size"),
                        retail_price=Decimal(row.get("retail_price", "0")),
                        status="active",
                    )
                    self.db.add(variant)
                else:
                    variant.retail_price = Decimal(row.get("retail_price", str(variant.retail_price)))

                imported += 1
            except Exception as exc:
                errors.append(f"Row {i}: {exc}")
                skipped += 1

        await self.db.flush()
        return {"imported": imported, "skipped": skipped, "errors": errors}

    async def export_to_csv(self) -> str:
        """Export all products + variants as CSV string."""
        import csv
        import io

        result = await self.db.execute(select(Product))
        products = result.scalars().all()

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["name", "slug", "moq", "status", "sku", "color", "size", "retail_price"])

        for product in products:
            variant_result = await self.db.execute(
                select(ProductVariant).where(ProductVariant.product_id == product.id)
            )
            variants = variant_result.scalars().all()
            if not variants:
                writer.writerow([product.name, product.slug, product.moq, product.status, "", "", "", ""])
            for variant in variants:
                writer.writerow([
                    product.name, product.slug, product.moq, product.status,
                    variant.sku, variant.color, variant.size, variant.retail_price,
                ])

        return buf.getvalue()


# def _product_to_dict(product: Product) -> dict:
#     """Serialize a Product ORM object to a plain dict (JSON-safe)."""
#     return {
#         "id": str(product.id),
#         "name": product.name,
#         "slug": product.slug,
#         "status": product.status,
#         "moq": product.moq,
#         "description": product.description,
#         "meta_title": getattr(product, "meta_title", None),
#         "meta_description": getattr(product, "meta_description", None),
#         "images": [_image_to_dict(i) for i in getattr(product, "images", [])],
#         "variants": [_variant_to_dict(v) for v in getattr(product, "variants", [])],
#         "categories": [_cat_to_dict(link.category) for link in getattr(product, "category_links", []) if getattr(link, "category", None)],
#         "created_at": str(product.created_at),
#         "updated_at": str(product.updated_at),
#     }


def _loaded_assets(product: Product) -> list:
    """Return assets only if they were eagerly loaded; never trigger a lazy load."""
    try:
        if "assets" in sa_inspect(product).unloaded:
            return []
        return [
            {"id": str(a.id), "asset_type": a.asset_type, "url": a.url, "file_name": a.file_name}
            for a in product.assets
        ]
    except Exception:
        return []


def _product_to_dict(product: Product) -> dict:
    images = getattr(product, "images", []) or []
    primary = next((img for img in images if getattr(img, "is_primary", False)), None)
    if primary is None and images:
        primary = images[0]

    return {
        "id": str(product.id),
        "name": product.name,
        "slug": product.slug,
        "status": product.status,
        "moq": product.moq,
        "description": product.description,
        "meta_title": getattr(product, "meta_title", None),
        "meta_description": getattr(product, "meta_description", None),
        "primary_image": _image_to_dict(primary) if primary else None,
        "images": [_image_to_dict(i) for i in images],
        "variants": [_variant_to_dict(v) for v in getattr(product, "variants", [])],
        "categories": [_cat_to_dict(link.category) for link in getattr(product, "category_links", []) if getattr(link, "category", None)],
        "created_at": str(product.created_at),
        "updated_at": str(product.updated_at),
        "fabric": getattr(product, "fabric", None),
        "product_code": getattr(product, "product_code", None),
        "weight": getattr(product, "weight", None),
        "gender": getattr(product, "gender", None),
        "care_instructions": getattr(product, "care_instructions", None),
        "print_guide": getattr(product, "print_guide", None),
        "size_chart_data": getattr(product, "size_chart_data", None),
        "assets": _loaded_assets(product),
        "highlight_text": getattr(product, "highlight_text", None),
        "review_count": getattr(product, "review_count", 0),
        "avg_rating": getattr(product, "avg_rating", 0.0),
        "gang_sheet_enabled": getattr(product, "gang_sheet_enabled", False),
        "gang_sheet_type": getattr(product, "gang_sheet_type", None),
        "gang_sheet_config": getattr(product, "gang_sheet_config", None),
        # Which buying UI the storefront should render: stocked variants or
        # the dynamic option configurator (options fetched separately).
        "pricing_mode": getattr(product, "pricing_mode", "variant") or "variant",
        "base_price": float(product.base_price) if getattr(product, "base_price", None) is not None else None,
        "template_id": str(product.template_id) if getattr(product, "template_id", None) else None,
        "metafields": getattr(product, "metafields", None) or {},
        "theme_page": getattr(product, "theme_page", None),
    }


def _variant_to_dict(variant: ProductVariant) -> dict:
    msrp = getattr(variant, "msrp", None)
    return {
        "id": str(variant.id),
        "sku": variant.sku,
        "color": variant.color,
        "color_hex": getattr(variant, "color_hex", None),
        "size": variant.size,
        "retail_price": str(variant.retail_price),
        "compare_price": str(variant.compare_price) if variant.compare_price is not None else None,
        "msrp": str(msrp) if msrp is not None else None,
        "effective_price": str(getattr(variant, "effective_price", variant.retail_price)),
        "stock_quantity": getattr(variant, "stock_quantity", 0),
        "weight_grams": getattr(variant, "weight_grams", None),
        "status": variant.status,
    }


def _image_to_dict(image: ProductImage) -> dict:
    return {
        "id": str(image.id),
        "url_thumbnail": image.url_thumbnail,
        "url_medium": image.url_medium,
        "url_large": image.url_large,
        "url_thumbnail_webp": getattr(image, "url_thumbnail_webp", None),
        "url_medium_webp": getattr(image, "url_medium_webp", None),
        "url_large_webp": getattr(image, "url_large_webp", None),
        "alt_text": image.alt_text,
        "is_primary": image.is_primary,
        "position": image.position,
    }


def _cat_to_dict(cat: Category) -> dict:
    return {
        "id": str(cat.id),
        "name": cat.name,
        "slug": cat.slug,
        "description": getattr(cat, "description", None),
        "parent_id": str(cat.parent_id) if cat.parent_id else None,
        "is_active": getattr(cat, "is_active", True),
        "sort_order": getattr(cat, "sort_order", 0),
        "image_url": getattr(cat, "image_url", None),  # ✅ yeh add karo
        "children": [_cat_to_dict(c) for c in getattr(cat, "children", [])],
    }
