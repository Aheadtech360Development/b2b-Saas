"""Settings → Notifications (design 34): each customer email on or off, and
in the shop's own words (services/notifications)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import notifications

router = APIRouter(prefix="/admin/notifications", tags=["admin", "notifications"])


class Wording(BaseModel):
    enabled: bool = True
    subject: str | None = Field(None, max_length=200)
    message: str | None = Field(None, max_length=4000)


def _kind(key: str) -> notifications.Kind:
    kind = notifications.BY_KEY.get(key)
    if kind is None:
        raise HTTPException(status_code=404, detail="There is no such email.")
    return kind


@router.get("")
async def list_notifications(db: AsyncSession = Depends(get_db)) -> dict:
    """Every email a customer can get, with this shop's switch and wording."""
    return {"items": notifications.editor_rows(await notifications.load(db)), "fields": list(notifications.FIELDS)}


@router.put("/{key}")
async def save_notification(key: str, payload: Wording, db: AsyncSession = Depends(get_db)) -> dict:
    """Keep one email's switch and wording for this shop."""
    _kind(key)
    if payload.enabled and payload.subject is not None and not payload.subject.strip():
        raise HTTPException(status_code=422, detail="Give the email a subject.")
    await notifications.save(db, key, enabled=payload.enabled, subject=payload.subject, message=payload.message)
    await db.commit()
    row = next(r for r in notifications.editor_rows(await notifications.load(db)) if r["key"] == key)
    return row


@router.post("/{key}/preview")
async def preview_notification(key: str, payload: Wording, db: AsyncSession = Depends(get_db)) -> dict:
    """The email as a customer gets it, with a sample order, as typed (saved or not).

    `db` is not read here: asking for it signs the request as the shop
    (core/database.use_brand_identity), so the frame carries the shop's name and
    not the platform's fallback."""
    from app.services.email_service import EmailService

    _kind(key)
    return notifications.preview(key, payload.subject, payload.message, EmailService._base_template)


@router.get("/{key}/preview")
async def preview_saved_notification(key: str, db: AsyncSession = Depends(get_db)) -> dict:
    """The saved email, previewed: a read, for people who may look but not change."""
    from app.services.email_service import EmailService

    _kind(key)
    mine = (await notifications.load(db)).get(key) or {}
    return notifications.preview(key, mine.get("subject"), mine.get("message"), EmailService._base_template)


@router.post("/{key}/test")
async def test_notification(key: str, payload: Wording, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Send the email, as typed, to the person signed in, with a sample order."""
    from app.models.user import User
    from app.services.email_service import EmailService

    _kind(key)
    user_id = getattr(request.state, "user_id", None)
    to = (await db.execute(select(User.email).where(User.id == user_id))).scalar() if user_id else None
    if not to:
        raise HTTPException(status_code=422, detail="Your account has no email address to send the test to.")
    made = notifications.preview(key, payload.subject, payload.message, EmailService._base_template)
    ok = EmailService(db).send_raw(to_email=to, subject=f"[Test] {made['subject']}", body_html=made["html"])
    if not ok:
        raise HTTPException(status_code=502, detail="The test email could not be sent. Check the shop's email settings.")
    return {"sent_to": to}
