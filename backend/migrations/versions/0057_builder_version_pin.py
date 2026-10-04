"""Builder versions can be kept out of the history limit.

Revision ID: 0057_builder_version_pin
Revises: 0056_visual_builder

Publish history is limited (services/builder/site.py KEEP_VERSIONS): the
oldest versions beyond the limit are removed when a new one is published,
except the live one and any the merchant chose to keep. This is the "keep".

Additive: a boolean defaulting to false, so every existing version is
unpinned and nothing about existing sites changes until the next publish.
"""
from alembic import op

revision = "0057_builder_version_pin"
down_revision = "0056_visual_builder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE builder_versions ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE builder_versions DROP COLUMN IF EXISTS pinned")
