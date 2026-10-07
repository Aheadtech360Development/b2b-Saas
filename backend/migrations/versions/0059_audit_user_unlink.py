"""Deleting an account no longer trips over the activity log.

Revision ID: 0059_audit_user_unlink
Revises: 0058_user_email_per_brand

0043 made audit_log append-only: a trigger refuses every UPDATE and DELETE on
it. But the log points at the account that acted (admin_user_id, ON DELETE SET
NULL), and the model says what is meant to happen when that account goes: the
link empties and actor_name still says who it was. That emptying is an UPDATE,
so the trigger refused it — and with it the delete itself. Since 0043 nobody
who had ever signed in (a sign-in is logged) could be deleted; the admin's
Delete button answered with a bare 500.

The trigger now lets through exactly that one change — the link to a deleted
account going empty, with every other column untouched — and still refuses
everything else. Nothing in the log is rewritten: what was done, when, from
where and by whom (by name) stays as it was written.
"""
from alembic import op

revision = "0059_audit_user_unlink"
down_revision = "0058_user_email_per_brand"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
        BEGIN
            -- Set only by the platform-level endpoint that is allowed to prune
            -- old entries. A brand admin's session never has it, so neither an
            -- application bug nor a crafted request can rewrite history.
            IF current_setting('app.audit_admin', true) = 'on' THEN
                RETURN COALESCE(NEW, OLD);
            END IF;
            -- An account was deleted: the link to it empties and nothing else
            -- about the entry changes. actor_name still says who it was.
            IF TG_OP = 'UPDATE'
               AND OLD.admin_user_id IS NOT NULL AND NEW.admin_user_id IS NULL
               AND (to_jsonb(NEW) - 'admin_user_id') = (to_jsonb(OLD) - 'admin_user_id') THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'audit_log is append-only';
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
        BEGIN
            IF current_setting('app.audit_admin', true) = 'on' THEN
                RETURN COALESCE(NEW, OLD);
            END IF;
            RAISE EXCEPTION 'audit_log is append-only';
        END;
        $$ LANGUAGE plpgsql;
    """)
