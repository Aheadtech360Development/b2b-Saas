"""A brand can be given a trial, and told how much of it is left.

Nothing recorded when a brand's free period ends, so nothing could count it
down, warn anybody, or decide what happens when it runs out. A trial existed
only as something a person remembered.

Two columns: when it ends, and which reminders have already been sent. The
second is what keeps a brand from being emailed the same warning on every
run of the job that sends them.

Revision ID: 0055_trial
Revises: 0054_connect_per_mode
"""
import sqlalchemy as sa
from alembic import op

revision = "0055_trial"
down_revision = "0054_connect_per_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_subscriptions",
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "tenant_subscriptions",
        # Days-remaining marks, as a list: [3, 1, 0]. A list rather than a
        # timestamp because the question is "has this particular warning gone
        # out", and a job that runs twice in a day must not ask it twice.
        sa.Column(
            "trial_notices_sent",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    # Every lookup is "whose trial ends soon", so it is worth an index on the
    # rows that have one at all.
    op.create_index(
        "ix_tenant_subs_trial_ends",
        "tenant_subscriptions",
        ["trial_ends_at"],
        postgresql_where=sa.text("trial_ends_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_subs_trial_ends", table_name="tenant_subscriptions")
    op.drop_column("tenant_subscriptions", "trial_notices_sent")
    op.drop_column("tenant_subscriptions", "trial_ends_at")
