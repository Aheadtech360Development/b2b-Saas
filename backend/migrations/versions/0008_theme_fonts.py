"""Theme typography + active theme — fonts and which starter theme is live.

Revision ID: 0008_theme_fonts
Revises: 0007_home_sections
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_theme_fonts"
down_revision = "0007_home_sections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS font_heading VARCHAR(200);
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS font_body VARCHAR(200);
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS active_theme VARCHAR(50);
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS font_heading;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS font_body;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS active_theme;
    """))
