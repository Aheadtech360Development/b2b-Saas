"""What a supplier's part of an order line cost (one product, several sources).

`order_item_sources` (0073) says how much of a line a supplier's stock
covered. This adds what each piece cost at that supplier when the order was
placed, so the order page can show the cost of each part and a supplier's
later price change never rewrites an old order.

Revision ID: 0074_source_costs
Revises: 0073_variant_sources
"""
from alembic import op

revision = "0074_source_costs"
down_revision = "0073_variant_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE order_item_sources ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10, 2)")


def downgrade() -> None:
    op.execute("ALTER TABLE order_item_sources DROP COLUMN IF EXISTS unit_cost")
