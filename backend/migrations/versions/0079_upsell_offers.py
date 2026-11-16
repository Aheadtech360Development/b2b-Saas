"""Cart upsells: offers a shop makes in its cart, and the lines they put there.

Revision ID: 0079_upsell_offers
Revises: 0078_builder_site_unique

`upsell_offers` is one offer: which product it puts in front of the buyer,
when (any cart, a cart holding certain products or collections, a subtotal in
a range), and at what price (as it is, or a percentage or an amount off).
A cart line and an order line added from an offer carry its id, so the price
can be worked out again on the server at every step and the shop can see
what each offer sold.

Tenant-scoped and under row-level security like every other tenant table.
"""
from alembic import op

revision = "0079_upsell_offers"
down_revision = "0078_builder_site_unique"
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
        CREATE TABLE IF NOT EXISTS upsell_offers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            priority INTEGER NOT NULL DEFAULT 0,
            product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
            headline VARCHAR(120),
            description VARCHAR(200),
            discount_type VARCHAR(10) NOT NULL DEFAULT 'none',
            discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
            trigger_kind VARCHAR(12) NOT NULL DEFAULT 'any',
            trigger_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            min_subtotal NUMERIC(10,2),
            max_subtotal NUMERIC(10,2),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_upsell_offers_tenant ON upsell_offers(tenant_id, is_active);

        ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS upsell_offer_id UUID
            REFERENCES upsell_offers(id) ON DELETE SET NULL;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS upsell_offer_id UUID
            REFERENCES upsell_offers(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS ix_order_items_upsell ON order_items(upsell_offer_id)
            WHERE upsell_offer_id IS NOT NULL;
    """)
    op.execute("ALTER TABLE upsell_offers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE upsell_offers FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON upsell_offers")
    op.execute(f"CREATE POLICY tenant_isolation ON upsell_offers USING {_PRED} WITH CHECK {_PRED}")
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON upsell_offers TO app_rls;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_order_items_upsell")
    op.execute("ALTER TABLE order_items DROP COLUMN IF EXISTS upsell_offer_id")
    op.execute("ALTER TABLE cart_items DROP COLUMN IF EXISTS upsell_offer_id")
    op.execute("DROP TABLE IF EXISTS upsell_offers")
