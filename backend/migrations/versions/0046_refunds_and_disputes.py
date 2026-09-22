"""Refunds get their own record, and a dispute remembers how it ended.

Two problems.

A refund left no trace. The order's payment_status flipped and that was all,
so "how much of this order came back, and who sent it back" had no answer —
and `charge.refunded` fires for a *partial* refund too, which meant refunding
five dollars of a hundred-dollar order marked the whole thing refunded and
cancelled. That is the bug this table exists to make impossible: the amount is
recorded, and the order's status is worked out from the total refunded rather
than from the arrival of an event.

Disputes were recorded but not their ending. A chargeback that the brand won
looked exactly like one they lost, and the money actually leaving and coming
back was nowhere.

Both tables are written from Stripe webhooks, which are signature-verified, and
from the admin action that asked for the refund. Neither trusts anything the
browser sends.

Revision ID: 0046_refunds_disputes
Revises: 0045_google_reviews
"""
from alembic import op

revision = "0046_refunds_disputes"
down_revision = "0045_google_reviews"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)


def upgrade() -> None:
    # ── Refunds ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS payment_refunds (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID,
            order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
            -- Stripe's id is the unique one: the same refund arrives from the
            -- admin action that made it and again from the webhook, and both
            -- must land on one row.
            stripe_refund_id         VARCHAR(255) UNIQUE,
            stripe_charge_id         VARCHAR(255),
            stripe_payment_intent_id VARCHAR(255),
            amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
            currency    VARCHAR(3) NOT NULL DEFAULT 'usd',
            reason      VARCHAR(100),
            -- pending | succeeded | failed | canceled, as Stripe reports it.
            status      VARCHAR(30) NOT NULL DEFAULT 'pending',
            -- 'admin' (somebody pressed refund here) or 'stripe' (it happened
            -- in the Stripe dashboard and reached us by webhook). Worth
            -- keeping: they are different conversations to have.
            source      VARCHAR(20) NOT NULL DEFAULT 'admin',
            initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
            initiated_by_name VARCHAR(255),
            note        TEXT,
            failure_reason TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_refunds_tenant ON payment_refunds(tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_refunds_order ON payment_refunds(order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_refunds_pi ON payment_refunds(stripe_payment_intent_id)")

    # How much of this order has come back. Kept on the order so the list can
    # show it without joining, and so "is this fully refunded?" is arithmetic
    # rather than a guess about which event arrived.
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_refunded NUMERIC(10, 2) NOT NULL DEFAULT 0")

    # ── Disputes: how it ended, and where the money went ───────────────────
    for column, ddl in (
        ("network_reason", "VARCHAR(120)"),
        # won | lost | warning_closed | charge_refunded — Stripe's own outcome.
        ("outcome", "VARCHAR(40)"),
        ("evidence_submitted_at", "TIMESTAMPTZ"),
        ("closed_at", "TIMESTAMPTZ"),
        # The money actually leaving and, if the brand wins, coming back.
        ("funds_withdrawn_at", "TIMESTAMPTZ"),
        ("funds_reinstated_at", "TIMESTAMPTZ"),
        ("is_charge_refundable", "BOOLEAN"),
        ("note", "TEXT"),
    ):
        op.execute(f"ALTER TABLE disputes ADD COLUMN IF NOT EXISTS {column} {ddl}")

    op.execute("CREATE INDEX IF NOT EXISTS ix_disputes_status ON disputes(status)")

    # ── Tenant isolation ───────────────────────────────────────────────────
    # `disputes` predates row-level security here and was scoped by hand in the
    # service. Adding the policy means a query that forgets to scope returns
    # nothing rather than another brand's chargebacks.
    for table in ("payment_refunds", "disputes"):
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

    # Orders already marked refunded before this existed keep saying so, and
    # their refunded amount is taken as the whole total — which is what
    # "refunded" meant when it was written.
    op.execute("""
        UPDATE orders SET amount_refunded = COALESCE(total, 0)
        WHERE payment_status = 'refunded' AND amount_refunded = 0
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payment_refunds")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS amount_refunded")
    op.execute("DROP INDEX IF EXISTS ix_disputes_status")
    for column in ("note", "is_charge_refundable", "funds_reinstated_at", "funds_withdrawn_at",
                   "closed_at", "evidence_submitted_at", "outcome", "network_reason"):
        op.execute(f"ALTER TABLE disputes DROP COLUMN IF EXISTS {column}")
