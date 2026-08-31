"""Add color_hex to product_variants.

The storefront was guessing swatch colours from the colour NAME (a small
name→hex map), so any supplier colour with a fancy name (Antique Cherry Red,
Heather Navy, Sport Grey, …) fell back to grey. Store the real hex the supplier
gives us (S&S `color1`) so the swatch shows the true colour.

Revision ID: 0029_variant_color_hex
Revises: 0028_sku_slug_per_tenant
"""
from alembic import op

revision = "0029_variant_color_hex"
down_revision = "0028_sku_slug_per_tenant"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex VARCHAR(9)")


def downgrade() -> None:
    op.execute("ALTER TABLE product_variants DROP COLUMN IF EXISTS color_hex")
