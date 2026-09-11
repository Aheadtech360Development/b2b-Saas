"""Carry a configured product's chosen options through cart → order.

A configurable line has no variant row to point at, so the selection itself is
the line's identity. `configuration` stores a human-readable snapshot of the
chosen options (name/value pairs + the resolved price breakdown) taken at the
moment of adding, so an order stays readable even if the brand later edits or
removes an option — the same reason order_items already snapshots product_name
and sku rather than joining live.

Additive and nullable: existing variant and gang-sheet lines are untouched.

Revision ID: 0033_configured_line_items
Revises: 0032_product_options
"""
from alembic import op

revision = "0033_configured_line_items"
down_revision = "0032_product_options"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cart_items  ADD COLUMN IF NOT EXISTS product_id UUID")
    op.execute("ALTER TABLE cart_items  ADD COLUMN IF NOT EXISTS configuration JSONB")
    op.execute("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id UUID")
    op.execute("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS configuration JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE order_items DROP COLUMN IF EXISTS configuration")
    op.execute("ALTER TABLE order_items DROP COLUMN IF EXISTS product_id")
    op.execute("ALTER TABLE cart_items  DROP COLUMN IF EXISTS configuration")
    op.execute("ALTER TABLE cart_items  DROP COLUMN IF EXISTS product_id")
