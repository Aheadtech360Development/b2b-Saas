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

KINDS = {"demo": "Demo request", "contact": "Contact", "newsletter": "Newsletter sign-up"}
# What a form may send beside the name and email: a few short answers.
MAX_FIELDS = 12
MAX_VALUE = 2000


class LeadIn(BaseModel):
    # newsletter: the blog's subscribe box (printcopilot.co/blog), an email and nothing else.
    kind: Literal["demo", "contact", "newsletter"]
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


def booking_html(name: str, when: str, theirs: str | None) -> str:
    """The visitor's confirmation of a booked demo."""
    local = f" ({escape(theirs)} your time)" if theirs else ""
    return (
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#1F2937">'
        f"<p>Hi {escape(name)},</p>"
        f"<p>Your PrintCoPilot demo is booked for <strong>{escape(when)}</strong>{local}.</p>"
        "<p>We will email you the meeting link before the call. Need a different time? Write to "
        '<a href="mailto:support@printcopilot.co">support@printcopilot.co</a>.</p>'
        "<p>The PrintCoPilot team</p></div>"
    )


def _their_time(at: Any, zone: str | None) -> str | None:
    """The booked time in the visitor's own time zone, if the page sent one we know."""
    from zoneinfo import ZoneInfo

    try:
        local = at.astimezone(ZoneInfo((zone or "").strip()))
    except Exception:  # noqa: BLE001 — an unknown or empty zone: the team's time alone
        return None
    clock = local.strftime("%I:%M %p").lstrip("0")
    return f"{local:%a}, {local:%b} {local.day}, {clock}"


def _confirm_booking(name: str, email: str, when: str, theirs: str | None) -> None:
    """Runs after the response: the booking stands whether or not the mail goes."""
    from app.services.email_service import send_as_platform

    try:
        send_as_platform(email, f"Your PrintCoPilot demo: {when}", booking_html(name, when, theirs))
    except Exception:  # noqa: BLE001
        logger.warning("demo booking mail failed for %s", email, exc_info=True)


@router.get("/demo-slots")
async def demo_slot_list(request: Request,
                         db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict:
    """The demo times still open (printcopilot.co/demo's second step), as UTC starts."""
    from app.services import demo_slots

    await enforce_rate_limit(request, "demo_slots", limit=60, window=300)
    return {
        "zone": str(demo_slots.ZONE),
        "slot_minutes": int(demo_slots.SLOT.total_seconds() // 60),
        "slots": await demo_slots.free(db),
    }


@router.post("", status_code=202)
async def create_lead(payload: LeadIn, request: Request, background: BackgroundTasks,
                      db: AsyncSession = Depends(get_partner_db, scope="function")) -> Any:
    """A demo request (or a contact message) from printcopilot.co.

    A demo request may carry the time the visitor picked (`slot_start`): it
    must still be open, and is kept with the lead as the booking.
    """
    await enforce_rate_limit(request, "platform_lead", limit=10, window=3600)
    if (payload.company or "").strip():
        # Answered as if it went through, so a bot learns nothing.
        return JSONResponse(status_code=202, content={"ok": True})
    data = dict(payload.data)
    booking: tuple[str, str | None] | None = None
    if payload.kind == "demo" and data.get("slot_start"):
        from app.services import demo_slots

        at = demo_slots.parse(data["slot_start"])
        if not at or demo_slots.iso(at) not in await demo_slots.free(db):
            return JSONResponse(status_code=409, content={
                "detail": "That time is no longer open. Pick another one.",
            })
        when = demo_slots.label(at)
        # The booked time first, so the team's email and the Leads list lead with it.
        data = {"meeting_time": when, **{k: v for k, v in data.items() if k != "slot_start"},
                "slot_start": demo_slots.iso(at)}
        booking = (when, _their_time(at, data.get("time_zone")))
    await save_lead(db, request, payload.kind, payload.name, payload.email, data)
    background.add_task(_tell_platform, payload.kind, payload.name.strip(), str(payload.email), data)
    if booking:
        background.add_task(_confirm_booking, payload.name.strip(), str(payload.email), *booking)
    return {"ok": True, **({"meeting_time": booking[0]} if booking else {})}
