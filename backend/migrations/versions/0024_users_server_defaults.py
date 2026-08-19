"""Add server-side defaults on users columns the raw-SQL paths rely on.

The users table is created by 0001's Base.metadata.create_all, which only
applies Python-side ORM defaults — the columns get NO database DEFAULT. But
several endpoints INSERT into users with raw SQL (platform tenant creation,
the startup admin seed, auth flows) and omit these columns, expecting the DB
to fill them. On the old (raw-SQL-provisioned) database those defaults existed;
on a fresh create_all database they don't, so those inserts hit NOT NULL
violations ("Failed to create brand", login seed failures). Add the defaults so
the raw-SQL inserts behave the same everywhere. Idempotent.

Revision ID: 0024_users_server_defaults
Revises: 0023_restore_null_allow
"""
from alembic import op
import sqlalchemy as sa

revision = "0024_users_server_defaults"
down_revision = "0023_restore_null_allow"
branch_labels = None
depends_on = None

_DEFAULTS = {
    "id": "gen_random_uuid()",
    "is_admin": "false",
    "is_platform_admin": "false",
    "is_active": "true",
    "email_verified": "false",
    "two_factor_enabled": "false",
    "account_type": "'wholesale'",
    "role": "'buyer'",
}


def upgrade() -> None:
    bind = op.get_bind()
    for col, default in _DEFAULTS.items():
        bind.execute(sa.text(f"ALTER TABLE users ALTER COLUMN {col} SET DEFAULT {default}"))


def downgrade() -> None:
    bind = op.get_bind()
    for col in _DEFAULTS:
        bind.execute(sa.text(f"ALTER TABLE users ALTER COLUMN {col} DROP DEFAULT"))
