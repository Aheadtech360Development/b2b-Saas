"""Gang sheet Batch 3 — internal notes, version history.

Adds supplier-private notes and a preserved history of every submission so a
resubmit after a revision never overwrites the previous artwork + layout — the
supplier can compare versions.

- internal_notes: supplier-only, never returned to the buyer.
- version: current submission number (starts at 1).
- versions: JSONB array of snapshots [{version, created_at, artworks, layout}].

The `production` status introduced this batch needs no migration — status is a
free-text VARCHAR, so only the app's allowed-set changes.

Revision ID: 0013_gang_sheet_versions
Revises: 0012_gang_sheet_layout
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_gang_sheet_versions"
down_revision = "0012_gang_sheet_layout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_orders
            ADD COLUMN IF NOT EXISTS internal_notes TEXT,
            ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS versions JSONB NOT NULL DEFAULT '[]'::jsonb;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_orders
            DROP COLUMN IF EXISTS internal_notes,
            DROP COLUMN IF EXISTS version,
            DROP COLUMN IF EXISTS versions;
    """))
