"""The program's activity log: who did what, when, and why.

Every action that changes money or access goes through here with its reason,
and the log is what the Activity log screen and each affiliate's Activity tab
read. A database trigger refuses any change to a row once written (0061), and
the table has no foreign keys, so it never blocks anything else being
deleted. The actor is kept as words, which still say who it was after their
account is gone.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _json(value: Any) -> str | None:
    return None if value is None else json.dumps(value, default=str)


async def log(
    db: AsyncSession,
    *,
    action: str,
    actor_kind: str = "system",
    actor_name: str | None = None,
    actor_email: str | None = None,
    partner_id: Any = None,
    subject_kind: str | None = None,
    subject_id: Any = None,
    reason: str | None = None,
    before: Any = None,
    after: Any = None,
) -> None:
    await db.execute(text("""
        INSERT INTO partner_activity
            (actor_kind, actor_name, actor_email, partner_id, subject_kind, subject_id,
             action, reason, before, after)
        VALUES (:kind, :name, :email, CAST(:pid AS uuid), :sk, :sid, :action, :reason,
                CAST(:before AS jsonb), CAST(:after AS jsonb))
    """), {
        "kind": actor_kind, "name": actor_name, "email": actor_email,
        "pid": str(partner_id) if partner_id else None,
        "sk": subject_kind, "sid": str(subject_id) if subject_id is not None else None,
        "action": action, "reason": (reason or "").strip() or None,
        "before": _json(before), "after": _json(after),
    })
