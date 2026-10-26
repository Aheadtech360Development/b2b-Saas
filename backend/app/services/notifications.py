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
         "We got your order, [order]",
         "Order [order] is confirmed. We will email you again when it ships."),
    Kind("artwork_approved", "Artwork approved", "When you approve a customer's gang sheet in Production.",
         "Your job is going to print",
         "[order] passed the artwork check. We are printing it now."),
    Kind("revision_requested", "Revision requested", "When you ask a customer to change their gang sheet.",
         "We need one change before we print",
         "Job [order] is on hold. Here is what we found:"),
    Kind("order_shipped", "Order shipped", "When an order is marked shipped, or its label is bought.",
         "Your order shipped",
         "Order [order] is on its way."),
    Kind("ready_for_pickup", "Ready for pickup", "When a pickup order is marked ready.",
         "Your order is ready for pickup",
         "Order [order] is packed and waiting for you."),
    Kind("refund_issued", "Refund issued", "When an order is marked refunded.",
         "Your refund is on its way",
         "We refunded [total] for order [order] to the card or account you paid with."),
    Kind("invoice_due", "Invoice due", "When you send a payment reminder from Invoices.",
         "Your invoice for order [order] is due",
         "Your invoice for order [order] is due soon."),
    Kind("quote_ready", "Quote ready", "When you send a quote from Quotes.",
         "Your quote is ready",
         "Here is the price for what you asked for."),
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


def preview(key: str, subject: str | None, message: str | None, base: Any = None) -> dict:
    """The email as a customer would get it, with a sample order, drawn by the
    same builders the emails use (services/mails), in this shop's card. The
    standard message shows the email's own opening; anything else is the
    shop's own words, as it would be sent. `base` is no longer used."""
    from datetime import date, timedelta
    from types import SimpleNamespace

    from app.services import mails

    kind = BY_KEY[key]
    own = message if (message and message.strip() != kind.message.strip()) else None
    intro = paragraphs(fill(own, SAMPLE)) if own else None
    subj = fill(subject, SAMPLE) if subject and subject.strip() != kind.subject.strip() else None
    order = SimpleNamespace(
        order_number=SAMPLE["order"], total=248.0, amount_paid=248.0, items=[SimpleNamespace(quantity=24, item_type="variant")],
        shipping_method="ground", courier="UPS", courier_service="Ground", carrier=None,
        tracking_number=SAMPLE["tracking"], tracking_url="https://www.ups.com/track", created_at=None,
    )
    url = "https://example.com/account/orders"
    if key == "order_confirmed":
        out = mails.order_confirmed(order, order_url=url, subject=subj, intro_html=intro)
    elif key == "artwork_approved":
        out = mails.artwork_approved(f"GS-{SAMPLE['order']}", job_url=url, subject=subj, intro_html=intro)
    elif key == "revision_requested":
        out = mails.revision_requested(f"GS-{SAMPLE['order']}", note="The logo is 72 dpi; please send a sharper file.",
                                       job_url=url, subject=subj, intro_html=intro)
    elif key == "order_shipped":
        out = mails.order_shipped(order, order_url=url, subject=subj, intro_html=intro)
    elif key == "ready_for_pickup":
        out = mails.ready_for_pickup(order, order_url=url, pickup={"address": "123 Main St", "hours": "Mon to Fri, 9 to 5"},
                                     subject=subj, intro_html=intro)
    elif key == "refund_issued":
        out = mails.refund_issued(order, order_url=url, subject=subj, intro_html=intro)
    elif key == "invoice_due":
        out = mails.invoice(order, invoice_number=f"INV-{SAMPLE['order']}", amount_due=248.0,
                            due_on=date.today() + timedelta(days=7), terms="Net 30", pay_url=url, download_url=url,
                            reminder=True, subject=subj, intro_html=intro)
    else:
        out = mails.quote_ready(f"DRAFT-{SAMPLE['order']}", total=248.0, valid_until=date.today() + timedelta(days=30),
                                url=url, subject=subj, intro_html=intro)
    return {"subject": out[0], "html": out[1]}
