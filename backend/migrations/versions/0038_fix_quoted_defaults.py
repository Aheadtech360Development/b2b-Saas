"""Fix column defaults that stored their own quotes.

Several models declared server_default="'all'" (quotes inside the string).
SQLAlchemy quotes server defaults itself, so the column default became the
five-character text 'all' — quotes included. Any row created without the value
set explicitly got it: a discount code whose eligibility was "'all'" was
refused for every customer ("not applicable to your account type"), and a
discount group whose status was "'enabled'" never matched a buyer.

Resets the defaults to the bare values and repairs rows that took the quoted
ones.

Revision ID: 0038_fix_quoted_defaults
Revises: 0037_order_label_file
"""
from alembic import op

revision = "0038_fix_quoted_defaults"
down_revision = "0037_order_label_file"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("discount_codes", "applicable_to", "all"),
    ("discount_codes", "customer_eligibility", "all"),
    ("discount_groups", "applies_to", "store"),
    ("discount_groups", "min_req_type", "none"),
    ("discount_groups", "shipping_type", "store_default"),
    ("discount_groups", "status", "enabled"),
    ("pricing_tiers", "payment_terms", "immediate"),
]


def upgrade() -> None:
    for table, column, value in _COLUMNS:
        op.execute(f"""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = '{table}' AND column_name = '{column}') THEN
                ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT '{value}';
                UPDATE {table} SET {column} = btrim({column}, '''')
                 WHERE {column} LIKE '''%''';
              END IF;
            END $$;
        """)


def downgrade() -> None:
    pass  # the quoted defaults were a bug; nothing to restore
