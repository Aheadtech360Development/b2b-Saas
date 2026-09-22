"""A warehouse code belongs to one brand, not to the whole platform.

`warehouses.code` was globally unique, so the first brand to call a warehouse
"MAIN" took that code away from every other brand on the platform. The second
brand got a database error with nothing in it about warehouses, which is the
same mistake already corrected for order numbers (0027) and product SKUs (0028).

Revision ID: 0042_warehouse_code_tenant
Revises: 0041_option_combinations
"""
from alembic import op

revision = "0042_warehouse_code_tenant"
down_revision = "0041_option_combinations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows may already collide across brands — they cannot, since the
    # old index forbade it, so the new index can be built without cleaning up.
    op.execute("DROP INDEX IF EXISTS ix_warehouses_code")
    op.execute("ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_code_key")
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_tenant_code
        ON warehouses(tenant_id, code)
    """)
    # Lookups by code alone still happen; keep them indexed, just not unique.
    op.execute("CREATE INDEX IF NOT EXISTS ix_warehouses_code ON warehouses(code)")


def downgrade() -> None:
    # Deliberately not restoring the global constraint: by now two brands may
    # share a code, and re-adding it would fail on real data.
    op.execute("DROP INDEX IF EXISTS uq_warehouses_tenant_code")
