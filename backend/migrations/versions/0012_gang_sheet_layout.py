"""Gang sheet Phase 2 — persisted sheet layout.

Phase 1 captured what to print (artwork + sizes + quantities); Phase 2 adds where
each piece sits on the sheet. The layout is an array of placements, one per
printed instance, stored as JSONB on the order so the whole arrangement saves and
loads in a single row without a join.

Each placement: {artwork_id, x_in, y_in, rotation, w_in, h_in}. Positions are in
inches from the sheet's top-left, matching how the sizes are already stored, so
the canvas and the print file speak the same units.

Revision ID: 0012_gang_sheet_layout
Revises: 0011_gang_sheets
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_gang_sheet_layout"
down_revision = "0011_gang_sheets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_orders
            ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '[]'::jsonb;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE gang_sheet_orders DROP COLUMN IF EXISTS layout;
    """))
