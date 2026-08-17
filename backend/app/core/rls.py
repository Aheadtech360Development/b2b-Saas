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


# Non-bypass role tenant sessions run as, so RLS actually enforces. The app's
# own login role (neondb_owner on Neon) has BYPASSRLS, so it must SET ROLE to
# this one; the role + its grants + the policies are created in the Phase B
# migration. SET LOCAL is transaction-scoped, so it never leaks across a pooled
# connection and resets on commit/rollback.
_APP_ROLE = "app_rls"


def install_rls_session_binding() -> None:
    @event.listens_for(Session, "after_begin")
    def _bind_tenant(session: Session, transaction, connection) -> None:
        if is_scoping_bypassed():
            # Platform admin / system jobs: stay on the login role, which bypasses
            # RLS on Neon — no role switch, sees every tenant.
            try:
                connection.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
                connection.execute(text("SELECT set_config('app.current_tenant', '', true)"))
            except Exception as exc:  # noqa: BLE001
                logger.warning("RLS bypass bind failed: %s", exc)
            return

        tid = get_current_tenant_id()
        # Switch to the non-bypass role in a SAVEPOINT: if the role doesn't exist
        # yet (Phase A deployed before the Phase B migration), the failure is
        # contained and the transaction continues on the login role (RLS not yet
        # enabled anyway) instead of aborting.
        try:
            connection.execute(text("SAVEPOINT rls_role"))
            connection.execute(text(f"SET LOCAL ROLE {_APP_ROLE}"))
            connection.execute(text("RELEASE SAVEPOINT rls_role"))
        except Exception:  # role missing — pre-migration state
            try:
                connection.execute(text("ROLLBACK TO SAVEPOINT rls_role"))
            except Exception:
                pass
        try:
            connection.execute(text("SELECT set_config('app.bypass_rls', 'off', true)"))
            # NULL / unknown tenant → empty string; the policy then matches no rows
            # (fail-closed), the same behaviour as the app-level NO_TENANT.
            connection.execute(
                text("SELECT set_config('app.current_tenant', :t, true)"),
                {"t": str(tid) if tid else ""},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("RLS tenant bind failed: %s", exc)
