"""Whether a product counts its stock.

Revision ID: 0063_product_track_inventory
Revises: 0062_partner_earn_until

Until now whether stock was counted was inferred: a variant with stock records
was limited by them, one without was sold without a limit. The admin showed
both as a number, "0" for the one with no records, so a brand saw stock 0 and
orders still coming in, and had no switch to say which products it counts.

products.track_inventory is that switch. Every product that has any stock
record today is switched on, so nothing that is limited now starts selling
without a limit. Every other product is off, and goes on selling as it does.
"""
from alembic import op

revision = "0063_product_track_inventory"
down_revision = "0062_partner_earn_until"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory boolean NOT NULL DEFAULT false")
    # Every brand's rows, whatever the session's tenant setting.
    op.execute("SELECT set_config('app.bypass_rls', 'on', true)")
    op.execute(
        """
        UPDATE products p SET track_inventory = true
         WHERE EXISTS (
                SELECT 1 FROM product_variants v
                  JOIN inventory i ON i.variant_id = v.id
                 WHERE v.product_id = p.id
         )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS track_inventory")
