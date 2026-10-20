"""The platform console's Leads list: printcopilot.co's demo requests and
contact messages (api/v1/leads), newest first, each marked handled once
somebody has answered it.

Platform admins only: every /api/v1/platform/ path is refused to anybody else
by the auth middleware.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.partners.db import get_partner_db

router = APIRouter(prefix="/platform/leads", tags=["platform"])

PAGE = 50


class HandledIn(BaseModel):
    handled: bool


def _row(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "kind": r["kind"],
        "name": r["name"],
        "email": r["email"],
        "data": r["data"] or {},
        "handled_at": r["handled_at"].isoformat() if r["handled_at"] else None,
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
    }


@router.get("")
async def list_leads(
    kind: Literal["demo", "contact"] | None = None,
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_partner_db, scope="function"),
) -> dict[str, Any]:
    where = "WHERE kind = :kind" if kind else ""
    params: dict[str, Any] = {"kind": kind} if kind else {}
    total = (await db.execute(text(f"SELECT count(*) FROM platform_leads {where}"), params)).scalar() or 0
    open_count = (await db.execute(
        text(f"SELECT count(*) FROM platform_leads {where + (' AND' if where else 'WHERE')} handled_at IS NULL"),
        params,
    )).scalar() or 0
    rows = (await db.execute(text(f"""
        SELECT id, kind, name, email, data, handled_at, created_at
          FROM platform_leads {where}
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset
    """), {**params, "limit": PAGE, "offset": (page - 1) * PAGE})).mappings().all()
    return {"items": [_row(r) for r in rows], "total": int(total), "open": int(open_count), "page": page, "per_page": PAGE}


@router.post("/{lead_id}/handled")
async def mark_handled(lead_id: str, data: HandledIn,
                       db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    try:
        uuid.UUID(lead_id)
    except ValueError:  # a malformed id is a lead that is not there
        raise HTTPException(status_code=404, detail="Lead not found")
    row = (await db.execute(text("""
        UPDATE platform_leads
           SET handled_at = CASE WHEN :h THEN COALESCE(handled_at, now()) ELSE NULL END
         WHERE id = CAST(:id AS uuid)
     RETURNING id, kind, name, email, data, handled_at, created_at
    """), {"h": data.handled, "id": lead_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")
    return _row(row)
