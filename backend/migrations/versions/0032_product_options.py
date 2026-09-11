"""Configurable-product option engine: options, choices and quantity tiers.

Adds the tables behind `pricing_mode = 'configurable'` — a product can carry
UNLIMITED option groups (Paper Stock, Coating, Rounded Corners, …) whose
combinations are never materialised as rows. Each choice carries a price effect
and the unit price is resolved on demand, which is what makes a ~5·10⁸-combination
product like Business Cards representable at all.

Purely additive: `pricing_mode` defaults to 'variant', so every existing product
keeps its current matrix behaviour untouched.

Revision ID: 0032_product_options
Revises: 0031_gang_sheet_config
"""
from alembic import op

revision = "0032_product_options"
down_revision = "0031_gang_sheet_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing products stay on the variant matrix — no behaviour change.
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) NOT NULL DEFAULT 'variant'")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,4)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS product_options (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID,
            product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            name         VARCHAR(150) NOT NULL,
            input_type   VARCHAR(20)  NOT NULL DEFAULT 'select',
            required     BOOLEAN      NOT NULL DEFAULT TRUE,
            help_text    TEXT,
            position     INTEGER      NOT NULL DEFAULT 0,
            is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_options_product_id ON product_options(product_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_options_tenant_id ON product_options(tenant_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS product_option_values (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID,
            option_id    UUID NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
            label        VARCHAR(200) NOT NULL,
            price_delta  NUMERIC(12,4) NOT NULL DEFAULT 0,
            price_mode   VARCHAR(12)   NOT NULL DEFAULT 'flat',
            image_url    VARCHAR(1000),
            swatch_hex   VARCHAR(9),
            sku_suffix   VARCHAR(40),
            position     INTEGER      NOT NULL DEFAULT 0,
            is_default   BOOLEAN      NOT NULL DEFAULT FALSE,
            enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_option_values_option_id ON product_option_values(option_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_option_values_tenant_id ON product_option_values(tenant_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS product_qty_tiers (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID,
            product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            min_qty      INTEGER NOT NULL,
            unit_price   NUMERIC(12,4) NOT NULL,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_qty_tiers_product_id ON product_qty_tiers(product_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_qty_tiers_tenant_id ON product_qty_tiers(tenant_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS product_qty_tiers")
    op.execute("DROP TABLE IF EXISTS product_option_values")
    op.execute("DROP TABLE IF EXISTS product_options")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS base_price")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS pricing_mode")
