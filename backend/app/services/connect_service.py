"""ConnectService — System B: Stripe Connect onboarding (customer -> brand).

Each brand onboards a Stripe **Express** connected account. Customer payments are
then Direct charges on that account (Phase 4), so money and payout land with the
brand and disputes/refunds are the brand's — the platform's liability stays low.

This service owns onboarding + readiness tracking:
  • create_or_get_account   — one Express account per brand (stored on tenants)
  • create_onboarding_link  — hosted KYC link (expires fast — always fresh)
  • create_dashboard_link   — Express dashboard login link (payouts view)
  • refresh_status          — pull latest flags from Stripe into the DB
  • sync_account            — same, driven by the account.updated webhook

Readiness flags (cached on `tenants` so status reads never hit Stripe — scalable
across many brands):
  connect_charges_enabled   — can accept customer payments
  connect_payouts_enabled   — can receive payouts to their bank
  connect_details_submitted — finished the onboarding form
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _stripe():
    """Stripe with the platform's key. See `_stripe_for(db)` for the
    mode-aware form used wherever a session is at hand."""
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


# What kind of connected account a brand gets, said in full rather than as the
# single word "express".
#
# `type="express"` is the old shorthand for exactly this set, and Stripe now
# refuses the shorthand for platforms whose profile has been filled in. Its
# first answer suggested Accounts v2, which would mean a different API for
# creation, onboarding links, dashboard links and the account.updated
# webhook, none of which the pinned SDK has. Saying the same thing in full is
# accepted in v1 and changes nothing else.
#
# The parts are not free to choose: an Express dashboard requires that the
# platform controls losses, which Stripe enforces and which is what Express
# has always meant. A brand is still merchant of record on its own direct
# charges and carries its own disputes; what sits with the platform is a
# connected account going negative, which is the risk of running a platform
# at all.
_EXPRESS_CONTROLLER = {
    # Required to be the application while the dashboard is express. Stripe
    # refuses the combination outright otherwise.
    "losses": {"payments": "application"},
    # Stripe collects what the brand has to provide, through its hosted
    # onboarding, which is what create_onboarding_link opens.
    "requirement_collection": "stripe",
    # The platform pays Stripe's processing fees, as Express has always done.
    "fees": {"payer": "application"},
    # The brand gets the Express dashboard for its payouts and balance.
    "stripe_dashboard": {"type": "express"},
}


class ConnectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _bypass_rls(self) -> None:
        """account.updated webhooks carry no auth (get_db pins NO_TENANT). Writing
        a brand's tenants row then needs RLS bypass — see BillingService._bypass_rls."""
        await self.db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))

    async def _suffix(self) -> str:
        """"" in live mode, "_test" in test mode.

        A connected account belongs to the world it was created in, so each
        mode keeps its own columns. Without this a brand onboarded in test
        reads as connected and ready under a live key, and every charge on
        it fails with "No such account" — a green dashboard over a checkout
        that cannot take money.
        """
        from app.services import stripe_mode

        return "" if await stripe_mode.current(self.db) == stripe_mode.LIVE else "_test"

    async def _get_tenant(self, tenant_id: str) -> dict | None:
        """The brand, with this mode's Connect columns under the plain names.

        Callers read `stripe_connect_account_id` and get whichever world the
        platform is in, so none of them has to know the mode.
        """
        sfx = await self._suffix()
        row = (await self.db.execute(text(f"""
            SELECT id, slug, name, email,
                   stripe_connect_account_id{sfx} AS stripe_connect_account_id,
                   connect_charges_enabled{sfx}   AS connect_charges_enabled,
                   connect_payouts_enabled{sfx}   AS connect_payouts_enabled,
                   connect_details_submitted{sfx} AS connect_details_submitted,
                   connect_onboarded_at{sfx}      AS connect_onboarded_at
            FROM tenants WHERE id = :t
        """), {"t": str(tenant_id)})).mappings().first()
        return dict(row) if row else None

    async def _get_tenant_by_account(self, account_id: str) -> dict | None:
        """Owner of a connected account, looked up in either world.

        An account.updated arriving for the mode we are not currently in is
        still that brand's account, and dropping it would leave the flags
        stale for whenever the platform switches back.
        """
        row = (await self.db.execute(text("""
            SELECT id, slug FROM tenants
            WHERE stripe_connect_account_id = :a
               OR stripe_connect_account_id_test = :a
        """), {"a": account_id})).mappings().first()
        return dict(row) if row else None

    # ── Account provisioning ──────────────────────────────────────────────────
    async def create_or_get_account(self, tenant_id: str) -> str:
        """Return the brand's Express account id, creating it once. Idempotent."""
        tenant = await self._get_tenant(tenant_id)
        if not tenant:
            raise ValueError("Tenant not found")
        if tenant.get("stripe_connect_account_id"):
            return tenant["stripe_connect_account_id"]

        s = await _stripe_for(self.db)
        common = {
            "country": "US",
            "email": tenant.get("email"),
            "capabilities": {
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
            "business_profile": {"name": tenant.get("name")},
            "metadata": {"tenant_id": str(tenant["id"]), "tenant_slug": tenant["slug"], "app": "at360"},
        }
        try:
            account = s.Account.create(controller=_EXPRESS_CONTROLLER, **common)
        except stripe.InvalidRequestError as exc:
            # A platform configured before `controller` existed can still only
            # be asked the old way. Falling back keeps such a platform working
            # rather than making this change a migration everybody has to do.
            if "controller" not in str(exc).lower():
                raise
            logger.info("controller form refused, creating an Express account the old way: %s", exc)
            account = s.Account.create(type="express", **common)
        sfx = await self._suffix()
        await self.db.execute(text(f"""
            UPDATE tenants SET stripe_connect_account_id{sfx} = :a, updated_at = now()
            WHERE id = :t
        """), {"a": account.id, "t": str(tenant_id)})
        return account.id

    # ── Hosted links (always fresh — Stripe links expire in minutes) ──────────
    async def create_onboarding_link(self, tenant_id: str) -> dict:
        account_id = await self.create_or_get_account(tenant_id)
        frontend = get_settings().FRONTEND_URL.rstrip("/")
        s = await _stripe_for(self.db)
        link = s.AccountLink.create(
            account=account_id,
            refresh_url=f"{frontend}/admin/billing?status=refresh",
            return_url=f"{frontend}/admin/billing?status=return",
            type="account_onboarding",
        )
        return {"onboarding_url": link.url, "expires_at": link.expires_at}

    async def create_dashboard_link(self, tenant_id: str) -> dict:
        tenant = await self._get_tenant(tenant_id)
        if not tenant or not tenant.get("stripe_connect_account_id"):
            raise ValueError("Brand has not started Connect onboarding yet")
        s = await _stripe_for(self.db)
        link = s.Account.create_login_link(tenant["stripe_connect_account_id"])
        return {"dashboard_url": link.url}

    # ── Status (DB read — never hits Stripe) ──────────────────────────────────
    async def get_status(self, tenant_id: str) -> dict:
        tenant = await self._get_tenant(tenant_id)
        if not tenant:
            raise ValueError("Tenant not found")
        from app.services import stripe_mode

        onboarded = tenant.get("connect_onboarded_at")
        return {
            # Said out loud, because "not connected" right after the platform
            # switched mode is confusing otherwise — the brand did onboard,
            # just in the other world.
            "mode": await stripe_mode.current(self.db),
            "connected": bool(tenant.get("stripe_connect_account_id")),
            "account_id": tenant.get("stripe_connect_account_id"),
            "charges_enabled": bool(tenant.get("connect_charges_enabled")),
            "payouts_enabled": bool(tenant.get("connect_payouts_enabled")),
            "details_submitted": bool(tenant.get("connect_details_submitted")),
            "onboarded_at": onboarded.isoformat() if onboarded else None,
            # A brand can only take customer money once charges are enabled.
            "ready_to_accept_payments": bool(tenant.get("connect_charges_enabled")),
        }

    # ── Sync from Stripe (on-demand refresh or account.updated webhook) ───────
    async def refresh_status(self, tenant_id: str) -> dict:
        tenant = await self._get_tenant(tenant_id)
        if not tenant or not tenant.get("stripe_connect_account_id"):
            raise ValueError("Brand has not started Connect onboarding yet")
        s = await _stripe_for(self.db)
        account = s.Account.retrieve(tenant["stripe_connect_account_id"])
        await self._apply_account(str(tenant["id"]), account)
        return await self.get_status(tenant_id)

    async def sync_account(self, account: dict) -> None:
        """account.updated webhook → update the owning brand's readiness flags."""
        await self._bypass_rls()
        account_id = account.get("id")
        owner = await self._get_tenant_by_account(account_id)
        if not owner:
            logger.warning("account.updated for unknown connected account %s", account_id)
            return
        await self._apply_account(str(owner["id"]), account)

    async def _apply_account(self, tenant_id: str, account) -> None:
        charges = bool(account.get("charges_enabled"))
        payouts = bool(account.get("payouts_enabled"))
        details = bool(account.get("details_submitted"))
        # Stamp onboarded_at the first time details are submitted.
        onboarded_at = datetime.now(timezone.utc) if details else None

        # Which world's flags these are is decided by the account the event is
        # about, not by the mode the platform happens to be in. A webhook for
        # a test account can arrive while the platform is live — writing it to
        # the live columns would mark a brand ready to take real cards on the
        # strength of a test onboarding.
        account_id = account.get("id")
        sfx = "_test" if account_id and await self._is_test_account(tenant_id, account_id) else ""
        await self.db.execute(text(f"""
            UPDATE tenants SET
                connect_charges_enabled{sfx} = :c,
                connect_payouts_enabled{sfx} = :p,
                connect_details_submitted{sfx} = :d,
                connect_onboarded_at{sfx} = COALESCE(connect_onboarded_at{sfx}, :oa),
                updated_at = now()
            WHERE id = :t
        """), {"c": charges, "p": payouts, "d": details, "oa": onboarded_at, "t": tenant_id})

    async def _is_test_account(self, tenant_id: str, account_id: str) -> bool:
        """Whether this account is the brand's test one rather than its live one."""
        return bool((await self.db.execute(text("""
            SELECT 1 FROM tenants
            WHERE id = :t AND stripe_connect_account_id_test = :a
        """), {"t": str(tenant_id), "a": account_id})).first())
