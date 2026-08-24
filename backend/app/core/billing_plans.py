"""Tier definitions for platform billing (System A — brand -> platform).

Single source of truth for the subscription tiers a brand can be on. Amounts are
in USD cents. Feature keys line up with `tenant_feature_flags.feature` so a plan
change flips exactly the right flags (see create_tenant defaults). Stripe
Product/Price objects are created from this config by
scripts/setup_stripe_billing.py; the resulting price ids are stored in
app_settings under `stripe_price_<key>` and looked up at runtime.

To change pricing/tiers: edit this file, re-run setup_stripe_billing.py. In test
mode the Stripe objects are throwaway, so iterating is cheap.
"""
from __future__ import annotations

# Cheapest -> most expensive. Drives the pricing table order in the UI.
PLAN_ORDER = ["starter", "growth", "scale"]

# Every feature flag a plan can toggle. Must match tenant_feature_flags.feature.
ALL_FEATURES = ["supplier_catalog", "markup_rules", "staff_accounts", "audit_logs"]

BILLING_PLANS: dict[str, dict] = {
    "starter": {
        "name": "Starter",
        "amount_cents": 2900,
        "interval": "month",
        "lookup_key": "at360_starter_monthly",
        "features": ["staff_accounts"],
        "limits": {"admin_seats": 1, "products": 500},
        "description": "Get selling: storefront, catalog, 1 admin seat.",
    },
    "growth": {
        "name": "Growth",
        "amount_cents": 9900,
        "interval": "month",
        "lookup_key": "at360_growth_monthly",
        "features": ["staff_accounts", "supplier_catalog", "markup_rules"],
        "limits": {"admin_seats": 5, "products": 10000},
        "description": "Scale up: supplier catalog, markup rules, 5 admin seats.",
    },
    "scale": {
        "name": "Scale",
        "amount_cents": 29900,
        "interval": "month",
        "lookup_key": "at360_scale_monthly",
        "features": ["staff_accounts", "supplier_catalog", "markup_rules", "audit_logs"],
        "limits": {"admin_seats": None, "products": None},  # None = unlimited
        "description": "Everything: audit logs, unlimited seats, priority support.",
    },
}


def get_plan(key: str) -> dict | None:
    """Return the plan definition, or None if the key is unknown."""
    return BILLING_PLANS.get(key)


def is_valid_plan(key: str) -> bool:
    return key in BILLING_PLANS


def features_for_plan(key: str) -> dict[str, bool]:
    """Map every known feature to on/off for the given plan.

    Used on plan change to reconcile a brand's tenant_feature_flags with what
    their tier includes.
    """
    plan = BILLING_PLANS.get(key) or {}
    enabled = set(plan.get("features", []))
    return {f: (f in enabled) for f in ALL_FEATURES}


def public_pricing_table() -> list[dict]:
    """Ordered, UI-safe view of the plans (no internal keys)."""
    out = []
    for key in PLAN_ORDER:
        p = BILLING_PLANS[key]
        out.append({
            "key": key,
            "name": p["name"],
            "amount_cents": p["amount_cents"],
            "price_display": f"${p['amount_cents'] // 100}/mo",
            "interval": p["interval"],
            "features": p["features"],
            "limits": p["limits"],
            "description": p["description"],
        })
    return out
