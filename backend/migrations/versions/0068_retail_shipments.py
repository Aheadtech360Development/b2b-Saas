"""Shipments of their own, for the order tracking page (Retail launch, package 2).

An order carried one tracking number in `orders.tracking_number` (a supplier
order could squeeze several into it, comma separated). The tracking page shows
one timeline per parcel, so a parcel is now a row: its courier, number, link,
where it is (`status`), when it left and arrived, and every change as an event,
from the courier or set by hand. `orders.tracking_*` stay and keep being
written, so nothing that reads them changes.

`next_check_at` is when the tracking loop next asks the courier; NULL once the
parcel is delivered or returned, or too old to chase.

Backfill: one shipment per tracking number already on an order (comma lists
split), delivered if the order is, otherwise in transit and checked soon if it
shipped in the last 7 days. An older one is left to the shop, as before: the
loop would find most of them delivered weeks ago and email the buyer late.

Revision ID: 0068_retail_shipments
Revises: 0067_storefront_visits
"""
from alembic import op

revision = "0068_retail_shipments"
down_revision = "0067_storefront_visits"
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
    op.execute("""
        CREATE TABLE IF NOT EXISTS shipments (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            carrier          VARCHAR(100),
            service          VARCHAR(100),
            tracking_number  VARCHAR(255) NOT NULL,
            tracking_url     TEXT,
            status           VARCHAR(30) NOT NULL DEFAULT 'label_created',
            status_source    VARCHAR(10) NOT NULL DEFAULT 'courier',
            status_detail    VARCHAR(500),
            shipped_at       TIMESTAMPTZ,
            delivered_at     TIMESTAMPTZ,
            last_checked_at  TIMESTAMPTZ,
            next_check_at    TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_shipments_order_number "
               "ON shipments(tenant_id, order_id, tracking_number)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shipments_order ON shipments(order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shipments_due ON shipments(next_check_at) "
               "WHERE next_check_at IS NOT NULL")
    _secure("shipments")

    op.execute("""
        CREATE TABLE IF NOT EXISTS shipment_events (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            shipment_id  UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
            status       VARCHAR(30) NOT NULL,
            source       VARCHAR(10) NOT NULL,
            note         VARCHAR(500),
            occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_shipment_events_shipment ON shipment_events(shipment_id, occurred_at)")
    _secure("shipment_events")

    # The parcels orders already know about.
    op.execute("""
        INSERT INTO shipments (tenant_id, order_id, carrier, service, tracking_number, tracking_url, status,
                               status_source, shipped_at, delivered_at, next_check_at)
        SELECT o.tenant_id, o.id, COALESCE(NULLIF(o.carrier, ''), o.courier), o.courier_service, t.number,
               CASE WHEN t.n = 1 THEN o.tracking_url END,
               CASE WHEN o.status = 'delivered' THEN 'delivered' ELSE 'in_transit' END,
               'courier', COALESCE(o.shipped_at, o.updated_at),
               CASE WHEN o.status = 'delivered' THEN o.updated_at END,
               CASE WHEN o.status NOT IN ('delivered', 'cancelled', 'refunded')
                         AND COALESCE(o.shipped_at, o.updated_at) > now() - interval '7 days' THEN now() END
          FROM orders o
          CROSS JOIN LATERAL (
              SELECT btrim(x) AS number, row_number() OVER () AS n
                FROM unnest(string_to_array(o.tracking_number, ',')) AS x
          ) t
         WHERE o.tenant_id IS NOT NULL AND btrim(coalesce(o.tracking_number, '')) <> '' AND t.number <> ''
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS shipment_events")
    op.execute("DROP TABLE IF EXISTS shipments")
