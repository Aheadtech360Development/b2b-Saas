"""BillingService — System A: platform billing (brand -> platform).

A brand pays the platform a flat monthly tier via a Stripe Subscription. This
service owns the money-in loop: create the brand's Stripe Customer, open a
subscription Checkout Session, open the billing portal, and reconcile the
subscription state we get back from webhooks into `tenant_subscriptions` +
`tenants` + `tenant_feature_flags`.

Tenant tables are raw-SQL (no ORM models), so this service uses text() to stay
consistent with app/api/v1/platform/tenants.py.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.billing_plans import BILLING_PLANS, ALL_FEATURES, get_plan, features_for_plan

logger = logging.getLogger(__name__)

# Stripe subscription statuses that mean "brand is paid up and should have access".
_ACTIVE_STATES = {"active", "trialing"}
# Terminal / dead states — access should be revoked.
_DEAD_STATES = {"canceled", "incomplete_expired", "unpaid"}


def _stripe():
    stripe.api_key = get_settings().STRIPE_SECRET_KEY
    return stripe


def _ts(unix: int | None) -> datetime | None:
    return datetime.fromtimestamp(unix, tz=timezone.utc) if unix else None


class BillingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── app_settings helpers (price id <-> plan mapping) ──────────────────────
    async def price_id_for_plan(self, plan_key: str) -> str | None:
        row = (await self.db.execute(
            text("SELECT value FROM app_settings WHERE key = :k"),
            {"k": f"stripe_price_{plan_key}"},
        )).first()
        return row[0] if row else None

    async def plan_for_price_id(self, price_id: str) -> str | None:
        row = (await self.db.execute(
            text("SELECT key FROM app_settings WHERE value = :v AND key LIKE 'stripe_price_%'"),
            {"v": price_id},
        )).first()
        return row[0].replace("stripe_price_", "") if row else None

    # ── tenant lookup ─────────────────────────────────────────────────────────
    async def _get_tenant(self, slug: str) -> dict | None:
        row = (await self.db.execute(
            text("SELECT id, slug, name, email, status, plan FROM tenants WHERE slug = :s"),
            {"s": slug},
        )).mappings().first()
        return dict(row) if row else None

    async def get_or_create_customer(self, tenant: dict) -> str:
        """Return the brand's platform-side Stripe Customer id, creating it once."""
        row = (await self.db.execute(
            text("SELECT stripe_customer_id FROM tenant_subscriptions WHERE tenant_id = :t"),
            {"t": str(tenant["id"])},
        )).first()
        if row and row[0]:
            return row[0]

        s = _stripe()
        customer = s.Customer.create(
            email=tenant.get("email"),
            name=tenant.get("name"),
            metadata={"tenant_id": str(tenant["id"]), "tenant_slug": tenant["slug"], "app": "at360"},
        )
        await self.db.execute(text("""
            UPDATE tenant_subscriptions SET stripe_customer_id = :c, updated_at = now()
            WHERE tenant_id = :t
        """), {"c": customer.id, "t": str(tenant["id"])})
        return customer.id

    # ── Checkout + portal ─────────────────────────────────────────────────────
    async def create_checkout_session(self, slug: str, plan_key: str) -> dict:
        tenant = await self._get_tenant(slug)
        if not tenant:
            raise ValueError("Tenant not found")
        if not get_plan(plan_key):
            raise ValueError(f"Unknown plan '{plan_key}'")
        price_id = await self.price_id_for_plan(plan_key)
        if not price_id:
            raise ValueError(f"No Stripe price for plan '{plan_key}'. Run setup_stripe_billing.py.")

        # Plan SWITCH: if a subscription is already active, change its price in
        # place (with proration) instead of opening a new checkout — otherwise the
        # brand ends up with two active subscriptions and gets double-billed.
        sub_row = (await self.db.execute(text(
            "SELECT stripe_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = :t"
        ), {"t": str(tenant["id"])})).first()
        if sub_row and sub_row[0] and sub_row[1] in ("active", "trialing", "past_due"):
            s = _stripe()
            sub = s.Subscription.retrieve(sub_row[0])
            item_id = sub["items"]["data"][0]["id"]
            s.Subscription.modify(
                sub.id,
                items=[{"id": item_id, "price": price_id}],
                proration_behavior="create_prorations",
                metadata={"tenant_id": str(tenant["id"]), "plan_key": plan_key},
            )
            await self.sync_subscription(s.Subscription.retrieve(sub.id))
            return {"switched": True, "plan": plan_key}

        customer_id = await self.get_or_create_customer(tenant)
        frontend = get_settings().FRONTEND_URL.rstrip("/")
        s = _stripe()
        session = s.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{frontend}/admin/billing?status=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend}/admin/billing?status=cancelled",
            metadata={"tenant_id": str(tenant["id"]), "plan_key": plan_key},
            subscription_data={"metadata": {"tenant_id": str(tenant["id"]), "plan_key": plan_key}},
            allow_promotion_codes=True,
        )
        return {"checkout_url": session.url, "session_id": session.id}

    async def create_portal_session(self, slug: str) -> dict:
        tenant = await self._get_tenant(slug)
        if not tenant:
            raise ValueError("Tenant not found")
        customer_id = await self.get_or_create_customer(tenant)
        frontend = get_settings().FRONTEND_URL.rstrip("/")
        s = _stripe()
        session = s.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{frontend}/admin/billing",
        )
        return {"portal_url": session.url}

    async def get_status(self, slug: str) -> dict:
        tenant = await self._get_tenant(slug)
        if not tenant:
            raise ValueError("Tenant not found")
        sub = (await self.db.execute(text("""
            SELECT plan, status, stripe_subscription_id, stripe_price_id,
                   current_period_end, cancel_at_period_end
            FROM tenant_subscriptions WHERE tenant_id = :t
        """), {"t": str(tenant["id"])})).mappings().first()
        plan_def = get_plan(tenant["plan"]) or {}
        return {
            "slug": slug,
            "tenant_status": tenant["status"],
            "plan": tenant["plan"],
            "plan_name": plan_def.get("name"),
            "subscription": dict(sub) if sub else None,
        }

    async def sync_current(self, slug: str) -> dict:
        """Pull the brand's latest Stripe subscription and reconcile it — a
        webhook-independent fallback called on the checkout success redirect, so
        the plan activates even if the webhook is delayed or missed."""
        tenant = await self._get_tenant(slug)
        if not tenant:
            raise ValueError("Tenant not found")
        row = (await self.db.execute(
            text("SELECT stripe_customer_id FROM tenant_subscriptions WHERE tenant_id = :t"),
            {"t": str(tenant["id"])},
        )).first()
        customer_id = row[0] if row else None
        if customer_id:
            s = _stripe()
            subs = s.Subscription.list(customer=customer_id, status="all", limit=1)
            if subs.data:
                await self.sync_subscription(subs.data[0])
        return await self.get_status(slug)

    # ── Reconciliation (called from webhooks) ─────────────────────────────────
    async def _bypass_rls(self) -> None:
        """Stripe webhooks carry no auth, so get_db pins the session to NO_TENANT.
        Billing sync writes platform-registry rows across a brand's tenant_id, so
        it must run with RLS bypass — the same treatment platform-admin flows get.
        Transaction-local (reset at commit)."""
        await self.db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))

    async def sync_subscription(self, subscription: dict) -> None:
        """Apply a Stripe subscription object to our tables. Idempotent."""
        await self._bypass_rls()
        tenant_id = (subscription.get("metadata") or {}).get("tenant_id")
        if not tenant_id:
            # Fall back to customer -> tenant lookup.
            cust = subscription.get("customer")
            row = (await self.db.execute(
                text("SELECT tenant_id FROM tenant_subscriptions WHERE stripe_customer_id = :c"),
                {"c": cust},
            )).first()
            if not row:
                logger.warning("sync_subscription: no tenant for subscription %s", subscription.get("id"))
                return
            tenant_id = str(row[0])

        status = subscription.get("status")
        items = (subscription.get("items") or {}).get("data") or []
        price_id = items[0]["price"]["id"] if items else None
        plan_key = (subscription.get("metadata") or {}).get("plan_key")
        if not plan_key and price_id:
            plan_key = await self.plan_for_price_id(price_id)

        await self.db.execute(text("""
            UPDATE tenant_subscriptions SET
                status = :status,
                plan = COALESCE(:plan, plan),
                stripe_subscription_id = :sub,
                stripe_price_id = :price,
                current_period_start = :cps,
                current_period_end = :cpe,
                cancel_at_period_end = :cape,
                updated_at = now()
            WHERE tenant_id = :t
        """), {
            "status": status,
            "plan": plan_key,
            "sub": subscription.get("id"),
            "price": price_id,
            # current_period_* moved from the subscription to the item level in
            # newer Stripe API versions — fall back to the item.
            "cps": _ts(subscription.get("current_period_start") or (items[0].get("current_period_start") if items else None)),
            "cpe": _ts(subscription.get("current_period_end") or (items[0].get("current_period_end") if items else None)),
            "cape": bool(subscription.get("cancel_at_period_end")),
            "t": tenant_id,
        })

        await self._reconcile_access(tenant_id, plan_key, status)

    async def _reconcile_access(self, tenant_id: str, plan_key: str | None, sub_status: str | None) -> None:
        """Flip tenant status + feature flags based on subscription health."""
        if sub_status in _ACTIVE_STATES:
            tenant_status = "active"
            flags = features_for_plan(plan_key) if plan_key else {f: False for f in ALL_FEATURES}
        elif sub_status in _DEAD_STATES:
            tenant_status = "suspended"
            flags = {f: False for f in ALL_FEATURES}
        else:
            # past_due / incomplete — grace period: keep access, don't change flags.
            tenant_status = None
            flags = None

        if plan_key:
            await self.db.execute(
                text("UPDATE tenants SET plan = :p, updated_at = now() WHERE id = :t"),
                {"p": plan_key, "t": tenant_id},
            )
        if tenant_status:
            await self.db.execute(
                text("UPDATE tenants SET status = :s, updated_at = now() WHERE id = :t"),
                {"s": tenant_status, "t": tenant_id},
            )
        if flags is not None:
            for feature, enabled in flags.items():
                await self.db.execute(text("""
                    INSERT INTO tenant_feature_flags (tenant_id, feature, is_enabled)
                    VALUES (:t, :f, :en)
                    ON CONFLICT (tenant_id, feature)
                    DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now()
                """), {"t": tenant_id, "f": feature, "en": enabled})

    async def mark_past_due(self, subscription_id: str) -> None:
        """invoice.payment_failed — record past_due without yanking access yet."""
        await self._bypass_rls()
        await self.db.execute(text("""
            UPDATE tenant_subscriptions SET status = 'past_due', updated_at = now()
            WHERE stripe_subscription_id = :s
        """), {"s": subscription_id})
