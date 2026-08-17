"""Row-Level Security — database-layer tenant isolation (Phase B).

On Neon the app's login role (neondb_owner) has BYPASSRLS, so RLS can't enforce
against it directly. This creates a dedicated NOBYPASSRLS role `app_rls` with
full DML on the schema; the app SET LOCAL ROLE app_rls per tenant transaction
(app/core/rls.py), so those queries are subject to RLS. Platform admin / system
jobs stay on the login role and keep bypassing. Then RLS + FORCE + one policy is
enabled on every tenant-scoped table.

Policy allow-list (any true → row visible):
  • app.bypass_rls = 'on'                          → platform admin / system
  • current_setting('app.current_tenant') IS NULL  → non-app connection
      (migrations, psql) — never blocked
  • CAST(tenant_id AS text) = app.current_tenant   → the session's own rows
  • tenant_id IS NULL                              → platform-level shared rows

The app ALWAYS sets app.current_tenant (a uuid, or '' for no-tenant), so app
sessions are always enforced; '' matches no tenant rows (fail-closed).

MUST deploy the Phase A hook (app/core/rls.py) with this — the migration and the
new app code ship together, and the old (pre-deploy) app keeps working because it
runs as neondb_owner, which bypasses RLS.

Revision ID: 0020_row_level_security
Revises: 0019_custom_roles
"""
from alembic import op
import sqlalchemy as sa

revision = "0020_row_level_security"
down_revision = "0019_custom_roles"
branch_labels = None
depends_on = None

# CAST(... AS text) avoids '::' which SQLAlchemy text() would read as a bind param.
_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)

_TABLE_LOOP = """
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
      AND tb.table_type = 'BASE TABLE'
"""


def upgrade() -> None:
    bind = op.get_bind()
    # 1. Dedicated non-bypass role + grants (idempotent).
    bind.execute(sa.text("""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            CREATE ROLE app_rls NOLOGIN NOBYPASSRLS;
          END IF;
        END $$;
    """))
    bind.execute(sa.text("GRANT app_rls TO CURRENT_USER"))
    bind.execute(sa.text("GRANT USAGE ON SCHEMA public TO app_rls"))
    bind.execute(sa.text("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_rls"))
    bind.execute(sa.text("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_rls"))
    bind.execute(sa.text("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_rls"))
    bind.execute(sa.text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_rls"))
    bind.execute(sa.text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_rls"))
    bind.execute(sa.text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_rls"))

    # 2. Enable RLS + FORCE + policy on every tenant-scoped table.
    bind.execute(sa.text(f"""
        DO $$
        DECLARE t text;
        BEGIN
          FOR t IN {_TABLE_LOOP} LOOP
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
            EXECUTE format(
              $f$CREATE POLICY tenant_isolation ON %I USING {_PRED} WITH CHECK {_PRED}$f$, t);
          END LOOP;
        END $$;
    """))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text(f"""
        DO $$
        DECLARE t text;
        BEGIN
          FOR t IN {_TABLE_LOOP} LOOP
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
            EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
            EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
          END LOOP;
        END $$;
    """))
    # Leave the app_rls role in place (dropping it needs its grants revoked first
    # and it's harmless without policies). Revoke nothing destructive here.
