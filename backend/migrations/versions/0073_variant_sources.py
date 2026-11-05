"""One product, several sources: own stock plus S&S and SanMar under one style.

Until now every supplier style became its own product, so the same blank from
the shop's own shelves, S&S and SanMar showed three times. Now a colour/size
of any of the shop's own products can carry a source per supplier:

* `variant_sources`: which supplier SKU it is at that supplier, the supplier's
  style (for syncing) and what it costs there. One row per variant and supplier.
* `warehouses.supplier`: a supplier's stock for those variants is kept in a
  location of its own (one per supplier), never in one of the shop's own, so
  a sync can never overwrite stock the shop counted itself. A shop's own
  locations stay NULL.
* `order_item_sources`: at checkout, how much of a line came from a
  supplier's stock — what that supplier is then asked to send.

Products imported from a supplier before this keep working exactly as they
did: nothing here touches them.

Revision ID: 0073_variant_sources
Revises: 0072_bulk_order
"""
from alembic import op

revision = "0073_variant_sources"
down_revision = "0072_bulk_order"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)


def _secure(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
    op.execute(f"CREATE POLICY tenant_isolation ON {table} USING {_PRED} WITH CHECK {_PRED}")


def upgrade() -> None:
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS supplier VARCHAR(40)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_tenant_supplier "
               "ON warehouses(tenant_id, supplier) WHERE supplier IS NOT NULL")

    op.execute("""
        CREATE TABLE IF NOT EXISTS variant_sources (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            variant_id    UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
            supplier      VARCHAR(40) NOT NULL,
            supplier_sku  VARCHAR(100) NOT NULL,
            style_ref     VARCHAR(100) NOT NULL,
            part_number   VARCHAR(100),
            gtin          VARCHAR(40),
            cost          NUMERIC(10, 2),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_sources_variant "
               "ON variant_sources(variant_id, supplier)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_sources_sku "
               "ON variant_sources(tenant_id, supplier, supplier_sku)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_variant_sources_style "
               "ON variant_sources(tenant_id, supplier, style_ref)")
    _secure("variant_sources")

    op.execute("""
        CREATE TABLE IF NOT EXISTS order_item_sources (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            order_item_id  UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
            variant_id     UUID REFERENCES product_variants(id) ON DELETE SET NULL,
            supplier       VARCHAR(40) NOT NULL,
            quantity       INTEGER NOT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_order_item_sources_order ON order_item_sources(order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_order_item_sources_item ON order_item_sources(order_item_id)")
    _secure("order_item_sources")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS order_item_sources")
    op.execute("DROP TABLE IF EXISTS variant_sources")
    op.execute("DROP INDEX IF EXISTS uq_warehouses_tenant_supplier")
    op.execute("ALTER TABLE warehouses DROP COLUMN IF EXISTS supplier")
