"""Contact form submissions — stored per tenant, viewable in the admin inbox.

Visitors submit a storefront contact form (a page section). Each submission is
saved as a row with the raw field data in JSONB so any custom field set works.

Revision ID: 0003_contact_submissions
Revises: 0002_tenant_pages
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_contact_submissions"
down_revision = "0002_tenant_pages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS contact_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            page_slug VARCHAR(100),
            form_name VARCHAR(150),
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_contact_submissions_tenant
            ON contact_submissions(tenant_id, created_at DESC);
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS contact_submissions CASCADE;"))
