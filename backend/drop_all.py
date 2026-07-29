"""Drop every table in Neon DB — complete fresh start."""
import asyncio, os, ssl, asyncpg

# Read from env — never hardcode credentials in source.
NEON_DSN = os.environ.get("NEON_DSN") or os.environ.get("DATABASE_URL")
if not NEON_DSN:
    raise SystemExit("Set NEON_DSN or DATABASE_URL (see backend/.env) before running this script.")

async def main():
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    conn = await asyncpg.connect(NEON_DSN, ssl=ssl_ctx)
    print("Connected to Neon DB")

    # Get all table names in public schema
    tables = await conn.fetch("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    """)

    if not tables:
        print("DB already clean — no tables found.")
    else:
        print(f"Found {len(tables)} tables — dropping all...")
        table_names = ", ".join(f'"{t["tablename"]}"' for t in tables)
        await conn.execute(f"DROP TABLE IF EXISTS {table_names} CASCADE")
        print("All tables dropped.")

    # Verify
    remaining = await conn.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    )
    print(f"Tables remaining: {len(remaining)} (should be 0)")
    await conn.close()
    print("\nDone! DB is completely clean.")

asyncio.run(main())
