"""Gang sheet custom-length pricing.

Beyond fixed sheet sizes, a size can be a "custom length" offering: the width is
fixed (e.g. 22") and the buyer chooses any length between a min and max, priced
per inch. This is the standard flexible option on US DTF stores.

New columns on gang_sheet_sizes:
- pricing_mode: 'fixed' (current behaviour) or 'custom_length'.
- price_per_inch: rate used when custom_length (× chosen length = sheet price).
- min_length_in / max_length_in: bounds the buyer's length choice.
- max_upload_mb: optional per-size artwork upload cap (advisory).

Fixed sizes are unaffected: pricing_mode defaults to 'fixed'.

Revision ID: 0014_gang_sheet_custom_length
Revises: 0013_gang_sheet_versions
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_gang_sheet_custom_length"
down_revision = "0013_gang_sheet_versions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_sizes
            ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) NOT NULL DEFAULT 'fixed',
            ADD COLUMN IF NOT EXISTS price_per_inch NUMERIC(10,4) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS min_length_in NUMERIC(8,2) NOT NULL DEFAULT 12,
            ADD COLUMN IF NOT EXISTS max_length_in NUMERIC(8,2) NOT NULL DEFAULT 240,
            ADD COLUMN IF NOT EXISTS max_upload_mb INTEGER;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_sizes
            DROP COLUMN IF EXISTS pricing_mode,
            DROP COLUMN IF EXISTS price_per_inch,
            DROP COLUMN IF EXISTS min_length_in,
            DROP COLUMN IF EXISTS max_length_in,
            DROP COLUMN IF EXISTS max_upload_mb;
    """))
