"""Storefront pages — multi-page builder (tenant_pages).

Each tenant can have multiple storefront pages (home, about, contact, custom …),
each built from a JSON array of section blocks.

Revision ID: 0002_tenant_pages
Revises: 0001_baseline
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_tenant_pages"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant_pages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            slug VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            sections JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_published BOOLEAN NOT NULL DEFAULT true,
            show_in_nav BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(tenant_id, slug)
        );
        CREATE INDEX IF NOT EXISTS ix_tenant_pages_tenant ON tenant_pages(tenant_id);
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS tenant_pages CASCADE;"))
