"""One brand's names are its own.

Six things were unique across the whole platform that should only ever have
been unique inside one shop: a category's slug, a discount code, a pricing
tier's name, a shipping tier's name, a purchase order number and an RMA
number.

With one brand nobody notices. With two, the second shop cannot create a
"t-shirts" category, cannot issue SAVE10, cannot call a tier "Gold", and its
purchase orders collide with the first shop's the moment both reach the same
number — each failing with a database error that says nothing about why.

Every one of these is now unique per brand. Rows that predate tenancy carry a
NULL tenant_id; Postgres treats NULLs as distinct in a unique index, so those
keep working exactly as before.

Left alone deliberately:
  • users.email — one address is one account platform-wide, and sign-in
    depends on that.
  • disputes.stripe_dispute_id, payment_refunds.stripe_refund_id — Stripe's
    own ids, already unique everywhere.

Revision ID: 0052_per_brand_unique
Revises: 0051_design_upload
"""
from alembic import op

revision = "0052_per_brand_unique"
down_revision = "0051_design_upload"
branch_labels = None
depends_on = None

# table, column, the old global index/constraint name
SCOPED = [
    ("categories", "slug", "ix_categories_slug"),
    ("discount_codes", "code", "ix_discount_codes_code"),
    ("pricing_tiers", "name", "pricing_tiers_name_key"),
    ("shipping_tiers", "name", "shipping_tiers_name_key"),
    ("purchase_orders", "po_number", "ix_purchase_orders_po_number"),
    ("rma_requests", "rma_number", "ix_rma_requests_rma_number"),
]


def upgrade() -> None:
    for table, column, old_name in SCOPED:
        # The old key may be a constraint or a plain index depending on how it
        # was created, and on a fresh database it may not exist at all.
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {old_name}")
        op.execute(f"DROP INDEX IF EXISTS {old_name}")
        # Some of these were also created as "<table>_<column>_key" by the
        # column's own unique=True.
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_{column}_key")
        op.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS uq_{table}_tenant_{column} "
            f"ON {table} (tenant_id, {column})"
        )
        # Lookups by the bare column stay fast — they are how the app finds a
        # discount code or a category before it knows which brand it belongs to.
        op.execute(
            f"CREATE INDEX IF NOT EXISTS ix_{table}_{column} ON {table} ({column})"
        )


def downgrade() -> None:
    for table, column, old_name in SCOPED:
        op.execute(f"DROP INDEX IF EXISTS uq_{table}_tenant_{column}")
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_{column}")
        op.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS {old_name} ON {table} ({column})"
        )
