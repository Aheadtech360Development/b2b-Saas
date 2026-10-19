"""A message in the Inbox can be answered and archived.

Revision ID: 0060_contact_message_state
Revises: 0063_product_track_inventory

contact_submissions kept only whether a message had been read, so the Inbox
could not tell a message somebody replied to from one still waiting, and the
only way to clear one out was to delete it. Two empty columns: when it was
answered (a reply sent from the Inbox, or marked by hand) and when it was
archived. Nothing existing changes; every message stays as it was, unanswered
and in the Inbox.

Numbered 0060 but it runs after 0063: it was written on the admin redesign
branch while main went on to 0061-0063 (live has run those), so at the merge
it was put at the end of the chain. IF NOT EXISTS because a database that ran
the branch's earlier order already has both columns.
"""
from alembic import op

revision = "0060_contact_message_state"
down_revision = "0063_product_track_inventory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS answered_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE")


def downgrade() -> None:
    op.drop_column("contact_submissions", "archived_at")
    op.drop_column("contact_submissions", "answered_at")
