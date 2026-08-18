"""Harden RLS: stop treating NULL tenant_id rows as globally visible.

The Phase B policy (0020) allowed a row when `tenant_id IS NULL`, intended for
"platform-level shared rows". But every table carrying a tenant_id is a
fully tenant-owned business table — none of them should hold a NULL-tenant row.
That allow-clause meant any row that slipped through with a NULL tenant_id
(a bug, a bypassed insert, an un-backfilled legacy row) would be visible to
*every* brand. This recreates the policy without that clause, so a NULL-tenant
row is fail-closed: invisible to every brand session. Platform admin / system
jobs (app.bypass_rls='on') and direct non-app connections (app.current_tenant
unset) can still see and repair such rows.

New allow-list (any true → row visible):
  • app.bypass_rls = 'on'                          → platform admin / system
  • current_setting('app.current_tenant') IS NULL  → non-app connection (psql/migrations)
  • CAST(tenant_id AS text) = app.current_tenant   → the session's own rows

Verify before/after with:
  SELECT relname, (SELECT count(*) ...) -- run scripts to count NULL-tenant rows
Reversible: downgrade restores the previous (looser) policy.

Revision ID: 0022_rls_drop_null_tenant_allow
Revises: 0021_two_factor_backup_codes
"""
from alembic import op
import sqlalchemy as sa

revision = "0022_rls_drop_null_tenant_allow"
down_revision = "0021_two_factor_backup_codes"
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

# Strict: NULL tenant_id no longer matches (fail-closed for orphan rows).
_PRED_STRICT = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true))"
)

# Previous (looser) predicate — restored on downgrade.
_PRED_LOOSE = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
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
    _apply(_PRED_STRICT)


def downgrade() -> None:
    _apply(_PRED_LOOSE)
