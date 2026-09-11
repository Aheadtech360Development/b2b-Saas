"""Conditional rules between a product's options.

Real configurators need dependencies — a print shop's "Laminating" is N/A once
"UV Coating" is picked. A rule says: when THIS choice is selected, hide or
disable THAT option (or one of its choices), with a note explaining why.

Kept deliberately small — one trigger choice, one action, one target — because
rules compose: several simple rows express the same logic as one complex rule,
and each stays readable in the admin.

Revision ID: 0034_option_rules
Revises: 0033_configured_line_items
"""
from alembic import op

revision = "0034_option_rules"
down_revision = "0033_configured_line_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS product_option_rules (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID,
            product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            when_value_id    UUID NOT NULL REFERENCES product_option_values(id) ON DELETE CASCADE,
            action           VARCHAR(20) NOT NULL DEFAULT 'disable_option',
            target_option_id UUID REFERENCES product_options(id) ON DELETE CASCADE,
            target_value_id  UUID REFERENCES product_option_values(id) ON DELETE CASCADE,
            note             VARCHAR(200),
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_option_rules_product_id ON product_option_rules(product_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_option_rules_when_value ON product_option_rules(when_value_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_option_rules_tenant_id ON product_option_rules(tenant_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS product_option_rules")
