"""Gang sheet builder — sheet sizes, orders, artwork files.

Phase 1 of the gang sheet module: a buyer uploads artwork with per-file
dimensions and quantities, picks a supplier-configured sheet size, and submits a
structured order the supplier reviews and approves (or sends back for revision).
Layout/nesting is deliberately out of scope here.

Everything is tenant-scoped: sheet sizes are each brand's own catalogue, and one
brand must never see another's artwork or orders.

Revision ID: 0011_gang_sheets
Revises: 0010_content_tables
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_gang_sheets"
down_revision = "0010_content_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        -- Supplier-configured sheet sizes. price_per_sheet is the Phase 1
        -- pricing input; area is stored so later phases can price by usage.
        CREATE TABLE IF NOT EXISTS gang_sheet_sizes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL,
            width_in NUMERIC(8,2) NOT NULL,
            height_in NUMERIC(8,2) NOT NULL,
            price_per_sheet NUMERIC(10,2) NOT NULL DEFAULT 0,
            bleed_in NUMERIC(6,2) NOT NULL DEFAULT 0.125,
            spacing_in NUMERIC(6,2) NOT NULL DEFAULT 0.125,
            is_active BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_gang_sheet_sizes_tenant ON gang_sheet_sizes(tenant_id);

        -- One submitted gang sheet job. Sheet dimensions and price are snapshotted
        -- so a later change to the size catalogue cannot rewrite historical orders.
        CREATE TABLE IF NOT EXISTS gang_sheet_orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            reference VARCHAR(40) NOT NULL,
            company_id UUID,
            user_id UUID,
            contact_email VARCHAR(255),
            contact_name VARCHAR(255),
            product_id UUID,
            sheet_size_id UUID,
            sheet_name VARCHAR(120) NOT NULL,
            sheet_width_in NUMERIC(8,2) NOT NULL,
            sheet_height_in NUMERIC(8,2) NOT NULL,
            price_per_sheet NUMERIC(10,2) NOT NULL DEFAULT 0,
            sheet_quantity INTEGER NOT NULL DEFAULT 1,
            subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
            status VARCHAR(30) NOT NULL DEFAULT 'submitted',
            customer_notes TEXT,
            supplier_notes TEXT,
            revision_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_gang_sheet_orders_tenant ON gang_sheet_orders(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_gang_sheet_orders_status ON gang_sheet_orders(tenant_id, status);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_gang_sheet_orders_ref ON gang_sheet_orders(tenant_id, reference);

        -- Artwork files belonging to a job, with the buyer's stated print size.
        CREATE TABLE IF NOT EXISTS gang_sheet_artworks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            gang_sheet_order_id UUID NOT NULL REFERENCES gang_sheet_orders(id) ON DELETE CASCADE,
            file_url VARCHAR(1000) NOT NULL,
            file_name VARCHAR(300) NOT NULL,
            file_type VARCHAR(20),
            width_in NUMERIC(8,2) NOT NULL,
            height_in NUMERIC(8,2) NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_gang_sheet_artworks_order ON gang_sheet_artworks(gang_sheet_order_id);
        CREATE INDEX IF NOT EXISTS ix_gang_sheet_artworks_tenant ON gang_sheet_artworks(tenant_id);

        -- Opt-in per product: only products flagged here expose the builder.
        ALTER TABLE products ADD COLUMN IF NOT EXISTS gang_sheet_enabled BOOLEAN NOT NULL DEFAULT false;
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        ALTER TABLE products DROP COLUMN IF EXISTS gang_sheet_enabled;
        DROP TABLE IF EXISTS gang_sheet_artworks;
        DROP TABLE IF EXISTS gang_sheet_orders;
        DROP TABLE IF EXISTS gang_sheet_sizes;
    """))
