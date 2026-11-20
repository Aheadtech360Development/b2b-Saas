"""A discount group's own percent off the list price.

Discount groups (Customers → Discount groups) only set tag, scope, minimum and
shipping: a Preferred buyer paid list price unless every product had an
override (dev fix list, item 2, 2026-11-20). `discount_percent` gives the
group a percent off on what it applies to; services/group_pricing reads it.

Revision ID: 0080_group_discount_percent
Revises: 0079_upsell_offers
"""
from alembic import op

revision = "0080_group_discount_percent"
down_revision = "0079_upsell_offers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE discount_groups ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2)")


def downgrade() -> None:
    op.execute("ALTER TABLE discount_groups DROP COLUMN IF EXISTS discount_percent")
