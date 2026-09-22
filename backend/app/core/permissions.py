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

import re
from typing import Any

# All permission sections.
SCOPES = {
    "products", "collections", "orders", "customers", "storefront", "media",
    "content", "inventory", "discounts", "staff", "settings", "analytics",
    "billing", "payouts", "audit",
}
_ALL = set(SCOPES)

# Sections where a mistake costs money, leaks data, or changes who can do what.
# A partial-access user reads these unless write is granted by name: handing
# somebody "Settings" so they can check a tax rate should not also let them
# rewrite the brand's payout account.
SENSITIVE_SCOPES = {"staff", "settings", "billing", "payouts", "audit"}

# Read and write, spelled once so the API, the UI and this module agree.
READ, WRITE = "read", "write"

# Operational sections (everything except staff-management, settings and money).
_OPERATIONAL = {
    "products", "collections", "orders", "customers", "storefront", "media",
    "content", "inventory", "discounts", "analytics",
}

# Role → accessible sections. Viewer accesses the operational set but READ-ONLY
# (writes blocked in can_access). Staff + settings stay admin-only.
ROLE_SCOPES: dict[str, set[str]] = {
    "platform_admin": _ALL,
    "tenant_admin": _ALL,
    "tenant_manager": set(_OPERATIONAL),
    "tenant_editor": {"products", "collections", "storefront", "media", "content", "analytics"},
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
    # Longest first: /products/collections must not be swallowed by /products.
    ("/api/v1/admin/collections", "collections"),
    ("/api/v1/admin/products", "products"),
    ("/api/v1/admin/reviews", "products"),
    ("/api/v1/admin/google-reviews", "products"),
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
    ("/api/v1/admin/roles", "staff"),
    # Money and history get their own sections rather than riding on
    # "settings": reading a tax rate and moving a payout account are not the
    # same permission, and treating them as one is how a viewer ends up able
    # to change where the brand's money lands.
    ("/api/v1/admin/audit-log", "audit"),
    ("/api/v1/admin/settings/audit-log", "audit"),
    ("/api/v1/admin/billing", "billing"),
    ("/api/v1/admin/payouts", "payouts"),
    ("/api/v1/admin/connect", "payouts"),
    ("/api/v1/admin/disputes", "billing"),
    ("/api/v1/admin/refunds", "billing"),
    ("/api/v1/admin/settings", "settings"),
    ("/api/v1/admin/email-templates", "settings"),
    ("/api/v1/admin/taxes", "settings"),
    ("/api/v1/admin/shipping", "settings"),
    ("/api/v1/admin/standard-shipping", "settings"),
    ("/api/v1/admin/analytics", "analytics"),
    ("/api/v1/admin/reports", "analytics"),
]

_READ_METHODS = {"GET", "HEAD", "OPTIONS"}

# Actions that live under one section but move money, so they also need write
# access to a second one. A refund is an order action, but it sends the brand's
# money back to a card; somebody allowed to ship orders is not, by that alone,
# allowed to do that.
_ALSO_REQUIRES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^/api/v1/admin/orders/[^/]+/refund/?$"), "billing"),
]


def extra_scope_for(path: str, method: str) -> str | None:
    """The second section a money-moving write needs, if any."""
    if method.upper() in _READ_METHODS:
        return None
    for pattern, scope in _ALSO_REQUIRES:
        if pattern.match(path):
            return scope
    return None


def scope_for_path(path: str) -> str | None:
    """Return the required scope for an admin path, or None if not gated."""
    for prefix, scope in _PATH_SCOPES:
        if path.startswith(prefix):
            return scope
    return None


def normalise_scopes(scopes: Any, read_only: bool = False) -> dict[str, str]:
    """A permission set as {section: "read" | "write"}, however it was stored.

    Roles used to hold a plain list of sections plus one `read_only` flag for
    all of them, which cannot express the common case: let somebody work
    through orders but only look at settings. A dict says it per section, and
    the old list form still loads — a list under `read_only` reads everywhere,
    otherwise it writes everywhere it names, exactly as before.

    A sensitive section in the old list form is downgraded to read, because a
    list was never an explicit grant of write over payouts or staff.
    """
    if isinstance(scopes, dict):
        out: dict[str, str] = {}
        for key, level in scopes.items():
            if key not in SCOPES:
                continue
            out[key] = WRITE if str(level).lower() == WRITE and not read_only else READ
        return out

    if isinstance(scopes, (list, tuple, set)):
        out = {}
        for key in scopes:
            if key not in SCOPES:
                continue
            if read_only or key in SENSITIVE_SCOPES:
                out[key] = READ
            else:
                out[key] = WRITE
        return out

    return {}


def can_access(
    role: str | None,
    path: str,
    method: str,
    scopes: Any = None,
    read_only: bool = False,
) -> bool:
    """Can a user perform `method` on `path`?

    One place, used by the middleware for every /api/v1/admin/* request, so a
    permission cannot be enforced in the UI and forgotten on the API.

    `scopes` describes a partial-access user: either {section: "read"|"write"}
    or the older plain list. A section that is not named is not accessible at
    all, and a section granted `read` allows GET and nothing else.
    """
    role = role or ""
    # Full access. Nothing below applies.
    if role in ("platform_admin", "tenant_admin"):
        return True

    is_read = method.upper() in _READ_METHODS
    scope = scope_for_path(path)

    also = extra_scope_for(path, method)

    # Partial access: an explicit permission set.
    if scopes is not None:
        allowed = normalise_scopes(scopes, read_only)
        if also is not None and allowed.get(also) != WRITE:
            return False
        if scope is None:
            # An admin path nothing has mapped yet. Reading is fine; writing is
            # refused, because an unmapped path is one nobody has decided about
            # and guessing "allowed" is how a new endpoint ships ungated.
            return is_read
        level = allowed.get(scope)
        if level is None:
            return False
        return is_read if level == READ else True

    # Fixed role. The second section is always a sensitive one, which a fixed
    # role below full access only ever reads — so these actions are refused.
    if also is not None:
        return False
    if scope is None:
        return is_read if role in READ_ONLY_ROLES else True
    if scope not in ROLE_SCOPES.get(role, set()):
        return False
    if role in READ_ONLY_ROLES:
        return is_read
    # A fixed role that reaches a sensitive section still only reads it; the
    # roles that are meant to change those settings have full access.
    if scope in SENSITIVE_SCOPES:
        return is_read
    return True


def scopes_for_role(role: str | None) -> list[str]:
    """List of sections a role can access (for the frontend)."""
    role = role or ""
    if role in ("platform_admin", "tenant_admin"):
        return sorted(_ALL)
    return sorted(ROLE_SCOPES.get(role, set()))


def permissions_for(role: str | None, scopes: Any = None,
                    read_only: bool = False) -> dict[str, str]:
    """What this user may do, per section — what the frontend hides by.

    The frontend mirrors this to hide what somebody cannot use; the middleware
    is what actually stops them. Both read the same function, so a screen
    cannot quietly offer something the API will refuse.
    """
    role = role or ""
    if role in ("platform_admin", "tenant_admin"):
        return {scope: WRITE for scope in sorted(_ALL)}
    if scopes is not None:
        return normalise_scopes(scopes, read_only)
    allowed = ROLE_SCOPES.get(role, set())
    if role in READ_ONLY_ROLES:
        return {scope: READ for scope in sorted(allowed)}
    return {
        scope: (READ if scope in SENSITIVE_SCOPES else WRITE)
        for scope in sorted(allowed)
    }
