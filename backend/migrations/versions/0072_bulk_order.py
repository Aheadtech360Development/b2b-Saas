"""Products sold in bulk: the wholesale order form on the product page.

Revision ID: 0072_bulk_order
Revises: 0071_loyalty

A blank tee sold by the case is not bought one colour and one size at a time.
`products.bulk_order` switches its page to the bulk order form: colour cards
the buyer picks up to 10 of, and under each a row of sizes with the price, the
stock and a quantity box. `products.bulk_cards` says what those cards show:
"pictures" (the colour's own picture, its swatch when it has none) or
"swatches" (the colour alone).

Every product starts off, so no page changes until a brand switches one on.
"""
from alembic import op

revision = "0072_bulk_order"
down_revision = "0071_loyalty"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS bulk_order boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS bulk_cards varchar(10) NOT NULL DEFAULT 'pictures'")


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS bulk_cards")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS bulk_order")
