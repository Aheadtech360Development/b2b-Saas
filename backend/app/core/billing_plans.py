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

Two flags a plan may carry (both default to False when absent):
- `enforce_limits`: its limits bind (the order notice, the staff cap). The
  print plans' figures are shown but not enforced until the manager says so
  (owner, 2026-10-28); Retail's are.
- `public`: offered on sign-up, pricing and the Billing page. A plan that is
  not public can still be set on a shop from the platform console, which is
  how a test shop tries it before launch.
"""
from __future__ import annotations

from app.core.features import ALL_FEATURES, PLAN_FEATURES

# Cheapest -> most expensive. Drives the pricing table order in the UI.
PLAN_ORDER = ["retail", "starter", "wholesale", "scale"]

BILLING_PLANS: dict[str, dict] = {
    # For D2C and retail brands selling their own products (specs/003-retail-launch).
    "retail": {
        "name": "Retail",
        "amount_cents": 7900,
        "interval": "month",
        "lookup_key": "printcopilot_retail_monthly",
        # No Gang Sheet Builder on Retail, so there is nothing to take a share of.
        "commission_bps": 0,
        "features": sorted(PLAN_FEATURES["retail"]),
        # The owner counts as one of the two staff accounts (owner, 2026-10-28).
        "limits": {"orders_per_month": 200, "staff_accounts": 2, "custom_domains": 1},
        "enforce_limits": True,
        # Not offered until the Retail pages launch (the plan's publish gate).
        "public": False,
        "description": "For D2C and retail brands selling their own products.",
    },
    "starter": {
        "name": "Starter",
        "amount_cents": 9700,
        "interval": "month",
        "lookup_key": "printcopilot_starter_monthly",
        # The share of a Gang Sheet Builder order, in basis points: 280 = 2.8%.
        "commission_bps": 280,
        "features": sorted(PLAN_FEATURES["starter"]),
        "limits": {"orders_per_month": 300, "staff_accounts": 3, "custom_domains": 1},
        "public": True,
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
        "public": True,
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
        "public": True,
        "description": "For high-volume operations that have outgrown fixed limits.",
    },
}

# What each plan is sold on, in the words of the pricing sheet.
PLAN_HIGHLIGHTS: dict[str, list[str]] = {
    # What it already has. Loyalty, gift cards, returns and the tracking page
    # join this list as each one ships, never before.
    "retail": [
        "Storefront and website builder",
        "Cart, checkout and Stripe payments",
        "Live chat and courier connections",
        "Product reviews and the 24/7 AI Data Analytics Agent",
        "Discounts, customers and segments",
        "No platform fee on orders",
    ],
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


def effective_plan(key: str | None) -> str:
    """The plan a stored key is treated as: itself, an old name's successor
    ("growth" is Wholesale), or Starter for anything else.

    Features already fell back this way (core/features.plan_defaults), but the
    commission did not: a brand on a key that is not a plan, like the
    console's old "standard", got Starter's tools and paid 0% on its Gang
    Sheet Builder orders. One answer for both.
    """
    from app.core.features import PLAN_ALIASES

    cleaned = (key or "").strip().lower()
    cleaned = PLAN_ALIASES.get(cleaned, cleaned)
    return cleaned if cleaned in BILLING_PLANS else "starter"


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
        # Not a plan: said so, and what it is treated as, so a screen can offer
        # the fix instead of showing a price that is not being charged.
        return {"key": key or "", "name": (key or "No plan").title(), "known": False,
                "treated_as": effective_plan(key),
                "price_display": "—", "commission_display": "—", "amount_cents": 0}
    return {
        "key": key,
        "known": True,
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
        if not p.get("public"):
            continue
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
