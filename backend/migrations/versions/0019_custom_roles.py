"""Custom roles (RBAC) — tenant-defined permission sets.

Beyond the 5 fixed roles, a brand can define its own roles with an arbitrary
set of permission scopes (e.g. "Sales rep" = orders + customers, no pricing).
A staff user with custom_role_id set uses that role's scopes; otherwise the
fixed `role` applies. Enforcement stays centralized in app/core/permissions.py.

Revision ID: 0019_custom_roles
Revises: 0018_customer_segments
"""
from alembic import op
import sqlalchemy as sa

revision = "0019_custom_roles"
down_revision = "0018_customer_segments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS custom_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL,
            scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
            read_only BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))
    op.get_bind().execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_custom_roles_tenant ON custom_roles(tenant_id);"
    ))
    op.get_bind().execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL;"
    ))


def downgrade() -> None:
    op.get_bind().execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS custom_role_id;"))
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS custom_roles;"))
