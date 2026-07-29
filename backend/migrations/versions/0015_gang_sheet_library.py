"""Gang sheet design library.

A store-curated set of ready-made designs buyers can drop straight onto a sheet
in the builder's "Designs" tab. Tenant-scoped like the rest of the gang sheet
tables, so each brand manages its own library.

Revision ID: 0015_gang_sheet_library
Revises: 0014_gang_sheet_custom_length
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_gang_sheet_library"
down_revision = "0014_gang_sheet_custom_length"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS gang_sheet_library_designs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(300) NOT NULL,
            file_url VARCHAR(1000) NOT NULL,
            file_type VARCHAR(20),
            category VARCHAR(120),
            is_active BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))
    op.get_bind().execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_gang_sheet_library_tenant ON gang_sheet_library_designs(tenant_id);"
    ))


def downgrade() -> None:
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS gang_sheet_library_designs;"))
