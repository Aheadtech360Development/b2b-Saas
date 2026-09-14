"""Store the print check that was run on each artwork file.

The buyer sees the check when they upload; the print team needs the same answer
later, on the review queue, without re-downloading and re-measuring every file.
Keeping the result with the artwork also means a job's history shows what the
file looked like when it was accepted.

Revision ID: 0035_artwork_inspection
Revises: 0034_option_rules
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0035_artwork_inspection"
down_revision = "0034_option_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gang_sheet_artworks",
        sa.Column("inspection", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gang_sheet_artworks", "inspection")
