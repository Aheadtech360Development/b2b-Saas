"""Loyalty points and buyer referrals (Retail launch, package 5).

- `loyalty_accounts`: one per buyer and shop; `balance` (never below zero) is
  kept in the same transaction as every ledger row; `referral_code` is what
  the buyer shares (?bref=CODE), unique per shop.
- `loyalty_ledger`: every change, signed, with the balance after it. Rows
  that add points carry `remaining` (spent oldest first, so expiry is exact)
  and `expires_at`; `idempotency_key` (unique per shop) makes a retried earn,
  reversal, redemption or reward write nothing twice.
- `buyer_referrals`: who referred whom, and whether it was rewarded or
  blocked (self referral) with why. Separate from the partner (affiliate)
  program in code, data and screens.
- `discount_codes.owner_user_id`: a reward code works only for the buyer who
  redeemed points for it.

Revision ID: 0071_loyalty
Revises: 0070_returns_portal
"""
from alembic import op

revision = "0071_loyalty"
down_revision = "0070_returns_portal"
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
        CREATE TABLE IF NOT EXISTS loyalty_accounts (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
            lifetime_earned  INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
            referral_code    VARCHAR(16) NOT NULL,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_accounts_user ON loyalty_accounts(tenant_id, user_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_accounts_code ON loyalty_accounts(tenant_id, referral_code)")
    _secure("loyalty_accounts")

    op.execute("""
        CREATE TABLE IF NOT EXISTS loyalty_ledger (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            account_id          UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
            kind                VARCHAR(20) NOT NULL
                                CHECK (kind IN ('earn', 'reverse', 'redeem', 'referral', 'adjust', 'expire', 'restore')),
            points              INTEGER NOT NULL,
            remaining           INTEGER CHECK (remaining IS NULL OR remaining >= 0),
            balance_after       INTEGER NOT NULL CHECK (balance_after >= 0),
            expires_at          TIMESTAMPTZ,
            expiry_notified_at  TIMESTAMPTZ,
            order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
            discount_code_id    UUID REFERENCES discount_codes(id) ON DELETE SET NULL,
            actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_name          VARCHAR(255),
            reason              VARCHAR(300),
            idempotency_key     VARCHAR(150) NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_ledger_key ON loyalty_ledger(tenant_id, idempotency_key)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_ledger_account ON loyalty_ledger(account_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_ledger_order ON loyalty_ledger(order_id) WHERE order_id IS NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_ledger_open ON loyalty_ledger(expires_at) "
               "WHERE remaining > 0 AND expires_at IS NOT NULL")
    _secure("loyalty_ledger")

    op.execute("""
        CREATE TABLE IF NOT EXISTS buyer_referrals (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            referrer_account_id  UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
            referred_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
            referred_email       VARCHAR(255),
            status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'qualified', 'rewarded', 'blocked')),
            block_reason         VARCHAR(300),
            first_order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
            rewarded_at          TIMESTAMPTZ,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_buyer_referrals_friend ON buyer_referrals(tenant_id, referred_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_buyer_referrals_open ON buyer_referrals(status) WHERE status = 'pending'")
    _secure("buyer_referrals")

    op.execute("ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE")


def downgrade() -> None:
    op.execute("ALTER TABLE discount_codes DROP COLUMN IF EXISTS owner_user_id")
    op.execute("DROP TABLE IF EXISTS buyer_referrals")
    op.execute("DROP TABLE IF EXISTS loyalty_ledger")
    op.execute("DROP TABLE IF EXISTS loyalty_accounts")
