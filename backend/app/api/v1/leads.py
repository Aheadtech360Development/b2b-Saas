"""printcopilot.co's own forms: a demo request, and a contact message sent from
the platform's address.

Kept in our own database (platform_leads, migration 0064) for the platform
console's Leads list, and the platform team is emailed about each one. They
went to an outside CRM through a webhook before; nothing about them leaves
the platform now.

A lead belongs to no shop, so the table has no tenant and the session here
reads and writes it without one, as the partner program's public doors do.
"""
from __future__ import annotations

import json
import logging
from html import escape
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import client_ip, enforce_rate_limit
from app.services.partners.db import get_partner_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])

KINDS = {"demo": "Demo request", "contact": "Contact"}
# What a form may send beside the name and email: a few short answers.
MAX_FIELDS = 12
MAX_VALUE = 2000


class LeadIn(BaseModel):
    kind: Literal["demo", "contact"]
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    data: dict[str, str] = Field(default_factory=dict)
    # Left empty by people. A form-filling bot fills every field it finds.
    company: str | None = Field(default=None, max_length=200)

    @field_validator("data")
    @classmethod
    def _small(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > MAX_FIELDS:
            raise ValueError(f"At most {MAX_FIELDS} answers")
        clean: dict[str, str] = {}
        for k, v in value.items():
            key = str(k).strip()[:60]
            if not key:
                continue
            text_value = str(v if v is not None else "").strip()
            if len(text_value) > MAX_VALUE:
                raise ValueError(f"'{key}' is too long")
            clean[key] = text_value
        return clean


def notice_html(kind: str, name: str, email: str, data: dict[str, str]) -> str:
    """The platform team's email: every answer, escaped."""
    # Every cell is HTML already escaped here, so nothing a visitor typed is markup.
    rows = [("Name", escape(name)), ("Email", f'<a href="mailto:{escape(email)}">{escape(email)}</a>')]
    rows += [(escape(k.replace("_", " ").capitalize()), escape(v).replace("\n", "<br>")) for k, v in data.items() if v]
    return (
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">'
        f'<h2 style="margin:0 0 12px">{escape(KINDS.get(kind, kind))} from printcopilot.co</h2>'
        '<table cellpadding="0" cellspacing="0" style="font-size:14px">'
        + "".join(
            f'<tr><td style="padding:6px 24px 6px 0;color:#6B7280;vertical-align:top">{k}</td>'
            f'<td style="padding:6px 0">{v}</td></tr>'
            for k, v in rows
        )
        + '</table><p style="color:#6B7280;font-size:13px;margin:18px 0 0">'
        "Also in the platform console, under Leads.</p></div>"
    )


def _tell_platform(kind: str, name: str, email: str, data: dict[str, str]) -> None:
    """Runs after the response: a lead is saved whether or not the inbox answers."""
    from app.services.email_service import notify_platform

    try:
        notify_platform(f"{KINDS.get(kind, kind)} — {name}", notice_html(kind, name, email, data))
    except Exception:  # noqa: BLE001
        logger.warning("lead notice failed for %s", email, exc_info=True)


async def save_lead(db: AsyncSession, request: Request, kind: str, name: str, email: str,
                    data: dict[str, Any]) -> None:
    """One lead in platform_leads (shared with the contact form's platform messages)."""
    from app.services.partners.auth import ip_hash

    await db.execute(text("""
        INSERT INTO platform_leads (kind, name, email, data, ip_hash)
        VALUES (:kind, :name, :email, CAST(:data AS jsonb), :ip)
    """), {"kind": kind, "name": name.strip()[:160], "email": email.strip().lower()[:255],
           "data": json.dumps(data), "ip": ip_hash(client_ip(request))})


@router.post("", status_code=202)
async def create_lead(payload: LeadIn, request: Request, background: BackgroundTasks,
                      db: AsyncSession = Depends(get_partner_db, scope="function")) -> Any:
    """A demo request (or a contact message) from printcopilot.co."""
    await enforce_rate_limit(request, "platform_lead", limit=10, window=3600)
    if (payload.company or "").strip():
        # Answered as if it went through, so a bot learns nothing.
        return JSONResponse(status_code=202, content={"ok": True})
    await save_lead(db, request, payload.kind, payload.name, payload.email, payload.data)
    background.add_task(_tell_platform, payload.kind, payload.name.strip(), str(payload.email), payload.data)
    return {"ok": True}
