"""A price of its own for a particular combination of options.

Until now a configurable product's price had to be separable: every choice
carried one delta that was added whatever else was picked, so the price of
(Small, Rounded) was forced to equal price(Small) + price(Rounded). Real print
pricing is not like that — rounded corners cost more on a bigger card — and a
brand had no way to say so.

The table is deliberately **sparse**. A row exists only for a combination
somebody actually priced. Materialising the matrix is not an option: a product
with fourteen option groups has on the order of 10^8 combinations, and writing
a row per combination would be both enormous and pointless, since almost all of
them follow the ordinary formula.

A row's pairs need only be a *subset* of what the buyer picked, and the most
specific matching row wins. That is what makes adding an option safe: add
Shape, and every price already set for Size x Quantity x Corners keeps applying
to both shapes until somebody overrides them.

`value_ids` carries the same pairs as a plain array so that deleting an option
value can clean up every row mentioning it with one indexed statement.

`product_options.in_price_matrix` says which options take part. Without it a
fourteen-option product would present an unusable grid; with it the brand
chooses the handful of options price really turns on.

Revision ID: 0041_option_combinations
Revises: 0040_order_attribution
"""
from alembic import op

revision = "0041_option_combinations"
down_revision = "0040_order_attribution"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)


def upgrade() -> None:
    op.execute(
        "ALTER TABLE product_options "
        "ADD COLUMN IF NOT EXISTS in_price_matrix BOOLEAN NOT NULL DEFAULT false"
    )

    op.execute("""
        CREATE TABLE IF NOT EXISTS product_option_combinations (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID,
            product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            -- The combination itself: "<option>:<value>|<option>:<value>", the
            -- pairs sorted by option id so the same combination always spells
            -- the same way however the buyer's payload was ordered.
            combo_key   TEXT NOT NULL,
            -- The same value ids as an array, so removing a value can delete
            -- every row that mentions it in one statement.
            value_ids   UUID[] NOT NULL DEFAULT '{}',
            -- Null means "no override": that part of the price falls back to
            -- the ordinary per-choice formula.
            unit_price  NUMERIC(12, 4),
            setup_fee   NUMERIC(12, 4),
            sku         VARCHAR(80),
            -- A combination that cannot be produced. Refused at pricing time
            -- rather than quietly sold.
            enabled     BOOLEAN NOT NULL DEFAULT true,
            note        VARCHAR(200),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # One row per combination per product: a second price for the same
    # combination would make the resolved price depend on insertion order.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_option_combinations_product_key
        ON product_option_combinations(product_id, combo_key)
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_option_combinations_tenant "
        "ON product_option_combinations(tenant_id)"
    )
    # Pricing loads a product's rows; cleanup asks which rows mention a value.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_option_combinations_values "
        "ON product_option_combinations USING GIN (value_ids)"
    )

    op.execute("ALTER TABLE product_option_combinations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE product_option_combinations FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON product_option_combinations")
    op.execute(
        f"CREATE POLICY tenant_isolation ON product_option_combinations "
        f"USING {_PRED} WITH CHECK {_PRED}"
    )
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON product_option_combinations TO app_rls;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS product_option_combinations")
    op.execute("ALTER TABLE product_options DROP COLUMN IF EXISTS in_price_matrix")
