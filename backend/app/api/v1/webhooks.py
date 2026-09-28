"""Stripe webhook handler with idempotency and event routing."""
import logging

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.models.order import Order
from app.models.system import WebhookLog
from app.services.billing_service import BillingService
from app.services.connect_service import ConnectService
from app.services.dispute_service import DisputeService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    payload = await request.body()

    # Verify the signature against ANY configured secret. A Stripe "Your
    # account" destination (platform billing) and a "Connected accounts"
    # destination (Direct charges, disputes, onboarding) each have their own
    # signing secret, and test and live destinations have their own again —
    # but all four deliver to this one endpoint.
    #
    # Every secret is tried rather than only the ones for the current mode,
    # because switching mode does not stop the other world from delivering:
    # a retry of an event from before the switch still has to be accepted or
    # Stripe keeps re-sending it.
    _secrets = [s for s in (
        settings.STRIPE_WEBHOOK_SECRET,
        settings.STRIPE_CONNECT_WEBHOOK_SECRET,
        settings.STRIPE_WEBHOOK_SECRET_TEST,
        settings.STRIPE_CONNECT_WEBHOOK_SECRET_TEST,
    ) if s]
    event = None
    for _secret in _secrets:
        try:
            event = stripe.Webhook.construct_event(payload, stripe_signature, _secret)
            break
        except stripe.SignatureVerificationError:
            continue
        except Exception as exc:
            logger.error("Webhook parse error: %s", exc)
            raise HTTPException(status_code=400, detail="Webhook parse error")
    if event is None:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    event_id = event["id"]
    event_type = event["type"]

    # A "thin payload" destination sends the event's name and ids and leaves
    # the object out; everything below reads the full object, so there is
    # nothing here to act on. Answered 200 and dropped rather than failed,
    # because a 500 tells Stripe to send it again — and it would keep
    # arriving just as empty, for days, burying the deliveries that matter.
    if not isinstance((event.get("data") or {}).get("object"), dict):
        logger.warning(
            "Ignoring %s (%s): no object in the payload. This endpoint needs a "
            "snapshot-payload destination.", event_type, event_id,
        )
        return {"status": "ignored_thin_payload"}

    # Idempotency check
    existing = await db.execute(
        select(WebhookLog).where(WebhookLog.event_id == event_id)
    )
    if existing.scalar_one_or_none():
        return {"status": "already_processed"}

    # Log event. provider + payload are NOT NULL; status is an enum
    # (received | processed | failed) — do not use other literals.
    log_entry = WebhookLog(
        event_id=event_id,
        provider="stripe",
        event_type=event_type,
        payload=payload.decode("utf-8", "replace"),
        status="received",
    )
    db.add(log_entry)
    await db.flush()

    try:
        obj = event["data"]["object"]
        # Set on events from a brand's connected account. The refund and
        # dispute handlers check it against the order they resolve to, so an
        # event from one brand's account can never touch another brand's order.
        account = event.get("account") if hasattr(event, "get") else None
        # ── Customer order payments ──
        if event_type == "payment_intent.succeeded":
            await _handle_payment_succeeded(db, obj)
        elif event_type == "payment_intent.payment_failed":
            await _handle_payment_failed(db, obj)
        # ── Refunds ──
        # `refund.*` carry the refund itself; `charge.refunded` fires for a
        # partial refund too, so it is reconciled from the money rather than
        # read as "fully refunded".
        elif event_type in ("refund.created", "refund.updated", "refund.failed",
                            "charge.refund.updated"):
            from app.services.refund_service import record_refund
            await record_refund(db, refund=obj, source="stripe", bypass_rls=True, account=account)
        elif event_type == "charge.refunded":
            from app.services.refund_service import reconcile_charge
            await reconcile_charge(db, obj, account=account)
        # ── Brand billing (System A — Stripe Subscriptions) ──
        elif event_type == "checkout.session.completed":
            await _handle_checkout_completed(db, obj)
        elif event_type in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        ):
            await BillingService(db).sync_subscription(obj)
        elif event_type == "invoice.payment_failed":
            sub_id = _invoice_subscription(obj)
            if sub_id:
                await BillingService(db).mark_past_due(sub_id)
        # ── Connect onboarding (System B) ──
        elif event_type == "account.updated":
            await ConnectService(db).sync_account(obj)
        # ── Disputes / chargebacks on Direct charges (System B) ──
        elif event_type in (
            "charge.dispute.created",
            "charge.dispute.updated",
            "charge.dispute.closed",
            "charge.dispute.funds_withdrawn",
            "charge.dispute.funds_reinstated",
        ):
            await DisputeService(db).record_dispute(obj, event_type, account=account)

        log_entry.status = "processed"
        await db.commit()

    except Exception as exc:
        logger.exception("Webhook handler error for event %s: %s", event_id, exc)
        log_entry.status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail="Webhook processing failed")

    return {"status": "ok"}


def _invoice_subscription(invoice: dict) -> str | None:
    """Which subscription an invoice is for, in either payload shape.

    Stripe moved this off the invoice and under `parent` in the 2025 API
    versions. A webhook destination is pinned to whichever version it was
    created with, and ours will outlive that choice, so both are read rather
    than betting on one. Reading the wrong one is silent: the invoice fails,
    nothing is marked past due, and the brand keeps its plan for free.
    """
    direct = invoice.get("subscription")
    if direct:
        return direct if isinstance(direct, str) else direct.get("id")
    details = ((invoice.get("parent") or {}).get("subscription_details") or {})
    sub = details.get("subscription")
    if sub:
        return sub if isinstance(sub, str) else sub.get("id")
    for line in (invoice.get("lines") or {}).get("data") or []:
        item = ((line.get("parent") or {}).get("subscription_item_details") or {})
        if item.get("subscription"):
            return item["subscription"]
    return None


async def _handle_payment_succeeded(db: AsyncSession, payment_intent: dict) -> None:
    intent_id = payment_intent["id"]
    result = await db.execute(
        select(Order).where(Order.stripe_payment_intent_id == intent_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        logger.warning("Order not found for PaymentIntent %s", intent_id)
        return

    await db.execute(
        update(Order)
        .where(Order.id == order.id)
        .values(status="processing", payment_status="paid")
    )

    from app.tasks.email_tasks import send_order_confirmation_email
    send_order_confirmation_email.delay(str(order.id))

    from app.core.config import settings

    logger.info("Order %s confirmed via Stripe webhook", order.order_number)


async def _handle_payment_failed(db: AsyncSession, payment_intent: dict) -> None:
    intent_id = payment_intent["id"]
    await db.execute(
        update(Order)
        .where(Order.stripe_payment_intent_id == intent_id)
        .values(payment_status="failed")
    )


async def _handle_checkout_completed(db: AsyncSession, session: dict) -> None:
    """Brand finished a subscription Checkout — pull the subscription and sync.

    A customer.subscription.created event usually follows and would sync too;
    doing it here as well makes activation immediate and is idempotent.
    """
    if session.get("mode") != "subscription":
        return
    sub_id = session.get("subscription")
    if not sub_id:
        return
    from app.services import stripe_mode as _mode

    stripe.api_key = await _mode.secret_key(db)
    subscription = stripe.Subscription.retrieve(sub_id)
    await BillingService(db).sync_subscription(subscription)
