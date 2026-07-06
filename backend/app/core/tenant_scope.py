"""
Centralized multi-tenant query scoping for SQLAlchemy.

This module installs two global event hooks so that *every* ORM model that
inherits `TenantMixin` is automatically isolated per tenant — without editing
individual routers or queries:

  1. `do_orm_execute`  → appends `WHERE tenant_id = <current>` to every SELECT
                         via `with_loader_criteria`, so a brand can only ever
                         read its own rows.
  2. `before_flush`    → stamps `tenant_id = <current>` on every newly inserted
                         tenant-scoped row, so a brand's writes belong to it.

Scoping is skipped when `is_scoping_bypassed()` is True (platform admin / system
jobs) or when no tenant is set (e.g. migrations, seeds). The current tenant lives
in a per-request ContextVar (app.core.tenant_context), so there is no leakage
between concurrent requests.

Call `install_tenant_scoping()` once at import time (done in app.core.database).
"""
from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.core.tenant_context import get_current_tenant_id, is_scoping_bypassed
from app.models.base import TenantMixin


def install_tenant_scoping() -> None:
    """Register the global SELECT-filter and INSERT-stamp event hooks (idempotent)."""

    # ── Auto-filter SELECTs ───────────────────────────────────────────────────
    @event.listens_for(Session, "do_orm_execute")
    def _add_tenant_filter(orm_execute_state: ORMExecuteState) -> None:
        # Only touch read queries; never rewrite UPDATE/DELETE/bulk statements here.
        if not orm_execute_state.is_select:
            return
        # Skip internal relationship loads / refreshes to avoid double-filtering
        # already-scoped parent rows.
        if orm_execute_state.is_relationship_load:
            return
        # Platform admin / system jobs see everything.
        if is_scoping_bypassed():
            return
        # No tenant resolved → don't filter (migrations, seeds, health checks).
        current_tenant_id = get_current_tenant_id()
        if current_tenant_id is None:
            return

        # Read the tenant id into a local; the lambda captures it as a bound value
        # (SQLAlchemy forbids invoking functions *inside* the criteria lambda).
        orm_execute_state.statement = orm_execute_state.statement.options(
            with_loader_criteria(
                TenantMixin,
                lambda cls: cls.tenant_id == current_tenant_id,
                include_aliases=True,
            )
        )

    # ── Auto-stamp INSERTs ────────────────────────────────────────────────────
    @event.listens_for(Session, "before_flush")
    def _stamp_tenant_on_insert(session: Session, flush_context, instances) -> None:
        if is_scoping_bypassed():
            return
        tenant_id = get_current_tenant_id()
        if tenant_id is None:
            return
        for obj in session.new:
            if isinstance(obj, TenantMixin) and getattr(obj, "tenant_id", None) is None:
                obj.tenant_id = tenant_id
