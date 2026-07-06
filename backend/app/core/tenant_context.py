"""
Per-request tenant context.

A ContextVar holds the current tenant_id for the duration of a single request
(or background task). Because ContextVars are isolated per asyncio task, there is
no cross-request leakage — unlike a module global or a pooled DB session variable.

The middleware sets this at the start of each request:
  • authenticated requests → tenant_id from the JWT claim
  • public storefront requests → tenant_id resolved from the subdomain

The SQLAlchemy events in app.core.tenant_scope read it to auto-scope queries.

Platform-admin / system operations set the tenant to None AND flag bypass so the
scoping layer does not filter (they legitimately operate across all tenants).
"""
from __future__ import annotations

import uuid
from contextvars import ContextVar

# Current tenant id for this request/task (None = no tenant resolved yet).
_current_tenant_id: ContextVar[uuid.UUID | None] = ContextVar("current_tenant_id", default=None)

# Current tenant slug (subdomain) — used for readable, consistent storage folders.
_current_tenant_slug: ContextVar[str | None] = ContextVar("current_tenant_slug", default=None)

# When True, tenant scoping is bypassed entirely (platform admin / system jobs).
_bypass_scoping: ContextVar[bool] = ContextVar("bypass_tenant_scoping", default=False)


def set_current_tenant_slug(slug: str | None) -> None:
    _current_tenant_slug.set(slug or None)


def get_current_tenant_slug() -> str | None:
    return _current_tenant_slug.get()


def set_current_tenant(tenant_id: uuid.UUID | str | None) -> None:
    """Set the active tenant for the current context."""
    if tenant_id is None:
        _current_tenant_id.set(None)
        return
    if isinstance(tenant_id, str):
        try:
            tenant_id = uuid.UUID(tenant_id)
        except (ValueError, AttributeError):
            _current_tenant_id.set(None)
            return
    _current_tenant_id.set(tenant_id)


def get_current_tenant_id() -> uuid.UUID | None:
    """Return the active tenant id, or None if none is set."""
    return _current_tenant_id.get()


def set_bypass_scoping(bypass: bool) -> None:
    """Enable/disable tenant scoping for the current context (platform admin/system)."""
    _bypass_scoping.set(bypass)


def is_scoping_bypassed() -> bool:
    """True when tenant scoping should be skipped (platform admin / system jobs)."""
    return _bypass_scoping.get()


def reset_tenant_context() -> None:
    """Clear tenant context (defensive; ContextVars are per-task so rarely needed)."""
    _current_tenant_id.set(None)
    _bypass_scoping.set(False)
