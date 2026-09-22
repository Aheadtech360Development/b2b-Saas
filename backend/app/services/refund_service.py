"""Refunds: what came back, how much, who sent it, and what that leaves owing.

One place records a refund, whether it was asked for here or done in Stripe and
reached us by webhook, so the two can never disagree about an order's state.

The important rule is arithmetic rather than events. An order is refunded when
the amount returned reaches its total — not when a `charge.refunded` event
arrives, because Stripe sends that for a partial refund too ("Occurs whenever a
charge is refunded, including partial refunds"). Reading it as "fully refunded"
is how a five-dollar refund on a hundred-dollar order used to cancel the whole
thing.

Nothing here believes a number from the browser. An admin refund is created
through Stripe and then recorded from Stripe's answer; a webhook is recorded
from the verified event.
"""
from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CENTS = Decimal("0.01")

# Only these count toward what has come back. A pending refund may still fail,
# and a failed or canceled one returned nothing.
COUNTED = ("succeeded", "pending")


def _money(cents: Any) -> Decimal:
    """Stripe counts in the smallest currency unit; we keep dollars."""
    try:
        return (Decimal(str(cents or 0)) / Decimal("100")).quantize(CENTS)
    except Exception:
        return Decimal("0.00")


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Read a field from a Stripe object or a plain dict alike."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    try:
        return obj[key]
    except (KeyError, TypeError, AttributeError):
        return getattr(obj, key, default)


async def _order_for_intent(db: AsyncSession, payment_intent: str | None) -> dict | None:
    if not payment_intent:
        return None
    return (await db.execute(text("""
        SELECT o.id, o.tenant_id, o.total, o.order_number, t.stripe_connect_account_id
        FROM orders o
        LEFT JOIN tenants t ON t.id = o.tenant_id
        WHERE o.stripe_payment_intent_id = :pi
    """), {"pi": payment_intent})).mappings().first()


def account_matches(order: dict | None, account: str | None) -> bool:
    """Does this event's connected account own the order it names?

    Stripe events are signed, so they are genuine — but a direct charge lives
    on one brand's connected account, and an event from that account must only
    ever touch that brand's orders. If a payment intent id ever resolved to
    another brand's order, this is what stops the refund landing there. An
    event with no account (platform-level) is not checked.
    """
    if order is None or not account:
        return True
    owner = order.get("stripe_connect_account_id")
    return owner is None or owner == account


async def record_refund(
    db: AsyncSession,
    *,
    refund: Any,
    source: str = "stripe",
    initiated_by: Any = None,
    initiated_by_name: str | None = None,
    note: str | None = None,
    bypass_rls: bool = False,
    account: str | None = None,
) -> dict | None:
    """Store one Stripe refund and bring its order's totals in line.

    Idempotent on Stripe's refund id: the admin action that created it and the
    webhook that follows both land on the same row, which is why that id is the
    unique one rather than anything of ours. The order history and the activity
    log hear about a refund once — when it first arrives, or when it fails —
    however many times Stripe repeats itself.
    """
    stripe_id = _get(refund, "id")
    if not stripe_id:
        return None

    if bypass_rls:
        # A webhook carries no brand context — it is Stripe calling us, not a
        # signed-in admin — so the lookup has to see every brand's orders.
        await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))

    payment_intent = _get(refund, "payment_intent")
    charge = _get(refund, "charge")
    amount = _money(_get(refund, "amount"))
    status = str(_get(refund, "status") or "pending")[:30]

    order = await _order_for_intent(db, payment_intent)
    if not account_matches(order, account):
        logger.warning(
            "Refund %s came from account %s, which does not own order %s — not recorded",
            stripe_id, account, order["id"] if order else None,
        )
        return None

    before = (await db.execute(
        text("SELECT status FROM payment_refunds WHERE stripe_refund_id = :r"),
        {"r": stripe_id},
    )).scalar_one_or_none()

    await db.execute(text("""
        INSERT INTO payment_refunds (
            tenant_id, order_id, stripe_refund_id, stripe_charge_id,
            stripe_payment_intent_id, amount, currency, reason, status,
            source, initiated_by, initiated_by_name, note, failure_reason
        ) VALUES (
            :tenant_id, :order_id, :refund_id, :charge_id,
            :pi, :amount, :currency, :reason, :status,
            :source, :initiated_by, :initiated_by_name, :note, :failure_reason
        )
        ON CONFLICT (stripe_refund_id) DO UPDATE SET
            status = EXCLUDED.status,
            amount = EXCLUDED.amount,
            failure_reason = EXCLUDED.failure_reason,
            -- Who asked for it is known only to the admin path; a webhook
            -- arriving first must not leave it blank for good.
            initiated_by = COALESCE(payment_refunds.initiated_by, EXCLUDED.initiated_by),
            initiated_by_name = COALESCE(payment_refunds.initiated_by_name, EXCLUDED.initiated_by_name),
            source = CASE WHEN EXCLUDED.source = 'admin' THEN 'admin' ELSE payment_refunds.source END,
            note = COALESCE(payment_refunds.note, EXCLUDED.note),
            updated_at = now()
    """), {
        "tenant_id": order["tenant_id"] if order else None,
        "order_id": order["id"] if order else None,
        "refund_id": stripe_id,
        "charge_id": charge if isinstance(charge, str) else _get(charge, "id"),
        "pi": payment_intent if isinstance(payment_intent, str) else _get(payment_intent, "id"),
        "amount": amount,
        "currency": (_get(refund, "currency") or "usd")[:3],
        "reason": _get(refund, "reason") or None,
        "status": status,
        "source": source[:20],
        "initiated_by": str(initiated_by) if initiated_by else None,
        "initiated_by_name": initiated_by_name or None,
        "note": note,
        "failure_reason": _get(refund, "failure_reason"),
    })

    result: dict = {
        "refund_id": stripe_id, "amount": float(amount), "status": status,
        "order_id": str(order["id"]) if order else None,
        "tenant_id": str(order["tenant_id"]) if order and order["tenant_id"] else None,
        "is_new": before is None, "fully_refunded": False,
        "total_refunded": 0.0, "remaining": None,
    }
    if order is None:
        # A refund for a payment we never took (a brand's own Stripe charge
        # outside this platform). Kept, with no order to update.
        return result

    result.update(await resync_order(db, order["id"], Decimal(str(order["total"] or 0))))

    # Tell the order's history, once. A refund first seen, or one that has just
    # failed — the brand needs to know the money did not go back after all.
    newly_failed = status in ("failed", "canceled") and before not in ("failed", "canceled", None)
    if before is None or newly_failed:
        await _announce(db, order, amount, status, source, initiated_by, initiated_by_name,
                        _get(refund, "reason"), stripe_id, result, failed=newly_failed or
                        status in ("failed", "canceled"))
    return result


async def _announce(db, order, amount, status, source, initiated_by, initiated_by_name,
                    reason, stripe_id, result, *, failed: bool) -> None:
    from app.middleware.audit_middleware import record_event
    from app.services import order_events

    who = initiated_by_name or ("Stripe dashboard" if source == "stripe" else "Staff")
    reason_words = f" — {reason.replace('_', ' ')}" if reason else ""
    if failed:
        message = f"Refund of ${amount:.2f} failed{reason_words}"
    elif result.get("fully_refunded"):
        message = f"Refund of ${amount:.2f} issued — order fully refunded{reason_words}"
    else:
        message = (f"Partial refund of ${amount:.2f} issued — "
                   f"${result.get('remaining', 0):.2f} still paid{reason_words}")
    if source == "stripe" and not failed:
        message += " (made in Stripe)"

    await order_events.record(
        db, NSOrder(order), "refund_issued" if not failed else "payment_failed", message,
        actor_type="admin" if source == "admin" else "system",
        actor_id=initiated_by, actor_name=who,
        meta={"refund_id": stripe_id, "amount": float(amount), "status": status,
              "source": source, "total_refunded": result.get("total_refunded"),
              "fully_refunded": result.get("fully_refunded")},
    )
    await record_event(
        "REFUND", "orders",
        summary=f"{message} on order {order['order_number']}",
        tenant_id=order["tenant_id"], user_id=initiated_by, entity_id=order["id"],
        actor_name=who,
        details={"refund_id": stripe_id, "amount": float(amount), "status": status,
                 "source": source, "reason": reason},
    )


class NSOrder:
    """What order_events.record reads off an order, from a raw row."""

    def __init__(self, row: dict):
        self.id = row["id"]
        self.tenant_id = row["tenant_id"]


async def resync_order(db: AsyncSession, order_id, order_total: Decimal) -> dict:
    """Recalculate an order's refunded total and set its status from that.

    Summing the refunds is what makes partial refunds correct: the status
    follows the money, so it cannot be wrong because two events arrived in an
    unlucky order or one arrived twice.
    """
    total_refunded = Decimal(str((await db.execute(
        text("""
            SELECT COALESCE(SUM(amount), 0) FROM payment_refunds
            WHERE order_id = :oid AND status = ANY(:counted)
        """),
        {"oid": str(order_id), "counted": list(COUNTED)},
    )).scalar_one() or 0)).quantize(CENTS)

    fully = order_total > 0 and total_refunded >= order_total

    # Only the payment side moves. Whether a partly refunded order still ships
    # is the brand's decision, not something a refund should make for them;
    # and a fully refunded order that already shipped stays shipped, because
    # that is still what happened to the parcel.
    await db.execute(text("""
        UPDATE orders
        SET amount_refunded = :refunded,
            payment_status = CASE
                WHEN :fully THEN 'refunded'::payment_status
                WHEN payment_status = 'refunded' THEN 'paid'::payment_status
                ELSE payment_status END,
            status = CASE WHEN :fully AND status NOT IN ('shipped', 'delivered')
                          THEN 'refunded'::order_status ELSE status END
        WHERE id = :oid
    """), {"refunded": total_refunded, "fully": fully, "oid": str(order_id)})

    return {
        "total_refunded": float(total_refunded),
        "fully_refunded": fully,
        "remaining": float(max(Decimal("0"), order_total - total_refunded).quantize(CENTS)),
    }


async def reconcile_charge(db: AsyncSession, charge: Any, *, account: str | None = None) -> dict | None:
    """Handle `charge.refunded`, which fires for partial refunds too.

    If the charge carries its refunds, each is recorded properly. Otherwise
    (newer API versions no longer expand them) the charge's own figures are
    used: `amount_refunded`, and `refunded`, which Stripe sets only when the
    charge is refunded in full. Either way the order is marked refunded only
    when the money says so.
    """
    await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
    refunds = _get(_get(charge, "refunds") or {}, "data") or []
    last = None
    for refund in refunds:
        last = await record_refund(db, refund=refund, source="stripe", account=account)
    if refunds:
        return last

    order = await _order_for_intent(db, _get(charge, "payment_intent"))
    if order is None or not account_matches(order, account):
        return None
    refunded = _money(_get(charge, "amount_refunded"))
    fully = bool(_get(charge, "refunded"))
    await db.execute(text("""
        UPDATE orders
        SET amount_refunded = GREATEST(amount_refunded, :refunded),
            payment_status = CASE WHEN :fully THEN 'refunded'::payment_status ELSE payment_status END,
            status = CASE WHEN :fully AND status NOT IN ('shipped', 'delivered')
                          THEN 'refunded'::order_status ELSE status END
        WHERE id = :oid
    """), {"refunded": refunded, "fully": fully, "oid": str(order["id"])})
    return {"order_id": str(order["id"]), "total_refunded": float(refunded), "fully_refunded": fully}


async def remaining_refundable(db: AsyncSession, order_id) -> Decimal:
    """What can still be refunded on an order: its total, less what came back."""
    row = (await db.execute(text("""
        SELECT o.total, COALESCE((
            SELECT SUM(r.amount) FROM payment_refunds r
            WHERE r.order_id = o.id AND r.status = ANY(:counted)
        ), 0) AS refunded
        FROM orders o WHERE o.id = :oid
    """), {"oid": str(order_id), "counted": list(COUNTED)})).mappings().first()
    if not row:
        return Decimal("0.00")
    return max(Decimal("0"), Decimal(str(row["total"] or 0)) - Decimal(str(row["refunded"] or 0))).quantize(CENTS)


async def refunds_for_order(db: AsyncSession, order_id) -> list[dict]:
    """Every refund on one order, newest first — the order page's history."""
    rows = (await db.execute(text("""
        SELECT stripe_refund_id, amount, currency, reason, status, source,
               initiated_by_name, note, failure_reason, created_at
        FROM payment_refunds
        WHERE order_id = :oid
        ORDER BY created_at DESC
    """), {"oid": str(order_id)})).mappings().all()
    return [_refund_row(r) for r in rows]


def _refund_row(r) -> dict:
    return {
        "refund_id": r["stripe_refund_id"],
        "amount": float(r["amount"] or 0),
        "currency": (r["currency"] or "usd").upper(),
        "reason": r["reason"],
        "status": r["status"],
        "source": r["source"],
        "by": r["initiated_by_name"],
        "note": r["note"],
        "failure_reason": r["failure_reason"],
        "at": r["created_at"].isoformat() if r["created_at"] else None,
        **({"order_id": str(r["order_id"]), "order_number": r["order_number"]}
           if "order_number" in r.keys() else {}),
    }


async def list_refunds(db: AsyncSession, tenant_id, *, limit: int = 100, offset: int = 0) -> dict:
    """This brand's refunds, newest first. Scoped explicitly as well as by RLS."""
    params = {"t": str(tenant_id), "lim": limit, "off": offset}
    rows = (await db.execute(text("""
        SELECT r.stripe_refund_id, r.amount, r.currency, r.reason, r.status, r.source,
               r.initiated_by_name, r.note, r.failure_reason, r.created_at,
               r.order_id, o.order_number
        FROM payment_refunds r
        LEFT JOIN orders o ON o.id = r.order_id
        WHERE r.tenant_id = :t
        ORDER BY r.created_at DESC
        LIMIT :lim OFFSET :off
    """), params)).mappings().all()
    totals = (await db.execute(text("""
        SELECT count(*) AS n,
               COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0) AS refunded
        FROM payment_refunds WHERE tenant_id = :t
    """), {"t": str(tenant_id)})).mappings().first()
    return {
        "items": [_refund_row(r) for r in rows],
        "total": int(totals["n"] or 0),
        "refunded_total": float(totals["refunded"] or 0),
    }


async def summary_for_orders(db: AsyncSession, order_ids: list[uuid.UUID]) -> dict:
    """How much has come back per order, for a list view — one query."""
    if not order_ids:
        return {}
    rows = (await db.execute(text("""
        SELECT order_id, COALESCE(SUM(amount), 0) AS refunded, count(*) AS n
        FROM payment_refunds
        WHERE order_id = ANY(:ids) AND status = 'succeeded'
        GROUP BY order_id
    """), {"ids": [str(i) for i in order_ids]})).mappings().all()
    return {
        str(r["order_id"]): {"refunded": float(r["refunded"] or 0), "count": int(r["n"])}
        for r in rows
    }
