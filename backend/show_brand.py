"""Show brands + their admin login emails."""
import asyncio, sys
sys.path.insert(0, ".")

async def main():
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping
    set_bypass_scoping(True)
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(text("""
            SELECT t.slug, t.name, t.status, u.email, u.role
            FROM tenants t
            LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'tenant_admin'
            ORDER BY t.created_at
        """))).fetchall()
        print("BRANDS + ADMIN LOGINS:")
        for r in rows:
            print(f"  slug={r[0]} | name={r[1]} | status={r[2]} | admin_email={r[3]} | role={r[4]}")

asyncio.run(main())
