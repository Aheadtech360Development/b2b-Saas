"""A message in the Inbox can be answered and archived.

Revision ID: 0060_contact_message_state
Revises: 0059_audit_user_unlink

contact_submissions kept only whether a message had been read, so the Inbox
could not tell a message somebody replied to from one still waiting, and the
only way to clear one out was to delete it. Two empty columns: when it was
answered (a reply sent from the Inbox, or marked by hand) and when it was
archived. Nothing existing changes; every message stays as it was, unanswered
and in the Inbox.
"""
import sqlalchemy as sa
from alembic import op

revision = "0060_contact_message_state"
down_revision = "0059_audit_user_unlink"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contact_submissions", sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contact_submissions", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("contact_submissions", "archived_at")
    op.drop_column("contact_submissions", "answered_at")
