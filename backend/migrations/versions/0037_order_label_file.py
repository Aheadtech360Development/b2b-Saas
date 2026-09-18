"""Keep the label file itself on the order.

UPS and USPS answer a label purchase with the image, not a link (FedEx links
expire). With nowhere to keep it, the order page had no label to print and read
the order as unlabelled — inviting a second, paid label for the same parcel.

Revision ID: 0037_order_label_file
Revises: 0036_supplier_orders
"""
from alembic import op

revision = "0037_order_label_file"
down_revision = "0036_supplier_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_data TEXT")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_format VARCHAR(10)")


def downgrade() -> None:
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS label_format")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS label_data")
