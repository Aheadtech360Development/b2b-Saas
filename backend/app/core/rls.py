"""Database-layer tenant isolation (Postgres Row-Level Security) — session binding.

This is Phase A: on every transaction begin, stamp the current tenant into a
Postgres session variable (`app.current_tenant`) plus a bypass flag
(`app.bypass_rls`). On its own this is a harmless no-op — nothing reads those
variables until the RLS policies are enabled (Phase B migration). Deploying this
first guarantees the running app is already setting the variable before any
policy starts enforcing it, so enabling RLS never blackholes live queries.

Why `after_begin` (not once per request): endpoints commit mid-request, which
ends the transaction and clears a LOCAL setting. Re-stamping on every BEGIN keeps
the tenant bound for every transaction, and `set_config(..., is_local=true)`
scopes it to the transaction so a pooled connection never leaks it to the next
request.
"""
from __future__ import annotations

import logging

from sqlalchemy import event, text
from sqlalchemy.orm import Session

from app.core.tenant_context import get_current_tenant_id, is_scoping_bypassed

logger = logging.getLogger(__name__)


def install_rls_session_binding() -> None:
    @event.listens_for(Session, "after_begin")
    def _bind_tenant(session: Session, transaction, connection) -> None:
        try:
            if is_scoping_bypassed():
                # Platform admin / system jobs: bypass RLS entirely.
                connection.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
                connection.execute(text("SELECT set_config('app.current_tenant', '', true)"))
            else:
                tid = get_current_tenant_id()
                connection.execute(text("SELECT set_config('app.bypass_rls', 'off', true)"))
                # NULL / unknown tenant → empty string; policy then matches no rows
                # (fail-closed), the same behaviour as the app-level NO_TENANT.
                connection.execute(
                    text("SELECT set_config('app.current_tenant', :t, true)"),
                    {"t": str(tid) if tid else ""},
                )
        except Exception as exc:  # noqa: BLE001
            # Never break a transaction over the GUC bind. Without RLS enabled this
            # is invisible; with RLS enabled a failure fails closed (no tenant set).
            logger.warning("RLS tenant bind failed: %s", exc)
