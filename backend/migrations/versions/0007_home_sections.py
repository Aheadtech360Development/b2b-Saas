"""Homepage flexible sections — user-built sections (image+text, gallery,
newsletter, text) rendered on the storefront homepage.

Revision ID: 0007_home_sections
Revises: 0006_header_layout
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_home_sections"
down_revision = "0006_header_layout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS home_sections JSONB NOT NULL DEFAULT '[]'::jsonb;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS home_sections;
    """))
