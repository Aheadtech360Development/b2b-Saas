"""One email, one account per shop — not one account for the whole platform.

Revision ID: 0058_user_email_per_brand
Revises: 0057_builder_version_pin

users.email was unique across every brand (0052 left it so on purpose, when
the platform had one shop that mattered). With several shops it made a buyer
of one shop unable to buy from another: signing up at the second shop said the
address was taken, and signing in there found nobody — the account belonged
to the first shop. The buyer could do neither.

Each shop's customers are its own, so the address is now unique inside one
brand. Platform admins (no brand) share one namespace, kept unique among
themselves by folding NULL into a fixed value.

The exact address is what is indexed, not its lower case: every address was
unique as written until now, so this cannot fail on existing data, and the
app lower-cases what it stores.
"""
from alembic import op

revision = "0058_user_email_per_brand"
down_revision = "0057_builder_version_pin"
branch_labels = None
depends_on = None

NO_BRAND = "00000000-0000-0000-0000-000000000000"


def upgrade() -> None:
    # The old key is an index on a database built by migrations, and may be a
    # constraint on one built another way.
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key")
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_brand_email "
        f"ON users ((COALESCE(tenant_id, '{NO_BRAND}'::uuid)), email)"
    )
    # Finding somebody by address — sign-in, a reset — stays an index lookup.
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")


def downgrade() -> None:
    # Fails if one address now has accounts at two shops, which is the point:
    # going back would have to choose which of them to delete.
    op.execute("DROP INDEX IF EXISTS uq_users_brand_email")
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.execute("CREATE UNIQUE INDEX ix_users_email ON users (email)")
