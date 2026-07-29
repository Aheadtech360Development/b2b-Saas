"""Cart supports gang-sheet line items.

Gang sheets are billable line items that aren't product variants. To let them
ride the existing cart/checkout, cart_items.variant_id becomes nullable and a
few snapshot columns are added: item_type, gang_sheet_order_id, label, image_url.
Existing variant rows are unaffected (item_type defaults to 'variant').

Revision ID: 0016_cart_gang_sheet_items
Revises: 0015_gang_sheet_library
"""
from alembic import op
import sqlalchemy as sa

revision = "0016_cart_gang_sheet_items"
down_revision = "0015_gang_sheet_library"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE cart_items
            ALTER COLUMN variant_id DROP NOT NULL,
            ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'variant',
            ADD COLUMN IF NOT EXISTS gang_sheet_order_id UUID,
            ADD COLUMN IF NOT EXISTS label VARCHAR(300),
            ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000);
    """))


def downgrade() -> None:
    # Leave variant_id nullable on downgrade — restoring NOT NULL would fail if any
    # gang-sheet rows exist. Only drop the added columns.
    op.get_bind().execute(sa.text("""
        ALTER TABLE cart_items
            DROP COLUMN IF EXISTS item_type,
            DROP COLUMN IF EXISTS gang_sheet_order_id,
            DROP COLUMN IF EXISTS label,
            DROP COLUMN IF EXISTS image_url;
    """))
