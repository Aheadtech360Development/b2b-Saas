"""Keep the design file a theme was built from.

The parser improves — it learned to find rows of cards, then navigation. A
theme parsed by an older version misses what the newer one would have found,
and without the original file the only way forward was to ask for it again.
Keeping the file means a theme can be re-read in place.

Revision ID: 0050_theme_source
Revises: 0049_product_theme_page
"""
from alembic import op

revision = "0050_theme_source"
down_revision = "0049_product_theme_page"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE brand_themes ADD COLUMN IF NOT EXISTS source_html TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE brand_themes DROP COLUMN IF EXISTS source_html")
