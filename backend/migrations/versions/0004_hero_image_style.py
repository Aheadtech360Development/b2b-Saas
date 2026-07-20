"""Hero image styling — corner radius + opacity on tenant_branding.

Revision ID: 0004_hero_image_style
Revises: 0003_contact_submissions
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_hero_image_style"
down_revision = "0003_contact_submissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS hero_image_radius INTEGER DEFAULT 4;
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS hero_image_opacity INTEGER DEFAULT 100;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS hero_image_radius;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS hero_image_opacity;
    """))
