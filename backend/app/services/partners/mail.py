"""The program's emails.

Sent in the platform's own name: a partner belongs to no shop, so nothing
here may go out as a brand. The words are in code, not in the email_templates
table, which any shop's admin can edit; a partner's invite or statement must
not be something a shop can rewrite. Sending is best effort and never fails
the action it belongs to: each function says whether it sent.

`support` is the program's own support email (Program settings, Emails).
When it is set, every email shows it as the contact and replies go to it;
when it is empty, the platform's inbox is shown, as before it was a setting.
The caller reads it, since an email is sent after the request has its answer.
"""
from __future__ import annotations

import html
import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_DEFAULT_NAME = "Wholesale Platform"   # the setting's placeholder (core/config.py)


def platform_name() -> str:
    name = (get_settings().PLATFORM_NAME or "").strip()
    return name if name and name != _DEFAULT_NAME else "PrintCoPilot"


def portal_url(path: str = "/partners") -> str:
    origin = (get_settings().FRONTEND_URL or "").rstrip("/")
    return f"{origin}{path if path.startswith('/') else '/' + path}"


def _e(value: object) -> str:
    return html.escape(str(value or ""))


def _masthead() -> str:
    """The top of every partner email: the platform's logo, as printcopilot.co's
    header has it (the mark alone, never the name in text), then "Partners".
    The name in text only when there is no address to load the logo from."""
    kicker = ('font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#5A5F68;'
              'margin:0 0 14px')
    origin = (get_settings().FRONTEND_URL or "").rstrip("/")
    if not origin:
        return f'<p style="{kicker}">{_e(platform_name())} Partners</p>'
    return (f'<p style="{kicker}"><img src="{_e(origin)}/icon_navy_128.png" width="36" height="36" '
            f'alt="{_e(platform_name())}" style="display:block;border:0;margin:0 0 8px">Partners</p>')


def _page(title: str, paragraphs: list[str], button: tuple[str, str] | None = None,
          rows: list[tuple[str, str]] | None = None, support: str | None = None) -> str:
    """One plain, readable email. Text given here is escaped by the caller."""
    parts = [
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
        'max-width:560px;color:#111318">',
        _masthead(),
        f'<h1 style="font-size:22px;margin:0 0 14px">{title}</h1>',
    ]
    parts += [f'<p style="color:#33373F;margin:0 0 14px;line-height:1.6">{p}</p>' for p in paragraphs]
    if rows:
        parts.append('<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;'
                     'border:1px solid #E7E5E2;border-radius:10px;padding:4px 16px;margin:6px 0 18px">')
        for i, (k, v) in enumerate(rows):
            line = "" if i == 0 else "border-top:1px solid #E7E5E2;"
            parts.append(f'<tr><td style="padding:10px 0;color:#5A5F68;{line}">{k}</td>'
                         f'<td style="padding:10px 0;text-align:right;font-weight:600;{line}">{v}</td></tr>')
        parts.append("</table>")
    if button:
        label, href = button
        parts.append(f'<p style="margin:22px 0"><a href="{_e(href)}" style="background:#1652F0;color:#fff;'
                     'padding:12px 24px;border-radius:9px;text-decoration:none;font-weight:700;'
                     f'display:inline-block">{_e(label)}</a></p>')
    contact = _support(support)
    if contact:
        parts.append(f'<p style="color:#5A5F68;font-size:13px;margin:26px 0 0;border-top:1px solid #E7E5E2;'
                     f'padding-top:14px">Questions: <a href="mailto:{_e(contact)}" style="color:#111318">'
                     f'{_e(contact)}</a></p>')
    parts.append("</div>")
    return "".join(parts)


def _support(support: str | None = None) -> str:
    """The contact an email shows: the program's support email, else the platform's inbox."""
    from app.services.email_service import platform_inbox

    return (support or "").strip() or platform_inbox() or ""


def send(to: str, subject: str, body: str, attachments: list[dict] | None = None,
         support: str | None = None) -> bool:
    """As the platform, never as a brand (see email_service.send_as_platform).
    A reply goes to the program's support email when one is set."""
    from app.core.tenant_context import (
        get_current_brand_name,
        get_current_brand_site,
        set_current_brand_name,
        set_current_brand_site,
    )
    from app.services.email_service import EmailService

    was_name, was_site = get_current_brand_name(), get_current_brand_site()
    set_current_brand_name(platform_name())
    set_current_brand_site(None)
    try:
        return bool(EmailService(None).send_raw(to_email=to, subject=subject, body_html=body,
                                                reply_to=(support or "").strip() or None,
                                                attachments=attachments))
    except Exception:  # noqa: BLE001
        logger.warning("partner mail to %s failed: %s", to, subject, exc_info=True)
        return False
    finally:
        set_current_brand_name(was_name)
        set_current_brand_site(was_site)


# ── Applications ──────────────────────────────────────────────────────────────

_NUMBER_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight",
                 9: "nine", 10: "ten"}


def working_days(n: int) -> str:
    """2 -> "two working days", the way the promise has always been worded."""
    return f"{_NUMBER_WORDS.get(n, str(n))} working day{'' if n == 1 else 's'}"


def application_received(name: str, email: str, days: int, support: str | None = None) -> bool:
    """`days` is the program's answer time (application_response_days)."""
    first = _e((name or "").split(" ")[0])
    return send(email, f"We got your application, {first}", _page(
        f"Thanks, {first}. Your application is in.",
        [f"We read every application ourselves and usually answer within {working_days(days)}. "
         "You will get an email either way."],
        support=support,
    ), support=support)


def info_requested(name: str, email: str, question: str, support: str | None = None) -> bool:
    return send(email, "A question about your partner application", _page(
        "One question before we decide",
        [f"Hi {_e((name or '').split(' ')[0])}, we need a little more about how you would share "
         f"{_e(platform_name())}:", f"<em>{_e(question)}</em>",
         "Reply to this email with your answer and we will pick it up from there."],
        support=support,
    ), support=support)


def application_declined(name: str, email: str, support: str | None = None) -> bool:
    return send(email, "About your partner application", _page(
        "We are not able to take your application",
        [f"Hi {_e((name or '').split(' ')[0])}, thank you for applying. We are not adding you to the "
         "partner program right now. If anything changes on your side, you are welcome to apply again."],
        support=support,
    ), support=support)


def invite(name: str, email: str, link: str, code: str, rate: str | None, support: str | None = None) -> bool:
    rows = [("Your code", _e(code))]
    if rate:
        rows.append(("Your rate", _e(rate)))
    return send(email, f"You are in: welcome to {platform_name()} Partners", _page(
        f"Welcome, {_e((name or '').split(' ')[0])}",
        ["Your partner account is ready. Set your password to open the portal, where your link, "
         "your shops and your earnings live. The link works for 7 days."],
        button=("Set my password", link), rows=rows, support=support,
    ), support=support)


def password_reset(name: str, email: str, link: str, support: str | None = None) -> bool:
    return send(email, "Reset your partner password", _page(
        "Reset your password",
        [f"Hi {_e((name or '').split(' ')[0])}, somebody asked to reset the password for this partner "
         "account. If it was you, the button below works for one hour. If not, ignore this email."],
        button=("Choose a new password", link), support=support,
    ), support=support)


# ── While a partner is in the program ─────────────────────────────────────────

def new_shop(name: str, email: str, shop: str, support: str | None = None) -> bool:
    return send(email, f"New referral: {shop}", _page(
        f"{_e(shop)} signed up with your link",
        ["It shows on your Referrals page now. Commission starts with its first paid invoice."],
        button=("Open my referrals", portal_url("/partners/referrals")), support=support,
    ), support=support)


def commission_earned(name: str, email: str, shop: str, amount: str, payable_on: str,
                      support: str | None = None) -> bool:
    return send(email, f"You earned {amount} from {shop}", _page(
        f"You earned {_e(amount)}",
        [f"{_e(shop)} paid its plan. The commission is pending until {_e(payable_on)}, "
         "then it is payable in the next batch."],
        button=("Open my earnings", portal_url("/partners/earnings")), support=support,
    ), support=support)


def payout_recorded(name: str, email: str, amount: str, paid_on: str, method: str,
                    reference: str | None, statement: bytes | None, statement_name: str,
                    support: str | None = None) -> bool:
    rows = [("Amount", _e(amount)), ("Paid on", _e(paid_on)), ("Method", _e(method))]
    if reference:
        rows.append(("Reference", _e(reference)))
    attachments = [{"filename": statement_name, "content": statement}] if statement else None
    return send(email, f"Payout recorded: {amount}", _page(
        "Your payout is on its way",
        ["We sent this payout and recorded it. The statement is attached, and every statement stays "
         "on your Payouts page."],
        rows=rows, button=("Open my payouts", portal_url("/partners/payouts")), support=support,
    ), attachments=attachments, support=support)


def terms_changed(name: str, email: str, version: int, changes: str | None, support: str | None = None) -> bool:
    paragraphs = [f"Version {version} of the partner terms is out. Accept it in the portal to keep "
                  "earning on new referrals. Commission you already earned is never reduced."]
    if changes:
        paragraphs.append(f"What changed: {_e(changes)}")
    return send(email, f"Partner terms, version {version}", _page(
        "The partner terms changed", paragraphs,
        button=("Read and accept", portal_url("/partners/terms")), support=support,
    ), support=support)


_STATUS_WORDS = {
    "paused": ("Your partner account is paused",
               "Your link is not tracking new shops for now. Shops you already referred keep earning "
               "for you, and the portal stays open."),
    "suspended": ("Your partner account is suspended",
                  "You cannot sign in for now, and commission is on hold while we review the account. "
                  "Write to us if you have questions."),
    "terminated": ("Your partnership has ended",
                   "Commission you earned is paid out as usual. If the partnership ended for breaking the "
                   "terms, pending commission is forfeited."),
    "active": ("Your partner account is active again",
               "Your link is tracking new shops again and the portal is open."),
}


def status_changed(name: str, email: str, status: str, support: str | None = None) -> bool:
    title, words = _STATUS_WORDS.get(status, ("Your partner account changed", "Sign in to see what changed."))
    return send(email, title, _page(title, [words], support=support), support=support)


def notify_new_application(name: str, email: str, business: str | None, website: str | None,
                           flags: list[str]) -> bool:
    from app.services.email_service import notify_platform

    rows = [("Name", _e(name)), ("Email", _e(email)), ("Business", _e(business or "None given")),
            ("Website", _e(website or "None given"))]
    if flags:
        rows.append(("Flags", _e(", ".join(f.replace("_", " ") for f in flags))))
    try:
        return bool(notify_platform(f"New partner application: {name}", _page(
            "New partner application", ["Review it in the Platform Console, under Affiliates."], rows=rows)))
    except Exception:  # noqa: BLE001
        logger.warning("could not tell the platform about an application", exc_info=True)
        return False
