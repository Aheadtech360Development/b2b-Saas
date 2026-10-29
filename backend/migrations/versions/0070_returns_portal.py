"""Returns and exchanges portal (Retail launch, package 4).

Built on the returns the shop already has (rma_requests / rma_items), not
beside them: one list, one refund path.

- `rma_status` gains received, refunded, exchanged and closed (pending reads
  as Requested, rejected as Declined). Added outside the migration's
  transaction, as Postgres wants for a new enum value.
- `rma_requests`: kind (return | exchange), refund_method (original |
  store_credit | exchange), channel (account | guest | admin), guest_email,
  refunded_amount, exchange_order_id, store_credit_card_id; submitted_by_id
  may be empty (a guest has no account).
- `rma_items`: replacement_variant_id (an exchange), received_quantity and
  restock (what came back and whether it went back on the shelf).
- `rma_events`: every status change, who made it and their note.

Revision ID: 0070_returns_portal
Revises: 0069_gift_cards
"""
from alembic import op

revision = "0070_returns_portal"
down_revision = "0069_gift_cards"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in ("received", "refunded", "exchanged", "closed"):
            op.execute(f"ALTER TYPE rma_status ADD VALUE IF NOT EXISTS '{value}'")

    op.execute("ALTER TABLE rma_requests ALTER COLUMN submitted_by_id DROP NOT NULL")
    op.execute("""
        ALTER TABLE rma_requests
            ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'return',
            ADD COLUMN IF NOT EXISTS refund_method VARCHAR(20),
            ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'account',
            ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255),
            ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10, 2),
            ADD COLUMN IF NOT EXISTS exchange_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS store_credit_card_id UUID REFERENCES gift_cards(id) ON DELETE SET NULL
    """)
    op.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rma_requests_kind') THEN
            ALTER TABLE rma_requests ADD CONSTRAINT ck_rma_requests_kind CHECK (kind IN ('return', 'exchange'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rma_requests_channel') THEN
            ALTER TABLE rma_requests ADD CONSTRAINT ck_rma_requests_channel
              CHECK (channel IN ('account', 'guest', 'admin'));
          END IF;
        END $$;
    """)
    op.execute("""
        ALTER TABLE rma_items
            ADD COLUMN IF NOT EXISTS replacement_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS received_quantity INTEGER CHECK (received_quantity IS NULL OR received_quantity >= 0),
            ADD COLUMN IF NOT EXISTS restock BOOLEAN
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS rma_events (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE,
            rma_id         UUID NOT NULL REFERENCES rma_requests(id) ON DELETE CASCADE,
            status         VARCHAR(20) NOT NULL,
            actor_kind     VARCHAR(10) NOT NULL CHECK (actor_kind IN ('buyer', 'staff', 'system')),
            actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_name     VARCHAR(255),
            note           VARCHAR(2000),
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_rma_events_rma ON rma_events(rma_id, created_at)")
    op.execute("ALTER TABLE rma_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE rma_events FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON rma_events")
    op.execute(f"CREATE POLICY tenant_isolation ON rma_events USING {_PRED} WITH CHECK {_PRED}")
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON rma_events TO app_rls;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    # Enum values cannot be dropped from a type in Postgres; they stay unused.
    op.execute("DROP TABLE IF EXISTS rma_events")
    op.execute("ALTER TABLE rma_items DROP COLUMN IF EXISTS restock, DROP COLUMN IF EXISTS received_quantity, "
               "DROP COLUMN IF EXISTS replacement_variant_id")
    op.execute("ALTER TABLE rma_requests DROP CONSTRAINT IF EXISTS ck_rma_requests_kind, "
               "DROP CONSTRAINT IF EXISTS ck_rma_requests_channel")
    op.execute("ALTER TABLE rma_requests DROP COLUMN IF EXISTS store_credit_card_id, "
               "DROP COLUMN IF EXISTS exchange_order_id, DROP COLUMN IF EXISTS refunded_amount, "
               "DROP COLUMN IF EXISTS guest_email, DROP COLUMN IF EXISTS channel, "
               "DROP COLUMN IF EXISTS refund_method, DROP COLUMN IF EXISTS kind")
