"""Stock for every kind of product, and a switch to track it.

Revision ID: 0063_stock_for_every_product
Revises: 0062_partner_earn_until

Until now only blanks (colour x size variants) had stock, and a variant that
had never been given a number sold without limit while the admin showed it as
"0 in stock". Gang sheets and configurable products (yard signs and the like)
had no stock at all.

* products.track_inventory: whether a blank's variant stock is enforced. On,
  a variant with no stock entered is sold out, which is what the admin has
  always shown it as. Off, it sells without limit and the admin says
  "Not tracked". On for every product.
* products.stock: units on hand for a product sold without variants, such as
  an upload-by-size gang sheet. NULL is no limit.
* gang_sheet_sizes.stock: sheets on hand for one size. NULL is no limit.
* product_option_values.stock: units on hand for one choice, such as a yard
  sign size. NULL is no limit.

Every new count starts NULL, so gang sheets and configurable products sell
exactly as before until the brand types a number in.
"""
from alembic import op

revision = "0063_stock_for_every_product"
down_revision = "0062_partner_earn_until"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory boolean NOT NULL DEFAULT true")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock integer")
    op.execute("ALTER TABLE gang_sheet_sizes ADD COLUMN IF NOT EXISTS stock integer")
    op.execute("ALTER TABLE product_option_values ADD COLUMN IF NOT EXISTS stock integer")


def downgrade() -> None:
    op.execute("ALTER TABLE product_option_values DROP COLUMN IF EXISTS stock")
    op.execute("ALTER TABLE gang_sheet_sizes DROP COLUMN IF EXISTS stock")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS stock")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS track_inventory")
