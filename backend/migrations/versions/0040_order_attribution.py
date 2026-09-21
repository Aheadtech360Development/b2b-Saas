"""Where each order came from.

Nothing in the platform recorded how a buyer arrived. A brand running ads had
no way to tell which campaign paid for an order, because the `utm_*` values on
the landing URL were read by nobody and kept nowhere.

The five UTM values get their own columns: they are what a brand filters,
groups and exports by, and a column is the honest place for something that
gets queried. Everything else about the visit — referrer, landing page, ad
click ids, whether it was the first touch or the last — goes in one JSONB
column, so adding another signal later needs no migration.

Every column is nullable. An order placed by a buyer who typed the address in
has no attribution, and pretending otherwise would be worse than a blank.

Revision ID: 0040_order_attribution
Revises: 0039_order_events
"""
from alembic import op

revision = "0040_order_attribution"
down_revision = "0039_order_events"
branch_labels = None
depends_on = None

_UTM = ("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content")


def upgrade() -> None:
    for column in _UTM:
        op.execute(f"ALTER TABLE orders ADD COLUMN IF NOT EXISTS {column} VARCHAR(255)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution JSONB")

    # What a brand actually asks: "how did last month's orders break down by
    # campaign?" — so index the two it groups by, not all five.
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_utm_source ON orders(utm_source)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_utm_campaign ON orders(utm_campaign)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_utm_campaign")
    op.execute("DROP INDEX IF EXISTS ix_orders_utm_source")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS attribution")
    for column in _UTM:
        op.execute(f"ALTER TABLE orders DROP COLUMN IF EXISTS {column}")
