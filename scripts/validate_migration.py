"""Migration validation script: count products/variants/images/customers, check duplicate SKUs.

Usage:
    python scripts/validate_migration.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.company import Company
from app.models.product import Product, ProductImage, ProductVariant
from app.models.user import User


async def validate(db: AsyncSession) -> dict:
    checks: list[dict] = []

    # Count products
    product_count = (await db.execute(select(func.count(Product.id)))).scalar_one()
    checks.append({"name": "Products exist", "value": product_count, "pass": product_count > 0})

    # Count active products
    active_count = (await db.execute(
        select(func.count(Product.id)).where(Product.status == "active")
    )).scalar_one()
    checks.append({"name": "Active products", "value": active_count, "pass": active_count > 0})

    # Count variants
    variant_count = (await db.execute(select(func.count(ProductVariant.id)))).scalar_one()
    checks.append({"name": "Variants exist", "value": variant_count, "pass": variant_count > 0})

    # Check duplicate SKUs
    dup_result = await db.execute(
        select(ProductVariant.sku, func.count(ProductVariant.id).label("cnt"))
        .group_by(ProductVariant.sku)
        .having(func.count(ProductVariant.id) > 1)
    )
    duplicates = dup_result.all()
    checks.append({"name": "No duplicate SKUs", "value": len(duplicates), "pass": len(duplicates) == 0,
                   "detail": [row.sku for row in duplicates] if duplicates else None})

    # Count images
    image_count = (await db.execute(select(func.count(ProductImage.id)))).scalar_one()
    checks.append({"name": "Images exist", "value": image_count, "pass": image_count > 0})

    # Check images processed (have url_large)
    unprocessed = (await db.execute(
        select(func.count(ProductImage.id)).where(ProductImage.url_large.is_(None))
    )).scalar_one()
    checks.append({"name": "All images processed", "value": unprocessed,
                   "pass": unprocessed == 0,
                   "detail": f"{unprocessed} images missing url_large" if unprocessed else None})

    # Count companies
    company_count = (await db.execute(select(func.count(Company.id)))).scalar_one()
    checks.append({"name": "Companies exist", "value": company_count, "pass": company_count > 0})

    # Count users (non-admin)
    user_count = (await db.execute(
        select(func.count(User.id)).where(User.is_admin.is_(False))
    )).scalar_one()
    checks.append({"name": "Users exist", "value": user_count, "pass": user_count > 0})

    return {"checks": checks}


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await validate(db)

    checks = result["checks"]
    all_pass = all(c["pass"] for c in checks)

    print("\nMigration Validation Report")
    print("=" * 50)
    for c in checks:
        status = "✅ PASS" if c["pass"] else "❌ FAIL"
        print(f"  {status}  {c['name']}: {c['value']}")
        if c.get("detail"):
            print(f"         Detail: {c['detail']}")

    print("=" * 50)
    print(f"Overall: {'✅ ALL PASS' if all_pass else '❌ FAILED'}\n")

    if not all_pass:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
