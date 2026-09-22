"""Product templates and product metafields.

A product template decides what goes *around* the standard product
information on the product page — a stripe bar under the title, a guarantee
under the price, a size guide section further down. It never replaces the
standard parts: title, price, variants and add to cart are blocks every
template has, which can be moved but not removed (see
services/product_templates.py).

Each template keeps two layouts. `draft` is what the editor saves; `published`
is what shoppers get, and only changes when somebody presses Publish. A
template that was never published is invisible on the storefront, so a half
built one can be assigned and previewed without anybody seeing it.

`products.template_id` picks a template for one product. NULL means "the
brand's default template", and a brand with no default gets the product page
exactly as it was before templates existed. Deleting a template sets its
products back to NULL rather than failing.

`products.metafields` is a flat key → value object a template can read, so one
template can say something different on every product ("Ships in
{{ product.metafields.ship_days }} days").

Revision ID: 0047_product_templates
Revises: 0046_refunds_disputes
"""
from alembic import op

revision = "0047_product_templates"
down_revision = "0046_refunds_disputes"
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
        CREATE TABLE IF NOT EXISTS product_templates (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID,
            name         VARCHAR(120) NOT NULL,
            -- Used for every product that has no template of its own.
            is_default   BOOLEAN NOT NULL DEFAULT false,
            -- {"blocks": [...], "sections": [...]} as last saved in the editor
            draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- the same shape, as shoppers see it; NULL until first published
            published    JSONB,
            published_at TIMESTAMPTZ,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_templates_tenant ON product_templates(tenant_id)")
    # One default per brand — enforced here, not just in the API.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_product_templates_default
        ON product_templates(tenant_id) WHERE is_default
    """)

    op.execute("ALTER TABLE product_templates ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE product_templates FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON product_templates")
    op.execute(f"CREATE POLICY tenant_isolation ON product_templates USING {_PRED} WITH CHECK {_PRED}")
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON product_templates TO app_rls;
          END IF;
        END $$;
    """)

    op.execute("""
        ALTER TABLE products
          ADD COLUMN IF NOT EXISTS template_id UUID
            REFERENCES product_templates(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS metafields JSONB NOT NULL DEFAULT '{}'::jsonb
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_template ON products(template_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_products_template")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS metafields")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS template_id")
    op.execute("DROP TABLE IF EXISTS product_templates")
