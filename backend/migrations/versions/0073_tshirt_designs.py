"""T-shirt designer: buyers' designs and their finished files.

Revision ID: 0073_tshirt_designs
Revises: 0072_bulk_order

The t-shirt designer's backend, built like the gang sheet builder's.
`tshirt_designs` is one buyer's design as a job: a reference, the same review
flow as a gang sheet, the whole design document (each shirt's design, sizes,
roster), and every version sent in. `tshirt_design_outputs` is its finished
files, one row per shirt, side and kind: the preview (the garment in its colour
with the design on it) and the print artwork at 300 DPI, kept in ImageKit.

Both tables are tenant-scoped and under row-level security like every other
tenant table (0020, 0039).
"""
from alembic import op

revision = "0073_tshirt_designs"
down_revision = "0072_bulk_order"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tshirt_designs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            reference VARCHAR(40) NOT NULL,
            company_id UUID,
            user_id UUID,
            contact_email VARCHAR(255),
            contact_name VARCHAR(255),
            name VARCHAR(120) NOT NULL DEFAULT 'Untitled design',
            method VARCHAR(20) NOT NULL DEFAULT 'print',
            status VARCHAR(30) NOT NULL DEFAULT 'submitted',
            document JSONB NOT NULL DEFAULT '{}'::jsonb,
            shirt_count INTEGER NOT NULL DEFAULT 0,
            total_qty INTEGER NOT NULL DEFAULT 0,
            quoted_total NUMERIC(10,2) NOT NULL DEFAULT 0,
            customer_notes TEXT,
            supplier_notes TEXT,
            internal_notes TEXT,
            revision_count INTEGER NOT NULL DEFAULT 0,
            version INTEGER NOT NULL DEFAULT 1,
            versions JSONB NOT NULL DEFAULT '[]'::jsonb,
            order_id UUID,
            paid_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_tshirt_designs_tenant ON tshirt_designs(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_tshirt_designs_status ON tshirt_designs(tenant_id, status);
        CREATE INDEX IF NOT EXISTS ix_tshirt_designs_user ON tshirt_designs(tenant_id, user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_tshirt_designs_ref ON tshirt_designs(tenant_id, reference);

        CREATE TABLE IF NOT EXISTS tshirt_design_outputs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            design_id UUID NOT NULL REFERENCES tshirt_designs(id) ON DELETE CASCADE,
            shirt_key VARCHAR(170) NOT NULL,
            view VARCHAR(10) NOT NULL,
            kind VARCHAR(10) NOT NULL,
            file_url VARCHAR(1000) NOT NULL,
            file_id VARCHAR(120),
            file_name VARCHAR(300) NOT NULL,
            width_px INTEGER NOT NULL,
            height_px INTEGER NOT NULL,
            dpi INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_tshirt_design_outputs_design ON tshirt_design_outputs(design_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_tshirt_design_outputs_file
            ON tshirt_design_outputs(design_id, shirt_key, view, kind);
    """)
    for table in ("tshirt_designs", "tshirt_design_outputs"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING {_PRED} WITH CHECK {_PRED}")
        op.execute(f"""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
                GRANT ALL PRIVILEGES ON {table} TO app_rls;
              END IF;
            END $$;
        """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tshirt_design_outputs")
    op.execute("DROP TABLE IF EXISTS tshirt_designs")
