"""Navbar customization — header layout preset + cart icon toggle.

Revision ID: 0006_header_layout
Revises: 0005_tenant_menus
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_header_layout"
down_revision = "0005_tenant_menus"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS header_layout VARCHAR(30) DEFAULT 'logo_left';
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS show_cart BOOLEAN DEFAULT true;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS header_layout;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS show_cart;
    """))
