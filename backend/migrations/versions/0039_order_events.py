"""One row per thing that happened to an order.

The order history lived in `orders.timeline`, a JSONB array that eight
different places rewrote whole: read the array, append, write it back. Two
writers at once — a supplier job finishing while an admin changes the status —
and one of the two entries is simply gone. Worse, the "Order placed" line was
never stored at all; the order page invented it from `created_at`, so the
history shown was partly a guess.

`order_events` is append-only. Recording something is an INSERT, which cannot
lose a concurrent write, and every row carries the real moment it happened plus
who caused it.

Nothing is invented in the backfill. Existing timeline entries move across with
their own timestamps; the four milestones the orders table already dates
(`created_at`, `shipped_at`, `invoice_sent_at`, `marked_paid_at`) are added only
where the timeline has no entry for them. An order with no record of an event
gets no event.

`orders.timeline` is left in place and still written, so every existing reader
keeps working while the new one takes over.

Revision ID: 0039_order_events
Revises: 0038_fix_quoted_defaults
"""
from alembic import op

revision = "0039_order_events"
down_revision = "0038_fix_quoted_defaults"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)

# Old timeline entries carried an order *status*, not an event name. These are
# the statuses that were ever written; anything else becomes a plain note, which
# still shows on the timeline with its message and time.
_TYPE_FROM_STATUS = """
    CASE lower(coalesce(e->>'status', ''))
        WHEN 'confirmed'        THEN 'order_confirmed'
        WHEN 'processing'       THEN 'processing_started'
        WHEN 'ready_for_pickup' THEN 'ready_for_pickup'
        WHEN 'shipped'          THEN 'shipped'
        WHEN 'delivered'        THEN 'delivered'
        WHEN 'cancelled'        THEN 'cancelled'
        WHEN 'refunded'         THEN 'refund_issued'
        WHEN 'paid'             THEN 'payment_received'
        WHEN 'invoice_sent'     THEN 'invoice_sent'
        WHEN 'pending'          THEN 'status_changed'
        ELSE 'note'
    END
"""

# 'system' and 'supplier' name themselves; anything else was a person in the
# admin — usually their real name, sometimes the placeholder "Admin".
_ACTOR_TYPE = """
    CASE lower(coalesce(e->>'created_by', ''))
        WHEN 'system'   THEN 'system'
        WHEN 'supplier' THEN 'supplier'
        WHEN ''         THEN 'system'
        ELSE 'admin'
    END
"""


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS order_events (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID,
            order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            type        VARCHAR(40) NOT NULL,
            message     TEXT NOT NULL,
            actor_type  VARCHAR(20) NOT NULL DEFAULT 'system',
            actor_id    UUID,
            actor_name  VARCHAR(255),
            meta        JSONB,
            -- When it happened, which is not always when we wrote it down: a
            -- carrier's delivery time and a supplier's ship time are theirs.
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_order_events_tenant_id ON order_events(tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_order_events_order_time ON order_events(order_id, occurred_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_order_events_type ON order_events(type)")

    # ── Backfill ────────────────────────────────────────────────────────────
    # Re-runnable: each block skips orders that already have that event, so a
    # half-applied migration can be applied again without doubling the history.

    # Every order was placed, and the orders table has always dated that.
    op.execute("""
        INSERT INTO order_events (tenant_id, order_id, type, message, actor_type, meta, occurred_at, created_at)
        SELECT o.tenant_id, o.id, 'order_created', 'Order placed', 'customer',
               jsonb_build_object('backfilled', true), o.created_at, o.created_at
        FROM orders o
        WHERE NOT EXISTS (
            SELECT 1 FROM order_events x WHERE x.order_id = o.id AND x.type = 'order_created'
        )
    """)

    # The old JSONB history, entry by entry, keeping each entry's own time.
    op.execute(f"""
        INSERT INTO order_events (tenant_id, order_id, type, message, actor_type, actor_name, meta, occurred_at, created_at)
        SELECT o.tenant_id,
               o.id,
               {_TYPE_FROM_STATUS},
               coalesce(nullif(e->>'message', ''), 'Order updated'),
               {_ACTOR_TYPE},
               nullif(e->>'created_by', ''),
               jsonb_build_object('backfilled', true, 'status', e->>'status'),
               coalesce((e->>'created_at')::timestamptz, o.created_at),
               coalesce((e->>'created_at')::timestamptz, o.created_at)
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(o.timeline) = 'array' THEN o.timeline ELSE '[]'::jsonb END
        ) AS e
        WHERE NOT EXISTS (
            SELECT 1 FROM order_events x
            WHERE x.order_id = o.id
              AND x.meta->>'backfilled' = 'true'
              AND x.type <> 'order_created'
        )
    """)

    # Three milestones the orders table dates directly. Added only where the
    # timeline never recorded them — otherwise the timeline entry stands.
    for column, event_type, message in (
        ("shipped_at", "shipped", "Order shipped"),
        ("invoice_sent_at", "invoice_sent", "Invoice sent"),
        ("marked_paid_at", "payment_received", "Payment received"),
    ):
        op.execute(f"""
            INSERT INTO order_events (tenant_id, order_id, type, message, actor_type, meta, occurred_at, created_at)
            SELECT o.tenant_id, o.id, '{event_type}', '{message}', 'admin',
                   jsonb_build_object('backfilled', true, 'from', '{column}'),
                   o.{column}, o.{column}
            FROM orders o
            WHERE o.{column} IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM order_events x WHERE x.order_id = o.id AND x.type = '{event_type}'
              )
        """)

    # ── Tenant isolation, same shape as every other tenant table ────────────
    op.execute("ALTER TABLE order_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE order_events FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON order_events")
    op.execute(f"CREATE POLICY tenant_isolation ON order_events USING {_PRED} WITH CHECK {_PRED}")
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON order_events TO app_rls;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    # orders.timeline was never stopped being written, so dropping this loses
    # only the events recorded after the upgrade.
    op.execute("DROP TABLE IF EXISTS order_events")
