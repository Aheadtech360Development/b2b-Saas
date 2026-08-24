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

    # Verify Stripe signature
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    except Exception as exc:
        logger.error("Webhook parse error: %s", exc)
        raise HTTPException(status_code=400, detail="Webhook parse error")

    event_id = event["id"]
    event_type = event["type"]

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
        # ── Customer order payments ──
        if event_type == "payment_intent.succeeded":
            await _handle_payment_succeeded(db, obj)
        elif event_type == "payment_intent.payment_failed":
            await _handle_payment_failed(db, obj)
        elif event_type == "charge.refunded":
            await _handle_charge_refunded(db, obj)
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
            sub_id = obj.get("subscription")
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
            await DisputeService(db).record_dispute(obj)

        log_entry.status = "processed"
        await db.commit()

    except Exception as exc:
        logger.exception("Webhook handler error for event %s: %s", event_id, exc)
        log_entry.status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail="Webhook processing failed")

    return {"status": "ok"}


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
    if settings.QUICKBOOKS_ENABLED:
        from app.tasks.quickbooks_tasks import sync_order_invoice_to_qb
        sync_order_invoice_to_qb.delay(str(order.id))

    logger.info("Order %s confirmed via Stripe webhook", order.order_number)


async def _handle_payment_failed(db: AsyncSession, payment_intent: dict) -> None:
    intent_id = payment_intent["id"]
    await db.execute(
        update(Order)
        .where(Order.stripe_payment_intent_id == intent_id)
        .values(payment_status="failed")
    )


async def _handle_charge_refunded(db: AsyncSession, charge: dict) -> None:
    intent_id = charge.get("payment_intent")
    if intent_id:
        await db.execute(
            update(Order)
            .where(Order.stripe_payment_intent_id == intent_id)
            .values(payment_status="refunded", status="refunded")
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
    stripe.api_key = get_settings().STRIPE_SECRET_KEY
    subscription = stripe.Subscription.retrieve(sub_id)
    await BillingService(db).sync_subscription(subscription)
