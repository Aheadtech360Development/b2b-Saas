"""Shopify → AF Apparels product migration script.

Usage:
    python scripts/migrate_products.py
    python scripts/migrate_products.py --dry-run
    python scripts/migrate_products.py --limit 100
"""
import argparse
import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.product import Category, Product, ProductVariant


SHOPIFY_BASE = f"https://{settings.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01"
HEADERS = {"X-Shopify-Access-Token": settings.SHOPIFY_ADMIN_API_TOKEN, "Content-Type": "application/json"}


async def fetch_products(limit: int | None = None) -> list[dict]:
    """Fetch all products from Shopify via pagination."""
    products: list[dict] = []
    url = f"{SHOPIFY_BASE}/products.json?limit=250&fields=id,title,handle,body_html,status,product_type,variants,images,tags"
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            resp = await client.get(url, headers=HEADERS)
            resp.raise_for_status()
            data = resp.json()
            products.extend(data.get("products", []))
            if limit and len(products) >= limit:
                products = products[:limit]
                break
            # Follow Link header for next page
            link = resp.headers.get("Link", "")
            url = None
            for part in link.split(","):
                if 'rel="next"' in part:
                    url = part.split(";")[0].strip().strip("<>")
                    break
    return products


def shopify_status_to_db(status: str) -> str:
    return {"active": "active", "draft": "draft", "archived": "archived"}.get(status, "draft")


async def migrate(db: AsyncSession, dry_run: bool = False, limit: int | None = None) -> dict:
    print(f"Fetching products from Shopify{' (dry run)' if dry_run else ''}...")
    products = await fetch_products(limit=limit)
    print(f"Found {len(products)} products")

    created = 0
    skipped = 0
    errors = 0

    for p in products:
        try:
            # Check if already migrated by slug
            existing = (await db.execute(
                select(Product).where(Product.slug == p["handle"])
            )).scalar_one_or_none()

            if existing:
                skipped += 1
                continue

            if dry_run:
                print(f"  [DRY] Would create: {p['title']} ({p['handle']}) — {len(p.get('variants', []))} variants")
                created += 1
                continue

            # Create product
            product = Product(
                name=p["title"],
                slug=p["handle"],
                description=p.get("body_html", ""),
                status=shopify_status_to_db(p.get("status", "draft")),
                moq=1,
            )
            db.add(product)
            await db.flush()

            # Create variants
            for v in p.get("variants", []):
                variant = ProductVariant(
                    product_id=product.id,
                    sku=v.get("sku") or f"SHOPIFY-{v['id']}",
                    color=v.get("option1"),
                    size=v.get("option2"),
                    retail_price=float(v.get("price", 0)),
                    is_active=True,
                )
                db.add(variant)

            created += 1
            print(f"  Created: {p['title']} ({len(p.get('variants', []))} variants)")

        except Exception as exc:
            print(f"  ERROR: {p.get('title', '?')} — {exc}")
            errors += 1

    if not dry_run:
        await db.commit()

    return {"products": len(products), "created": created, "skipped": skipped, "errors": errors}


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Shopify products to AF Apparels")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of products")
    args = parser.parse_args()

    if not settings.SHOPIFY_STORE_DOMAIN or not settings.SHOPIFY_ADMIN_API_TOKEN:
        print("ERROR: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set in .env")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        result = await migrate(db, dry_run=args.dry_run, limit=args.limit)

    print(f"\n{'DRY RUN ' if args.dry_run else ''}Migration complete:")
    print(f"  Products found : {result['products']}")
    print(f"  Created        : {result['created']}")
    print(f"  Skipped        : {result['skipped']}")
    print(f"  Errors         : {result['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
