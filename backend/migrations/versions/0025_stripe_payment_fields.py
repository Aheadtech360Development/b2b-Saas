"""Add Stripe Connect + billing fields for the multi-tenant payment system.

Two payment systems are layered onto the existing schema:

  System A — Platform billing (brand -> platform). `tenant_subscriptions`
  already carries stripe_customer_id / stripe_subscription_id / period fields;
  we add stripe_price_id (which tier price is active) and cancel_at_period_end
  (so a scheduled downgrade/cancel is visible before it takes effect).

  System B — Connect payouts (customer -> brand). Each brand onboards a Stripe
  Express connected account; customer charges are Direct charges on that
  account. We record the connected-account id and the three Stripe readiness
  flags (charges/payouts/details) so the admin UI can show onboarding status
  and checkout can refuse to charge a brand that isn't ready.

Idempotent — uses ADD COLUMN IF NOT EXISTS so re-running is safe.

Revision ID: 0025_stripe_payment_fields
Revises: 0024_users_server_defaults
"""
from alembic import op
import sqlalchemy as sa

revision = "0025_stripe_payment_fields"
down_revision = "0024_users_server_defaults"
branch_labels = None
depends_on = None


# table -> list of (column, DDL type + default)
_ADD = {
    "tenants": [
        ("stripe_connect_account_id", "VARCHAR(255)"),
        ("connect_charges_enabled", "BOOLEAN NOT NULL DEFAULT false"),
        ("connect_payouts_enabled", "BOOLEAN NOT NULL DEFAULT false"),
        ("connect_details_submitted", "BOOLEAN NOT NULL DEFAULT false"),
        ("connect_onboarded_at", "TIMESTAMPTZ"),
    ],
    "tenant_subscriptions": [
        ("stripe_price_id", "VARCHAR(255)"),
        ("cancel_at_period_end", "BOOLEAN NOT NULL DEFAULT false"),
    ],
}

_DROP = {
    "tenants": [
        "stripe_connect_account_id",
        "connect_charges_enabled",
        "connect_payouts_enabled",
        "connect_details_submitted",
        "connect_onboarded_at",
    ],
    "tenant_subscriptions": [
        "stripe_price_id",
        "cancel_at_period_end",
    ],
}


def upgrade() -> None:
    bind = op.get_bind()
    for table, cols in _ADD.items():
        for col, ddl in cols:
            bind.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {ddl}"))
    # A connected-account id is looked up on every Direct charge — index it.
    bind.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tenants_stripe_connect_account_id "
        "ON tenants (stripe_connect_account_id)"
    ))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DROP INDEX IF EXISTS ix_tenants_stripe_connect_account_id"))
    for table, cols in _DROP.items():
        for col in cols:
            bind.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {col}"))
