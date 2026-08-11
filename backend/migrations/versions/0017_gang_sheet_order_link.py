"""Link a gang sheet to the paid order.

When a buyer checks out a gang sheet, the review pipeline and the paid order
should stay connected. Adds order_id + paid_at to gang_sheet_orders (nullable —
unpaid drafts simply have neither set).

Revision ID: 0017_gang_sheet_order_link
Revises: 0016_cart_gang_sheet_items
"""
from alembic import op
import sqlalchemy as sa

revision = "0017_gang_sheet_order_link"
down_revision = "0016_cart_gang_sheet_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_orders
            ADD COLUMN IF NOT EXISTS order_id UUID,
            ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_orders
            DROP COLUMN IF EXISTS order_id,
            DROP COLUMN IF EXISTS paid_at;
    """))
