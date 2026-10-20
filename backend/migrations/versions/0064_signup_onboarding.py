"""The sign-up and onboarding design: a wholesale applicant's trading name, and
the platform's own leads.

Revision ID: 0064_signup_onboarding
Revises: 0060_contact_message_state

wholesale_applications gains `trading_name` (the design's wholesale form asks
for it; companies already have the column, and approving an application now
copies it across).

platform_leads keeps what printcopilot.co's own forms send — a demo request,
a contact message — in our database rather than in an outside CRM, for the
platform console's Leads list. It belongs to no shop, so it has no tenant_id
and no row-level policy, like the partner program's tables.

Both are additive: nothing existing changes. IF NOT EXISTS so a database that
already ran it (a local one) is left as it is.
"""
from alembic import op

revision = "0064_signup_onboarding"
down_revision = "0060_contact_message_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE wholesale_applications ADD COLUMN IF NOT EXISTS trading_name VARCHAR(255)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS platform_leads (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            kind varchar(20) NOT NULL,
            name varchar(160) NOT NULL,
            email varchar(255) NOT NULL,
            data jsonb NOT NULL DEFAULT '{}'::jsonb,
            ip_hash varchar(64),
            handled_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_platform_leads_created ON platform_leads (created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS platform_leads")
    op.execute("ALTER TABLE wholesale_applications DROP COLUMN IF EXISTS trading_name")
