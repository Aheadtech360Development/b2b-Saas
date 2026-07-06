"""
Wipe ALL brands (tenants) for a clean scratch start.

Deleting a tenant row cascades (ON DELETE CASCADE) to every tenant-scoped table
— products, orders, companies, users, branding, subscriptions, etc. The platform
super-admin (users.tenant_id IS NULL) is left untouched.
"""
import asyncio, sys
sys.path.insert(0, ".")

async def main():
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping
    set_bypass_scoping(True)

    async with AsyncSessionLocal() as s:
        before = (await s.execute(text("SELECT slug, name, status FROM tenants ORDER BY created_at"))).fetchall()
        print(f"Brands before wipe ({len(before)}):")
        for r in before:
            print(f"  {r[0]} ({r[1]}) - {r[2]}")

        # Delete all tenants -> cascades to all tenant data.
        await s.execute(text("DELETE FROM tenants"))
        # Safety: also clear any orphan tenant-scoped rows (defensive).
        await s.execute(text("DELETE FROM products WHERE tenant_id IS NOT NULL"))
        await s.commit()

        after = (await s.execute(text("SELECT COUNT(*) FROM tenants"))).scalar()
        admins = (await s.execute(text(
            "SELECT email FROM users WHERE tenant_id IS NULL AND is_platform_admin = true"
        ))).fetchall()
        prod = (await s.execute(text("SELECT COUNT(*) FROM products"))).scalar()

        print(f"\nBrands after wipe: {after}")
        print(f"Products remaining: {prod}")
        print("Platform super-admins preserved:")
        for a in admins:
            print(f"  {a[0]}")
    print("\n[OK] Clean slate - no brands, super admin intact.")

asyncio.run(main())
