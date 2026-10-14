"""How long a referral earns its partner commission.

Revision ID: 0062_partner_earn_until
Revises: 0061_partner_program

The program can now limit how long a referred shop earns (Program settings,
earning_months). The end is kept on each referral when it is made, so a later
change to the setting never shortens or stretches a referral that already
exists, and an invoice paid after it earns nothing.

NULL is no end. Every referral made before this, and every one made while
the setting is 0, earns for as long as the shop pays, as they always have.

Nothing existing changes.
"""
from alembic import op

revision = "0062_partner_earn_until"
down_revision = "0061_partner_program"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE partner_referrals ADD COLUMN IF NOT EXISTS earn_until timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE partner_referrals DROP COLUMN IF EXISTS earn_until")
