"""Supplier links on products, and the purchase orders sent to suppliers.

`products.supplier` / `supplier_ref` say which supplier style a product was
imported from. Until now the only trace was `product_code`, which a brand can
also type by hand, so a sync could not tell "S&S stopped selling this" apart
from "this was never an S&S product".

`supplier_orders` is one row per store order per supplier PO attempt. The row
is written with status 'sending' BEFORE the supplier is called, and a partial
unique index allows only one live row per order and supplier — so two web
workers, or a retry racing a scheduled run, can never send the same order twice.

Revision ID: 0036_supplier_orders
Revises: 0035_artwork_inspection
"""
from alembic import op

revision = "0036_supplier_orders"
down_revision = "0035_artwork_inspection"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier VARCHAR(40)")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_ref VARCHAR(100)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_supplier ON products(supplier, supplier_ref)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_orders (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID,
            order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            supplier         VARCHAR(40) NOT NULL,
            batch_id         UUID,
            status           VARCHAR(20) NOT NULL DEFAULT 'sending',
            test             BOOLEAN NOT NULL DEFAULT false,
            trigger          VARCHAR(20) NOT NULL DEFAULT 'manual',
            po_number        VARCHAR(100),
            supplier_order_numbers VARCHAR(500),
            lines            JSONB,
            request          JSONB,
            response         JSONB,
            error            TEXT,
            tracking_number  VARCHAR(255),
            carrier          VARCHAR(100),
            shipped_at       TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_orders_tenant_id ON supplier_orders(tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_orders_order_id ON supplier_orders(order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_orders_status ON supplier_orders(status)")
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_orders_live
        ON supplier_orders(order_id, supplier)
        WHERE status IN ('sending', 'placed', 'shipped')
    """)
    op.execute("ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE supplier_orders FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON supplier_orders")
    op.execute(f"CREATE POLICY tenant_isolation ON supplier_orders USING {_PRED} WITH CHECK {_PRED}")
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON supplier_orders TO app_rls;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS supplier_orders")
    op.execute("DROP INDEX IF EXISTS ix_products_supplier")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS supplier_ref")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS supplier")
