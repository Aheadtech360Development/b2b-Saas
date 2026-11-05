"""What a brand's Stripe subscription bills a month.

The console can change a plan's price (services/plan_prices); a brand already
paying keeps the Stripe Price it started on. So "the plan's price" stops being
"what this brand pays", and the console's revenue would count the new price
for brands still on the old one. This keeps the amount Stripe bills with the
subscription, written on each sync from Stripe.

Revision ID: 0075_subscription_amount
Revises: 0074_source_costs
"""
from alembic import op

revision = "0075_subscription_amount"
down_revision = "0074_source_costs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS amount_cents INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE tenant_subscriptions DROP COLUMN IF EXISTS amount_cents")
