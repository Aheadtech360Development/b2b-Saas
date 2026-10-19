"""The emails a shop's customers get, each one the shop's own to switch off and
to word (design 34, Settings → Notifications).

Kept per shop in one tenant setting, "notifications", so one shop's wording
never reaches another shop's customers. The old email_templates table is one
row per email for the whole platform, and any shop's admin could edit it.

Nothing is stored for an email the shop has not touched: it goes out as it
always has. A shop's own subject replaces the subject, and its own message
replaces the opening of the email (the greeting and the first lines). What the
email carries besides (order number, tracking box, pay button, PDF) stays, so
a custom message cannot lose it.
"""
from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

KEY = "notifications"
FIELDS = ("order", "customer", "total", "tracking")


@dataclass(frozen=True)
class Kind:
    key: str
    label: str
    when: str
    subject: str
    message: str


# The standard wording is what each email says today, in the fields a shop can
# use (a reminder's due date and a quote's valid-until date are added by the
# email itself), so the editor and its preview show what customers get.
CATALOG: tuple[Kind, ...] = (
    Kind("order_confirmed", "Order confirmed", "When an order is placed at checkout.",
         "Order Received — [order]",
         "Hi [customer], your order has been received and is now being processed."),
    Kind("artwork_approved", "Artwork approved", "When you approve a customer's gang sheet in Production.",
         "Gang sheet approved — [order]",
         "Good news — your gang sheet [order] has been approved and is queued for production."),
    Kind("revision_requested", "Revision requested", "When you ask a customer to change their gang sheet.",
         "Changes requested on your gang sheet — [order]",
         "Our team has requested changes to gang sheet [order]. Please review the notes, update your artwork, and resubmit."),
    Kind("order_shipped", "Order shipped", "When an order is marked shipped, or its label is bought.",
         "Your Order [order] Has Shipped!",
         "Hi [customer],\nGreat news — your order [order] is on its way!"),
    Kind("ready_for_pickup", "Ready for pickup", "When a pickup order is marked ready.",
         "Order [order] — Ready for Pickup",
         "Hi [customer],\nYour order [order] has been updated to Ready for Pickup."),
    Kind("refund_issued", "Refund issued", "When an order is marked refunded.",
         "Order [order] — Refunded",
         "Hi [customer],\nYour order [order] has been updated to Refunded."),
    Kind("invoice_due", "Invoice due", "When you send a payment reminder from Invoices.",
         "Reminder: invoice [order] is due",
         "Hi [customer], a reminder that this invoice is due. It is attached again here."),
    Kind("quote_ready", "Quote ready", "When you send a quote from Quotes.",
         "Quote [order]",
         "Hi [customer], here is the price for what you asked for."),
)
BY_KEY = {k.key: k for k in CATALOG}

SAMPLE = {"order": "1052", "customer": "Jordan", "total": "$248.00", "tracking": "1Z999AA10123456784"}


def _clean(saved: Any) -> dict[str, dict]:
    if isinstance(saved, str):
        try:
            saved = json.loads(saved)
        except ValueError:
            saved = {}
    out: dict[str, dict] = {}
    for key, value in (saved or {}).items() if isinstance(saved, dict) else []:
        if key in BY_KEY and isinstance(value, dict):
            out[key] = {
                "enabled": value.get("enabled") is not False,
                "subject": (str(value["subject"]).strip()[:200] or None) if value.get("subject") else None,
                "message": (str(value["message"]).strip()[:4000] or None) if value.get("message") else None,
            }
    return out


async def load(db: AsyncSession, tenant_id: Any = None) -> dict[str, dict]:
    """What this shop has changed: {key: {enabled, subject, message}}."""
    from app.core.tenant_settings import get_setting

    return _clean(await get_setting(db, KEY, tenant_id=tenant_id))


async def save(db: AsyncSession, key: str, *, enabled: bool, subject: str | None, message: str | None,
               tenant_id: Any = None) -> dict:
    """Keep one email's switch and wording. Wording equal to the default is not
    kept, so the email goes on as it always has."""
    from app.core.tenant_settings import set_setting

    kind = BY_KEY[key]
    saved = await load(db, tenant_id)
    subject = (subject or "").strip()[:200] or None
    message = (message or "").strip()[:4000] or None
    entry = {
        "enabled": bool(enabled),
        "subject": None if subject in (None, kind.subject) else subject,
        "message": None if message in (None, kind.message) else message,
    }
    if entry["enabled"] and not entry["subject"] and not entry["message"]:
        saved.pop(key, None)
    else:
        saved[key] = entry
    await set_setting(db, KEY, json.dumps(saved), tenant_id=tenant_id)
    return entry


def fill(text: str, values: dict[str, Any]) -> str:
    """The fields put in, as plain text: [order] [customer] [total] [tracking]."""
    def one(m: re.Match) -> str:
        v = values.get(m.group(1).lower())
        return "" if v is None else str(v)
    return re.sub(r"\[(order|customer|total|tracking)\]", one, text or "", flags=re.IGNORECASE)


def paragraphs(text: str) -> str:
    """Plain text as email paragraphs, escaped; a blank line or a new line
    starts the next one."""
    parts = [p.strip() for p in re.split(r"\n+", text or "") if p.strip()]
    return "".join(f'<p style="color:#374151;margin:0 0 12px;line-height:1.55">{html.escape(p)}</p>' for p in parts)


@dataclass(frozen=True)
class Wording:
    """What a sender does with one email: whether to send it, and the shop's
    own subject and opening, or None to keep the email's own."""
    send: bool
    subject: str | None
    intro_html: str | None


async def wording(db: AsyncSession, key: str, values: dict[str, Any], tenant_id: Any = None) -> Wording:
    """Asked by each sender just before it sends. Never raises: a settings
    read that fails sends the email as it always went."""
    try:
        entry = (await load(db, tenant_id)).get(key)
    except Exception:
        entry = None
    if not entry:
        return Wording(True, None, None)
    if not entry["enabled"]:
        return Wording(False, None, None)
    subject = fill(entry["subject"], values) if entry["subject"] else None
    intro = paragraphs(fill(entry["message"], values)) if entry["message"] else None
    return Wording(True, subject, intro)


def editor_rows(saved: dict[str, dict]) -> list[dict]:
    """Every email, as the Notifications screen lists and edits it."""
    rows = []
    for k in CATALOG:
        mine = saved.get(k.key) or {}
        rows.append({
            "key": k.key, "label": k.label, "when": k.when,
            "enabled": mine.get("enabled", True) is not False,
            "subject": mine.get("subject") or k.subject,
            "message": mine.get("message") or k.message,
            "custom": bool(mine.get("subject") or mine.get("message")),
            "default_subject": k.subject, "default_message": k.message,
        })
    return rows


def preview(key: str, subject: str | None, message: str | None, base: Any) -> dict:
    """The email as a customer would get it, with a sample order. `base` is
    EmailService._base_template, so the shop's own header and footer frame it."""
    kind = BY_KEY[key]
    subj = fill(subject or kind.subject, SAMPLE)
    body = paragraphs(fill(message or kind.message, SAMPLE))
    detail = {
        "order_shipped": f'<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:14px 0">'
                         f'<b style="color:#166534">Tracking #: {SAMPLE["tracking"]}</b></div>',
        "invoice_due": f'<p style="margin:14px 0"><b>Amount due: {SAMPLE["total"]}</b></p>',
        "quote_ready": f'<p style="margin:14px 0"><b>Total: {SAMPLE["total"]}</b> · valid for 30 days</p>',
    }.get(key, "")
    card = (f'<div style="background:#f9fafb;border-radius:8px;padding:14px;margin:14px 0">'
            f'<span style="color:#6b7280;font-size:12px">ORDER NUMBER</span><br>'
            f'<b style="font-size:17px">{SAMPLE["order"]}</b></div>')
    return {"subject": subj, "html": base(f"{body}{card}{detail}")}
