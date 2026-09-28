"""A brand's Connect account belongs to one Stripe mode.

Stripe keeps test and live entirely apart. An `acct_` created while the
platform held a test key does not exist under a live one — retrieving it
answers "No such account". The readiness flags that came with it mean
nothing there either.

All of it lived in one set of columns, so switching the platform to live
would have left every brand looking connected and ready while not one of
them had a live account. The columns are split per mode now.

Everything recorded so far was created under a test key, so the existing
values move into the test columns rather than being kept as live ones. A
brand that had onboarded will correctly read as not connected in live mode,
and its test account is still there when the platform switches back.

Revision ID: 0054_connect_per_mode
Revises: 0053_shop_code
"""
import sqlalchemy as sa
from alembic import op

revision = "0054_connect_per_mode"
down_revision = "0053_shop_code"
branch_labels = None
depends_on = None

# The live-mode columns keep their existing names, matching STRIPE_SECRET_KEY
# holding the live key and STRIPE_SECRET_KEY_TEST the other one.
_COLS = [
    ("stripe_connect_account_id_test", sa.String(length=255), None),
    ("connect_charges_enabled_test", sa.Boolean(), sa.text("false")),
    ("connect_payouts_enabled_test", sa.Boolean(), sa.text("false")),
    ("connect_details_submitted_test", sa.Boolean(), sa.text("false")),
    ("connect_onboarded_at_test", sa.DateTime(timezone=True), None),
]


def upgrade() -> None:
    for name, type_, default in _COLS:
        op.add_column(
            "tenants",
            sa.Column(name, type_, nullable=True, server_default=default),
        )

    # Everything on these columns today was made with a test key: the platform
    # has never run with a live one. Moved rather than copied, so live mode
    # starts honestly empty instead of pointing at accounts that are not there.
    op.execute("""
        UPDATE tenants SET
            stripe_connect_account_id_test = stripe_connect_account_id,
            connect_charges_enabled_test   = connect_charges_enabled,
            connect_payouts_enabled_test   = connect_payouts_enabled,
            connect_details_submitted_test = connect_details_submitted,
            connect_onboarded_at_test      = connect_onboarded_at,
            stripe_connect_account_id = NULL,
            connect_charges_enabled   = false,
            connect_payouts_enabled   = false,
            connect_details_submitted = false,
            connect_onboarded_at      = NULL
        WHERE stripe_connect_account_id IS NOT NULL
    """)

    # Two brands cannot share one connected account, in either world.
    op.create_index(
        "ix_tenants_connect_acct_test",
        "tenants",
        ["stripe_connect_account_id_test"],
        unique=True,
        postgresql_where=sa.text("stripe_connect_account_id_test IS NOT NULL"),
    )


def downgrade() -> None:
    # Put the test values back where they came from, so a brand that onboarded
    # before this migration is not left looking unconnected on the way down.
    op.execute("""
        UPDATE tenants SET
            stripe_connect_account_id = stripe_connect_account_id_test,
            connect_charges_enabled   = connect_charges_enabled_test,
            connect_payouts_enabled   = connect_payouts_enabled_test,
            connect_details_submitted = connect_details_submitted_test,
            connect_onboarded_at      = connect_onboarded_at_test
        WHERE stripe_connect_account_id_test IS NOT NULL
          AND stripe_connect_account_id IS NULL
    """)
    op.drop_index("ix_tenants_connect_acct_test", table_name="tenants")
    for name, _type, _default in _COLS:
        op.drop_column("tenants", name)
