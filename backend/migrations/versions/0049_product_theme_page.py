"""Which layout of the theme a product page uses.

A design ships several product layouts — a gang sheet is bought differently
from a tee. This is which of the theme's product pages a product is drawn in;
NULL means the theme's first product layout.

Revision ID: 0049_product_theme_page
Revises: 0048_brand_themes
"""
from alembic import op

revision = "0049_product_theme_page"
down_revision = "0048_brand_themes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS theme_page VARCHAR(60)")


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS theme_page")
