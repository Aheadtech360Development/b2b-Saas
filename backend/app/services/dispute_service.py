"""DisputeService — Phase 5: chargebacks on Connect Direct charges.

A dispute on a Direct charge belongs to the brand (they respond via their Express
dashboard). The platform records it so the brand admin and super admin can see it
and the brand can be alerted. Raw-SQL `disputes` table (no RLS); webhook writes
run under bypass_rls, admin reads scope by tenant_id explicitly.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _ts(unix: int | None) -> datetime | None:
    return datetime.fromtimestamp(unix, tz=timezone.utc) if unix else None


class DisputeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _bypass_rls(self) -> None:
        await self.db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))

    async def record_dispute(self, dispute: dict) -> None:
        """Upsert a Stripe dispute (charge.dispute.* webhook). Idempotent."""
        await self._bypass_rls()

        pi_id = dispute.get("payment_intent")
        charge_id = dispute.get("charge")
        amount = dispute.get("amount")  # cents
        amount_dollars = (amount / 100.0) if amount is not None else None
        reason = dispute.get("reason")
        status = dispute.get("status")
        due_by = ((dispute.get("evidence_details") or {}).get("due_by"))

        # Link to the brand + order via the payment intent stored on the order.
        tenant_id = None
        order_id = None
        if pi_id:
            row = (await self.db.execute(
                text("SELECT id, tenant_id FROM orders WHERE stripe_payment_intent_id = :pi"),
                {"pi": pi_id},
            )).first()
            if row:
                order_id, tenant_id = row[0], row[1]

        await self.db.execute(text("""
            INSERT INTO disputes (
                tenant_id, order_id, stripe_dispute_id, stripe_charge_id,
                stripe_payment_intent_id, amount, currency, reason, status, evidence_due_by
            ) VALUES (
                :tenant_id, :order_id, :did, :charge, :pi, :amount, :currency,
                :reason, :status, :due_by
            )
            ON CONFLICT (stripe_dispute_id) DO UPDATE SET
                status = EXCLUDED.status,
                reason = EXCLUDED.reason,
                amount = EXCLUDED.amount,
                evidence_due_by = EXCLUDED.evidence_due_by,
                order_id = COALESCE(disputes.order_id, EXCLUDED.order_id),
                tenant_id = COALESCE(disputes.tenant_id, EXCLUDED.tenant_id),
                updated_at = now()
        """), {
            "tenant_id": str(tenant_id) if tenant_id else None,
            "order_id": str(order_id) if order_id else None,
            "did": dispute.get("id"),
            "charge": charge_id,
            "pi": pi_id,
            "amount": amount_dollars,
            "currency": dispute.get("currency", "usd"),
            "reason": reason,
            "status": status,
            "due_by": _ts(due_by),
        })
        logger.info("Recorded dispute %s (status=%s) for tenant=%s order=%s",
                    dispute.get("id"), status, tenant_id, order_id)

    async def list_for_tenant(self, tenant_id: str, limit: int = 100) -> list[dict]:
        rows = (await self.db.execute(text("""
            SELECT d.id, d.stripe_dispute_id, d.amount, d.currency, d.reason, d.status,
                   d.evidence_due_by, d.created_at, d.order_id, o.order_number
            FROM disputes d
            LEFT JOIN orders o ON o.id = d.order_id
            WHERE d.tenant_id = :t
            ORDER BY d.created_at DESC
            LIMIT :lim
        """), {"t": str(tenant_id), "lim": limit})).mappings().all()
        return [dict(r) for r in rows]

    async def list_all(self, limit: int = 200) -> list[dict]:
        await self._bypass_rls()
        rows = (await self.db.execute(text("""
            SELECT d.id, d.stripe_dispute_id, d.tenant_id, t.slug AS tenant_slug,
                   d.amount, d.currency, d.reason, d.status, d.evidence_due_by,
                   d.created_at, d.order_id, o.order_number
            FROM disputes d
            LEFT JOIN tenants t ON t.id = d.tenant_id
            LEFT JOIN orders o ON o.id = d.order_id
            ORDER BY d.created_at DESC
            LIMIT :lim
        """), {"lim": limit})).mappings().all()
        return [dict(r) for r in rows]
