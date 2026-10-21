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
from app.core.billing_plans import get_plan

logger = logging.getLogger(__name__)

# Stripe subscription statuses that mean "brand is paid up and should have access".
_ACTIVE_STATES = {"active", "trialing"}
# Terminal / dead states — access should be revoked.
_DEAD_STATES = {"canceled", "incomplete_expired", "unpaid"}
# A subscription that can still bill or come back, and so is the one to change.
_RESUMABLE = ("active", "trialing", "past_due", "unpaid", "incomplete")



def _is_missing(exc: Exception) -> bool:
    """Whether Stripe is saying an id simply does not exist in this world.

    A customer, a subscription and a price each belong to one Stripe account
    and one mode. Change either and every id stored here still looks perfectly
    valid and names nothing: Stripe answers "No such customer", which reaches
    a brand as a checkout that will not open and no way to tell why.

    This happens on purpose as well as by accident — the platform's own test
    and live switch does it every time — so a stored id is treated as a hint
    to check rather than a fact, and an id that is gone is the same as never
    having had one.
    """
    return isinstance(exc, stripe.InvalidRequestError) and (
        getattr(exc, "code", "") == "resource_missing"
        or "no such" in str(exc).lower()
    )


def _stripe():
    """Stripe with the platform's key.

    The mode-aware form is `_stripe_for(db)`; this stays for the few paths
    that have no session to ask with.
    """
    stripe.api_key = get_settings().STRIPE_SECRET_KEY
    return stripe


async def _stripe_for(db):
    """Stripe, keyed for whichever mode the platform is in.

    Test and live are separate worlds in Stripe — a customer, a price or a
    Connect account made in one does not exist in the other — so which key is
    in use decides which world every id here belongs to.
    """
    from app.services import stripe_mode

    stripe.api_key = await stripe_mode.secret_key(db)
    return stripe


def _ts(unix: int | None) -> datetime | None:
    return datetime.fromtimestamp(unix, tz=timezone.utc) if unix else None


def start_params(*, customer_id: str, price_id: str, payment_method: str, tenant_id, plan_key: str,
                 trial_ends_at: datetime | None, now: datetime | None = None) -> tuple[dict, str]:
    """The subscription a card on file starts, and the key it is started under.

    Charged to that card, off session: nobody is at the screen when the sweep
    starts it. While the brand's free trial still runs (more than an hour of
    it), Stripe holds the first charge until the trial's last moment; after
    that it is charged now. The first payment happens in the request and a
    declined card creates nothing (error_if_incomplete), so a failed card never
    leaves a half-made subscription behind that later closes the shop.

    The key names the brand, the plan, the card and the day, so two workers
    starting the same brand at once make one subscription, and a new card is a
    new attempt rather than yesterday's decline replayed.
    """
    now = now or datetime.now(timezone.utc)
    params: dict = {
        "customer": customer_id,
        "items": [{"price": price_id}],
        "default_payment_method": payment_method,
        "payment_behavior": "error_if_incomplete",
        "off_session": True,
        "metadata": {"tenant_id": str(tenant_id), "plan_key": plan_key, "started_by": "card_on_file"},
    }
    if trial_ends_at is not None:
        if trial_ends_at.tzinfo is None:
            trial_ends_at = trial_ends_at.replace(tzinfo=timezone.utc)
        if (trial_ends_at - now).total_seconds() > 3600:
            params["trial_end"] = int(trial_ends_at.timestamp())
    return params, f"at360-start-{tenant_id}-{plan_key}-{payment_method}-{now:%Y%m%d}"


class BillingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── app_settings helpers (price id <-> plan mapping) ──────────────────────
    async def price_id_for_plan(self, plan_key: str) -> str | None:
        row = (await self.db.execute(
            text("SELECT value FROM app_settings WHERE key = :k"),
            {"k": f"stripe_price_{plan_key}"},
        )).first()
        stored = row[0] if row else None
        if stored:
            # Checked rather than trusted. A Price belongs to one Stripe
            # account and one mode, and this row is neither — it is a single
            # global setting, so it outlives a change of either and then names
            # nothing. That reached a brand as "No such price" on the one
            # button they were trying to press.
            s = await _stripe_for(self.db)
            try:
                found = s.Price.retrieve(stored)
                if getattr(found, "active", True):
                    return stored
                logger.warning("Price %s is archived; finding the current one.", stored)
            except Exception as exc:
                if not _is_missing(exc):
                    raise
                logger.warning(
                    "Price %s does not exist in the current account or mode; "
                    "finding or creating the right one.", stored,
                )

        # Nothing usable recorded. Rather than refuse — which is what turned
        # "Switch to this" into "Could not start checkout" and left the answer
        # in a script nobody could see — find or create the Price in Stripe and
        # remember it. Stripe keys it by lookup_key, so this is idempotent: the
        # same plan resolves to the same Price however many times it runs.
        return await self._ensure_price(plan_key)

    async def _ensure_price(self, plan_key: str) -> str | None:
        from app.core.billing_plans import BILLING_PLANS

        plan = BILLING_PLANS.get(plan_key)
        if not plan:
            return None
        s = await _stripe_for(self.db)
        lookup_key = plan["lookup_key"]
        try:
            found = s.Price.list(lookup_keys=[lookup_key], limit=1, active=True)
            price = found.data[0] if found.data else None
            if price is None or price.unit_amount != plan["amount_cents"]:
                if price is not None:
                    # The amount changed: keep the product, make a new Price and
                    # move the key onto it. Existing subscriptions keep theirs.
                    product_id = price.product if isinstance(price.product, str) else price.product.id
                    transfer = True
                else:
                    product_id = s.Product.create(
                        name=plan["name"], description=plan["description"],
                        metadata={"plan_key": plan_key, "app": "at360"},
                    ).id
                    transfer = False
                price = s.Price.create(
                    product=product_id,
                    unit_amount=plan["amount_cents"],
                    currency="usd",
                    recurring={"interval": plan["interval"]},
                    lookup_key=lookup_key,
                    transfer_lookup_key=transfer,
                    metadata={"plan_key": plan_key},
                )
            await self.db.execute(text("""
                INSERT INTO app_settings (key, value, updated_at)
                VALUES (:k, :v, now())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
            """), {"k": f"stripe_price_{plan_key}", "v": price.id})
            await self.db.commit()
            logger.info("Stripe price for %s resolved to %s", plan_key, price.id)
            return price.id
        except Exception as exc:
            logger.error("Could not set up a Stripe price for %s: %s", plan_key, exc)
            return None

    async def plan_for_price_id(self, price_id: str) -> str | None:
        row = (await self.db.execute(
            text("SELECT key FROM app_settings WHERE value = :v AND key LIKE 'stripe_price_%'"),
            {"v": price_id},
        )).first()
        return row[0].replace("stripe_price_", "") if row else None

    # ── tenant lookup ─────────────────────────────────────────────────────────
    async def _get_tenant(self, slug: str) -> dict | None:
        row = (await self.db.execute(
            text("SELECT id, slug, name, email, status, plan, custom_domain FROM tenants WHERE slug = :s"),
            {"s": slug},
        )).mappings().first()
        return dict(row) if row else None

    async def get_or_create_customer(self, tenant: dict) -> str:
        """Return the brand's platform-side Stripe Customer id, creating it once."""
        row = (await self.db.execute(
            text("SELECT stripe_customer_id FROM tenant_subscriptions WHERE tenant_id = :t"),
            {"t": str(tenant["id"])},
        )).first()
        s = await _stripe_for(self.db)
        stored = row[0] if row and row[0] else None
        if stored:
            try:
                found = s.Customer.retrieve(stored)
                # A customer deleted in the dashboard still retrieves, with a
                # flag, and cannot be charged. Treated as gone.
                if not getattr(found, "deleted", False):
                    return stored
                logger.warning("Stripe customer %s was deleted; making a new one.", stored)
            except Exception as exc:
                if not _is_missing(exc):
                    raise
                logger.warning(
                    "Stripe customer %s does not exist in the current account or mode; "
                    "making a new one.", stored,
                )

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
            raise ValueError(
                f"Could not set up billing for the {plan_key} plan in Stripe. "
                "Check that STRIPE_SECRET_KEY is set and is for the right mode."
            )

        # Plan SWITCH: if a subscription is already active, change its price in
        # place (with proration) instead of opening a new checkout — otherwise the
        # brand ends up with two active subscriptions and gets double-billed.
        sub_row = (await self.db.execute(text(
            "SELECT stripe_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = :t"
        ), {"t": str(tenant["id"])})).first()
        if sub_row and sub_row[0] and sub_row[1] in ("unpaid", "incomplete"):
            # A new checkout here would start a second subscription beside the
            # one still owed, and paying that later would bill both.
            raise ValueError(
                "Your last invoice is still unpaid. Pay it in Manage billing; the plan can be changed after."
            )
        if sub_row and sub_row[0] and sub_row[1] in ("active", "trialing", "past_due"):
            s = await _stripe_for(self.db)
            try:
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
            except Exception as exc:
                if not _is_missing(exc):
                    raise
                # The subscription belongs to an account or a mode this
                # platform is no longer in. Forgotten, so the brand gets a
                # fresh checkout rather than an error about an id they have
                # never seen.
                logger.warning(
                    "Subscription %s does not exist here; starting a new checkout.", sub_row[0],
                )
                await self.db.execute(text("""
                    UPDATE tenant_subscriptions
                       SET stripe_subscription_id = NULL, updated_at = now()
                     WHERE tenant_id = :t
                """), {"t": str(tenant["id"])})

        customer_id = await self.get_or_create_customer(tenant)
        # Back to *their* admin, not the platform's. Built from the shop's own
        # address, because a link made from the one global front-end setting
        # drops a brand on a page that knows nothing about their shop.
        from app.services import brand_urls

        back = brand_urls.build(tenant["slug"], tenant.get("custom_domain"), "/admin/billing")
        joiner = "&" if "?" in back else "?"
        s = await _stripe_for(self.db)
        session = s.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{back}{joiner}status=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{back}{joiner}status=cancelled",
            metadata={"tenant_id": str(tenant["id"]), "plan_key": plan_key},
            subscription_data={"metadata": {"tenant_id": str(tenant["id"]), "plan_key": plan_key}},
            allow_promotion_codes=True,
        )
        return {"checkout_url": session.url, "session_id": session.id}

    async def switch_plan(self, slug: str, plan_key: str) -> dict:
        """Move a brand to another plan from the platform console.

        The console used to write the plan straight onto the brand. Stripe went
        on charging the old price, and for a paying brand the next subscription
        event wrote the old plan back, so the change quietly undid itself. Now a
        paying brand's subscription is switched in Stripe, in place and
        prorated (the same switch the brand's own billing page makes), and the
        plan follows from what Stripe then says. A brand with nothing being
        paid is simply put on the plan, which is what its card on file will
        start when it has one.

        Returns {"plan", "billing"}: "switched" (Stripe changed), "unchanged"
        (already on that price) or "not_subscribed" (nothing in Stripe to change).
        The caller commits.
        """
        tenant = await self._get_tenant(slug)
        if not tenant:
            raise ValueError("Tenant not found")
        if not get_plan(plan_key):
            raise ValueError(f"Unknown plan '{plan_key}'")

        sub_row = (await self.db.execute(text(
            "SELECT stripe_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = :t"
        ), {"t": str(tenant["id"])})).first()
        # Every subscription that can still bill or resume, not only the paid-up
        # ones: an unpaid or incomplete one keeps its old price, and paying its
        # open invoice would bring the old plan back.
        if sub_row and sub_row[0] and sub_row[1] in _RESUMABLE:
            price_id = await self.price_id_for_plan(plan_key)
            if not price_id:
                raise ValueError(
                    f"Could not set up billing for the {plan_key} plan in Stripe. "
                    "Check that STRIPE_SECRET_KEY is set and is for the right mode."
                )
            s = await _stripe_for(self.db)
            try:
                sub = s.Subscription.retrieve(sub_row[0])
                item = await self._plan_item(sub)
                metadata = {"tenant_id": str(tenant["id"]), "plan_key": plan_key}
                outcome = "unchanged"
                if item["price"]["id"] != price_id:
                    s.Subscription.modify(
                        sub.id,
                        items=[{"id": item["id"], "price": price_id}],
                        # Prorated only when the current period was paid for:
                        # a past-due or unpaid period credited on a downgrade
                        # would be credit for time nobody paid.
                        proration_behavior="create_prorations" if sub.get("status") == "active" else "none",
                        metadata=metadata,
                    )
                    outcome = "switched"
                else:
                    # Already on that price: the plan written on it still has
                    # to say so, or the sync below reads the old one back.
                    s.Subscription.modify(sub.id, metadata=metadata)
                await self.sync_subscription(s.Subscription.retrieve(sub.id))
                return {"plan": plan_key, "billing": outcome}
            except Exception as exc:
                if not _is_missing(exc):
                    raise
                # From another Stripe account or mode: nothing there to change.
                logger.warning("Subscription %s does not exist here; plan set without Stripe.", sub_row[0])
                await self.db.execute(text("""
                    UPDATE tenant_subscriptions SET stripe_subscription_id = NULL, updated_at = now()
                     WHERE tenant_id = :t
                """), {"t": str(tenant["id"])})

        await self.db.execute(
            text("UPDATE tenants SET plan = :p, updated_at = now() WHERE id = :t"),
            {"p": plan_key, "t": str(tenant["id"])},
        )
        await self.db.execute(
            text("UPDATE tenant_subscriptions SET plan = :p, updated_at = now() WHERE tenant_id = :t"),
            {"p": plan_key, "t": str(tenant["id"])},
        )
        from app.services import entitlements

        entitlements.forget(tenant["id"])
        return {"plan": plan_key, "billing": "not_subscribed"}

    async def _plan_item(self, sub) -> dict:
        """The subscription's plan line, not an add-on beside it."""
        from app.core.billing_plans import BILLING_PLANS

        items = (sub.get("items") or {}).get("data") or []
        if len(items) == 1:
            return items[0]
        lookup = {p["lookup_key"] for p in BILLING_PLANS.values()}
        found = []
        for it in items:
            price = it.get("price") or {}
            if price.get("lookup_key") in lookup or await self.plan_for_price_id(price.get("id") or ""):
                found.append(it)
        if len(found) != 1:
            raise ValueError("This brand's Stripe subscription has no single plan line to change. Change it in Stripe.")
        return found[0]

    async def _live_subscription(self, tenant_id) -> tuple[str | None, str | None]:
        row = (await self.db.execute(text(
            "SELECT stripe_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = :t"
        ), {"t": str(tenant_id)})).first()
        if row and row[0] and row[1] in _RESUMABLE:
            return row[0], row[1]
        return None, None

    async def hold_billing(self, slug: str) -> str:
        """The platform closed the shop: Stripe stops collecting while it is closed.

        Collection is paused, not the subscription ended, so restoring the shop
        restores its billing exactly as it was; invoices due meanwhile are
        voided, so a closed shop is never charged. "paused" or "none" (nothing
        in Stripe to pause). Raises when Stripe refuses, so the caller can
        leave the shop as it was rather than close it while it is still billed.
        """
        tenant = await self._get_tenant(slug)
        sub_id, _ = await self._live_subscription(tenant["id"]) if tenant else (None, None)
        if not sub_id:
            return "none"
        s = await _stripe_for(self.db)
        try:
            s.Subscription.modify(sub_id, pause_collection={"behavior": "void"})
        except Exception as exc:
            if _is_missing(exc):
                return "none"
            raise
        return "paused"

    async def release_billing(self, slug: str) -> str:
        """The platform reopened the shop: Stripe collects again. "resumed" or "none"."""
        tenant = await self._get_tenant(slug)
        sub_id, _ = await self._live_subscription(tenant["id"]) if tenant else (None, None)
        if not sub_id:
            return "none"
        s = await _stripe_for(self.db)
        try:
            s.Subscription.modify(sub_id, pause_collection="")
        except Exception as exc:
            if _is_missing(exc):
                return "none"
            raise
        return "resumed"

    async def end_billing(self, slug: str) -> str:
        """The brand is being deleted for good: its subscription is cancelled now,
        or Stripe would go on charging a brand nothing here can see any more.
        "cancelled" or "none". Raises when Stripe refuses."""
        tenant = await self._get_tenant(slug)
        sub_id, _ = await self._live_subscription(tenant["id"]) if tenant else (None, None)
        if not sub_id:
            return "none"
        s = await _stripe_for(self.db)
        try:
            s.Subscription.cancel(sub_id)
        except Exception as exc:
            if _is_missing(exc):
                return "none"
            raise
        return "cancelled"

    async def move_trial_end(self, tenant_id, ends_at: datetime | None) -> bool:
        """A card already on file during the free period: Stripe's own trial end
        moves with ours, or Stripe would charge on the old date (or, ended,
        keep the trial running). True when Stripe was changed."""
        row = (await self.db.execute(text(
            "SELECT stripe_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = :t"
        ), {"t": str(tenant_id)})).first()
        if not (row and row[0] and row[1] == "trialing"):
            return False
        s = await _stripe_for(self.db)
        trial_end = "now" if ends_at is None else int(ends_at.timestamp())
        try:
            s.Subscription.modify(row[0], trial_end=trial_end, proration_behavior="none")
            await self.sync_subscription(s.Subscription.retrieve(row[0]))
        except Exception as exc:
            if _is_missing(exc):
                return False
            raise
        return True

    async def create_portal_session(self, slug: str) -> dict:
        tenant = await self._get_tenant(slug)
        if not tenant:
            raise ValueError("Tenant not found")
        customer_id = await self.get_or_create_customer(tenant)
        from app.services import brand_urls

        s = await _stripe_for(self.db)
        session = s.billing_portal.Session.create(
            customer=customer_id,
            # Back with ?status=portal: the billing page asks to be synced, which
            # starts the plan when a card was just put on file.
            return_url=brand_urls.build(tenant["slug"], tenant.get("custom_domain"), "/admin/billing?status=portal"),
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
            s = await _stripe_for(self.db)
            try:
                subs = s.Subscription.list(customer=customer_id, status="all", limit=1)
                if subs.data:
                    await self.sync_subscription(subs.data[0])
            except Exception as exc:
                # Reading the status must not fail because a stored id is from
                # somewhere else; the screen still has something to show.
                if not _is_missing(exc):
                    raise
                logger.warning("Customer %s is not in this account or mode.", customer_id)
        # A card entered in the billing portal with no plan behind it: start it.
        started = None
        try:
            started = await self.start_from_card_on_file(slug)
        except Exception:
            logger.warning("Could not start %s's plan from the card on file", slug, exc_info=True)
        return {**await self.get_status(slug), "card_on_file": started}

    # ── A card on file starts the plan ────────────────────────────────────────
    async def start_from_card_on_file(self, slug: str) -> dict:
        """A brand that has put a card on file and never had a subscription is
        put on its plan, charged to that card, and Stripe bills it every month
        from then on.

        The card is entered in Stripe's billing portal ("Manage billing"), which
        saves it to the brand's Stripe customer and nothing more. No
        subscription was made, so nothing was ever charged: a brand could have
        a card on file for months and pay nothing.

        Only for a customer Stripe has never had a subscription for. A brand
        that cancelled keeps its card on file and is not signed up again; it
        chooses a plan itself. One Stripe already has is only synced.
        """
        tenant = await self._get_tenant(slug)
        if not tenant:
            raise ValueError("Tenant not found")
        if tenant.get("status") != "active":
            return {"started": False, "reason": "shop_not_active"}
        row = (await self.db.execute(text(
            "SELECT stripe_customer_id, trial_ends_at FROM tenant_subscriptions WHERE tenant_id = :t"
        ), {"t": str(tenant["id"])})).mappings().first()
        customer_id = row["stripe_customer_id"] if row else None
        if not customer_id:
            return {"started": False, "reason": "no_customer"}

        s = await _stripe_for(self.db)
        try:
            subs = s.Subscription.list(customer=customer_id, status="all", limit=10)
            customer = s.Customer.retrieve(customer_id)
        except Exception as exc:
            if _is_missing(exc):
                return {"started": False, "reason": "no_customer"}
            raise
        if subs.data:
            live = [x for x in subs.data if x.get("status") in ("active", "trialing", "past_due", "unpaid", "incomplete")]
            if live:
                await self.sync_subscription(live[0])
            return {"started": False, "reason": "has_subscription", "status": subs.data[0].get("status")}
        if getattr(customer, "deleted", False):
            return {"started": False, "reason": "no_customer"}

        payment_method = (customer.get("invoice_settings") or {}).get("default_payment_method")
        if isinstance(payment_method, dict):
            payment_method = payment_method.get("id")
        if not payment_method:
            cards = s.PaymentMethod.list(customer=customer_id, type="card", limit=1)
            payment_method = cards.data[0].id if cards.data else None
        if not payment_method:
            return {"started": False, "reason": "no_card"}

        # The plan the brand's features already follow: an old name's successor
        # ("growth" is Wholesale), Starter for anything that is not a plan.
        from app.core.billing_plans import effective_plan

        plan_key = effective_plan(tenant.get("plan"))
        price_id = await self.price_id_for_plan(plan_key)
        if not price_id:
            raise ValueError(f"No Stripe price for the {plan_key} plan.")
        params, key = start_params(
            customer_id=customer_id, price_id=price_id, payment_method=payment_method,
            tenant_id=tenant["id"], plan_key=plan_key, trial_ends_at=row["trial_ends_at"],
        )
        try:
            sub = s.Subscription.create(**params, idempotency_key=key)
        except stripe.CardError as exc:
            logger.warning("The card on file for %s was declined: %s", slug, getattr(exc, "user_message", None) or exc)
            return {"started": False, "reason": "card_declined",
                    "message": getattr(exc, "user_message", None) or "The card was declined."}
        await self.sync_subscription(sub)
        logger.info("Started %s on %s from the card on file (%s)", slug, plan_key, sub.get("status"))
        return {"started": True, "status": sub.get("status"), "plan": plan_key, "trial_end": params.get("trial_end")}

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
        """Put the brand on the plan it is paying for, and open or close the shop.

        What that plan *includes* is not written down here. It used to write a
        row per feature, which turned every plan default into a standing
        decision: the platform's own grants were silently overwritten on the
        next sync, and taking a feature back was indistinguishable from never
        having granted it. The plan decides by itself now
        (app/services/entitlements.py), and a row in tenant_feature_flags means
        only what the platform decided on purpose.
        """
        if sub_status in _ACTIVE_STATES:
            tenant_status = "active"
        elif sub_status in _DEAD_STATES:
            # Nothing is deleted and no feature is touched: the shop is closed,
            # and paying reopens it exactly as it was.
            tenant_status = "suspended"
        else:
            tenant_status = None  # past_due / incomplete — a grace period.

        if plan_key:
            await self.db.execute(
                text("UPDATE tenants SET plan = :p, updated_at = now() WHERE id = :t"),
                {"p": plan_key, "t": tenant_id},
            )
        from app.services import brand_status, entitlements

        if tenant_status:
            if await brand_status.is_held(self.db, tenant_id):
                # The platform closed this shop by hand: a payment does not
                # reopen it, and a lapse does not change why it is closed.
                logger.info("Brand %s is held by the platform; Stripe %s leaves its status alone.",
                            tenant_id, sub_status)
            else:
                await self.db.execute(
                    text("UPDATE tenants SET status = :s, updated_at = now() WHERE id = :t"),
                    {"s": tenant_status, "t": tenant_id},
                )

        entitlements.forget(tenant_id)
        brand_status.forget(tenant_id)

    async def mark_past_due(self, subscription_id: str) -> None:
        """invoice.payment_failed — record past_due without yanking access yet.

        Only a live subscription becomes past_due. A failed attempt to pay a
        subscription that has already lapsed (a brand trying a card that
        declines), or a failure event delivered late, must not rewrite a dead
        state as a live one: Stripe sends no later event to put it back.
        """
        await self._bypass_rls()
        await self.db.execute(text("""
            UPDATE tenant_subscriptions SET status = 'past_due', updated_at = now()
            WHERE stripe_subscription_id = :s
              AND status NOT IN ('canceled', 'unpaid', 'incomplete_expired')
        """), {"s": subscription_id})
