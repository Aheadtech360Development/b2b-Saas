"""What a brand pays the platform, and what that buys.

Single source of truth for the tiers. Amounts are in USD cents. The features a
plan includes live in `app/core/features.py` — one catalogue, so a plan change
and the platform's own overrides are talking about the same things.

A tier is a flat monthly plan plus a commission on Gang Sheet Builder orders
only; nothing else on a brand's store is metered. See the pricing sheet in
designs/Platform-Pricing-Page.html.

Stripe Product/Price objects are created from this by
scripts/setup_stripe_billing.py; the resulting price ids are stored in
app_settings under `stripe_price_<key>` and looked up at runtime.
"""
from __future__ import annotations

from app.core.features import ALL_FEATURES, PLAN_FEATURES

# Cheapest -> most expensive. Drives the pricing table order in the UI.
PLAN_ORDER = ["starter", "wholesale", "scale"]

BILLING_PLANS: dict[str, dict] = {
    "starter": {
        "name": "Starter",
        "amount_cents": 9700,
        "interval": "month",
        "lookup_key": "printcopilot_starter_monthly",
        # The share of a Gang Sheet Builder order, in basis points: 280 = 2.8%.
        "commission_bps": 280,
        "features": sorted(PLAN_FEATURES["starter"]),
        "limits": {"orders_per_month": 300, "staff_accounts": 3, "custom_domains": 1},
        "description": "For shops not yet running wholesale volume.",
    },
    "wholesale": {
        "name": "Wholesale",
        "amount_cents": 29700,
        "interval": "month",
        "lookup_key": "printcopilot_wholesale_monthly",
        "commission_bps": 190,
        "features": sorted(PLAN_FEATURES["wholesale"]),
        "limits": {"orders_per_month": 1500, "staff_accounts": 10, "custom_domains": 3},
        "description": "For shops running real bulk and wholesale order volume.",
    },
    "scale": {
        "name": "Scale",
        "amount_cents": 49700,
        "interval": "month",
        "lookup_key": "printcopilot_scale_monthly",
        "commission_bps": 130,
        "features": sorted(PLAN_FEATURES["scale"]),
        # None = unlimited.
        "limits": {"orders_per_month": None, "staff_accounts": None, "custom_domains": None},
        "description": "For high-volume operations that have outgrown fixed limits.",
    },
}

# What each plan is sold on, in the words of the pricing sheet.
PLAN_HIGHLIGHTS: dict[str, list[str]] = {
    "starter": [
        "Orders, drafts, shipping labels, abandoned checkouts, returns, purchase orders",
        "Products, collections, reviews, inventory, multi-location inventory",
        "Customers and segments",
        "Storefront, theme, discounts, blog, SEO, pages, menus, custom domains",
        "24/7 AI Data Analytics Agent",
        "Gang Sheet Builder access",
    ],
    "wholesale": [
        "Everything in Starter",
        "Wholesale accounts, sign-up and approval",
        "Customer tiers and discounts",
        "Net terms and credit at checkout",
        "Invoices for net terms accounts",
        "Matrix ordering grid and Quick Buy reorder",
    ],
    "scale": [
        "Everything in Wholesale",
        "Lowest commission, 1.3%",
        "Mobile app included",
        "Priority support, faster than the standard response window",
    ],
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
    enabled = set((BILLING_PLANS.get(key) or {}).get("features", []))
    return {f: (f in enabled) for f in ALL_FEATURES}


def _limit(value: int | None) -> str:
    return "Unlimited" if value is None else f"{value:,}"


def plan_summary(key: str | None) -> dict:
    """How one brand's plan should read wherever it is shown.

    The console listed brands by a bare key — "starter" — which says neither
    what the brand pays nor what we take. One shape, so the list and the manage
    panel can never disagree about it.
    """
    p = BILLING_PLANS.get((key or "").strip().lower())
    if not p:
        return {"key": key or "", "name": (key or "No plan").title(),
                "price_display": "—", "commission_display": "—", "amount_cents": 0}
    return {
        "key": key,
        "name": p["name"],
        "amount_cents": p["amount_cents"],
        "price_display": f"${p['amount_cents'] // 100}/mo",
        "commission_display": f"{p['commission_bps'] / 100:.1f}%",
        "limits_display": (
            f"{_limit(p['limits']['orders_per_month'])} orders/month · "
            f"{_limit(p['limits']['staff_accounts'])} staff accounts"
        ),
        "description": p["description"],
    }


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
            "commission_display": f"{p['commission_bps'] / 100:.1f}%",
            "commission_bps": p["commission_bps"],
            "interval": p["interval"],
            "features": p["features"],
            "highlights": PLAN_HIGHLIGHTS.get(key, []),
            "limits": p["limits"],
            "limits_display": (
                f"{_limit(p['limits']['orders_per_month'])} orders/month · "
                f"{_limit(p['limits']['staff_accounts'])} staff accounts"
            ),
            "description": p["description"],
        })
    return out
