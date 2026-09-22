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

    async def record_dispute(self, dispute: dict, event_type: str | None = None,
                             account: str | None = None) -> dict | None:
        """Upsert a Stripe dispute (charge.dispute.* webhook). Idempotent.

        Beyond the status, what a brand needs to know afterwards: how it ended
        (`outcome`), and when the money actually left and — if they won — came
        back. Those are separate events at Stripe, so each is dated when it
        arrives rather than inferred from a status.
        """
        from app.services.refund_service import account_matches

        await self._bypass_rls()

        pi_id = dispute.get("payment_intent")
        charge_id = dispute.get("charge")
        amount = dispute.get("amount")  # cents
        amount_dollars = (amount / 100.0) if amount is not None else None
        reason = dispute.get("reason")
        status = dispute.get("status")
        details = dispute.get("evidence_details") or {}
        due_by = details.get("due_by")

        # Link to the brand + order via the payment intent stored on the order.
        order = None
        if pi_id:
            order = (await self.db.execute(text("""
                SELECT o.id, o.tenant_id, o.order_number, t.stripe_connect_account_id
                FROM orders o LEFT JOIN tenants t ON t.id = o.tenant_id
                WHERE o.stripe_payment_intent_id = :pi
            """), {"pi": pi_id})).mappings().first()
        if not account_matches(dict(order) if order else None, account):
            logger.warning("Dispute %s from account %s does not own its order — not recorded",
                           dispute.get("id"), account)
            return None
        tenant_id = order["tenant_id"] if order else None
        order_id = order["id"] if order else None

        before = (await self.db.execute(
            text("SELECT status, funds_withdrawn_at, funds_reinstated_at, closed_at "
                 "FROM disputes WHERE stripe_dispute_id = :d"),
            {"d": dispute.get("id")},
        )).mappings().first()

        closed = status in ("won", "lost", "warning_closed", "prevented")
        submitted = int(details.get("submission_count") or 0) > 0

        await self.db.execute(text("""
            INSERT INTO disputes (
                tenant_id, order_id, stripe_dispute_id, stripe_charge_id,
                stripe_payment_intent_id, amount, currency, reason, status, evidence_due_by,
                network_reason, outcome, is_charge_refundable,
                evidence_submitted_at, closed_at, funds_withdrawn_at, funds_reinstated_at
            ) VALUES (
                :tenant_id, :order_id, :did, :charge, :pi, :amount, :currency,
                :reason, :status, :due_by,
                :network_reason, :outcome, :refundable,
                CASE WHEN :submitted THEN now() END,
                CASE WHEN :closed THEN now() END,
                CASE WHEN :withdrawn THEN now() END,
                CASE WHEN :reinstated THEN now() END
            )
            ON CONFLICT (stripe_dispute_id) DO UPDATE SET
                status = EXCLUDED.status,
                reason = EXCLUDED.reason,
                amount = EXCLUDED.amount,
                evidence_due_by = EXCLUDED.evidence_due_by,
                network_reason = COALESCE(EXCLUDED.network_reason, disputes.network_reason),
                outcome = COALESCE(EXCLUDED.outcome, disputes.outcome),
                is_charge_refundable = EXCLUDED.is_charge_refundable,
                -- Each moment is kept the first time it happens: a repeated
                -- event must not move when the money actually left.
                evidence_submitted_at = COALESCE(disputes.evidence_submitted_at, EXCLUDED.evidence_submitted_at),
                closed_at = COALESCE(disputes.closed_at, EXCLUDED.closed_at),
                funds_withdrawn_at = COALESCE(disputes.funds_withdrawn_at, EXCLUDED.funds_withdrawn_at),
                funds_reinstated_at = COALESCE(disputes.funds_reinstated_at, EXCLUDED.funds_reinstated_at),
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
            "network_reason": (dispute.get("network_reason_code")
                               or (dispute.get("payment_method_details") or {}).get("card", {}).get("network_reason_code")),
            "outcome": status if closed else None,
            "refundable": dispute.get("is_charge_refundable"),
            "submitted": submitted,
            "closed": closed,
            "withdrawn": event_type == "charge.dispute.funds_withdrawn",
            "reinstated": event_type == "charge.dispute.funds_reinstated",
        })
        logger.info("Recorded dispute %s (status=%s, event=%s) for tenant=%s order=%s",
                    dispute.get("id"), status, event_type, tenant_id, order_id)

        # What changed, said once — to the order's history and the activity log.
        change = _describe_change(before, status, event_type, amount_dollars, reason)
        if change and order is not None:
            await _announce(self.db, order, change, dispute, amount_dollars)
        return {"tenant_id": str(tenant_id) if tenant_id else None,
                "order_id": str(order_id) if order_id else None,
                "status": status, "change": change[0] if change else None}

    async def list_for_tenant(self, tenant_id: str, limit: int = 100) -> list[dict]:
        rows = (await self.db.execute(text("""
            SELECT d.id, d.stripe_dispute_id, d.amount, d.currency, d.reason, d.status,
                   d.evidence_due_by, d.created_at, d.order_id, o.order_number,
                   d.outcome, d.closed_at, d.funds_withdrawn_at, d.funds_reinstated_at,
                   d.evidence_submitted_at, d.is_charge_refundable
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

    async def for_order(self, order_id) -> list[dict]:
        """Disputes on one order, for the order page."""
        rows = (await self.db.execute(text("""
            SELECT stripe_dispute_id, amount, currency, reason, status, outcome,
                   evidence_due_by, closed_at, funds_withdrawn_at, funds_reinstated_at,
                   created_at
            FROM disputes WHERE order_id = :o ORDER BY created_at DESC
        """), {"o": str(order_id)})).mappings().all()
        return [dict(r) for r in rows]


# ── Saying what happened ─────────────────────────────────────────────────────

_STATUS_WORDS = {
    "warning_needs_response": "an inquiry needs a response",
    "warning_under_review": "the inquiry is under review",
    "warning_closed": "the inquiry closed without a chargeback",
    "needs_response": "needs a response",
    "under_review": "is under review",
    "won": "was won — the money stays with you",
    "lost": "was lost — the money went back to the customer",
    "prevented": "was prevented",
}


def _describe_change(before, status, event_type, amount, reason):
    """(order-event type, sentence) for a dispute change worth recording, or None.

    A dispute is re-sent often with nothing new; only a real change — opened,
    status moved, money withdrawn or reinstated — becomes an entry.
    """
    money = f"${amount:.2f}" if amount is not None else "the payment"
    why = f" ({reason.replace('_', ' ')})" if reason else ""
    if before is None:
        return ("dispute_opened", f"Customer disputed {money} with their bank{why}")
    if event_type == "charge.dispute.funds_withdrawn" and not before["funds_withdrawn_at"]:
        return ("dispute_funds_withdrawn", f"{money} withdrawn from your balance for the dispute")
    if event_type == "charge.dispute.funds_reinstated" and not before["funds_reinstated_at"]:
        return ("dispute_funds_reinstated", f"{money} returned to your balance")
    if status != before["status"]:
        kind = {"won": "dispute_won", "lost": "dispute_lost"}.get(status, "dispute_updated")
        return (kind, f"Dispute {_STATUS_WORDS.get(status, status.replace('_', ' '))}")
    return None


async def _announce(db, order, change, dispute, amount) -> None:
    from app.middleware.audit_middleware import record_event
    from app.services import order_events
    from app.services.refund_service import NSOrder

    kind, sentence = change
    await order_events.record(
        db, NSOrder(order), kind, sentence,
        actor_type="system", actor_name="Card network",
        meta={"dispute_id": dispute.get("id"), "status": dispute.get("status"),
              "amount": amount, "reason": dispute.get("reason")},
    )
    await record_event(
        "DISPUTE", "orders",
        summary=f"{sentence} on order {order['order_number']}",
        tenant_id=order["tenant_id"], entity_id=order["id"],
        actor_name="Card network",
        details={"dispute_id": dispute.get("id"), "status": dispute.get("status"),
                 "amount": amount, "reason": dispute.get("reason")},
    )

