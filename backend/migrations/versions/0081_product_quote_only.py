"""Products sold by quote.

A quote-only product was a page template with no price and no Add to cart,
and still read "From $0.00" on the grids and "Out of stock" in the admin
(dev fix list, item 14). `quote_only` says it: no price, no cart, a "Request
a quote" button instead.

Revision ID: 0081_product_quote_only
Revises: 0080_group_discount_percent
"""
from alembic import op

revision = "0081_product_quote_only"
down_revision = "0080_group_discount_percent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS quote_only BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS quote_only")
