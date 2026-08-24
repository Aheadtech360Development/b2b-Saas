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
    stripe.api_key = get_settings().STRIPE_SECRET_KEY
    return stripe


class ConnectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _bypass_rls(self) -> None:
        """account.updated webhooks carry no auth (get_db pins NO_TENANT). Writing
        a brand's tenants row then needs RLS bypass — see BillingService._bypass_rls."""
        await self.db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))

    async def _get_tenant(self, tenant_id: str) -> dict | None:
        row = (await self.db.execute(text("""
            SELECT id, slug, name, email, stripe_connect_account_id,
                   connect_charges_enabled, connect_payouts_enabled,
                   connect_details_submitted, connect_onboarded_at
            FROM tenants WHERE id = :t
        """), {"t": str(tenant_id)})).mappings().first()
        return dict(row) if row else None

    async def _get_tenant_by_account(self, account_id: str) -> dict | None:
        row = (await self.db.execute(text("""
            SELECT id, slug FROM tenants WHERE stripe_connect_account_id = :a
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

        s = _stripe()
        account = s.Account.create(
            type="express",
            country="US",
            email=tenant.get("email"),
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
            business_profile={"name": tenant.get("name")},
            metadata={"tenant_id": str(tenant["id"]), "tenant_slug": tenant["slug"], "app": "at360"},
        )
        await self.db.execute(text("""
            UPDATE tenants SET stripe_connect_account_id = :a, updated_at = now()
            WHERE id = :t
        """), {"a": account.id, "t": str(tenant_id)})
        return account.id

    # ── Hosted links (always fresh — Stripe links expire in minutes) ──────────
    async def create_onboarding_link(self, tenant_id: str) -> dict:
        account_id = await self.create_or_get_account(tenant_id)
        frontend = get_settings().FRONTEND_URL.rstrip("/")
        s = _stripe()
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
        s = _stripe()
        link = s.Account.create_login_link(tenant["stripe_connect_account_id"])
        return {"dashboard_url": link.url}

    # ── Status (DB read — never hits Stripe) ──────────────────────────────────
    async def get_status(self, tenant_id: str) -> dict:
        tenant = await self._get_tenant(tenant_id)
        if not tenant:
            raise ValueError("Tenant not found")
        onboarded = tenant.get("connect_onboarded_at")
        return {
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
        s = _stripe()
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
        await self.db.execute(text("""
            UPDATE tenants SET
                connect_charges_enabled = :c,
                connect_payouts_enabled = :p,
                connect_details_submitted = :d,
                connect_onboarded_at = COALESCE(connect_onboarded_at, :oa),
                updated_at = now()
            WHERE id = :t
        """), {"c": charges, "p": payouts, "d": details, "oa": onboarded_at, "t": tenant_id})
