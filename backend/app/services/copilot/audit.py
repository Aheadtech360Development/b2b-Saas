"""A record of what the copilot looked at and what it changed.

Two different things, kept in two different places on purpose:

* **Lookups** are high-volume reads that answer one question and are gone. They
  go to the application log as one structured line each — enough to see which
  tool a question used, how long it took and whether it failed, without filling
  a table with rows nobody will ever read.

* **Changes** go in `audit_log`, the same table every other admin write lands
  in, so "who confirmed this order" has one answer whether it was done on the
  order screen or through the copilot. The entry says it came from the copilot
  and carries the exact action and inputs the admin confirmed.

Neither records the question itself. A prompt can contain anything the person
typed, and the useful part — which tool ran against which record — is captured
without keeping that.
"""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import get_current_tenant_id

logger = logging.getLogger("copilot.audit")


def log_tool_call(*, scope: str, tool: str, args: dict, ms: int, ok: bool, note: str = "") -> None:
    """One line per lookup. Argument names are kept, values are not — a customer
    name in a search is the admin's data, not something to leave in logs."""
    logger.info(
        "copilot tool tenant=%s scope=%s tool=%s args=%s ms=%d ok=%s%s",
        get_current_tenant_id() or "-", scope, tool,
        ",".join(sorted(args)) or "-", ms, ok, f" note={note}" if note else "",
    )


async def log_action(
    db: AsyncSession,
    *,
    action: str,
    params: dict,
    summary: str,
    admin_user_id: str | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Record a confirmed change in the admin audit trail. Best-effort: a failure
    to write the log must not undo the change the admin just made — but it is
    logged loudly, because an unlogged change is the thing this exists to stop."""
    from app.models.system import AuditLog

    try:
        tenant = get_current_tenant_id()
        db.add(AuditLog(
            tenant_id=uuid.UUID(str(tenant)) if tenant else None,
            admin_user_id=uuid.UUID(str(admin_user_id)) if admin_user_id else None,
            # Every copilot action changes something that already exists.
            action="UPDATE",
            entity_type=f"copilot:{action}",
            entity_id=(params.get("order_number") or params.get("reference")
                       or params.get("company_name") or None),
            new_values=json.dumps({"via": "copilot", "summary": summary, "params": params}, default=str),
            ip_address=ip_address,
            user_agent=(user_agent or "")[:500] or None,
        ))
        await db.flush()
    except Exception:
        logger.exception("copilot action NOT audited: %s %s", action, params)
