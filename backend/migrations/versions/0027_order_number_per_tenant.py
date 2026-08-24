"""Make order_number unique PER TENANT, not globally.

Each brand numbers its own orders independently starting at #1001 (Shopify-style
— see OrderService._generate_order_number). But order_number had a GLOBAL unique
index (ix_orders_order_number from the model's unique=True), so brand B's #1001
collided with brand A's #1001 → UniqueViolationError, and B's checkout failed.

Fix: drop the global unique index, add a composite unique index on
(tenant_id, order_number), and keep a plain (non-unique) index on order_number
for lookups/search.

Revision ID: 0027_order_number_per_tenant
Revises: 0026_payment_disputes
"""
from alembic import op

revision = "0027_order_number_per_tenant"
down_revision = "0026_payment_disputes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_order_number")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_order_number "
        "ON orders (tenant_id, order_number)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_order_number ON orders (order_number)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_orders_tenant_order_number")
    op.execute("DROP INDEX IF EXISTS ix_orders_order_number")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_order_number ON orders (order_number)")
