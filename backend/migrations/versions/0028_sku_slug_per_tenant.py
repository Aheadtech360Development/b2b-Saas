"""Make product SKU and slug unique PER TENANT, not globally.

Two brands on the platform must be able to sell the SAME supplier product
(e.g. both carry Gildan 2000). But `product_variants.sku` and `products.slug`
each had a GLOBAL unique index (from the models' unique=True), so the second
brand to import a style collided on SKU (and slug) → the import failed.

Fix (mirrors 0027 for order_number): drop the global unique indexes, add
composite unique indexes on (tenant_id, sku) and (tenant_id, slug), and keep a
plain (non-unique) index on sku / slug for lookups. Existing rows were globally
unique, so they are trivially unique per tenant — no data conflict.

Revision ID: 0028_sku_slug_per_tenant
Revises: 0027_order_number_per_tenant
"""
from alembic import op

revision = "0028_sku_slug_per_tenant"
down_revision = "0027_order_number_per_tenant"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── product_variants.sku → unique per (tenant_id, sku) ────────────────────
    # Drop whichever form the global unique took (constraint first: dropping it
    # also drops its backing index, so a later DROP INDEX can't fail on it).
    op.execute("ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_sku_key")
    op.execute("DROP INDEX IF EXISTS ix_product_variants_sku")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_tenant_sku "
        "ON product_variants (tenant_id, sku)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_variants_sku ON product_variants (sku)")

    # ── products.slug → unique per (tenant_id, slug) ──────────────────────────
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_slug_key")
    op.execute("DROP INDEX IF EXISTS ix_products_slug")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_slug "
        "ON products (tenant_id, slug)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_slug ON products (slug)")


def downgrade() -> None:
    # Revert to global unique indexes. NOTE: only safe while no two tenants share
    # a sku/slug — true after a fresh upgrade, but a real multi-brand catalogue
    # will have duplicates, so this downgrade can fail by design.
    op.execute("DROP INDEX IF EXISTS uq_product_variants_tenant_sku")
    op.execute("DROP INDEX IF EXISTS ix_product_variants_sku")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_product_variants_sku ON product_variants (sku)")

    op.execute("DROP INDEX IF EXISTS uq_products_tenant_slug")
    op.execute("DROP INDEX IF EXISTS ix_products_slug")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_products_slug ON products (slug)")
