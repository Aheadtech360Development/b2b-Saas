"""Disputes/chargebacks tracking for Connect Direct charges.

When a customer disputes a Direct charge, the dispute lives on the BRAND's
connected account — the brand responds with evidence from their Express
dashboard. The platform records the dispute so both the brand admin and the
super admin can see it (a dispute panel), and so we can notify the brand.

Raw-SQL table (like tenants) — no ORM model, no RLS. Queries scope by tenant_id
explicitly; webhook writes run under bypass_rls.

Revision ID: 0026_payment_disputes
Revises: 0025_stripe_payment_fields
"""
from alembic import op
import sqlalchemy as sa

revision = "0026_payment_disputes"
down_revision = "0025_stripe_payment_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS disputes (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid,
            order_id uuid,
            stripe_dispute_id varchar(255) UNIQUE NOT NULL,
            stripe_charge_id varchar(255),
            stripe_payment_intent_id varchar(255),
            amount numeric(10, 2),
            currency varchar(3) DEFAULT 'usd',
            reason varchar(100),
            status varchar(50),
            evidence_due_by timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_disputes_tenant_id ON disputes(tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_disputes_order_id ON disputes(order_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS disputes")
