"""Let a product be ordered with the buyer's own artwork.

Signs, promo material and business cards are printed from a file the buyer
supplies. Which products offer that is the brand's decision, so it is a flag
on the product rather than a guess from its name or its options.

Revision ID: 0051_design_upload
Revises: 0050_theme_source
"""
from alembic import op

revision = "0051_design_upload"
down_revision = "0050_theme_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS "
        "allow_design_upload BOOLEAN NOT NULL DEFAULT FALSE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS allow_design_upload")
