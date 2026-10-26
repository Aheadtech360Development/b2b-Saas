#backend/app/services/email_service.py
"""EmailService — file-based Jinja2 templates + DB fallback + Resend delivery."""
import base64
import json
import logging
import os
from uuid import UUID

import resend
from jinja2 import BaseLoader, Environment, FileSystemLoader, TemplateError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.models.communication import EmailTemplate

logger = logging.getLogger(__name__)

import re as _re

# Legacy single-store identifiers baked into the email bodies. Kept here, at the
# single send path, so every message is neutralised no matter which call site or
# DB template produced it.
_LEGACY_BRAND = "AF Apparels"
_LEGACY_PHONE = "(214) 272-7213"
# "Questions? Call us at (214) 272-7213" → "Questions?" — drop the dangling phrase
# rather than leave "Call us at ." once the number is gone.
_PHONE_PHRASE_RE = _re.compile(r"\s*(?:Call(?:\s+us)?(?:\s+at)?)\s*" + _re.escape(_LEGACY_PHONE))


def _tenant_email_cfg() -> dict:
    """This brand's own email settings, resolved per request (see core.database)."""
    try:
        from app.core.tenant_context import get_current_tenant_email

        return get_current_tenant_email() or {}
    except Exception:
        return {}


def notify_address() -> str | None:
    """Where a brand's own alerts go — new orders, applications, low stock.

    The brand's address when it has set one, otherwise the platform's. Without
    this every brand's alerts landed in the platform inbox and the owner never
    heard about their own orders.
    """
    return (_tenant_email_cfg().get("notify_email") or "").strip() or (
        settings.ADMIN_NOTIFICATION_EMAIL or None
    )


def platform_inbox() -> str | None:
    """The platform's own inbox — not any brand's."""
    return (settings.PLATFORM_SUPPORT_EMAIL or "").strip() or (
        settings.ADMIN_NOTIFICATION_EMAIL or ""
    ).strip() or None


def send_as_platform(to_email: str, subject: str, body_html: str) -> bool:
    """Send as the platform rather than as a brand.

    Nearly every message belongs to a shop and carries that shop's name, and
    its links are bent towards that shop's address. These few do not: they are
    ours — a shop signing up, a welcome to the person who just opened one — and
    bending them would send a new owner to a store that has nothing in it yet.
    """
    from app.core.tenant_context import (
        get_current_brand_name,
        get_current_brand_site,
        set_current_brand_name,
        set_current_brand_site,
    )

    was_name, was_site = get_current_brand_name(), get_current_brand_site()
    set_current_brand_name(settings.PLATFORM_NAME)
    set_current_brand_site(None)
    try:
        return EmailService(None).send_raw(to_email=to_email, subject=subject, body_html=body_html)
    finally:
        set_current_brand_name(was_name)
        set_current_brand_site(was_site)


def notify_platform(subject: str, body_html: str) -> bool:
    """Tell the platform something happened — a new shop, mainly."""
    to = platform_inbox()
    if not to:
        logger.warning("PLATFORM_SUPPORT_EMAIL not set — skipping: %s", subject)
        return False
    return send_as_platform(to, subject, body_html)


def _current_brand_from_context() -> str | None:
    try:
        from app.core.tenant_context import get_current_brand_name

        return get_current_brand_name()
    except Exception:
        return None


def _brand_site() -> str | None:
    """Where this brand's shop lives, resolved for the current request."""
    try:
        from app.core.tenant_context import get_current_brand_site

        return get_current_brand_site()
    except Exception:
        return None


def _brand_logo() -> str:
    """The logo this mail carries: the brand's own, or none.

    The platform's logo (LOGO_URL) is for mail the platform sends as itself.
    It used to be the fallback for everybody, so a shop that had not put a
    logo into its mail settings sent its customers the platform's.
    """
    try:
        from app.core.tenant_context import get_current_brand_logo

        own = (_tenant_email_cfg().get("logo_url") or "").strip() or (get_current_brand_logo() or "")
    except Exception:
        own = ""
    if own:
        return own
    sender = _current_brand_from_context()
    is_a_brand = bool(sender) and sender != settings.PLATFORM_NAME
    return "" if is_a_brand else (getattr(settings, "LOGO_URL", "") or "")


def _brand_contact() -> str | None:
    """Where a customer's reply should land: the brand, never the platform."""
    cfg = _tenant_email_cfg()
    own = (cfg.get("reply_to") or "").strip() or (cfg.get("notify_email") or "").strip()
    if own:
        return own
    try:
        from app.core.tenant_context import get_current_brand_contact

        return get_current_brand_contact()
    except Exception:
        return None


def _bare_address(value: str | None) -> str:
    """`Name <a@b.c>` or `a@b.c` → `a@b.c`. The sender's name is put on by the
    send path, so a platform address saved with a name of its own must not
    bring that name along."""
    text = (value or "").strip()
    found = _re.search(r"<([^<>\s]+@[^<>\s]+)>", text)
    return found.group(1) if found else text


def _point_at_brand(text: str | None, site: str) -> str | None:
    """Send every link in this message to the brand's shop.

    Forty call sites build their links from FRONTEND_URL, which is the
    platform's address — so a brand's customer clicking "track my order" landed
    on the platform's front page instead of the shop they bought from. Rewriting
    it here, where every message passes through, fixes all of them at once and
    keeps working for a call site written tomorrow.
    """
    platform = (settings.FRONTEND_URL or "").rstrip("/")
    if not text or not platform or not site or site == platform:
        return text
    return text.replace(platform, site)


# Everything else the single-store copy carried: its other phone, its inboxes,
# its domains and its two addresses. None of it belongs in another brand's mail.
_LEGACY_PHONES = [
    "(214) 272-7213", "(214)\xa0272-7213", "(214)&nbsp;272-7213", "214-272-7213", "2142727213",
    "+1 (469) 367-9753", "+1\xa0(469)\xa0367-9753", "(469) 367-9753", "469-367-9753", "4693679753",
]
_LEGACY_EMAILS = ["info@afblanks.com", "info.afapparel@gmail.com", "shipping@afapparels.com"]
_LEGACY_DOMAINS = ["https://shop.afapparels.com", "https://afblanks.com", "https://afapparels.com",
                   "shop.afapparels.com", "afblanks.com", "afapparels.com", "af-apparel.com"]
_LEGACY_ADDRESSES = ["2041 Luna Rd, Carrollton, TX 75006", "10719 Turbeville Rd, Dallas, TX 75243",
                     "10719 Turbeville Road, Dallas, TX 75243"]
# A sentence that only existed to give out a phone number goes with it.
_CALL_PHRASE_RE = _re.compile(
    r"(?:Questions\?\s*)?(?:Need help getting started\?\s*)?Call(?:\s+us)?(?:\s+at)?\s*"
    r"(?:<a[^>]*href=\"tel:[^\"]*\"[^>]*>[^<]*</a>|[+()\d\s.\-\xa0]{7,})"
    r"(?:\s*or\s*)?",
    _re.IGNORECASE,
)


def _rebrand_text(text: str | None, brand: str, *, contact_email: str | None = None,
                  site_url: str | None = None) -> str | None:
    """Swap the legacy store's name, phones, inboxes, domains and addresses for
    this brand's — or drop them when the brand has nothing to put there."""
    if not text:
        return text
    text = _PHONE_PHRASE_RE.sub("", text)
    text = _CALL_PHRASE_RE.sub("", text)
    for phone in _LEGACY_PHONES:
        text = text.replace(phone, "")
    # What a removed number leaves behind: "Call  or email x" → "Email x",
    # and a bare "Call us at." with nothing after it goes entirely.
    text = _re.sub(r"Call(?:\s+us)?(?:\s+at)?\s+or\s+email", "Email", text, flags=_re.IGNORECASE)
    text = _re.sub(r"Call(?:\s+us)?(?:\s+at)?\s*(?=[.<]|$)", "", text, flags=_re.IGNORECASE)
    for email in _LEGACY_EMAILS:
        text = text.replace(f"mailto:{email}", f"mailto:{contact_email}" if contact_email else "#")
        text = text.replace(email, contact_email or "")
    site = (site_url or "").rstrip("/")
    for dom in _LEGACY_DOMAINS:
        text = text.replace(dom, site if dom.startswith("http") else site.replace("https://", "").replace("http://", ""))
    for addr in _LEGACY_ADDRESSES:
        text = text.replace(addr, "")
    text = text.replace(_LEGACY_BRAND, brand)
    return text


_jinja_env = Environment(loader=BaseLoader(), autoescape=True)

_TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates", "emails")
_file_jinja_env = Environment(loader=FileSystemLoader(_TEMPLATES_DIR), autoescape=True)


def sender_account(cfg: dict | None, platform_key: str | None) -> tuple[str, str, bool]:
    """Which Resend account this email leaves on, and from what address.

    A brand that has brought its own key and its own verified address sends on
    it: everything its customer sees is then the shop they bought from. Without
    both, it goes out on the platform's account — which is how every brand
    works on day one, and why the brand's name rides on the display name and
    its reply-to carries replies home.

    Both are needed together. A key with no verified sender cannot send, and a
    sender with no key is somebody else's domain.
    """
    cfg = cfg or {}
    own_key = (cfg.get("api_key") or "").strip()
    own_from = (cfg.get("from_email") or "").strip()
    if own_key and own_from:
        return own_key, own_from, True
    return (platform_key or ""), "", False


def customer_facing_identity(store_name: str | None, cfg: dict | None, signup_email: str | None) -> dict:
    """What a brand's customer sees of who wrote to them — said to the brand's
    admin before they find out from a customer.

    Worked out from the same settings, in the same order, as the send path
    below: a test holds the two together, so the page cannot promise a name
    the mail does not carry.
    """
    cfg = cfg or {}
    _key, own_from, use_own = sender_account(cfg, settings.RESEND_API_KEY)
    custom = (cfg.get("from_name") or "").strip()
    store = (store_name or "").strip()
    email = (cfg.get("notify_email") or "").strip()
    reply = (cfg.get("reply_to") or "").strip() or email or (signup_email or "").strip()
    return {
        "store_name": store,
        # The name on the mail: one typed in on purpose, else the store's.
        "sender_name": custom or store or settings.EMAIL_FROM_NAME,
        "custom_sender_name": custom,
        "email": email,
        "reply_to": reply,
        "from_address": _bare_address(own_from if use_own else settings.EMAIL_FROM_ADDRESS),
        # True once the brand sends from a verified address of its own.
        "own_sender": use_own,
    }


class EmailService:
    def __init__(self, db: AsyncSession | None = None):
        # Optional: the raw and file-template senders never touch the database,
        # and platform mail has no request session to hand them.
        self.db = db

    async def get_template(self, trigger_event: str) -> EmailTemplate:
        result = await self.db.execute(
            select(EmailTemplate).where(
                EmailTemplate.trigger_event == trigger_event,
                EmailTemplate.is_active.is_(True),
            )
        )
        tpl = result.scalar_one_or_none()
        if not tpl:
            raise NotFoundError(f"Email template '{trigger_event}' not found or inactive")
        return tpl

    async def get_template_by_id(self, template_id: UUID) -> EmailTemplate:
        result = await self.db.execute(
            select(EmailTemplate).where(EmailTemplate.id == template_id)
        )
        tpl = result.scalar_one_or_none()
        if not tpl:
            raise NotFoundError(f"Email template {template_id} not found")
        return tpl

    async def list_templates(self) -> list[EmailTemplate]:
        result = await self.db.execute(select(EmailTemplate).order_by(EmailTemplate.trigger_event))
        return list(result.scalars().all())

    def render_template(self, template_str: str, variables: dict) -> str:
        try:
            tpl = _jinja_env.from_string(template_str)
            return tpl.render(**variables)
        except TemplateError as exc:
            logger.error("Template render error: %s", exc)
            return template_str  # fallback — return unrendered

    def render_file_template(self, template_name: str, variables: dict) -> str:
        """Render a Jinja2 HTML file from backend/app/templates/emails/."""
        try:
            tpl = _file_jinja_env.get_template(template_name)
            return tpl.render(**variables)
        except Exception as exc:
            logger.error("File template render error (%s): %s", template_name, exc)
            return ""

    def _file_template_vars(self, extra: dict) -> dict:
        """Merge logo_url + frontend_url into a variables dict."""
        cfg = _tenant_email_cfg()
        return {
            # Only a logo somebody configured: the fallback used to be one
            # store's file, which then appeared on every brand's email.
            "logo_url": _brand_logo(),
            "frontend_url": settings.FRONTEND_URL,
            # The sending brand — the templates print this instead of a name
            # that used to be written into every one of them.
            "brand_name": _current_brand_from_context() or settings.PLATFORM_NAME,
            "brand_address": (cfg.get("address") or "").strip(),
            **extra,
        }

    def send_from_file(
        self,
        template_name: str,
        to_email: str,
        subject: str,
        variables: dict,
        attachments: list[dict] | None = None,
    ) -> bool:
        """Render a file template and send via Resend."""
        body_html = self.render_file_template(template_name, self._file_template_vars(variables))
        if not body_html:
            return False
        return self._send_via_resend(
            to_email=to_email,
            subject=subject,
            body_html=body_html,
            attachments=attachments,
        )

    async def render(self, trigger_event: str, variables: dict) -> dict:
        """Returns rendered {subject, body_html, body_text}."""
        tpl = await self.get_template(trigger_event)
        return {
            "subject": self.render_template(tpl.subject, variables),
            "body_html": self.render_template(tpl.body_html, variables),
            "body_text": self.render_template(tpl.body_text, variables) if tpl.body_text else None,
        }

    async def send(self, trigger_event: str, to_email: str, variables: dict) -> bool:
        """Render template and send via Resend. Returns True on success."""
        rendered = await self.render(trigger_event, variables)
        return self._send_via_resend(
            to_email=to_email,
            subject=rendered["subject"],
            body_html=rendered["body_html"],
            body_text=rendered.get("body_text"),
        )

    def send_raw(
        self,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        reply_to: str | None = None,
        attachments: list[dict] | None = None,
    ) -> bool:
        """Send an ad-hoc email without requiring a DB template."""
        return self._send_via_resend(
            to_email=to_email,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            cc=cc,
            bcc=bcc,
            reply_to=reply_to,
            attachments=attachments,
        )

    def _send_via_resend(
        self,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        reply_to: str | None = None,
        attachments: list[dict] | None = None,
    ) -> bool:
        cfg = _tenant_email_cfg()
        api_key, own_from, use_own = sender_account(cfg, settings.RESEND_API_KEY)
        if not api_key:
            logger.warning("No Resend key for this brand or the platform — skipping email to %s", to_email)
            return False

        resend.api_key = api_key

        # Rebrand outbound copy to the tenant this email belongs to. The bodies were
        # written for a single store and still carry that store's name and phone;
        # here — the one point every email passes through — they are swapped for the
        # active brand so each tenant's customers only ever see their own store.
        brand = _current_brand_from_context() or settings.EMAIL_FROM_NAME or "Our Store"
        from_name = (cfg.get("from_name") or "").strip() or brand or settings.EMAIL_FROM_NAME
        # Where this brand's customers should write, and where its store lives.
        contact = _brand_contact()
        site = _brand_site() or settings.FRONTEND_URL
        subject = _rebrand_text(subject, brand, contact_email=contact, site_url=site)
        body_html = _rebrand_text(body_html, brand, contact_email=contact, site_url=site)
        if body_text:
            body_text = _rebrand_text(body_text, brand, contact_email=contact, site_url=site)
        # Links last: the rebrand above may itself have written the platform's
        # address in, replacing a legacy domain.
        subject = _point_at_brand(subject, site)
        body_html = _point_at_brand(body_html, site)
        body_text = _point_at_brand(body_text, site)

        # The brand's own verified address when it has one. Otherwise the
        # platform's — the only domain that account may send from — with the
        # brand's identity on the display name and its reply-to carrying
        # replies home.
        from_addr = f"{from_name} <{_bare_address(own_from if use_own else settings.EMAIL_FROM_ADDRESS)}>"
        # A reply goes to the brand: the address it set, else the one it signed
        # up with. Without one it went to the platform's sending address.
        if not reply_to:
            reply_to = contact

        # Everything to one inbox while no sending domain is verified — see
        # EMAIL_REDIRECT_TO. The real recipient rides in the subject so nothing
        # about the flow is hidden.
        recipient = to_email
        redirect = (settings.EMAIL_REDIRECT_TO or "").strip()
        if not redirect and settings.APP_ENV in ("development", "test"):
            redirect = settings.ADMIN_NOTIFICATION_EMAIL or ""
        if redirect and redirect.lower() != (to_email or "").lower():
            subject = f"[to: {to_email}] {subject}"
            recipient = redirect

        params: resend.Emails.SendParams = {
            "from": from_addr,
            "to": [recipient],
            "subject": subject,
            "html": body_html,
        }
        if body_text:
            params["text"] = body_text
        if cc:
            params["cc"] = cc
        if bcc:
            params["bcc"] = bcc
        if reply_to:
            params["reply_to"] = [reply_to]
        if attachments:
            params["attachments"] = [
                {
                    "filename": a["filename"],
                    "content": base64.b64encode(a["content"]).decode()
                    if isinstance(a["content"], bytes)
                    else a["content"],
                }
                for a in attachments
            ]

        try:
            result = resend.Emails.send(params)
            email_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
            logger.info("Resend email sent to %s (id=%s)", recipient, email_id)
            return True
        except Exception as exc:
            logger.error("Resend exception for %s: %s", recipient, exc)
            return False

    # ── Branded template wrapper ───────────────────────────────────────────────

    @staticmethod
    def _base_template(content_html: str, footer_note: str = "") -> str:
        """Prepared content in the design's card (services/mail_layout.frame):
        the sending shop's name and logo across the top, who sent it and why at
        the foot. For the emails that build their own body; the rest are drawn
        whole by services/mails."""
        from app.services.mail_layout import frame

        note = (f'<p style="color:#5A6A7E;font-size:13px;margin:16px 0 0">{footer_note}</p>'
                if footer_note else "")
        return frame(content_html + note)

    # ── High-level transactional senders ──────────────────────────────────────

    async def send_password_reset_link(
        self, to_email: str, first_name: str, reset_url: str, expiry_hours: int = 1
    ) -> bool:
        """Send the link that gets somebody back into their account, in the
        design's card (services/mails.password_reset): the shop's, when the
        request came through a shop; the platform's otherwise. The built-in
        message is the one sent: the shared template it used to try first is
        the platform's, and this is the one mail nobody can do without."""
        from app.services import mails

        sender = _current_brand_from_context()
        on_platform = not sender or sender == settings.PLATFORM_NAME
        subject, html = mails.password_reset(reset_url=reset_url, hours=expiry_hours, platform=on_platform)
        return self.send_raw(to_email=to_email, subject=subject, body_html=html)

    def send_order_confirmation(self, order: "Order", to_email: str, *,  # type: ignore[name-defined]
                                subject: str | None = None, intro_html: str | None = None) -> bool:
        """The order confirmation (services/mails.order_confirmed), with the
        order's confirmation PDF attached.

        `subject` and `intro_html` are the shop's own wording (services/
        notifications), in place of the subject and the opening line.
        """
        from app.core.config import settings as _s
        from app.services import mails
        from app.services.pdf_service import PDFService

        order_url = f"{_s.FRONTEND_URL}/account/orders/{order.id}"
        # A guest has no account page: their link is the order's own page, opened
        # by its view key (services/order_view.py). The key rides in the
        # #fragment, which no server and no log ever sees, and the page takes it
        # off the address before the shop's tracking tools read it.
        if getattr(order, "is_guest_order", False):
            from app.services import order_view

            order_url = (f"{_s.FRONTEND_URL}/checkout/thank-you/{order.order_number}"
                         f"#k={order_view.view_key(order.id, order.tenant_id)}")
        mail_subject, html = mails.order_confirmed(order, order_url=order_url, subject=subject, intro_html=intro_html)

        attachments = None
        try:
            pdf_bytes = PDFService().generate_order_confirmation(order)
            attachments = [{"filename": f"order-{order.order_number}.pdf", "content": pdf_bytes}]
        except Exception as _exc:
            logger.warning("PDF generation failed (order confirmation): %s", _exc)

        return self._send_via_resend(
            to_email=to_email,
            subject=mail_subject,
            body_html=html,
            attachments=attachments,
        )

    def send_invoice(
        self,
        order: "Order",  # type: ignore[name-defined]
        to_email: str,
        payment_terms: str | None = None,
        customer_name: str | None = None,
        due_on: "date | None" = None,
        reminder: bool = False,
        subject: str | None = None,
        intro_html: str | None = None,
    ) -> bool:
        """An invoice, or a reminder of one (services/mails.invoice), with the
        invoice PDF attached and a button to pay it online.

        A reminder (the Invoices screen's) carries the invoice's own due date,
        not one worked out from today. `subject` and `intro_html` are the
        shop's own wording (services/notifications), in place of the subject
        and the opening line.
        """
        from datetime import datetime as _dt, timedelta as _td

        from app.services import mails, order_view
        from app.services.invoices import invoice_number
        from app.services.pdf_service import PDFService

        terms = payment_terms or getattr(order, 'payment_terms', None) or 'net_30'
        _terms_display = {
            'net_30': ('Net 30', 30),
            'net_15': ('Net 15', 15),
            'due_on_receipt': ('Due on receipt', 0),
        }
        terms_label, days = _terms_display.get(terms, _terms_display['net_30'])
        due = due_on or (_dt.now() + _td(days=days)).date()
        order_num = getattr(order, 'order_number', 'N/A')
        total_val = float(getattr(order, 'total', 0) or 0)
        balance_due_val = max(0.0, total_val - float(getattr(order, 'amount_paid', None) or 0))
        # The invoice page opens to the order's view key, carried in the
        # #fragment (no server or log sees it); without it, the buyer signs in.
        pay_url = (f"{settings.FRONTEND_URL}/checkout/invoice/{order_num}"
                   f"#k={order_view.view_key(getattr(order, 'id', ''), getattr(order, 'tenant_id', None))}")
        download_url = (f"{settings.FRONTEND_URL}/account/orders/{getattr(order, 'id', '')}"
                        if getattr(order, 'company_id', None) else None)
        number = invoice_number(order_num, getattr(order, 'created_at', None))
        mail_subject, html = mails.invoice(
            order, invoice_number=number, amount_due=balance_due_val, due_on=due, terms=terms_label,
            pay_url=pay_url, download_url=download_url, reminder=reminder,
            subject=subject, intro_html=intro_html,
        )

        # Temporarily set payment_terms on the order object so PDF picks it up
        _orig_terms = getattr(order, 'payment_terms', None)
        try:
            object.__setattr__(order, 'payment_terms', terms)
        except AttributeError:
            pass

        attachments = None
        try:
            # The PDF says what the email says: issued today (a reminder keeps
            # the invoice's own date), due on the same day.
            pdf_bytes = PDFService().generate_invoice(order, due_on=due,
                                                      issued_on=None if reminder else _dt.now().date())
            attachments = [{"filename": f"invoice-{order_num}.pdf", "content": pdf_bytes}]
        except Exception as _exc:
            logger.warning("PDF generation failed (invoice): %s", _exc)
        finally:
            try:
                object.__setattr__(order, 'payment_terms', _orig_terms)
            except AttributeError:
                pass

        return self._send_via_resend(
            to_email=to_email,
            subject=mail_subject,
            body_html=html,
            attachments=attachments,
        )

    def send_quote(
        self,
        order: "Order",  # type: ignore[name-defined]
        items: list,
        to_email: str,
        valid_until: "date",
        customer_name: str | None = None,
        message: str | None = None,
        subject: str | None = None,
        intro_html: str | None = None,
    ) -> bool:
        """A quote (a priced draft, services/quotes) for the customer to accept
        (services/mails.quote_ready).

        `subject` and `intro_html` are the shop's own wording (services/
        notifications), in place of the subject and the opening line; the
        note typed when sending follows it.

        The link opens the quote's own page with the order's view key in the
        #fragment, as the invoice's does: no server or log sees it.
        """
        from app.services import mails, order_view

        number = getattr(order, "order_number", "")
        view_url = (f"{settings.FRONTEND_URL}/quote/{number}"
                    f"#k={order_view.view_key(getattr(order, 'id', ''), getattr(order, 'tenant_id', None))}")
        mail_subject, html = mails.quote_ready(
            number, total=getattr(order, "total", 0), valid_until=valid_until, url=view_url,
            message=message, subject=subject, intro_html=intro_html,
        )
        return self._send_via_resend(to_email=to_email, subject=mail_subject, body_html=html)

    def send_quote_accepted_alert(self, order: "Order", customer: str) -> bool:  # type: ignore[name-defined]
        """Tell the shop a customer accepted its quote, to convert it."""
        _to = notify_address()
        if not _to:
            return False
        from app.services import mails

        number = getattr(order, "order_number", "")
        url = f"{settings.FRONTEND_URL}/admin/orders/quotes?quote={getattr(order, 'id', '')}"
        mail_subject, html = mails.quote_accepted_alert(
            number, customer=customer, total=getattr(order, "total", 0), admin_url=url)
        return self._send_via_resend(to_email=_to, subject=mail_subject, body_html=html)

    def send_admin_new_order_alert(self, order: "Order", customer: str | None = None) -> bool:  # type: ignore[name-defined]
        """Tell the shop it has a new order (services/mails.new_order_alert).
        `customer` is who placed it, when the caller knows; a guest's own name
        otherwise."""
        _to = notify_address()
        if not _to:
            return False
        from app.core.config import settings as _s
        from app.services import mails

        who = customer or getattr(order, "guest_name", None) or getattr(order, "guest_email", None) or "A customer"
        mail_subject, html = mails.new_order_alert(
            order, customer=who, admin_url=f"{_s.FRONTEND_URL}/admin/orders/{order.id}")
        return self._send_via_resend(to_email=_to, subject=mail_subject, body_html=html)

    def send_admin_low_stock_alert(
        self, product_name: str, sku: str, qty: int
    ) -> bool:
        """Notify admin when a SKU drops below LOW_STOCK_THRESHOLD."""
        _to = notify_address()
        if not _to:
            return False
        from app.core.config import settings as _s
        content_html = (
            f'<h2 style="color:#D97706;font-size:20px;font-weight:800;margin:0 0 8px">'
            f'⚠️ Low Stock Alert</h2>'
            f'<p style="color:#374151;margin:0 0 20px">A SKU has dropped below the '
            f'threshold of {_s.LOW_STOCK_THRESHOLD} units.</p>'
            f'<div style="background:#fff8f0;border:1.5px solid #fed7aa;border-radius:8px;'
            f'padding:16px 20px;margin-bottom:20px">'
            f'<div style="font-size:16px;font-weight:800;color:#1B3A5C;margin-bottom:6px">'
            f'{product_name}</div>'
            f'<div style="font-size:13px;color:#6b7280;margin-bottom:4px">'
            f'SKU: <span style="font-family:monospace;color:#374151">{sku}</span></div>'
            f'<div style="font-size:20px;font-weight:900;color:#D97706">'
            f'{qty} units remaining</div>'
            f'</div>'
            f'<p style="margin:0"><a href="{_s.FRONTEND_URL}/admin/products" '
            f'style="background:#D97706;color:#fff;padding:12px 24px;border-radius:6px;'
            f'font-weight:700;text-decoration:none;font-size:14px;display:inline-block">'
            f'Manage Inventory →</a></p>'
        )
        return self._send_via_resend(
            to_email=_to,
            subject=f"Low Stock: {sku} ({qty} left) | AF Apparels",
            body_html=self._base_template(content_html),
        )

    def send_application_approved(
        self, to_email: str, first_name: str, company_name: str
    ) -> bool:
        """Notify applicant their account has been approved."""
        from app.core.config import settings as _s
        content_html = (
            f'<h2 style="color:#059669;font-size:22px;font-weight:800;margin:0 0 8px">'
            f'Application Approved! ✅</h2>'
            f'<p style="color:#374151;margin:0 0 20px">Hi {first_name},</p>'
            f'<p style="color:#374151;margin:0 0 16px">'
            f'Great news — your application for <b>{company_name}</b> has been '
            f'<b style="color:#059669">approved</b>. Your account is now active and you can '
            f'start placing orders.</p>'
            f'<p style="margin:0"><a href="{_s.FRONTEND_URL}/login" '
            f'style="background:#059669;color:#fff;padding:12px 28px;border-radius:6px;'
            f'font-weight:700;text-decoration:none;font-size:14px;display:inline-block">'
            f'Log In to Your Account →</a></p>'
        )
        return self._send_via_resend(
            to_email=to_email,
            subject="Your AF Apparels Account is Approved!",
            body_html=self._base_template(content_html),
        )

    def send_application_rejected(
        self, to_email: str, first_name: str, company_name: str
    ) -> bool:
        """Notify applicant their wholesale application was not approved."""
        content_html = (
            f'<h2 style="color:#374151;font-size:22px;font-weight:800;margin:0 0 8px">'
            f'Application Update</h2>'
            f'<p style="color:#374151;margin:0 0 16px">Hi {first_name},</p>'
            f'<p style="color:#374151;margin:0 0 16px">'
            f'Thank you for applying to the AF Apparels wholesale program. After reviewing your '
            f'application for <b>{company_name}</b>, we are unable to approve it at this time.</p>'
            f'<p style="color:#374151;margin:0 0 16px">'
            f'If you believe this is an error or would like more information, please contact us '
            f'at <a href="tel:2142727213" style="color:#1B3A5C">(214)\xa0272-7213</a> and we '
            f'will be happy to assist.</p>'
        )
        return self._send_via_resend(
            to_email=to_email,
            subject="AF Apparels Wholesale Application Update",
            body_html=self._base_template(content_html),
        )

    def send_retail_account_activation(
        self,
        customer_email: str,
        first_name: str,
        activation_url: str,
        order_number: str | None = None,
    ) -> bool:
        """Send retail account activation email after guest checkout."""
        order_line = (
            f'<p style="color:#374151;margin:0 0 16px">'
            f'Your order <strong style="color:#1B3A5C">{order_number}</strong> '
            f'has been placed and is being processed.</p>'
        ) if order_number else ""

        content_html = (
            f'<h2 style="color:#1B3A5C;font-size:22px;font-weight:800;margin:0 0 8px">'
            f'Welcome to AF Apparels, {first_name}!</h2>'
            f'{order_line}'
            f'<p style="color:#374151;margin:0 0 16px">'
            f'Create a password to access your order history, view invoices, '
            f'and manage your account anytime.</p>'
            f'<p style="color:#6b7280;font-size:13px;margin:0 0 24px">'
            f'This link expires in 7 days.</p>'
            f'<p style="margin:0">'
            f'<a href="{activation_url}" style="background:#E8242A;color:#fff;'
            f'padding:12px 28px;border-radius:6px;font-weight:700;'
            f'text-decoration:none;font-size:14px;display:inline-block">'
            f'Activate My Account →</a></p>'
        )
        return self._send_via_resend(
            to_email=customer_email,
            subject="Activate Your AF Apparels Account",
            body_html=self._base_template(content_html),
        )

    @staticmethod
    def get_available_variables(tpl: EmailTemplate) -> list[str]:
        if not tpl.available_variables:
            return []
        try:
            return json.loads(tpl.available_variables)
        except (ValueError, TypeError):
            return []
