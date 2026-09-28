"""The code a buyer types into the mobile app to reach one shop.

The app is one app for every brand, so the first thing it has to learn is
which shop it is looking at. A brand hands its buyers a short code — printed
on an invoice, on a card, in a QR square — and that is the whole of the
onboarding.

Short and unguessable rather than the brand's own name: a slug can be worked
out from the company, and a trade catalogue with trade prices in it is not
something a brand wants opened by anyone who can spell its name.

Left empty here. A code is minted the first time a brand asks for one, so
this adds nothing to back-fill and nothing to go stale.

Revision ID: 0053_shop_code
Revises: 0052_per_brand_unique
"""
from alembic import op

revision = "0053_shop_code"
down_revision = "0052_per_brand_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shop_code VARCHAR(12)")
    # One code, one shop. NULLs are distinct in Postgres, so every brand that
    # has not asked for one yet sits happily alongside the others.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_shop_code "
        "ON tenants (shop_code) WHERE shop_code IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_tenants_shop_code")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS shop_code")
