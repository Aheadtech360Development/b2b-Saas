"""A shop's customer is written to by the shop, never by the platform.

Everything a customer can see of who sent a mail — the sender's name, the
subject, the heading, the signature, the logo, the links, where a reply goes —
is the brand's. The platform's name belongs on the platform's own mail only.
The one thing that stays the platform's is the sending address's domain, until
a brand connects a sending domain of its own.

No database, no network: Resend's send is replaced by a function that keeps
what it was given.
"""
import inspect
import re
from types import SimpleNamespace

import pytest
import resend

from app.core import tenant_context as ctx
from app.core.config import settings
from app.services import email_service
from app.services.email_service import EmailService

PLATFORM = "PrintCopilot"


@pytest.fixture
def outbox(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(resend.Emails, "send", lambda params: (sent.append(params), {"id": "kept"})[1])
    for key, value in {
        "RESEND_API_KEY": "re_test", "EMAIL_FROM_ADDRESS": "noreply@printcopilot.co",
        "EMAIL_FROM_NAME": PLATFORM, "PLATFORM_NAME": PLATFORM, "FRONTEND_URL": "https://printcopilot.co",
        "LOGO_URL": "https://printcopilot.co/logo.png", "EMAIL_REDIRECT_TO": "", "APP_ENV": "production",
    }.items():
        monkeypatch.setattr(settings, key, value)
    yield sent
    for clear in (ctx.set_current_brand_name, ctx.set_current_brand_site, ctx.set_current_tenant_email,
                  ctx.set_current_brand_logo, ctx.set_current_brand_contact):
        clear(None)


def as_brand(name="innterflow", site="https://innterflow.printcopilot.co", logo=None,
             contact="hello@innterflow.com", mail=None):
    ctx.set_current_brand_name(name)
    ctx.set_current_brand_site(site)
    ctx.set_current_tenant_email(mail)
    ctx.set_current_brand_logo(logo)
    ctx.set_current_brand_contact(contact)


def an_order():
    item = SimpleNamespace(product_name="Gang Sheet GS-1", color=None, size=None, quantity=1,
                           unit_price=7.35, line_total=7.35)
    return SimpleNamespace(id="11111111-1111-1111-1111-111111111111", order_number="1006", guest_name=None,
                           is_guest_order=False, items=[item], subtotal=7.35, shipping_cost=0, tax_amount=0,
                           discount_amount=0, total=7.35)


def test_an_order_mail_is_the_shops_from_top_to_bottom(outbox):
    as_brand()
    EmailService(None).send_order_confirmation(an_order(), "customer@example.com")
    mail = outbox[-1]
    assert mail["from"] == "innterflow <noreply@printcopilot.co>"
    assert mail["subject"].endswith("| innterflow")
    assert ">innterflow<" in mail["html"] and "innterflow Team" in mail["html"]
    # The button goes to the shop, and a reply goes to the shop.
    assert 'href="https://innterflow.printcopilot.co/account/orders/' in mail["html"]
    assert mail["reply_to"] == ["hello@innterflow.com"]
    # The platform's name is nowhere a customer reads. Its domain is: in the
    # sending address, and in the shop's own address on the platform.
    seen = " ".join([mail["from"], mail["subject"], mail["html"]])
    assert PLATFORM not in seen
    assert set(re.findall(r"[\w.-]*printcopilot\.co", seen)) == {"printcopilot.co", "innterflow.printcopilot.co"}


def test_a_reply_goes_where_the_shop_said_before_where_it_signed_up(outbox):
    as_brand(mail={"reply_to": "orders@innterflow.com", "notify_email": "owner@innterflow.com"})
    EmailService(None).send_raw("customer@example.com", "Hello", "<p>Hi</p>")
    assert outbox[-1]["reply_to"] == ["orders@innterflow.com"]
    as_brand(mail={"notify_email": "owner@innterflow.com"})
    EmailService(None).send_raw("customer@example.com", "Hello", "<p>Hi</p>")
    assert outbox[-1]["reply_to"] == ["owner@innterflow.com"]


def test_a_shop_without_a_logo_sends_none_rather_than_the_platforms(outbox):
    as_brand(logo=None)
    assert EmailService(None)._file_template_vars({})["logo_url"] == ""
    as_brand(logo="https://cdn.example.com/innterflow.png")
    assert EmailService(None)._file_template_vars({})["logo_url"] == "https://cdn.example.com/innterflow.png"
    # The platform's own mail keeps the platform's logo.
    as_brand(name=PLATFORM, site=None, logo=None, contact=None)
    assert EmailService(None)._file_template_vars({})["logo_url"] == "https://printcopilot.co/logo.png"
    as_brand(name=None, site=None, logo=None, contact=None)
    assert EmailService(None)._file_template_vars({})["logo_url"] == "https://printcopilot.co/logo.png"


def test_the_shops_documents_carry_its_logo_or_none(outbox):
    """The order PDF and the invoice read the logo the same way."""
    from app.services import pdf_service

    src = inspect.getsource(pdf_service._header)
    assert "get_current_brand_logo()" in src and "_cfg.PLATFORM_NAME" in src
    assert "logo_url = _cfg.LOGO_URL" not in src  # the line that put one logo on every shop's PDF


def test_a_platform_address_saved_with_a_name_does_not_bring_the_name(outbox, monkeypatch):
    assert email_service._bare_address("PrintCopilot <noreply@printcopilot.co>") == "noreply@printcopilot.co"
    assert email_service._bare_address(" noreply@printcopilot.co ") == "noreply@printcopilot.co"
    monkeypatch.setattr(settings, "EMAIL_FROM_ADDRESS", "PrintCopilot <noreply@printcopilot.co>")
    as_brand()
    EmailService(None).send_raw("customer@example.com", "Hello", "<p>Hi</p>")
    assert outbox[-1]["from"] == "innterflow <noreply@printcopilot.co>"


def test_a_brand_always_has_a_name_to_sign_with():
    """It was the store name or nothing, and nothing meant the platform's name
    on every line of the mail. The resolver falls through to the company name
    and then the name the brand signed up with — as the shop's pages do."""
    from app.core import database

    sql = inspect.getsource(database._resolve_brand_name)
    order = [sql.index("b.store_name"), sql.index("b.company_name"), sql.index("t.name")]
    assert order == sorted(order) and "COALESCE(" in sql and "LEFT JOIN tenant_branding" in sql


def test_every_background_mail_job_signs_as_the_records_brand():
    """A job runs outside a request, so nothing has said whose mail it is.
    Seven of these said nothing, and sent as the platform."""
    from app.tasks import email_tasks

    src = inspect.getsource(email_tasks)
    jobs = re.split(r"\n@celery_app\.task[^\n]*\n", src)[1:]
    assert len(jobs) >= 17
    for job in jobs:
        name = re.match(r"def (\w+)", job).group(1)
        assert "_brand_from_order(" in job or "_brand_from(" in job, f"{name} sends without saying whose mail it is"

    # And the one call that says it sets all five things, not two of them.
    helper = inspect.getsource(email_tasks._brand_from)
    assert "use_brand_identity" in helper
    from app.core import database

    setters = inspect.getsource(database.use_brand_identity)
    for part in ("set_current_brand_name", "set_current_brand_site", "set_current_tenant_email",
                 "set_current_brand_logo", "set_current_brand_contact"):
        assert part in setters, part
