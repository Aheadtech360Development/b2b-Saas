"""The shop's documents (services/pdf_service), in the owner's design.

An invoice says what is due, when, and where to pay it; once paid it is the
receipt. A packing slip shows no prices. A statement prints the lines its page
lists, and what is owed by how late it is. Everything printed is the shop's,
and what the shop has not set is left out.

No database, no network: the order is a stand-in, the shop is the request's
brand identity, and the pages are left uncompressed so their words can be read
straight out of the PDF.
"""
import inspect
import json
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from reportlab import rl_config

from app.core import tenant_context as ctx
from app.services.pdf_service import PDFService


@pytest.fixture(autouse=True)
def shop(monkeypatch):
    monkeypatch.setattr(rl_config, "pageCompression", 0)
    ctx.set_current_brand_name("Innterflow")
    ctx.set_current_brand_site("https://innterflow.com")
    ctx.set_current_brand_contact("hello@innterflow.com")
    ctx.set_current_brand_logo(None)
    ctx.set_current_brand_card({"lines": ["10 Dock Rd", "Dallas, TX 75243"], "phone": "(214) 555-0100"})
    yield
    for clear in (ctx.set_current_brand_name, ctx.set_current_brand_site, ctx.set_current_brand_contact,
                  ctx.set_current_brand_logo, ctx.set_current_brand_card, ctx.set_current_tenant_email):
        clear(None)


def an_order(**over):
    items = [SimpleNamespace(sku="G5000-BLK-L", product_name="Gildan 5000 Tee", color="Black", size="L",
                             quantity=24, unit_price=4.85, line_total=116.40),
             SimpleNamespace(sku="GS-22x60", product_name="Gang sheet 22 x 60 in", color=None, size=None,
                             quantity=1, unit_price=38.50, line_total=38.50)]
    base = dict(id="11111111-1111-1111-1111-111111111111", tenant_id="22222222-2222-2222-2222-222222222222",
                order_number="1005", po_number=None, created_at=datetime(2026, 10, 20, 15, tzinfo=timezone.utc),
                invoice_sent_at=None, items=items, subtotal=154.90, shipping_cost=12.40, tax_amount=0,
                tax_rate=None, tax_region=None, convenience_fee=0, total=167.30, amount_paid=None,
                amount_refunded=0, payment_status="unpaid", payment_terms="net_30", payment_method=None,
                stripe_payment_intent_id=None, ach_account_last4=None, marked_paid_at=None, notes=None,
                shipping_method="ground", courier="UPS", courier_service="Ground", carrier=None,
                tracking_number="1Z999AA10123456784", shipped_at=None, guest_name=None, placed_by=None,
                company=SimpleNamespace(name="Torres Print Co.", address_line1="455 Elm St", address_line2=None,
                                        city="Garland", state_province="TX", postal_code="75040", country="US",
                                        tax_id="74-1234567"),
                shipping_address_snapshot=json.dumps({"full_name": "Maria Torres", "line1": "455 Elm St",
                                                      "city": "Garland", "state": "TX", "postal_code": "75040",
                                                      "country": "US"}))
    base.update(over)
    return SimpleNamespace(**base)


def words(pdf: bytes) -> str:
    return pdf.decode("latin-1")


def test_an_unpaid_invoice_says_what_is_due_when_and_where_to_pay():
    text = words(PDFService().generate_invoice(an_order()))
    for part in ("(Invoice)", "Invoice INV-2026-1005", "Order 1005", "Issued Oct 20, 2026",
                 "Due Nov 19, 2026 \\(Net 30\\)", "Amount due", "$167.30", "Torres Print Co.", "Tax ID 74-1234567",
                 "PAY ONLINE", "innterflow.com/checkout/invoice/1005", "Thank you for your business.", "Page 1 of 1"):
        assert part in text, part
    # The shop at the top: its name, its address, where to write.
    for part in ("Innterflow", "10 Dock Rd", "Dallas, TX 75243", "hello@innterflow.com"):
        assert part in text, part
    assert "Receipt" not in text
    # A US shop's papers leave the country out.
    assert "(US)" not in text


def test_the_invoice_says_the_dates_its_email_says():
    text = words(PDFService().generate_invoice(an_order(), due_on=date(2026, 12, 1), issued_on=date(2026, 10, 26)))
    assert "Issued Oct 26, 2026" in text and "Due Dec 1, 2026" in text


def test_without_its_email_the_invoice_counts_from_when_it_was_sent():
    """The Invoices screen's rule (services/invoices.due_on): sent, else placed."""
    sent = datetime(2026, 11, 2, 9, tzinfo=timezone.utc)
    text = words(PDFService().generate_invoice(an_order(invoice_sent_at=sent, payment_terms="net_15")))
    assert "Issued Nov 2, 2026" in text and "Due Nov 17, 2026 \\(Net 15\\)" in text


def test_a_paid_invoice_is_the_receipt():
    text = words(PDFService().generate_invoice(an_order(payment_status="paid", stripe_payment_intent_id="pi_1")))
    assert "(Receipt)" in text and "Amount paid" in text and "PAID WITH" in text and "(Card)" in text
    assert "Amount due" not in text and "PAY ONLINE" not in text


def test_a_refund_on_the_receipt_says_what_went_back():
    text = words(PDFService().generate_invoice(an_order(payment_status="refunded", amount_paid=167.30,
                                                        amount_refunded=167.30)))
    assert "(Refunded)" in text and "-$167.30" in text and "Net paid" in text and "$0.00" in text


def test_the_packing_slip_shows_no_prices():
    text = words(PDFService().generate_pack_slip(an_order(notes="Pack the black tees on top.")))
    assert "Packing slip" in text and "PACKED" in text and "ORDER NOTES" in text and "Pack the black tees" in text
    assert "1Z999AA10123456784" in text and "UPS Ground" in text
    assert "$" not in text
    assert "No prices shown on this slip." in text and "quote order 1005" in text


def test_a_shop_that_set_no_address_gets_none_printed():
    ctx.set_current_brand_card(None)
    text = words(PDFService().generate_invoice(an_order()))
    assert "Dock Rd" not in text and "555-0100" not in text
    for other in ("AF Apparels", "PrintCoPilot", "PrintCopilot"):
        assert other not in text


def test_the_shops_reply_address_is_the_one_printed():
    """The address the shop's mail replies go to, before the sign-up one."""
    ctx.set_current_tenant_email({"reply_to": "orders@innterflow.com"})
    text = words(PDFService().generate_invoice(an_order()))
    assert "orders@innterflow.com" in text and "hello@innterflow.com" not in text


def test_words_from_the_shop_or_the_buyer_cannot_break_a_document():
    odd = an_order(notes="<b>Rush</b> & fold", po_number="PO <1>")
    odd.items[0].product_name = "Tee <XL> & more"
    for make in (PDFService().generate_invoice, PDFService().generate_pack_slip,
                 PDFService().generate_order_confirmation, PDFService().generate_ship_confirmation):
        assert make(odd).startswith(b"%PDF")


def test_pickup_orders_say_pickup_not_an_address():
    text = words(PDFService().generate_pack_slip(an_order(shipping_method="will_call", shipping_address_snapshot=None)))
    assert "Pickup at the shop" in text and "(Pickup)" in text


def test_a_statement_prints_its_lines_and_the_aging():
    rows = [{"date": "2026-09-03", "description": "Order 1001", "type": "charge", "amount": 420.0,
             "reference": "1001", "running_balance": 420.0},
            {"date": "2026-09-20", "description": "Payment", "type": "payment", "amount": 420.0,
             "reference": "pi_3Q", "running_balance": 0.0}]
    text = words(PDFService().generate_statement(
        account="Torres Print Co.", period="Sep 1, 2026 to Oct 26, 2026", rows=rows,
        summary={"total_charges": 420.0, "total_payments": 420.0, "current_balance": 0.0},
        aging={"current": 0, "1_30": 0, "31_60": 0, "over_60": 0}))
    for part in ("(Statement)", "Torres Print Co.", "Total charges", "Current balance", "Order 1001", "(Invoice)",
                 "(Payment)", "AGING", "31 to 60 days", "Over 60 days", "Sep 3, 2026"):
        assert part in text, part


def test_the_statement_pdf_prints_the_pages_own_lines():
    """It read only one of the two places a statement's lines come from, so a
    company whose lines come from its orders got an empty PDF."""
    from app.api.v1 import account

    assert "_statement_lines(" in inspect.getsource(account.list_statements)
    assert "_statement_lines(" in inspect.getsource(account.download_statement_pdf)


async def test_every_order_is_on_the_statement_once():
    """A company checkout wrote each order's charge twice (the order service and
    the checkout), so the statement listed every order twice and owed double."""
    import uuid

    from app.api.v1 import account

    order_a, order_b = uuid.uuid4(), uuid.uuid4()

    def line(kind, amount, order, description):
        return SimpleNamespace(id=uuid.uuid4(), transaction_date="2026-10-08", description=description,
                               transaction_type=kind, amount=amount, reference_number="1017", order_id=order)

    written = [line("charge", 288.54, order_a, "Order #1017"), line("charge", 288.54, order_a, "Order 1017"),
               line("payment", 288.54, order_a, "Card payment for Order 1017"),
               line("charge", 23.95, order_b, "Order #1043"), line("charge", 23.95, order_b, "Order 1043")]

    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: written)

    class Db:
        async def execute(self, statement):
            return Result()

    request = SimpleNamespace(state=SimpleNamespace(company_id=str(uuid.uuid4()), user_id=None))
    items, summary = await account._statement_lines(Db(), request, None, None)
    assert [i["type"] for i in items] == ["charge", "payment", "charge"]
    assert summary == {"total_charges": 312.49, "total_payments": 288.54, "current_balance": 23.95}

    # And no second line is written any more: the checkout writes the order's.
    from app.services.order_service import OrderService

    made = inspect.getsource(OrderService.create_order)
    assert "StatementTransaction(" not in made and "send_raw(" not in made


def test_aging_settles_the_oldest_charges_first():
    from app.api.v1.account import _aging

    items = [
        {"date": "2026-07-01", "type": "charge", "amount": 100.0, "order_id": "a"},
        {"date": "2026-08-20", "type": "charge", "amount": 50.0, "order_id": "b"},   # Net 15: due Sep 4
        {"date": "2026-09-15", "type": "payment", "amount": 120.0, "order_id": "a"},
        {"date": "2026-10-10", "type": "charge", "amount": 70.0, "order_id": "c"},   # due Nov 9
        {"date": "2026-09-10", "type": "charge", "amount": 30.0, "order_id": None},  # Net 30: due Oct 10
    ]
    aging = _aging(items, {"a": "net_30", "b": "net_15", "c": "net_30"}, date(2026, 10, 26))
    assert aging == {"current": 70.0, "1_30": 30.0, "31_60": 30.0, "over_60": 0.0}
    # More paid than charged: nothing is owed.
    assert sum(_aging([{"date": "2026-10-01", "type": "charge", "amount": 10.0, "order_id": None},
                       {"date": "2026-10-02", "type": "payment", "amount": 25.0, "order_id": None}],
                      {}, date(2026, 10, 26)).values()) == 0
