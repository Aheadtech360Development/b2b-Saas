"""The t-shirt designer on a product: switched on per product, like the gang
sheet builder (products.gang_sheet_enabled / gang_sheet_config).

`designer_enabled` puts "Design your own" on the product's page and the
product in the designer, with its own colours, sizes and prices.
`designer_config` is how it is drawn and decorated there: the garment's shape
(tee, long sleeve, tank, muscle) and whether embroidery is offered.

Revision ID: 0077_product_designer
Revises: 0076_tshirt_designs
"""
from alembic import op

revision = "0077_product_designer"
down_revision = "0076_tshirt_designs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS designer_enabled BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS designer_config JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS designer_config")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS designer_enabled")
