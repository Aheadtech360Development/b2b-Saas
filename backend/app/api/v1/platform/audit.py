"""Platform API — the activity log across every brand, and the only way to prune it.

A brand admin reads their own log and can do nothing else to it: the database
refuses UPDATE and DELETE on `audit_log` unless the session sets
`app.audit_admin`, and only this module sets it (migration 0043). So a brand
admin cannot erase their own tracks, and neither can a bug in an admin route.

Pruning is deliberately limited to *old* entries. There is no endpoint that
removes one particular row, because the reason to remove one particular row is
almost always that somebody wants it gone — and every prune is itself recorded,
in a row the same prune cannot reach.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.system import AuditLog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/platform/audit-log", tags=["platform", "audit"])

# Nothing newer than this may be pruned. An investigation into something that
# happened last week must still have last week to look at.
MIN_RETENTION_DAYS = 90


async def _require_platform_admin(request: Request) -> str:
    """Only the platform's own administrators, not a brand's.

    The auth middleware already gates /api/v1/platform/*; this is the second
    check, on the handler itself, so the protection does not rest on one line
    of middleware continuing to match this path.
    """
    if not getattr(request.state, "is_platform_admin", False):
        raise HTTPException(status_code=403, detail="Platform administrator access required")
    return str(getattr(request.state, "user_id", "") or "")


@router.get("")
async def list_all_audit(
    tenant_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: str = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Every brand's activity, for support and investigations."""
    await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))

    query = select(AuditLog).order_by(AuditLog.created_at.desc())
    if tenant_id:
        query = query.where(AuditLog.tenant_id == tenant_id)
    if action:
        query = query.where(AuditLog.action == action.upper())
    if search:
        like = f"%{search.strip()}%"
        query = query.where(
            AuditLog.summary.ilike(like)
            | AuditLog.entity_type.ilike(like)
            | AuditLog.actor_name.ilike(like)
        )

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar_one() or 0
    rows = (await db.execute(
        query.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [
            {
                "id": str(r.id),
                "tenant_id": str(r.tenant_id) if r.tenant_id else None,
                "actor_name": r.actor_name,
                "admin_user_id": str(r.admin_user_id) if r.admin_user_id else None,
                "action": r.action, "entity_type": r.entity_type, "entity_id": r.entity_id,
                "summary": r.summary, "method": r.method, "path": r.path,
                "status_code": r.status_code, "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


class PruneRequest(BaseModel):
    """How far back to keep. Never less than MIN_RETENTION_DAYS."""

    older_than_days: int = Field(..., ge=MIN_RETENTION_DAYS)
    tenant_id: Optional[str] = None
    # Typing the number of rows you expect to remove, which the caller gets
    # from the dry run. A prune that would remove a different number is
    # refused, so "delete everything before 2026" cannot quietly become
    # "delete everything".
    confirm_count: Optional[int] = None
    dry_run: bool = True


@router.post("/prune")
async def prune_audit_log(
    payload: PruneRequest,
    request: Request,
    actor: str = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove entries older than a cutoff. Platform administrators only.

    Defaults to a dry run, refuses anything inside the retention window, and
    records what it did — in an entry written after the delete, so the prune
    cannot remove its own record.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=payload.older_than_days)

    where = "created_at < :cutoff"
    params: dict = {"cutoff": cutoff}
    if payload.tenant_id:
        where += " AND tenant_id = CAST(:tid AS uuid)"
        params["tid"] = payload.tenant_id

    await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
    affected = (await db.execute(
        text(f"SELECT count(*) FROM audit_log WHERE {where}"), params
    )).scalar_one()

    if payload.dry_run:
        return {
            "dry_run": True, "would_remove": affected, "cutoff": cutoff.isoformat(),
            "message": f"{affected} entries are older than {payload.older_than_days} days. "
                       f"Send dry_run=false with confirm_count={affected} to remove them.",
        }

    if payload.confirm_count is None or payload.confirm_count != affected:
        raise HTTPException(
            status_code=409,
            detail=f"That would remove {affected} entries, not {payload.confirm_count}. "
                   "Run the dry run again and confirm the number it reports.",
        )

    # The one place the append-only trigger is lifted, for one statement.
    await db.execute(text("SELECT set_config('app.audit_admin', 'on', true)"))
    try:
        await db.execute(text(f"DELETE FROM audit_log WHERE {where}"), params)
    finally:
        await db.execute(text("SELECT set_config('app.audit_admin', 'off', true)"))
    await db.commit()

    # Written after the delete, so it cannot be inside what was removed.
    from app.middleware.audit_middleware import record_event

    await record_event(
        "DELETE", "audit_log",
        summary=f"Pruned {affected} activity entries older than {payload.older_than_days} days",
        tenant_id=payload.tenant_id,
        user_id=actor or None,
        details={"older_than_days": payload.older_than_days, "removed": affected,
                 "cutoff": cutoff.isoformat()},
        request=request,
    )
    logger.warning("Platform admin %s pruned %d audit entries older than %s",
                   actor, affected, cutoff.isoformat())

    return {"dry_run": False, "removed": affected, "cutoff": cutoff.isoformat()}
