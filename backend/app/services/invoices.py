"""Invoices and payments: what the shop is owed on its orders, and when.

Every order has an invoice (the PDF and the customer's own list draw one from
it), but most were paid by card at checkout and were never owed. This screen
is about the rest. An order is on it when:

- it waits to be paid: on Net terms at checkout, by bank transfer, cash on
  delivery, or a draft confirmed into an order (its invoice is emailed then);
- or it was invoiced or paid against an invoice: an invoice was sent by hand,
  or it was marked paid, or paid through the invoice's payment link.

A draft still being priced is a quote (services/quotes), not an invoice, and a
no-charge reprint owes nothing.

The due date is the invoice date plus the order's payment terms, the same days
EmailService.send_invoice prints. The invoice date is when the invoice was last
sent, else when the order was placed. The invoice number is the PDF's
(PDFService.generate_invoice): INV-<year placed>-<last part of the order
number>.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.order import Order

TERMS_DAYS = {"due_on_receipt": 0, "net_15": 15, "net_30": 30}
TERMS_WORDS = {"due_on_receipt": "Due on receipt", "net_15": "Net 15", "net_30": "Net 30"}
# "Due soon": due within this many days.
DUE_SOON_DAYS = 7
TABS = ("all", "unpaid", "overdue", "paid")


def terms_days(terms: str | None) -> int:
    return TERMS_DAYS.get(terms or "net_30", 30)


def invoice_number(order_number: str | None, placed_at: datetime | None) -> str:
    """The number the invoice PDF prints, so the screen and the PDF agree."""
    year = (placed_at or datetime.now(timezone.utc)).year
    suffix = order_number.rsplit("-", 1)[-1] if order_number else "0001"
    return f"INV-{year}-{suffix}"


def due_on(*, terms: str | None, invoiced_at: datetime | None, placed_at: datetime, offset: timedelta) -> date:
    """The day payment is due, on the viewer's clock."""
    start = invoiced_at or placed_at
    return (start + offset).date() + timedelta(days=terms_days(terms))


def balance_of(*, total: Any, amount_paid: Any, payment_status: str | None) -> Decimal:
    if payment_status in ("paid", "refunded"):
        return Decimal("0.00")
    owed = Decimal(str(total or 0)) - Decimal(str(amount_paid or 0))
    return max(owed, Decimal("0.00")).quantize(Decimal("0.01"))


def state_of(*, balance: Decimal, due: date, today: date) -> str:
    """paid, overdue, due_soon or unpaid."""
    if balance <= 0:
        return "paid"
    if due < today:
        return "overdue"
    if (due - today).days <= DUE_SOON_DAYS:
        return "due_soon"
    return "unpaid"


def is_invoice():
    """The orders this screen is about (see the module's note)."""
    return and_(
        # A draft not yet confirmed is a quote.
        not_(and_(Order.order_number.like("DRAFT-%"), Order.status == "pending")),
        Order.status != "cancelled",
        func.coalesce(Order.total, 0) > 0,
        or_(
            Order.invoice_sent_at.isnot(None),
            Order.marked_paid_at.isnot(None),
            # Owed, and not a card payment still going through or given up on.
            and_(Order.payment_status == "unpaid", func.coalesce(Order.payment_method, "") != "card"),
        ),
    )


def _row(o: Order, company: str | None, offset: timedelta, today: date) -> dict[str, Any]:
    balance = balance_of(total=o.total, amount_paid=o.amount_paid, payment_status=o.payment_status)
    due = due_on(terms=o.payment_terms, invoiced_at=o.invoice_sent_at, placed_at=o.created_at, offset=offset)
    return {
        "order_id": str(o.id),
        "order_number": o.order_number,
        "invoice_number": invoice_number(o.order_number, o.created_at),
        "customer": company or o.guest_name or o.guest_email or "Customer",
        "terms": TERMS_WORDS.get(o.payment_terms or "net_30", "Net 30"),
        "invoiced_at": (o.invoice_sent_at or o.created_at).isoformat() if (o.invoice_sent_at or o.created_at) else None,
        "due_on": due.isoformat(),
        "total": float(o.total or 0),
        "balance": float(balance),
        "paid_at": o.marked_paid_at.isoformat() if o.marked_paid_at else None,
        "state": state_of(balance=balance, due=due, today=today),
        "can_remind": balance > 0 and bool(o.guest_email or o.placed_by_id),
    }


async def load(db: AsyncSession, *, utc_offset_minutes: int = 0) -> list[dict[str, Any]]:
    """Every invoice, newest first, with its state worked out."""
    offset = timedelta(minutes=utc_offset_minutes)
    today = (datetime.now(timezone.utc) + offset).date()
    rows = (await db.execute(
        select(Order, Company.name)
        .outerjoin(Company, Order.company_id == Company.id)
        .where(is_invoice())
        .order_by(Order.created_at.desc())
        .limit(2000)
    )).all()
    return [_row(o, name, offset, today) for o, name in rows]


def in_tab(row: dict[str, Any], tab: str) -> bool:
    if tab == "unpaid":
        return row["state"] != "paid"
    if tab == "overdue":
        return row["state"] == "overdue"
    if tab == "paid":
        return row["state"] == "paid"
    return True


def summary(rows: list[dict[str, Any]], *, utc_offset_minutes: int = 0) -> dict[str, Any]:
    """The three figures over the list, and the tabs' counts."""
    offset = timedelta(minutes=utc_offset_minutes)
    now = datetime.now(timezone.utc) + offset
    month = (now.year, now.month)

    def paid_this_month(r: dict[str, Any]) -> bool:
        if r["state"] != "paid" or not r["paid_at"]:
            return False
        at = datetime.fromisoformat(r["paid_at"]) + offset
        return (at.year, at.month) == month

    return {
        "outstanding": round(sum(r["balance"] for r in rows), 2),
        "overdue": round(sum(r["balance"] for r in rows if r["state"] == "overdue"), 2),
        "paid_this_month": round(sum(r["total"] for r in rows if paid_this_month(r)), 2),
        "counts": {t: sum(1 for r in rows if in_tab(r, t)) for t in TABS},
    }
