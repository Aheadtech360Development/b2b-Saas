"""Shops the platform closed by hand before it kept a record of it.

Revision ID: 0065_platform_hold_backfill
Revises: 0064_signup_onboarding

From this release, closing a shop in the Platform Console writes a hold (the
brand setting platform_hold, services/brand_status): a Stripe event cannot
reopen a held shop, and its people cannot sign in until the platform opens it
again. A shop closed for its plan has no hold, and its staff can sign in to pay.

Shops closed before this release have no hold, so they are given one here:
every cancelled shop (only the console ever cancels), and every suspended shop
whose plan has not lapsed in Stripe (Stripe only closes a shop when its
subscription is canceled, unpaid or incomplete_expired, so any other suspended
shop was closed by hand). Existing holds are left alone.
"""
from alembic import op

revision = "0065_platform_hold_backfill"
down_revision = "0064_signup_onboarding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Every brand's rows, whatever the session's tenant setting.
    op.execute("SELECT set_config('app.bypass_rls', 'on', true)")
    op.execute(
        """
        INSERT INTO settings (id, key, value, created_at, updated_at)
        SELECT gen_random_uuid(),
               'platform_hold@' || t.id::text,
               json_build_object(
                   'status', t.status,
                   'by', NULL,
                   'reason', 'Closed in the console before the reason was kept',
                   'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')
               )::text,
               now(), now()
          FROM tenants t
          LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id
         WHERE t.status = 'cancelled'
            OR (t.status = 'suspended'
                AND COALESCE(s.status, '') NOT IN ('canceled', 'unpaid', 'incomplete_expired'))
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    # Only the rows this wrote: the ones with its reason.
    op.execute("SELECT set_config('app.bypass_rls', 'on', true)")
    op.execute(
        """
        DELETE FROM settings
         WHERE key LIKE 'platform_hold@%'
           AND value LIKE '%Closed in the console before the reason was kept%'
        """
    )
