"""
Multi-tenant migration.

1. Creates all ORM-model tables that don't exist yet (products, orders, companies,
   …) — they already include `tenant_id` because their models use TenantMixin.
2. For every tenant-scoped table: ensures the tenant_id column exists, backfills
   any existing NULL rows to the demo tenant, adds the FK to tenants(id), and an
   index. Fully idempotent — safe to run repeatedly.

Run:  python migrate_tenant.py
"""
import asyncio
import sys

sys.path.insert(0, ".")


async def main() -> None:
    from sqlalchemy import text

    # Import ALL models so Base.metadata is complete before create_all.
    import app.models  # noqa: F401
    from app.models.base import Base, TenantMixin
    from app.core.database import engine
    from app.core.tenant_context import set_bypass_scoping

    set_bypass_scoping(True)  # never scope queries during migration

    # ── 1. Collect tenant-scoped table names from the mappers ──────────────────
    scoped_tables: list[str] = []
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if issubclass(cls, TenantMixin):
            scoped_tables.append(cls.__tablename__)
    scoped_tables = sorted(set(scoped_tables))
    print(f"Tenant-scoped tables ({len(scoped_tables)}): {', '.join(scoped_tables)}\n")

    # ── 2. Create all missing ORM tables (with tenant_id already in the model) ─
    print("Creating missing tables from models…")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("  create_all: done\n")

    # ── 3. Resolve the demo tenant to backfill legacy rows ─────────────────────
    async with engine.begin() as conn:
        r = await conn.execute(text("SELECT id, slug FROM tenants ORDER BY created_at"))
        tenants = r.fetchall()
        print("Tenants in DB:")
        for row in tenants:
            print(f"  {row[1]} -> {row[0]}")
        demo = next((row for row in tenants if row[1] == "demo"), None)
        demo_id = demo[0] if demo else (tenants[0][0] if tenants else None)
        print(f"\nBackfilling legacy NULL rows to: {demo_id}\n")

    # ── 4. Ensure tenant_id column + FK + index + backfill on each table ───────
    async with engine.begin() as conn:
        for t in scoped_tables:
            await conn.execute(text(f'ALTER TABLE {t} ADD COLUMN IF NOT EXISTS tenant_id UUID'))
            if demo_id is not None:
                await conn.execute(
                    text(f"UPDATE {t} SET tenant_id = :tid WHERE tenant_id IS NULL"),
                    {"tid": str(demo_id)},
                )
            await conn.execute(
                text(f'CREATE INDEX IF NOT EXISTS ix_{t}_tenant_id ON {t}(tenant_id)')
            )
            # Add FK to tenants(id) only if not already present.
            await conn.execute(text(f"""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints
                        WHERE constraint_name = 'fk_{t}_tenant' AND table_name = '{t}'
                    ) THEN
                        ALTER TABLE {t}
                            ADD CONSTRAINT fk_{t}_tenant
                            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            """))
            print(f"  {t}: tenant_id ready (column + backfill + FK + index)")

    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(main())
