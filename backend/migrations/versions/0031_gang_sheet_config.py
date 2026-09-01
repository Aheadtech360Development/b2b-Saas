"""Add products.gang_sheet_config (JSONB) for per-product builder config.

Holds type-specific settings — mainly the 'upload_by_size' printer width, max
height, and tiered area-pricing. Additive/nullable, safe.

Revision ID: 0031_gang_sheet_config
Revises: 0030_gang_sheet_products
"""
from alembic import op

revision = "0031_gang_sheet_config"
down_revision = "0030_gang_sheet_products"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS gang_sheet_config JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS gang_sheet_config")
