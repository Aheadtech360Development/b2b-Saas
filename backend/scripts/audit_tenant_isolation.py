"""Read-only tenant-isolation audit.

Reports, for every tenant-scoped table (has a tenant_id column):
  • whether RLS is enabled + FORCEd and the tenant_isolation policy exists
  • how many rows have a NULL tenant_id (these are the rows the 0022 migration
    stops sharing across brands — run this first to see the impact)

Changes nothing. Run:  python -m scripts.audit_tenant_isolation
"""
from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.core.database import AsyncSessionLocal


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tables = [
            r[0]
            for r in (
                await db.execute(
                    text(
                        """
                        SELECT c.table_name FROM information_schema.columns c
                        JOIN information_schema.tables tb
                          ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
                        WHERE c.column_name = 'tenant_id'
                          AND c.table_schema = 'public'
                          AND tb.table_type = 'BASE TABLE'
                        ORDER BY c.table_name
                        """
                    )
                )
            ).all()
        ]

        print(f"Tenant-scoped tables: {len(tables)}\n")
        print(f"{'table':<34}{'RLS':<6}{'FORCE':<7}{'policy':<8}{'NULL-tenant rows'}")
        print("-" * 75)

        total_null = 0
        gaps = []
        for t in tables:
            rls = (
                await db.execute(
                    text("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = :t"),
                    {"t": t},
                )
            ).first()
            has_policy = (
                await db.execute(
                    text("SELECT 1 FROM pg_policies WHERE tablename = :t AND policyname = 'tenant_isolation'"),
                    {"t": t},
                )
            ).first() is not None
            null_rows = (
                await db.execute(text(f'SELECT count(*) FROM "{t}" WHERE tenant_id IS NULL'))
            ).scalar() or 0
            total_null += null_rows

            enabled = bool(rls and rls[0])
            forced = bool(rls and rls[1])
            if not (enabled and forced and has_policy):
                gaps.append(t)
            print(f"{t:<34}{'yes' if enabled else 'NO':<6}{'yes' if forced else 'NO':<7}{'yes' if has_policy else 'NO':<8}{null_rows}")

        print("-" * 75)
        print(f"\nTotal NULL-tenant rows across all tables: {total_null}")
        if total_null:
            print("  → these are currently visible to every brand under the 0020 policy;")
            print("    migration 0022 makes them fail-closed (platform admin can still fix them).")
        if gaps:
            print(f"\n[GAP] tables missing RLS/FORCE/policy: {', '.join(gaps)}")
        else:
            print("\nAll tenant-scoped tables have RLS + FORCE + policy. ✓")


if __name__ == "__main__":
    asyncio.run(main())
