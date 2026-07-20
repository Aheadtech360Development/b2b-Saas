"""Theme style knobs — what makes themes actually *look* different beyond colors.

card_style      : how product/category cards are drawn (elevated | bordered | flat)
button_radius   : 0 = square, 6 = soft, 999 = pill
corner_radius   : general roundness for images/cards
section_spacing : compact | normal | spacious

Revision ID: 0009_theme_style
Revises: 0008_theme_fonts
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_theme_style"
down_revision = "0008_theme_fonts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS card_style VARCHAR(20) DEFAULT 'bordered';
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS button_radius INTEGER DEFAULT 4;
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS corner_radius INTEGER DEFAULT 6;
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS section_spacing VARCHAR(20) DEFAULT 'normal';
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS card_style;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS button_radius;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS corner_radius;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS section_spacing;
    """))
