"""Gift cards (Retail launch, package 3).

A gift card is money the shop owes its holder, so every movement is a ledger
row and the balance is what the rows add up to:

- `gift_cards`: one card. The code is never stored: only the SHA-256 of the
  shop and the normalised code (`code_hash`, unique per shop) and its last 4
  characters for showing it masked. `balance` cannot go below zero.
- `gift_card_holds`: what a checkout has set aside on a card while the buyer
  pays the rest by card. Taken off the balance at once (under a row lock), so
  two checkouts cannot spend the same money; captured when the order is made,
  given back when the payment fails or the hold runs out (the 5 minute loop).
- `gift_card_ledger`: every change, signed, with the balance after it, the
  order, the hold, who did it and why. `idempotency_key` (unique per shop)
  makes a retried capture, refund or issue write nothing twice.

Revision ID: 0069_gift_cards
Revises: 0068_retail_shipments
"""
from alembic import op

revision = "0069_gift_cards"
down_revision = "0068_retail_shipments"
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
    op.execute(f"""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON {table} TO app_rls;
          END IF;
        END $$;
    """)


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS gift_cards (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            code_hash           VARCHAR(64) NOT NULL,
            code_last4          VARCHAR(4) NOT NULL,
            initial_amount      NUMERIC(10, 2) NOT NULL CHECK (initial_amount > 0),
            balance             NUMERIC(10, 2) NOT NULL CHECK (balance >= 0),
            currency            VARCHAR(3) NOT NULL DEFAULT 'usd',
            status              VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'disabled', 'voided', 'expired')),
            expires_at          TIMESTAMPTZ,
            source              VARCHAR(20) NOT NULL
                                CHECK (source IN ('purchase', 'manual', 'store_credit')),
            purchase_order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
            buyer_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
            buyer_email         VARCHAR(255),
            recipient_name      VARCHAR(120),
            recipient_email     VARCHAR(255),
            message             VARCHAR(500),
            sender_name         VARCHAR(120),
            delivered_at        TIMESTAMPTZ,
            created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
            status_reason       VARCHAR(300),
            note                VARCHAR(500),
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_gift_cards_code ON gift_cards(tenant_id, code_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_cards_list ON gift_cards(tenant_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_cards_order ON gift_cards(purchase_order_id) "
               "WHERE purchase_order_id IS NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_cards_expiry ON gift_cards(expires_at) "
               "WHERE expires_at IS NOT NULL AND status = 'active'")
    _secure("gift_cards")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gift_card_holds (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            gift_card_id       UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
            checkout_ref       VARCHAR(100) NOT NULL,
            payment_intent_id  VARCHAR(100),
            order_id           UUID REFERENCES orders(id) ON DELETE SET NULL,
            amount             NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
            status             VARCHAR(20) NOT NULL DEFAULT 'held'
                               CHECK (status IN ('held', 'captured', 'released')),
            expires_at         TIMESTAMPTZ NOT NULL,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_card_holds_ref ON gift_card_holds(tenant_id, checkout_ref)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_card_holds_card ON gift_card_holds(gift_card_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_card_holds_due ON gift_card_holds(expires_at) "
               "WHERE status = 'held'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_card_holds_order ON gift_card_holds(order_id) "
               "WHERE order_id IS NOT NULL")
    _secure("gift_card_holds")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gift_card_ledger (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            gift_card_id     UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
            kind             VARCHAR(20) NOT NULL
                             CHECK (kind IN ('issue', 'hold', 'release', 'capture', 'refund',
                                             'adjust', 'void', 'expire')),
            amount           NUMERIC(10, 2) NOT NULL,
            balance_after    NUMERIC(10, 2) NOT NULL CHECK (balance_after >= 0),
            order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
            hold_id          UUID REFERENCES gift_card_holds(id) ON DELETE SET NULL,
            actor_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_name       VARCHAR(255),
            reason           VARCHAR(300),
            idempotency_key  VARCHAR(150) NOT NULL,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_gift_card_ledger_key "
               "ON gift_card_ledger(tenant_id, idempotency_key)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_card_ledger_card ON gift_card_ledger(gift_card_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_card_ledger_order ON gift_card_ledger(order_id) "
               "WHERE order_id IS NOT NULL")
    _secure("gift_card_ledger")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS gift_card_ledger")
    op.execute("DROP TABLE IF EXISTS gift_card_holds")
    op.execute("DROP TABLE IF EXISTS gift_cards")
