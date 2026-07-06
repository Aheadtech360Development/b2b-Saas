"""Celery tasks: S&S Activewear catalog sync (categories / products / inventory).

Sync schedule (configured in celeryconfig.py beat_schedule):
  - sync_ss_inventory  : every 15 min
  - sync_ss_products   : every 6 h
  - sync_ss_categories : daily at 02:00 UTC

Manual trigger available via POST /api/v1/admin/supplier-catalog/sync/trigger.
"""
import asyncio
import logging
from datetime import datetime, timezone

from app.core.celery import celery_app

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _apply_markup(
    wholesale: float,
    markup_rules: list[dict],
    *,
    category: str | None = None,
    brand: str | None = None,
    style_id: str | None = None,
) -> float:
    """Return retail price by applying the highest-priority matching markup rule.

    Priority order: product (3) > brand (2) > category (1) > global (0).
    Falls back to 40 % markup if no rule exists.
    """
    best: dict | None = None
    best_priority = -1

    for rule in markup_rules:
        if not rule.get("is_active"):
            continue
        rt = rule.get("rule_type", "")
        tv = rule.get("target_value", "")

        if rt == "product" and tv == style_id:
            priority = 3
        elif rt == "brand" and tv == brand:
            priority = 2
        elif rt == "category" and tv == category:
            priority = 1
        elif rt == "global":
            priority = 0
        else:
            continue

        if priority > best_priority:
            best_priority = priority
            best = rule

    if best is None:
        return round(wholesale * 1.40, 2)

    pct = float(best.get("markup_pct") or 0)
    fixed = float(best.get("markup_fixed") or 0)
    return round(wholesale * (1 + pct / 100) + fixed, 2)


# ── Task: sync categories ─────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3, name="app.tasks.supplier_sync_tasks.sync_ss_categories")
def sync_ss_categories(self) -> dict:
    """Daily: refresh S&S category list in local DB."""

    async def _run() -> dict:
        from sqlalchemy import select

        from app.core.database import AsyncSessionLocal
        from app.models.supplier import SSCategory, SSSyncLog
        from app.services.ss_activewear_service import SSActivewearService

        svc = SSActivewearService()
        started = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as db:
            log = SSSyncLog(sync_type="categories", status="running", started_at=started)
            db.add(log)
            await db.commit()
            await db.refresh(log)

            try:
                raw = await svc.fetch_categories()

                # S&S may return categories as objects or as product-derived list
                upserted = 0
                for item in raw:
                    name = (
                        item.get("categoryName")
                        or item.get("name")
                        or item.get("category")
                        or ""
                    )
                    if not name:
                        continue

                    res = await db.execute(select(SSCategory).where(SSCategory.name == name))
                    existing = res.scalar_one_or_none()
                    if existing:
                        existing.product_count = int(item.get("productCount") or 0)
                        existing.gender = item.get("genderName")
                    else:
                        db.add(SSCategory(
                            name=name,
                            gender=item.get("genderName"),
                            product_count=int(item.get("productCount") or 0),
                        ))
                    upserted += 1

                log.status = "completed"
                log.completed_at = datetime.now(timezone.utc)
                log.records_fetched = len(raw)
                log.records_upserted = upserted
                await db.commit()
                return {"status": "completed", "upserted": upserted}

            except Exception as exc:
                log.status = "failed"
                log.error_message = str(exc)[:1000]
                log.completed_at = datetime.now(timezone.utc)
                await db.commit()
                raise
            finally:
                await svc.close()

    try:
        return asyncio.get_event_loop().run_until_complete(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)


# ── Task: sync products ───────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3, name="app.tasks.supplier_sync_tasks.sync_ss_products")
def sync_ss_products(self) -> dict:
    """Every 6 h: batch-sync the full S&S product catalog (style-level data)."""

    async def _run() -> dict:
        from sqlalchemy import select

        from app.core.database import AsyncSessionLocal
        from app.models.supplier import SSProduct, SSSyncLog
        from app.services.ss_activewear_service import SSActivewearService

        svc = SSActivewearService()
        started = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as db:
            log = SSSyncLog(sync_type="products", status="running", started_at=started)
            db.add(log)
            await db.commit()
            await db.refresh(log)

            total_fetched = 0
            total_upserted = 0

            try:
                page = 1
                while True:
                    products = await svc.fetch_products_page(page=page, page_size=100)
                    if not products:
                        break

                    now = datetime.now(timezone.utc)
                    for p in products:
                        style_id = svc.extract_style_id(p)
                        if not style_id:
                            continue

                        res = await db.execute(
                            select(SSProduct).where(SSProduct.style_id == style_id)
                        )
                        existing = res.scalar_one_or_none()

                        name = (
                            p.get("styleName")
                            or p.get("title")
                            or p.get("name")
                            or style_id
                        )
                        image = svc.extract_front_image(p)
                        price = svc.extract_piece_price(p)

                        if existing:
                            existing.style_name = name
                            existing.brand_name = p.get("brandName")
                            existing.category_name = p.get("categoryName")
                            existing.gender_name = p.get("genderName")
                            existing.description = p.get("description")
                            existing.keywords = p.get("keywords")
                            existing.piece_price = price
                            existing.case_price = p.get("casePrice")
                            existing.case_size = p.get("caseSize")
                            existing.front_image = image
                            existing.last_synced_at = now
                        else:
                            db.add(SSProduct(
                                style_id=style_id,
                                style_name=name,
                                brand_name=p.get("brandName"),
                                category_name=p.get("categoryName"),
                                gender_name=p.get("genderName"),
                                description=p.get("description"),
                                keywords=p.get("keywords"),
                                piece_price=price,
                                case_price=p.get("casePrice"),
                                case_size=p.get("caseSize"),
                                front_image=image,
                                raw_data=p,
                                last_synced_at=now,
                            ))
                        total_upserted += 1

                    total_fetched += len(products)
                    await db.commit()

                    if len(products) < 100:
                        break
                    page += 1

                log.status = "completed"
                log.completed_at = datetime.now(timezone.utc)
                log.records_fetched = total_fetched
                log.records_upserted = total_upserted
                await db.commit()
                return {"status": "completed", "fetched": total_fetched, "upserted": total_upserted}

            except Exception as exc:
                log.status = "failed"
                log.error_message = str(exc)[:1000]
                log.completed_at = datetime.now(timezone.utc)
                await db.commit()
                raise
            finally:
                await svc.close()

    try:
        return asyncio.get_event_loop().run_until_complete(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=600)


# ── Task: sync inventory ──────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3, name="app.tasks.supplier_sync_tasks.sync_ss_inventory")
def sync_ss_inventory(self) -> dict:
    """Every 15 min: refresh inventory quantities for all imported S&S products."""

    async def _run() -> dict:
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.core.database import AsyncSessionLocal
        from app.models.supplier import SSProduct, SSVariant, SSSyncLog
        from app.services.ss_activewear_service import SSActivewearService

        svc = SSActivewearService()
        started = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as db:
            log = SSSyncLog(sync_type="inventory", status="running", started_at=started)
            db.add(log)
            await db.commit()
            await db.refresh(log)

            try:
                res = await db.execute(
                    select(SSProduct)
                    .options(selectinload(SSProduct.variants))
                    .where(SSProduct.is_imported.is_(True))
                )
                imported = res.scalars().all()

                variants_updated = 0
                now = datetime.now(timezone.utc)

                for product in imported:
                    inv_rows = await svc.fetch_inventory(style_id=product.style_id)

                    # Build SKU → qty map (sum across all warehouses)
                    inv_map: dict[str, int] = {}
                    for row in inv_rows:
                        sku = row.get("sku") or row.get("gtin") or ""
                        qty = int(row.get("qty") or row.get("onHandQty") or row.get("quantity") or 0)
                        if sku:
                            inv_map[sku] = inv_map.get(sku, 0) + qty

                    for variant in product.variants:
                        if variant.sku in inv_map:
                            variant.qty_on_hand = inv_map[variant.sku]
                            variant.last_inventory_sync = now
                            variants_updated += 1

                    await db.commit()

                log.status = "completed"
                log.completed_at = now
                log.records_fetched = len(imported)
                log.records_upserted = variants_updated
                await db.commit()
                return {
                    "status": "completed",
                    "products_checked": len(imported),
                    "variants_updated": variants_updated,
                }

            except Exception as exc:
                log.status = "failed"
                log.error_message = str(exc)[:1000]
                log.completed_at = datetime.now(timezone.utc)
                await db.commit()
                raise
            finally:
                await svc.close()

    try:
        return asyncio.get_event_loop().run_until_complete(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)
