"""PaymentService — Stripe Payment Intents and saved payment methods."""
import logging
from decimal import Decimal
from uuid import UUID

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _get_stripe():
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_payment_intent(
        self,
        amount_decimal: Decimal,
        currency: str = "usd",
        customer_stripe_id: str | None = None,
        metadata: dict | None = None,
    ) -> stripe.PaymentIntent:
        s = _get_stripe()
        amount_cents = int(amount_decimal * 100)  # Stripe uses cents
        params: dict = {
            "amount": amount_cents,
            "currency": currency,
            "payment_method_types": ["card"],
            "metadata": metadata or {},
        }
        if customer_stripe_id:
            params["customer"] = customer_stripe_id

        intent = s.PaymentIntent.create(**params)
        return intent

    async def create_direct_payment_intent(
        self,
        amount_decimal: Decimal,
        connected_account_id: str,
        currency: str = "usd",
        metadata: dict | None = None,
    ) -> stripe.PaymentIntent:
        """Direct charge on a brand's connected account (customer -> brand).

        The `stripe_account` request option routes creation to the connected
        account, so the charge, balance, and payout all land with the brand and
        the brand is merchant of record (disputes/refunds are theirs). No
        application_fee — the platform earns from subscription tiers, not sales.
        """
        s = _get_stripe()
        amount_cents = int(amount_decimal * 100)
        return s.PaymentIntent.create(
            amount=amount_cents,
            currency=currency,
            payment_method_types=["card"],
            metadata=metadata or {},
            stripe_account=connected_account_id,
        )

    async def create_refund(
        self,
        payment_intent_id: str,
        connected_account_id: str,
        amount_decimal: Decimal | None = None,
        reason: str | None = None,
    ) -> stripe.Refund:
        """Refund a Direct charge on the brand's connected account.

        amount_decimal=None refunds in full. Runs on the connected account, so
        the money comes back out of the brand's balance (they are merchant of
        record).
        """
        s = _get_stripe()
        params: dict = {"payment_intent": payment_intent_id}
        if amount_decimal is not None:
            params["amount"] = int(amount_decimal * 100)
        if reason in ("duplicate", "fraudulent", "requested_by_customer"):
            params["reason"] = reason
        return s.Refund.create(stripe_account=connected_account_id, **params)

    async def retrieve_payment_intent(self, intent_id: str) -> stripe.PaymentIntent:
        s = _get_stripe()
        return s.PaymentIntent.retrieve(intent_id)

    async def save_payment_method(
        self, payment_method_id: str, customer_stripe_id: str
    ) -> stripe.PaymentMethod:
        s = _get_stripe()
        pm = s.PaymentMethod.attach(payment_method_id, customer=customer_stripe_id)
        return pm

    async def list_saved_payment_methods(
        self, customer_stripe_id: str
    ) -> list[stripe.PaymentMethod]:
        s = _get_stripe()
        result = s.PaymentMethod.list(customer=customer_stripe_id, type="card")
        return result.data

    async def detach_payment_method(
        self, payment_method_id: str
    ) -> stripe.PaymentMethod:
        s = _get_stripe()
        return s.PaymentMethod.detach(payment_method_id)

    async def get_or_create_stripe_customer(
        self, company_id: UUID, email: str, name: str
    ) -> str:
        """Return existing Stripe customer ID from DB or create new one."""
        from sqlalchemy import select
        from app.models.company import Company

        result = await self.db.execute(
            select(Company.stripe_customer_id).where(Company.id == company_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        s = _get_stripe()
        customer = s.Customer.create(
            email=email,
            name=name,
            metadata={"company_id": str(company_id)},
        )
        # Save to DB
        from sqlalchemy import update
        from app.models.company import Company as CompanyModel

        await self.db.execute(
            update(CompanyModel)
            .where(CompanyModel.id == company_id)
            .values(stripe_customer_id=customer.id)
        )
        return customer.id
