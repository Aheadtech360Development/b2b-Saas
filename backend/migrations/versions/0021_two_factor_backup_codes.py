"""Two-factor auth: backup recovery codes.

two_factor_enabled + two_factor_secret already exist on users. This adds a place
for one-time recovery codes (stored hashed) so a user who loses their
authenticator can still get in.

Revision ID: 0021_two_factor_backup_codes
Revises: 0020_row_level_security
"""
from alembic import op
import sqlalchemy as sa

revision = "0021_two_factor_backup_codes"
down_revision = "0020_row_level_security"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB"
    ))


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "ALTER TABLE users DROP COLUMN IF EXISTS two_factor_backup_codes"
    ))
