"""A combination's price for its whole line.

Revision ID: 0066_combo_line_price
Revises: 0065_platform_hold_backfill

product_option_combinations gains `line_price`: the price of the whole line
for a combination that names the product's quantity question ("30 signs,
24x24, front only: $52.11"). Suppliers price every quantity as a total, and a
total divided into a unit price to the cent does not add back up, so the total
is kept as it was given.

Additive and nullable: every existing row keeps pricing exactly as before.
IF NOT EXISTS so a database that already ran it is left as it is.
"""
from alembic import op

revision = "0066_combo_line_price"
down_revision = "0065_platform_hold_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE product_option_combinations ADD COLUMN IF NOT EXISTS line_price NUMERIC(12, 2)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE product_option_combinations DROP COLUMN IF EXISTS line_price")
