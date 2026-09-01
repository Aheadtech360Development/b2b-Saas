"""Per-product gang-sheet builders.

Adds:
  - products.gang_sheet_type  — 'gang_sheet' | 'upload_by_size' (NULL until set)
  - gang_sheet_sizes.product_id — which product a size row belongs to
    (NULL = the brand's global default set, backward-compatible).

This lets each product carry its own builder type + its own sizes/prices,
matching the reference "Products" model, without breaking existing sizes.

Revision ID: 0030_gang_sheet_products
Revises: 0029_variant_color_hex
"""
from alembic import op

revision = "0030_gang_sheet_products"
down_revision = "0029_variant_color_hex"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS gang_sheet_type VARCHAR(30)")
    op.execute("ALTER TABLE gang_sheet_sizes ADD COLUMN IF NOT EXISTS product_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gang_sheet_sizes_product_id ON gang_sheet_sizes (product_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_gang_sheet_sizes_product_id")
    op.execute("ALTER TABLE gang_sheet_sizes DROP COLUMN IF EXISTS product_id")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS gang_sheet_type")
