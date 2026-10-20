"""Public contact form endpoint.

Open to visitors (it has no account behind it), so everything they type is
escaped before it goes into an email, every field has a length, a bot that
fills the hidden field is answered and dropped, and the confirmation sent to
the address given does not repeat the message: a form that mails anything
typed to any address is a relay for somebody else's mail.
"""
import logging
from html import escape

from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    company: str = Field(default="", max_length=200)
    department: str = Field(default="sales", max_length=40)
    message: str = Field(min_length=1, max_length=5000)
    # Left empty by people. A form-filling bot fills every field it finds.
    company_hp: str | None = Field(default=None, max_length=200)


DEPT_LABELS = {
    "sales": "Sales & Pricing",
    "support": "Order Support",
    "private-label": "Private Label",
    "shipping": "Shipping & Logistics",
    "accounting": "Billing & Accounts",
    "wholesale-sales": "Wholesale Sales",
    "account-support": "Account Support",
    "order-status": "Order Status / Shipping",
    "returns": "Returns & Exchanges",
    # printcopilot.co's own contact page asks this too.
    "partnerships": "Partnerships",
    "other": "Other",
}

_ROW = '<tr style="border-bottom:1px solid #E2E0DA"><td style="padding:10px 0;color:#888;width:120px;vertical-align:top;font-size:13px;font-family:sans-serif">{label}</td><td style="padding:10px 0;color:#222;font-size:13px;font-family:sans-serif">{value}</td></tr>'


def _send_contact_email(data: ContactRequest) -> None:
    from app.core.config import settings
    from app.services.email_service import EmailService

    dept_label = DEPT_LABELS.get(data.department, data.department)
    # Everything the visitor typed, as text: nothing of it is markup in the mail.
    name, email, company, phone = escape(data.name), escape(str(data.email)), escape(data.company), escape(data.phone)
    message, dept = escape(data.message), escape(dept_label)

    if not settings.RESEND_API_KEY:
        print(f"[Contact Form] {dept_label} — {data.name} <{data.email}>: {data.message[:100]}")
        return

    # Sent through EmailService so this brand's own Resend account, sender and
    # alert address are used — this used to build its own client with the
    # platform key, so every brand's contact form landed in the platform inbox.
    from app.services.email_service import EmailService as _Svc, notify_address as _notify_to

    rows = [
        ("Name", name),
        ("Business", company or "—"),
        ("Email", f'<a href="mailto:{email}" style="color:#1B3A5C">{email}</a>'),
        ("Phone", phone or "—"),
        ("Department", dept),
        ("Message", f'<span style="white-space:pre-line">{message}</span>'),
    ]
    rows_html = "".join(_ROW.format(label=label, value=value) for label, value in rows)

    admin_html = EmailService._base_template(
        f'<h2 style="color:#1B3A5C;margin:0 0 20px;font-family:sans-serif">New Contact Form Submission</h2>'
        f'<table style="width:100%;border-collapse:collapse">{rows_html}</table>',
        footer_note=f'Reply directly to <a href="mailto:{email}" style="color:#1B3A5C">{email}</a>',
    )

    admin_to = _notify_to() or settings.EMAIL_FROM_ADDRESS
    try:
        _Svc(None)._send_via_resend(
            to_email=admin_to,
            subject=f"[Contact] {dept_label} — {data.name[:80]} ({data.company[:80] or '—'})",
            body_html=admin_html,
            reply_to=data.email,
        )
    except Exception as exc:
        print(f"Contact email failed: {exc}")

    # The visitor's own copy says it arrived and nothing more: what they wrote is
    # not repeated to an address nobody has confirmed.
    confirm_html = EmailService._base_template(
        f'<h2 style="color:#1B3A5C;margin:0 0 12px;font-family:sans-serif">Thanks, {escape(data.name[:60])}!</h2>'
        f'<p style="color:#444;font-size:14px;font-family:sans-serif">We\'ve received your message and will respond within 4 business hours (Mon–Fri, 8AM–6PM CT).</p>',
    )
    try:
        _Svc(None)._send_via_resend(
            to_email=data.email,
            subject="We received your message",
            body_html=confirm_html,
        )
    except Exception as exc:
        print(f"Contact confirmation email failed: {exc}")


@router.post("/contact", status_code=202)
async def submit_contact(payload: ContactRequest, request: Request, background_tasks: BackgroundTasks):
    # Open to visitors, and it sends two emails (one to the sender), so it is
    # limited per address like the platform's other open forms.
    from app.core.rate_limit import enforce_rate_limit

    await enforce_rate_limit(request, "contact_form", limit=5, window=3600)
    if (payload.company_hp or "").strip():
        # Answered as if it went through, so a bot learns nothing.
        return {"message": "Message received. We will get back to you within 1 business day."}
    background_tasks.add_task(_send_contact_email, payload)
    # Sent from printcopilot.co itself (no shop on the request): also kept for
    # the platform console's Leads list (api/v1/leads). A shop's own contact
    # form is the shop's, and goes on as it was. Keeping it must never cost the
    # visitor their message, which has been emailed either way.
    if not getattr(request.state, "tenant_slug", None):
        try:
            from app.api.v1.leads import save_lead
            from app.services.partners.db import session

            async with session() as db:
                await save_lead(db, request, "contact", payload.name, str(payload.email), {
                    "department": DEPT_LABELS.get(payload.department, payload.department),
                    "company": payload.company, "phone": payload.phone, "message": payload.message[:2000],
                })
                await db.commit()
        except Exception:  # noqa: BLE001
            logger.warning("platform contact not kept for %s", payload.email, exc_info=True)
    return {"message": "Message received. We will get back to you within 1 business day."}
