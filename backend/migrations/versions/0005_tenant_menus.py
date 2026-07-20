"""Navigation menus — named, reusable menus (Shopify-style).

Each tenant can create multiple named menus (Main menu, Footer menu, …), each a
JSON array of items. Branding points to which menu is used for the header and
which for the footer.

Revision ID: 0005_tenant_menus
Revises: 0004_hero_image_style
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_tenant_menus"
down_revision = "0004_hero_image_style"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant_menus (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            items JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_tenant_menus_tenant ON tenant_menus(tenant_id);
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS header_menu_id UUID;
        ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS footer_menu_id UUID;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS header_menu_id;
        ALTER TABLE tenant_branding DROP COLUMN IF EXISTS footer_menu_id;
        DROP TABLE IF EXISTS tenant_menus CASCADE;
    """))
