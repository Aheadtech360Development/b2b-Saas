"""Restore the RLS `tenant_id IS NULL` allow-clause (revert 0022).

0022 removed the `OR tenant_id IS NULL` branch to fail-close orphan rows. But the
RLS policy set is applied to every table carrying a tenant_id column — including
`users`, whose platform-admin rows are GLOBAL (tenant_id IS NULL by design). With
the strict predicate those rows became invisible to any tenant-scoped session, so
platform-admin login (and lookups that cross into global rows) broke.

Restoring the allow-clause fixes that immediately. The NULL-orphan hardening was
defense-in-depth and is not worth a login outage; a correct version must instead
make *business* tables NOT NULL (after backfill) and/or exclude the genuinely
global tables (users, …) from the policy — a careful, separate change.

Revision ID: 0023_rls_restore_null_tenant_allow
Revises: 0022_rls_drop_null_tenant_allow
"""
from alembic import op
import sqlalchemy as sa

revision = "0023_rls_restore_null_tenant_allow"
down_revision = "0022_rls_drop_null_tenant_allow"
branch_labels = None
depends_on = None

_TABLE_LOOP = """
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
      AND tb.table_type = 'BASE TABLE'
"""

# Loose predicate (NULL-tenant rows visible) — the working 0020 behaviour.
_PRED_LOOSE = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)

# Strict predicate — restored on downgrade (matches 0022).
_PRED_STRICT = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true))"
)


def _apply(pred: str) -> None:
    op.get_bind().execute(sa.text(f"""
        DO $$
        DECLARE t text;
        BEGIN
          FOR t IN {_TABLE_LOOP} LOOP
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
            EXECUTE format(
              $f$CREATE POLICY tenant_isolation ON %I USING {pred} WITH CHECK {pred}$f$, t);
          END LOOP;
        END $$;
    """))


def upgrade() -> None:
    _apply(_PRED_LOOSE)


def downgrade() -> None:
    _apply(_PRED_STRICT)
