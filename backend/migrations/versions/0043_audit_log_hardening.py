"""An activity log that records more, leaks less, and cannot be quietly edited.

Three problems with what was there.

It recorded the request body verbatim, so creating a staff member wrote their
plaintext password into a table every brand admin can read, and connecting a
carrier wrote that brand's API key beside it. Redaction happens in the
middleware; this migration clears what is already stored, because leaving it
would mean the fix only protected future rows.

It only knew CREATE, UPDATE and DELETE, so a sign-in, a sign-out and a refused
attempt had nowhere to go — and a refused attempt is the one an investigation
starts from.

And nothing stopped it being edited. A log somebody can rewrite is not
evidence. UPDATE and DELETE are now refused by the database itself unless the
session sets `app.audit_admin`, which only the platform-level endpoint does, so
a brand admin cannot erase their own tracks even by reaching the table
directly.

Revision ID: 0043_audit_hardening
Revises: 0042_warehouse_code_tenant
"""
from alembic import op

revision = "0043_audit_hardening"
down_revision = "0042_warehouse_code_tenant"
branch_labels = None
depends_on = None

# Keys whose values must never be written down. Matched as substrings, so
# "api_key", "new_password" and "card_number" are all caught.
_SECRET_HINTS = (
    "password", "secret", "token", "api_key", "apikey", "private",
    "card", "cvc", "cvv", "ssn", "routing", "account_number", "credential",
)


def upgrade() -> None:
    for value in ("LOGIN", "LOGOUT", "DENIED", "REFUND", "DISPUTE", "PAYOUT"):
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")

    op.execute("ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS summary VARCHAR(300)")
    op.execute("ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS method VARCHAR(10)")
    op.execute("ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS path VARCHAR(300)")
    op.execute("ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS status_code INTEGER")
    op.execute("ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255)")

    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_tenant_time ON audit_log(tenant_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_action ON audit_log(action)")

    # ── Clear secrets already written down ──────────────────────────────────
    # Whole-value replacement rather than surgery on the JSON: these rows are a
    # record that something happened, and the values in them were never safe to
    # keep. Nothing is deleted, so the history of *what* was done survives.
    like_clauses = " OR ".join(
        f"lower(new_values) LIKE '%{hint}%'" for hint in _SECRET_HINTS
    )
    op.execute(f"""
        UPDATE audit_log
        SET new_values = '{{"redacted": "secrets removed by migration 0043"}}'
        WHERE new_values IS NOT NULL AND ({like_clauses})
    """)
    like_old = " OR ".join(f"lower(old_values) LIKE '%{hint}%'" for hint in _SECRET_HINTS)
    op.execute(f"""
        UPDATE audit_log
        SET old_values = '{{"redacted": "secrets removed by migration 0043"}}'
        WHERE old_values IS NOT NULL AND ({like_old})
    """)

    # ── Make the log evidence rather than a table ───────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
        BEGIN
            -- Set only by the platform-level endpoint that is allowed to prune
            -- old entries. A brand admin's session never has it, so neither an
            -- application bug nor a crafted request can rewrite history.
            IF current_setting('app.audit_admin', true) = 'on' THEN
                RETURN COALESCE(NEW, OLD);
            END IF;
            RAISE EXCEPTION 'audit_log is append-only';
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("DROP TRIGGER IF EXISTS audit_log_no_rewrite ON audit_log")
    op.execute("""
        CREATE TRIGGER audit_log_no_rewrite
        BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_log_no_rewrite ON audit_log")
    op.execute("DROP FUNCTION IF EXISTS audit_log_is_append_only()")
    op.execute("DROP INDEX IF EXISTS ix_audit_log_action")
    op.execute("DROP INDEX IF EXISTS ix_audit_log_tenant_time")
    for column in ("actor_name", "status_code", "path", "method", "summary"):
        op.execute(f"ALTER TABLE audit_log DROP COLUMN IF EXISTS {column}")
    # Enum values cannot be removed in Postgres without rebuilding the type,
    # and leaving them costs nothing.
