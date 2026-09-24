"""What a brand is allowed to use, and which plan gives it.

Two things live here and nowhere else: the list of features the platform can
switch on or off for a brand, and which of them each plan includes by default.
The platform can then grant or take away any one of them for any brand
regardless of its plan — a shop on Starter can be given the wholesale toolset,
and a shop on Scale can have the blog taken away — because the plan only
decides the default, and an override decides the answer.

Keys are stored in `tenant_feature_flags.feature`. A key never changes once a
brand has a row for it; rename the label instead.
"""
from __future__ import annotations

# ── The catalogue ──────────────────────────────────────────────────────────
# (key, label, group). The order is the order the platform console shows.
FEATURES: list[tuple[str, str, str]] = [
    # Orders and fulfillment
    ("orders", "Orders", "Orders and fulfillment"),
    ("drafts", "Draft orders", "Orders and fulfillment"),
    ("shipping_labels", "Shipping labels", "Orders and fulfillment"),
    ("abandoned_checkouts", "Abandoned checkouts", "Orders and fulfillment"),
    ("returns", "Returns", "Orders and fulfillment"),
    ("purchase_orders", "Purchase orders", "Orders and fulfillment"),
    # Products and catalog
    ("products", "Products and variants", "Products and catalog"),
    ("collections", "Collections", "Products and catalog"),
    ("inventory", "Inventory tracking", "Products and catalog"),
    ("reviews", "Product reviews", "Products and catalog"),
    ("multi_location_inventory", "Multi-location inventory", "Products and catalog"),
    ("supplier_catalog", "Supplier catalogue import", "Products and catalog"),
    # Customers
    ("customers", "Customer records", "Customers"),
    ("segments", "Customer segments", "Customers"),
    ("messages", "Live chat and messaging", "Customers"),
    # Wholesale ordering tools
    ("wholesale_accounts", "Wholesale accounts, sign-up and approval", "Wholesale ordering"),
    ("customer_tiers", "Customer tiers and discounts", "Wholesale ordering"),
    ("matrix_ordering", "Matrix ordering grid", "Wholesale ordering"),
    ("quick_buy", "Quick Buy reorder", "Wholesale ordering"),
    ("net_terms", "Net terms and credit at checkout", "Wholesale ordering"),
    ("invoices", "Invoices for net terms accounts", "Wholesale ordering"),
    # Marketing and storefront
    ("discounts", "Discounts", "Marketing and storefront"),
    ("blog", "Blog", "Marketing and storefront"),
    ("pages", "Pages and SEO", "Marketing and storefront"),
    ("storefront_theme", "Storefront theme", "Marketing and storefront"),
    ("custom_domains", "Custom domains", "Marketing and storefront"),
    # Analytics
    ("analytics", "Sales, product and customer analytics", "Analytics"),
    ("ai_agent", "24/7 AI Data Analytics Agent", "Analytics"),
    # Gang Sheet Builder
    ("gang_sheet", "Gang Sheet Builder", "Gang Sheet Builder"),
    # Operations
    ("staff_accounts", "Staff accounts and roles", "Settings and operations"),
    ("audit_logs", "Audit log", "Settings and operations"),
    ("mobile_app", "Buyer mobile app", "Settings and operations"),
]

ALL_FEATURES: list[str] = [key for key, _, _ in FEATURES]
LABELS: dict[str, str] = {key: label for key, label, _ in FEATURES}
GROUP_OF: dict[str, str] = {key: group for key, _, group in FEATURES}

# The toolset that separates a wholesale plan from a starter one.
_WHOLESALE_ONLY = {
    "wholesale_accounts", "customer_tiers", "matrix_ordering",
    "quick_buy", "net_terms", "invoices",
}
# Scale only.
_SCALE_ONLY = {"mobile_app"}

# Every plan includes everything except what is reserved above.
_BASE = [k for k in ALL_FEATURES if k not in _WHOLESALE_ONLY and k not in _SCALE_ONLY]

PLAN_FEATURES: dict[str, set[str]] = {
    "starter": set(_BASE),
    "wholesale": set(_BASE) | _WHOLESALE_ONLY,
    "scale": set(_BASE) | _WHOLESALE_ONLY | _SCALE_ONLY,
}

# Older plan names kept working so a brand already on one is not cut off.
PLAN_ALIASES = {"growth": "wholesale", "free": "starter", "": "starter"}


def plan_defaults(plan: str | None) -> set[str]:
    """What this plan includes before any per-brand decision."""
    key = (plan or "starter").strip().lower()
    key = PLAN_ALIASES.get(key, key)
    return set(PLAN_FEATURES.get(key, PLAN_FEATURES["starter"]))


# ── Where each feature is enforced ─────────────────────────────────────────
# Admin path prefix → the feature it needs. Longest/most specific first, the
# same way permissions.py maps scopes, so a feature cannot be switched off in
# the console and still reachable through the API.
PATH_FEATURES: list[tuple[str, str]] = [
    ("/api/v1/admin/gang-sheets", "gang_sheet"),
    ("/api/v1/admin/purchase-orders", "purchase_orders"),
    ("/api/v1/admin/returns", "returns"),
    ("/api/v1/admin/rma", "returns"),
    ("/api/v1/admin/abandoned-carts", "abandoned_checkouts"),
    ("/api/v1/admin/wholesale-applications", "wholesale_accounts"),
    ("/api/v1/admin/pricing-tiers", "customer_tiers"),
    ("/api/v1/admin/discount-groups", "customer_tiers"),
    ("/api/v1/admin/segments", "segments"),
    ("/api/v1/admin/contact-submissions", "messages"),
    ("/api/v1/admin/supplier-catalog", "supplier_catalog"),
    ("/api/v1/admin/suppliers", "supplier_catalog"),
    ("/api/v1/admin/google-reviews", "reviews"),
    ("/api/v1/admin/reviews", "reviews"),
    ("/api/v1/admin/blog-posts", "blog"),
    ("/api/v1/admin/pages-seo", "pages"),
    ("/api/v1/admin/discounts", "discounts"),
    ("/api/v1/admin/collections", "collections"),
    ("/api/v1/admin/inventory", "inventory"),
    ("/api/v1/admin/warehouses", "inventory"),
    ("/api/v1/admin/storefront", "storefront_theme"),
    ("/api/v1/admin/analytics", "analytics"),
    ("/api/v1/admin/reports", "analytics"),
    ("/api/v1/admin/copilot", "ai_agent"),
    ("/api/v1/admin/audit-log", "audit_logs"),
    ("/api/v1/admin/roles", "staff_accounts"),
    ("/api/v1/admin/users", "staff_accounts"),
]

# The buyer's side. These are what a brand is actually selling, so a plan that
# does not include them must not leave them working on the storefront.
PUBLIC_PATH_FEATURES: list[tuple[str, str]] = [
    ("/api/v1/gang-sheets", "gang_sheet"),
    ("/api/v1/quick-order", "quick_buy"),
    ("/api/v1/copilot", "ai_agent"),
]


def feature_for_path(path: str, *, public: bool = False) -> str | None:
    """The feature a request needs, or None when it needs none."""
    table = PUBLIC_PATH_FEATURES if public else PATH_FEATURES
    for prefix, feature in table:
        if path.startswith(prefix):
            return feature
    return None
