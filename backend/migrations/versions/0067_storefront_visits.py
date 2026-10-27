"""Every visit to a shop, for Home's Sessions and Conversion rate.

Until now a visit was only known once it ended in an order (the visit list the
browser sends with the order, services/attribution). Counting sessions needs
the visits that bought nothing too, so the storefront reports each new visit
once (POST /storefront/visits) and the checkout marks the visit that placed an
order. Conversion rate = visits with an order / all visits, as Shopify counts it.

`id` is the browser's own id for the visit: a visit reported twice is kept once.
Nothing here names a person: when, where from, the first page's path, the kind
of device, and the order it led to.

Revision ID: 0067_storefront_visits
Revises: 0066_combo_line_price
"""
from alembic import op

revision = "0067_storefront_visits"
down_revision = "0066_combo_line_price"
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
        CREATE TABLE IF NOT EXISTS storefront_visits (
            id            UUID PRIMARY KEY,
            tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            kind          VARCHAR(20) NOT NULL,
            source        VARCHAR(120),
            utm_source    VARCHAR(255),
            utm_medium    VARCHAR(255),
            utm_campaign  VARCHAR(255),
            landing_path  VARCHAR(500),
            device        VARCHAR(10),
            order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
            converted_at  TIMESTAMPTZ
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_storefront_visits_tenant_started ON storefront_visits(tenant_id, started_at)"
    )
    op.execute("ALTER TABLE storefront_visits ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE storefront_visits FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON storefront_visits")
    op.execute(f"CREATE POLICY tenant_isolation ON storefront_visits USING {_PRED} WITH CHECK {_PRED}")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS storefront_visits")
