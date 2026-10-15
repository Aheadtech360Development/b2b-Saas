"""Designs 29-31: quotes, invoices and payments, returns and reprints.

The rules that decide what each screen shows, without a database; the
screens' routes are walked through the local API by hand (session scratchpad,
orders_money_local.py).
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.permissions import extra_scope_for
from app.services import invoices, quotes, returns

UTC = timezone.utc


def test_an_invoice_is_due_its_terms_after_it_was_sent_or_placed():
    placed = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)
    assert invoices.due_on(terms="net_30", invoiced_at=None, placed_at=placed, offset=timedelta()) == date(2026, 10, 31)
    assert invoices.due_on(terms="net_15", invoiced_at=None, placed_at=placed, offset=timedelta()) == date(2026, 10, 16)
    assert invoices.due_on(terms="due_on_receipt", invoiced_at=None, placed_at=placed, offset=timedelta()) == date(2026, 10, 1)
    # Sent again later: the invoice date is the last send.
    sent = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)
    assert invoices.due_on(terms="net_30", invoiced_at=sent, placed_at=placed, offset=timedelta()) == date(2026, 11, 9)
    # On the viewer's clock: 01:00 UTC is still the day before in Dallas.
    late = datetime(2026, 10, 2, 1, 0, tzinfo=UTC)
    assert invoices.due_on(terms="net_30", invoiced_at=None, placed_at=late, offset=timedelta(hours=-5)) == date(2026, 10, 31)
    # Terms nobody set read as the order's default, Net 30.
    assert invoices.terms_days(None) == 30


def test_an_invoice_is_paid_overdue_due_soon_or_unpaid():
    today = date(2026, 10, 15)
    assert invoices.state_of(balance=Decimal("0"), due=date(2026, 9, 1), today=today) == "paid"
    assert invoices.state_of(balance=Decimal("10"), due=date(2026, 10, 14), today=today) == "overdue"
    assert invoices.state_of(balance=Decimal("10"), due=date(2026, 10, 22), today=today) == "due_soon"
    assert invoices.state_of(balance=Decimal("10"), due=date(2026, 10, 30), today=today) == "unpaid"


def test_what_is_owed_counts_part_payments_and_nothing_once_paid_or_refunded():
    assert invoices.balance_of(total=100, amount_paid=None, payment_status="unpaid") == Decimal("100.00")
    assert invoices.balance_of(total=100, amount_paid=40, payment_status="unpaid") == Decimal("60.00")
    assert invoices.balance_of(total=100, amount_paid=None, payment_status="paid") == Decimal("0.00")
    assert invoices.balance_of(total=100, amount_paid=None, payment_status="refunded") == Decimal("0.00")


def test_the_invoice_number_is_the_one_its_pdf_prints():
    placed = datetime(2026, 10, 1, tzinfo=UTC)
    assert invoices.invoice_number("1051", placed) == "INV-2026-1051"
    assert invoices.invoice_number("AF-000123", placed) == "INV-2026-000123"


def test_the_figures_and_tabs_over_the_list():
    month = datetime.now(UTC).isoformat()
    rows = [
        {"state": "overdue", "balance": 100.0, "total": 100.0, "paid_at": None},
        {"state": "unpaid", "balance": 50.0, "total": 80.0, "paid_at": None},
        {"state": "paid", "balance": 0.0, "total": 70.0, "paid_at": month},
        {"state": "paid", "balance": 0.0, "total": 30.0, "paid_at": "2020-01-05T00:00:00+00:00"},
    ]
    s = invoices.summary(rows)
    assert s["outstanding"] == 150.0 and s["overdue"] == 100.0 and s["paid_this_month"] == 70.0
    assert s["counts"] == {"all": 4, "unpaid": 2, "overdue": 1, "paid": 2}


def test_where_a_quote_stands():
    today = date(2026, 10, 15)
    later = {"valid_until": "2026-10-29"}
    passed = {"valid_until": "2026-10-01"}
    assert quotes.status_of(order_status="pending", sent=None, accepted=False, today=today) == "draft"
    assert quotes.status_of(order_status="pending", sent=later, accepted=False, today=today) == "sent"
    assert quotes.status_of(order_status="pending", sent=passed, accepted=False, today=today) == "expired"
    assert quotes.status_of(order_status="pending", sent=passed, accepted=True, today=today) == "accepted"
    assert quotes.status_of(order_status="confirmed", sent=later, accepted=True, today=today) == "ordered"
    assert quotes.default_valid_until(today) == date(2026, 11, 14)


def test_a_return_keeps_its_reason_and_the_shops_words():
    assert returns.reason_text("print_quality", None) == "Print quality"
    assert returns.reason_text("wrong_file", "  They sent v2 ") == "Wrong file: They sent v2"
    with pytest.raises(HTTPException):
        returns.reason_text("not-a-reason", None)


def test_a_refund_from_returns_needs_billing_as_the_order_pages_does():
    assert extra_scope_for("/api/v1/admin/orders/abc/refund", "POST") == "billing"
    assert extra_scope_for("/api/v1/admin/returns/refund", "POST") == "billing"
    assert extra_scope_for("/api/v1/admin/returns/abc/refund", "POST") == "billing"
    assert extra_scope_for("/api/v1/admin/returns/reprint", "POST") is None
    assert extra_scope_for("/api/v1/admin/returns/abc/reject", "POST") is None
    assert extra_scope_for("/api/v1/admin/returns", "GET") is None
