"""Four faults in the checkout, closed together.

- An invoice's pay link answered anybody who knew the order number with the
  lines, the money and the order's id. Its email link now carries the order's
  view key in the #fragment, and the summary opens only to it or to the buyer.
- A guest's confirmation email had no link at all. It now links to the order's
  own page, with the key in the #fragment.
- An ACH order was marked paid at checkout, with nothing paid. It stays unpaid
  until the shop marks it paid, like cash on delivery.
- A checkout retried after a lost answer made a second order on cash on
  delivery, ACH and Net 30. One attempt key now makes one order.

No database or network.
"""
import inspect
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
import resend

from app.api.v1 import checkout, guest, orders
from app.core import tenant_context as ctx
from app.core.config import settings
from app.services import order_attempts, order_service, order_view
from app.services.email_service import EmailService

SHOP = uuid.uuid4()
ORDER_ID = uuid.uuid4()


@pytest.fixture
def outbox(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(resend.Emails, "send", lambda params: (sent.append(params), {"id": "kept"})[1])
    for key, value in {
        "RESEND_API_KEY": "re_test", "EMAIL_FROM_ADDRESS": "noreply@printcopilot.co",
        "EMAIL_FROM_NAME": "PrintCopilot", "PLATFORM_NAME": "PrintCopilot", "FRONTEND_URL": "https://printcopilot.co",
        "LOGO_URL": "https://printcopilot.co/logo.png", "EMAIL_REDIRECT_TO": "", "APP_ENV": "production",
    }.items():
        monkeypatch.setattr(settings, key, value)
    ctx.set_current_brand_name("innterflow")
    ctx.set_current_brand_site("https://innterflow.printcopilot.co")
    yield sent
    for clear in (ctx.set_current_brand_name, ctx.set_current_brand_site, ctx.set_current_tenant_email,
                  ctx.set_current_brand_logo, ctx.set_current_brand_contact):
        clear(None)


def an_order(**fields):
    item = SimpleNamespace(product_name="Classic Tee", color="Black", size="L", quantity=12,
                           unit_price=6.5, line_total=78, configuration=None, sku="TEE-BLK-L")
    base = dict(id=ORDER_ID, tenant_id=SHOP, order_number="1047", guest_name="Sara Khan", is_guest_order=True,
                items=[item], subtotal=78, shipping_cost=0, tax_amount=0, discount_amount=0, total=78,
                amount_paid=0, payment_terms="net_30", created_at=None, po_number=None)
    base.update(fields)
    return SimpleNamespace(**base)


def test_a_guests_confirmation_links_to_the_orders_own_page(outbox):
    EmailService(None).send_order_confirmation(an_order(), "sara@example.com")
    html = outbox[-1]["html"]
    key = order_view.view_key(ORDER_ID, SHOP)
    # On the shop's own address, with the key where no server or log sees it.
    assert f'href="https://innterflow.printcopilot.co/checkout/thank-you/1047#k={key}"' in html
    assert "View your order" in html


def test_a_signed_in_buyers_confirmation_still_links_to_their_account(outbox):
    EmailService(None).send_order_confirmation(an_order(is_guest_order=False), "sara@example.com")
    html = outbox[-1]["html"]
    assert f'href="https://innterflow.printcopilot.co/account/orders/{ORDER_ID}"' in html
    assert "#k=" not in html


def test_an_invoices_pay_link_carries_the_orders_key(outbox):
    EmailService(None).send_invoice(an_order(), "sara@example.com")
    html = outbox[-1]["html"]
    key = order_view.view_key(ORDER_ID, SHOP)
    assert f'https://innterflow.printcopilot.co/checkout/invoice/1047#k={key}' in html


def test_the_invoice_summary_is_not_open_by_number_alone():
    source = inspect.getsource(orders.get_order_invoice_summary)
    assert "order_view.key_opens(" in source and "order_view.owned_by(" in source
    assert 'request.headers.get("x-order-key")' in source


def test_an_ach_order_is_not_paid_at_checkout():
    # Signed in: the order is made unpaid, like Net 30 and cash on delivery.
    assert 'if _pm in ("net_30", "ach")' in inspect.getsource(order_service.OrderService.create_order)
    # A guest: the same.
    source = inspect.getsource(guest.guest_checkout)
    ach = source[source.index('if payload.payment_method == "ach":'):]
    assert ach.split("\n", 2)[1].strip().startswith("#") or '_payment_status = "unpaid"' in ach[:400]
    assert '_payment_status = "paid"  # ACH' not in source


def test_an_attempt_key_is_only_a_plain_token():
    assert order_attempts.clean("3f1c2a9e-8b7d-4c6e-9f01-23456789abcd") == "3f1c2a9e-8b7d-4c6e-9f01-23456789abcd"
    assert order_attempts.clean(" lrx3k9-abcdef1234 ") == "lrx3k9-abcdef1234"
    for bad in (None, "", "short", "x" * 65, "abc def ghij", "abc'; drop--", "é" * 10):
        assert order_attempts.clean(bad) is None


def test_both_checkouts_look_for_the_attempt_before_making_an_order():
    for fn, keep in ((checkout._confirm_checkout_inner, "_attempt"), (guest.guest_checkout, "_attempt")):
        source = inspect.getsource(fn)
        looked = source.index("order_attempts.already_placed(")
        assert looked < source.index('"order_created"'), fn.__name__
        # And the order's event keeps the key, so the next retry finds it.
        assert '**({"idempotency_key": _attempt} if _attempt else {})' in source, fn.__name__


def test_the_attempt_lock_lasts_until_the_order_is_made():
    # One commit, at the end, in each checkout: the lock taken before the order
    # is made is still held when its event is written.
    for fn in (checkout._confirm_checkout_inner, guest.guest_checkout):
        source = inspect.getsource(fn)
        made = source.index('"order_created"')
        assert "db.commit()" not in source[source.index("order_attempts.already_placed("):made], fn.__name__
    assert "pg_advisory_xact_lock" in Path(order_attempts.__file__).read_text()
