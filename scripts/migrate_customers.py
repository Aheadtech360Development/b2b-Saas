"""Shopify → AF Apparels customer migration script.

Maps Shopify customers to Company + User records and assigns a default pricing tier.

Usage:
    python scripts/migrate_customers.py
    python scripts/migrate_customers.py --dry-run
    python scripts/migrate_customers.py --default-tier "Standard"
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
from app.core.security import hash_password
from app.models.company import Company
from app.models.pricing import PricingTier
from app.models.user import User


SHOPIFY_BASE = f"https://{settings.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01"
HEADERS = {"X-Shopify-Access-Token": settings.SHOPIFY_ADMIN_API_TOKEN}


async def fetch_customers() -> list[dict]:
    customers: list[dict] = []
    url = f"{SHOPIFY_BASE}/customers.json?limit=250&fields=id,email,first_name,last_name,company,phone,verified_email"
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            resp = await client.get(url, headers=HEADERS)
            resp.raise_for_status()
            data = resp.json()
            customers.extend(data.get("customers", []))
            link = resp.headers.get("Link", "")
            url = None
            for part in link.split(","):
                if 'rel="next"' in part:
                    url = part.split(";")[0].strip().strip("<>")
                    break
    return customers


async def migrate(db: AsyncSession, default_tier_name: str = "Standard", dry_run: bool = False) -> dict:
    print(f"Fetching customers from Shopify{' (dry run)' if dry_run else ''}...")

    # Load default pricing tier
    tier = (await db.execute(
        select(PricingTier).where(PricingTier.name == default_tier_name)
    )).scalar_one_or_none()
    if not tier:
        print(f"ERROR: Pricing tier '{default_tier_name}' not found. Run seed_data.py first.")
        sys.exit(1)

    customers = await fetch_customers()
    print(f"Found {len(customers)} customers")

    created = 0
    skipped = 0
    errors = 0

    for c in customers:
        try:
            email = c.get("email", "").lower().strip()
            if not email:
                skipped += 1
                continue

            existing_user = (await db.execute(
                select(User).where(User.email == email)
            )).scalar_one_or_none()
            if existing_user:
                skipped += 1
                continue

            if dry_run:
                company_name = c.get("company") or f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or email
                print(f"  [DRY] Would create: {company_name} / {email}")
                created += 1
                continue

            company_name = c.get("company") or f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or email

            # Create company
            company = Company(
                name=company_name,
                status="active",
                pricing_tier_id=tier.id,
            )
            db.add(company)
            await db.flush()

            # Create user
            user = User(
                email=email,
                hashed_password=hash_password("ChangeMe123!"),  # force password reset on first login
                first_name=c.get("first_name", ""),
                last_name=c.get("last_name", ""),
                company_id=company.id,
                company_role="owner",
                is_active=True,
                email_verified=bool(c.get("verified_email")),
            )
            db.add(user)

            created += 1
            print(f"  Created: {company_name} / {email}")

        except Exception as exc:
            print(f"  ERROR: {c.get('email', '?')} — {exc}")
            errors += 1

    if not dry_run:
        await db.commit()

    return {"customers": len(customers), "created": created, "skipped": skipped, "errors": errors}


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Shopify customers to AF Apparels")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--default-tier", default="Standard", help="Default pricing tier name")
    args = parser.parse_args()

    if not settings.SHOPIFY_STORE_DOMAIN or not settings.SHOPIFY_ADMIN_API_TOKEN:
        print("ERROR: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set in .env")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        result = await migrate(db, default_tier_name=args.default_tier, dry_run=args.dry_run)

    print(f"\n{'DRY RUN ' if args.dry_run else ''}Migration complete:")
    print(f"  Customers found : {result['customers']}")
    print(f"  Created         : {result['created']}")
    print(f"  Skipped         : {result['skipped']}")
    print(f"  Errors          : {result['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
