"""Customer intelligence: per-customer metrics + saved segments.

customer_metrics — one row per company, order-derived rollup segments filter on.
customer_segments — saved named condition trees for the shared filter engine.

Revision ID: 0018_customer_segments
Revises: 0017_gang_sheet_order_link
"""
from alembic import op
import sqlalchemy as sa

revision = "0018_customer_segments"
down_revision = "0017_gang_sheet_order_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS customer_metrics (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            total_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
            order_count INTEGER NOT NULL DEFAULT 0,
            paid_order_count INTEGER NOT NULL DEFAULT 0,
            aov NUMERIC(14,2) NOT NULL DEFAULT 0,
            first_order_at TIMESTAMPTZ,
            last_order_at TIMESTAMPTZ,
            refunded_order_count INTEGER NOT NULL DEFAULT 0,
            refunded_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
            cancelled_order_count INTEGER NOT NULL DEFAULT 0,
            purchased_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            purchased_category_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            computed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))
    op.get_bind().execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_metrics_company ON customer_metrics(company_id);"
    ))
    op.get_bind().execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_customer_metrics_tenant ON customer_metrics(tenant_id);"
    ))

    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS customer_segments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL,
            description TEXT,
            definition JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))
    op.get_bind().execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_customer_segments_tenant ON customer_segments(tenant_id);"
    ))


def downgrade() -> None:
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS customer_segments;"))
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS customer_metrics;"))
