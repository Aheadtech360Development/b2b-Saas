"""The emails in the owner's design ("PrintCoPilot Documents and Emails"), each
built from what its sender knows and drawn by services/mail_layout.

Every builder answers (subject, html). The shop's own subject and opening
lines from Settings, Notifications (services/notifications) come in as
`subject` and `intro_html` and win over the design's; what the email carries
besides (the facts, the buttons, the attachments) stays, so the shop's own
words can never lose them.

A shop's emails to its customers wear the shop; the platform's to a shop's
owner wear PrintCoPilot (platform=True).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.services.mail_layout import Button, Fact, money, render


def _date(value: date | datetime | str | None) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value[:10])
        except ValueError:
            return value
    return f"{value:%B} {value.day}, {value.year}"


def _units(order: Any) -> int:
    return sum(int(getattr(i, "quantity", 0) or 0) for i in (getattr(order, "items", None) or []))


def _has_print_jobs(order: Any) -> bool:
    return any(getattr(i, "item_type", "") == "gang_sheet" for i in (getattr(order, "items", None) or []))


def _is_pickup(order: Any) -> bool:
    from app.services.order_progress import is_pickup

    return is_pickup(getattr(order, "shipping_method", None))


# ── A shop to its customer ───────────────────────────────────────────────────

def order_confirmed(order: Any, *, order_url: str, subject: str | None = None,
                    intro_html: str | None = None) -> tuple[str, str]:
    number = order.order_number
    then = []
    if _has_print_jobs(order):
        then.append("when your artwork is checked")
    then.append("when it is ready for pickup" if _is_pickup(order) else "when it ships")
    html = render(
        heading="Thanks, we got your order",
        lines=[f"Order {number} is confirmed. We will email you again {' and '.join(then)}."],
        intro_html=intro_html,
        facts=[Fact("Order", number), Fact("Items", str(_units(order) or len(getattr(order, 'items', []) or []))),
               Fact("Total", money(order.total)),
               Fact("Delivery", "Pickup" if _is_pickup(order) else "Shipping")],
        buttons=[Button("View your order", order_url)],
        preview="Here is what you ordered and when to expect it.",
    )
    return subject or f"We got your order, {number}", html


def order_shipped(order: Any, *, order_url: str, subject: str | None = None,
                  intro_html: str | None = None, track_url: str | None = None) -> tuple[str, str]:
    """`track_url`: the shop's own tracking page for this order (every parcel,
    one place); without it the button goes to the courier's page."""
    number = order.order_number
    carrier = " ".join(x for x in (getattr(order, "courier", None) or getattr(order, "carrier", None),
                                   getattr(order, "courier_service", None)) if x).strip()
    tracking = getattr(order, "tracking_number", None) or ""
    tracking_url = getattr(order, "tracking_url", None) or None
    if track_url:
        buttons = [Button("Track your order", track_url)]
    else:
        buttons = [Button("Track your package", tracking_url)] if tracking_url else [Button("View your order", order_url)]
    html = render(
        heading="Your order is on its way",
        lines=[f"Order {number} shipped{' with ' + carrier if carrier else ''}."],
        intro_html=intro_html,
        facts=[Fact("Order", number), Fact("Carrier", carrier), Fact("Tracking", tracking, tracking_url)],
        buttons=buttons,
        preview="Tracking inside." if tracking else "It is on its way.",
    )
    return subject or "Your order shipped", html


def ready_for_pickup(order: Any, *, order_url: str, pickup: dict | None = None, subject: str | None = None,
                     intro_html: str | None = None) -> tuple[str, str]:
    number = order.order_number
    p = pickup or {}
    html = render(
        heading="Ready when you are",
        lines=[f"Order {number} is packed and waiting for you."],
        intro_html=intro_html,
        facts=[Fact("Place", p.get("name") or ""), Fact("Address", p.get("address") or ""),
               Fact("Hours", p.get("hours") or ""), Fact("Bring", f"Order number {number}")],
        after=[p["note"]] if p.get("note") else [],
        buttons=[Button("See pickup details", order_url)],
        preview="Where and when to collect it.",
    )
    return subject or "Your order is ready for pickup", html


def refund_issued(order: Any, *, order_url: str, amount: Any = None, subject: str | None = None,
                  intro_html: str | None = None) -> tuple[str, str]:
    number = order.order_number
    paid = float(getattr(order, "amount_paid", 0) or 0)
    value = amount if amount is not None else (paid if paid > 0 else getattr(order, "total", 0))
    html = render(
        heading="We refunded your order",
        lines=[f"We refunded {money(value)} for order {number} to the card or account you paid with."],
        intro_html=intro_html,
        after=["It can take 5 to 10 business days to show up."],
        buttons=[Button("View your order", order_url)],
        preview="We refunded your order.",
    )
    return subject or "Your refund is on its way", html


_UPDATE_HEADINGS = {
    "pending": "We have your order",
    "confirmed": "Your order is confirmed",
    "processing": "We are working on your order",
    "delivered": "Your order was delivered",
    "cancelled": "Your order was cancelled",
}


def order_update(order: Any, *, status: str, label: str, order_url: str, subject: str | None = None,
                 intro_html: str | None = None, extra_html: str = "", track_url: str | None = None) -> tuple[str, str]:
    """An order's other changes (processing, delivered, cancelled…): the same card.
    `track_url` (delivered): the shop's tracking page instead of the order."""
    number = order.order_number
    after = ["Questions? Reply to this email."] if status in ("cancelled", "refunded") else []
    html = render(
        heading=_UPDATE_HEADINGS.get(status, "Your order was updated"),
        lines=[f"Order {number} is now {label.lower()}."],
        intro_html=intro_html,
        facts=[Fact("Order", number), Fact("Status", label)],
        after=after,
        extra_html=extra_html,
        buttons=[Button("See your order's journey", track_url) if track_url else Button("View your order", order_url)],
        preview=f"Order {number}: {label}.",
    )
    return subject or f"Order {number}: {label}", html


def artwork_approved(reference: str, *, job_url: str, subject: str | None = None,
                     intro_html: str | None = None) -> tuple[str, str]:
    html = render(
        heading="Your job is in production",
        lines=[f"{reference} passed the artwork check. We are printing it now."],
        intro_html=intro_html,
        facts=[Fact("Job", reference)],
        buttons=[Button("Track your job", job_url)],
        preview="Approved, now in production.",
    )
    return subject or "Your job is going to print", html


def revision_requested(reference: str, *, note: str | None, job_url: str, subject: str | None = None,
                       intro_html: str | None = None) -> tuple[str, str]:
    html = render(
        heading="We need a change",
        lines=[f"Job {reference} is on hold. Here is what we found:" if note
               else f"Job {reference} is on hold until the artwork is updated."],
        intro_html=intro_html,
        note=note,
        after=["Send us a new file or tell us to print it as is."],
        buttons=[Button("Update your artwork", job_url)],
        preview="A note from the shop about your artwork.",
    )
    return subject or "We need one change before we print", html


def invoice(order: Any, *, invoice_number: str, amount_due: float, due_on: date | None, terms: str,
            pay_url: str, download_url: str | None, reminder: bool, subject: str | None = None,
            intro_html: str | None = None) -> tuple[str, str]:
    number = order.order_number
    due = _date(due_on)
    if reminder:
        heading = f"Invoice {invoice_number} is due soon"
        line = f"Your invoice for order {number} is due on {due}." if due else f"Your invoice for order {number} is due."
        default_subject = f"Invoice {invoice_number} is due {due}" if due else f"Invoice {invoice_number} is due"
    else:
        heading = f"Invoice {invoice_number}"
        line = (f"Here is the invoice for order {number}. It is due on {due}." if due
                else f"Here is the invoice for order {number}.")
        default_subject = f"Invoice {invoice_number} for order {number}"
    buttons = [Button("Pay now", pay_url)]
    if download_url:
        buttons.append(Button("Download invoice", download_url, primary=False))
    html = render(
        heading=heading,
        lines=[line],
        intro_html=intro_html,
        facts=[Fact("Invoice", invoice_number), Fact("Amount due", money(amount_due)),
               Fact("Due", due), Fact("Terms", terms)],
        after=["The invoice is attached as a PDF."],
        buttons=buttons,
        preview="Pay online in a minute.",
    )
    return subject or default_subject, html


def quote_ready(number: str, *, total: Any, valid_until: date | None, url: str, message: str | None = None,
                subject: str | None = None, intro_html: str | None = None) -> tuple[str, str]:
    until = _date(valid_until)
    html = render(
        heading="Your quote is ready",
        lines=[f"Here is the price for what you asked for. It is good until {until}." if until
               else "Here is the price for what you asked for."],
        intro_html=intro_html,
        note=(message or "").strip() or None,
        facts=[Fact("Quote", number), Fact("Total", money(total)), Fact("Valid until", until)],
        buttons=[Button("Review and accept", url)],
        preview="Review it and accept.",
    )
    return subject or "Your quote is ready", html


def notice(heading: str, lines: list[str], *, button: Button | None = None, facts: list[Fact] | None = None,
           preview: str = "", platform: bool = False, reason: str = "your account") -> str:
    """A short account notice (address added, password changed…) in the same card."""
    return render(heading=heading, lines=lines, facts=facts or [], buttons=[button] if button else [],
                  preview=preview, platform=platform, reason=reason)


# ── The platform to a shop's owner ──────────────────────────────────────────

def new_order_alert(order: Any, *, customer: str, admin_url: str) -> tuple[str, str]:
    number = order.order_number
    html = render(
        heading="You have a new order",
        lines=[f"{customer} placed order {number}."],
        facts=[Fact("Order", number), Fact("Customer", customer), Fact("Total", money(order.total)),
               Fact("Method", "Pickup" if _is_pickup(order) else "Shipping")],
        buttons=[Button("Open order", admin_url)],
        preview=f"{money(order.total)}, ready for you.",
        platform=True,
    )
    return f"New order {number} from {customer}", html


def quote_accepted_alert(number: str, *, customer: str, total: Any, admin_url: str) -> tuple[str, str]:
    html = render(
        heading=f"Quote {number} accepted",
        lines=[f"{customer} accepted quote {number}. Convert it to an order to start on it."],
        facts=[Fact("Quote", number), Fact("Customer", customer), Fact("Total", money(total))],
        buttons=[Button("Open the quote", admin_url)],
        preview="Convert it to an order.",
        platform=True,
    )
    return f"Quote {number} accepted by {customer}", html


def wholesale_application_alert(*, company: str, business_type: str | None, tax_id: str | None, shop: str,
                                admin_url: str, contact: str | None = None) -> tuple[str, str]:
    html = render(
        heading="New wholesale application",
        lines=[f"{company} wants a wholesale account on {shop}."],
        facts=[Fact("Company", company), Fact("Contact", contact or ""), Fact("Type", business_type or ""),
               Fact("Tax ID", tax_id or "")],
        buttons=[Button("Review application", admin_url)],
        preview="Review and approve.",
        platform=True,
    )
    return f"{company} applied for wholesale", html


def trial_notice(*, days_left: int, ends_on: date | None, plans_url: str, shop_url: str | None) -> tuple[str, str]:
    """Trial ending (days left) or ended (days_left <= 0). Nothing is switched
    off when a trial ends; the mail says so rather than threatening it."""
    facts = [Fact("Your shop", (shop_url or "").replace("https://", ""), shop_url)] if shop_url else []
    if days_left <= 0:
        html = render(
            heading="Your trial has ended",
            lines=["Your shop, products and orders are all still here. Nothing was deleted.",
                   "Choose a plan to keep selling."],
            facts=facts, buttons=[Button("Choose a plan", plans_url)],
            preview="Choose a plan to keep selling.", platform=True,
        )
        return "Your trial has ended", html
    when = _date(ends_on)
    html = render(
        heading=f"Your trial ends {when}" if when else ("Your trial ends tomorrow" if days_left == 1
                                                         else f"Your trial ends in {days_left} days"),
        lines=["Your store, products and orders stay safe. Choose a plan so selling doesn't stop."],
        facts=facts, buttons=[Button("Choose a plan", plans_url)],
        preview="Pick a plan to keep selling.", platform=True,
    )
    return ("Your trial ends tomorrow" if days_left == 1 else f"Your trial ends in {days_left} days"), html


def order_limit_notice(*, level: int, orders: int, limit: int, plan: str, plans_url: str) -> tuple[str, str]:
    """The owner's notice at 80% and 100% of the plan's monthly orders. A
    notice only: buyers keep checking out (services/plan_usage)."""
    if level >= 100:
        subject = f"You have reached the {limit:,} orders your {plan} plan includes this month"
        lines = [f"Your shop has taken {orders:,} orders this month. Buyers can still check out, nothing is stopped.",
                 "A plan with more orders keeps you inside your limits as you grow."]
    else:
        subject = f"Your shop has used {orders * 100 // limit}% of this month's orders"
        lines = [f"{orders:,} of the {limit:,} orders your {plan} plan includes this month.",
                 "Buyers can always check out. If this is your new normal, a bigger plan has room for it."]
    html = render(heading=subject, lines=lines, buttons=[Button("See plans", plans_url)],
                  preview=lines[0], platform=True)
    return subject, html


def team_invite(*, shop: str, role: str, accept_url: str, valid_days: int,
                inviter: str | None = None) -> tuple[str, str]:
    who = inviter or "The shop's owner"
    html = render(
        heading=f"Join {shop}",
        lines=[f"{who} invited you to the {shop} admin as {role}. You set your own password."],
        after=[f"The link works for {valid_days} days. After that, use \"Forgot password\" on the sign-in page."],
        buttons=[Button("Accept invite", accept_url)],
        preview="Set your password to join.",
        platform=True,
    )
    return (f"{inviter} invited you to {shop}" if inviter else f"You are invited to {shop}"), html


def password_reset(*, reset_url: str, hours: int = 1, platform: bool = False) -> tuple[str, str]:
    within = "an hour" if hours == 1 else f"{hours} hours"
    html = render(
        heading="Reset your password",
        lines=[f"Use the button within {within}. If you did not ask, ignore this; nothing has changed."],
        buttons=[Button("Reset password", reset_url)],
        preview="The link works once.",
        platform=platform,
        reason="your account",
    )
    return "Reset your password", html


def welcome(*, first_name: str | None, shop: str, shop_url: str, sign_in_url: str, email: str) -> tuple[str, str]:
    html = render(
        heading=f"Welcome, {first_name}" if first_name else "Welcome",
        lines=[f"Your store {shop} is ready. Next: add products, brand your store, connect payments."],
        facts=[Fact("Your shop", shop_url.replace("https://", ""), shop_url), Fact("Sign in with", email)],
        buttons=[Button("Open your store", sign_in_url)],
        preview="Three steps to your first order.",
        platform=True,
    )
    return "Welcome to PrintCoPilot", html
