"""
Role-Based Access Control (RBAC) — fixed roles with preset permissions.

Brand team members get one of 5 roles. Each role grants access to a set of
"sections" (scopes). Enforcement happens in the auth middleware for every
/api/v1/admin/* request, and the frontend mirrors this to hide sections.

Roles (DB `users.role` values):
  tenant_admin       → Administrator  (full access)
  tenant_manager     → Manager        (everything except staff + settings)
  tenant_editor      → Editor         (products, storefront, media, content)
  tenant_fulfillment → Order Manager  (orders, customers, inventory, discounts)
  tenant_viewer      → Viewer         (read-only everywhere)
"""
from __future__ import annotations

# All permission sections
SCOPES = {
    "products", "orders", "customers", "storefront", "media", "content",
    "inventory", "discounts", "staff", "settings", "analytics",
}
_ALL = set(SCOPES)

# Operational sections (everything except staff-management + settings).
_OPERATIONAL = {
    "products", "orders", "customers", "storefront", "media",
    "content", "inventory", "discounts", "analytics",
}

# Role → accessible sections. Viewer accesses the operational set but READ-ONLY
# (writes blocked in can_access). Staff + settings stay admin-only.
ROLE_SCOPES: dict[str, set[str]] = {
    "platform_admin": _ALL,
    "tenant_admin": _ALL,
    "tenant_manager": set(_OPERATIONAL),
    "tenant_editor": {"products", "storefront", "media", "content", "analytics"},
    "tenant_fulfillment": {"orders", "customers", "inventory", "discounts", "analytics"},
    "tenant_viewer": set(_OPERATIONAL),  # read-only
}

# Roles that can view but not modify anything.
READ_ONLY_ROLES = {"tenant_viewer"}

# UI label ↔ DB role
ROLE_LABELS: dict[str, str] = {
    "tenant_admin": "Administrator",
    "tenant_manager": "Manager",
    "tenant_editor": "Editor",
    "tenant_fulfillment": "Order Manager",
    "tenant_viewer": "Viewer",
}

# Admin path prefix → required scope. Longest/most-specific first.
_PATH_SCOPES: list[tuple[str, str]] = [
    ("/api/v1/admin/products", "products"),
    ("/api/v1/admin/supplier-catalog", "products"),
    ("/api/v1/admin/inventory", "inventory"),
    ("/api/v1/admin/warehouses", "inventory"),
    ("/api/v1/admin/purchase-orders", "inventory"),
    ("/api/v1/admin/orders", "orders"),
    ("/api/v1/admin/returns", "orders"),
    ("/api/v1/admin/rma", "orders"),
    ("/api/v1/admin/abandoned-carts", "orders"),
    ("/api/v1/admin/customers", "customers"),
    ("/api/v1/admin/contact-submissions", "customers"),
    ("/api/v1/admin/companies", "customers"),
    ("/api/v1/admin/wholesale-applications", "customers"),
    ("/api/v1/admin/pricing-tiers", "customers"),
    ("/api/v1/admin/storefront", "storefront"),
    ("/api/v1/admin/media", "media"),
    ("/api/v1/admin/blog-posts", "content"),
    ("/api/v1/admin/pages-seo", "content"),
    ("/api/v1/admin/style-sheets", "content"),
    ("/api/v1/admin/product-specs", "content"),
    ("/api/v1/admin/discount-groups", "discounts"),
    ("/api/v1/admin/discounts", "discounts"),
    ("/api/v1/admin/variant-pricing", "discounts"),
    ("/api/v1/admin/variant-level-pricing", "discounts"),
    ("/api/v1/admin/users", "staff"),
    ("/api/v1/admin/settings", "settings"),
    ("/api/v1/admin/email-templates", "settings"),
    ("/api/v1/admin/quickbooks", "settings"),
    ("/api/v1/admin/taxes", "settings"),
    ("/api/v1/admin/shipping", "settings"),
    ("/api/v1/admin/standard-shipping", "settings"),
    ("/api/v1/admin/analytics", "analytics"),
    ("/api/v1/admin/reports", "analytics"),
]

_READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def scope_for_path(path: str) -> str | None:
    """Return the required scope for an admin path, or None if not gated."""
    for prefix, scope in _PATH_SCOPES:
        if path.startswith(prefix):
            return scope
    return None


def can_access(role: str | None, path: str, method: str) -> bool:
    """Can a user with this role perform `method` on `path`?"""
    role = role or ""
    # Full-access roles.
    if role in ("platform_admin", "tenant_admin"):
        return True

    is_read = method.upper() in _READ_METHODS
    scope = scope_for_path(path)

    if scope is None:
        # Ungated admin path (e.g. generic dashboard data). Read-only roles may
        # only read it; others allowed.
        return is_read if role in READ_ONLY_ROLES else True

    # Section must be accessible to the role at all.
    if scope not in ROLE_SCOPES.get(role, set()):
        return False

    # Read-only roles can view accessible sections but never write.
    if role in READ_ONLY_ROLES:
        return is_read

    return True


def scopes_for_role(role: str | None) -> list[str]:
    """List of sections a role can access (for the frontend)."""
    role = role or ""
    if role in ("platform_admin", "tenant_admin"):
        return sorted(_ALL)
    return sorted(ROLE_SCOPES.get(role, set()))
