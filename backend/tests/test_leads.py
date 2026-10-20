"""printcopilot.co's own forms in our own database (api/v1/leads, migration
0064): a demo request is kept and the platform is told; a bot's is answered
and dropped; a contact message sent from the platform's address is kept too,
a shop's is not; and only a platform admin reads the list.

The database is faked; the SQL is checked for what it writes.
"""
import asyncio
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.api.v1 import leads


def run(coro):
    return asyncio.run(coro)


class Db:
    def __init__(self):
        self.sql: list[tuple[str, dict]] = []
        self.committed = False

    async def execute(self, statement, params=None):
        self.sql.append((str(statement), params or {}))
        return SimpleNamespace()

    async def commit(self):
        self.committed = True


class Tasks:
    def __init__(self):
        self.added = []

    def add_task(self, fn, *args):
        self.added.append((fn, args))


@pytest.fixture
def no_limit(monkeypatch):
    async def none(*a, **k):
        return None

    monkeypatch.setattr(leads, "enforce_rate_limit", none)


def request(slug=None):
    return SimpleNamespace(client=SimpleNamespace(host="1.2.3.4"), headers={}, state=SimpleNamespace(tenant_slug=slug))


def test_a_demo_request_is_kept_and_the_platform_is_told(no_limit):
    db, tasks = Db(), Tasks()
    body = leads.LeadIn(kind="demo", name="Ana Torres", email="Ana@TorresTees.com",
                        data={"business_name": "Torres Tees", "business_type": "Screen printer", "message": "100 shirts a week"})
    assert run(leads.create_lead(body, request(), tasks, db)) == {"ok": True}
    sql, params = db.sql[0]
    assert "INSERT INTO platform_leads" in sql
    assert params["kind"] == "demo" and params["email"] == "ana@torrestees.com"
    assert json.loads(params["data"])["business_name"] == "Torres Tees"
    assert params["ip"] and params["ip"] != "1.2.3.4"  # kept only as a salted hash
    assert tasks.added and tasks.added[0][0] is leads._tell_platform


def test_a_bot_is_answered_as_if_it_went_through_and_nothing_is_kept(no_limit):
    db, tasks = Db(), Tasks()
    body = leads.LeadIn(kind="demo", name="x", email="bot@spammer.com", company="Spam LLC")
    response = run(leads.create_lead(body, request(), tasks, db))
    assert response.status_code == 202
    assert db.sql == [] and tasks.added == []


def test_what_a_form_may_send_is_small():
    with pytest.raises(ValidationError):
        leads.LeadIn(kind="newsletter", name="a", email="a@b.co")
    with pytest.raises(ValidationError):
        leads.LeadIn(kind="demo", name="a", email="not an email")
    with pytest.raises(ValidationError):
        leads.LeadIn(kind="demo", name="a", email="a@b.co", data={f"k{i}": "v" for i in range(13)})
    with pytest.raises(ValidationError):
        leads.LeadIn(kind="demo", name="a", email="a@b.co", data={"message": "x" * 2001})


def test_the_platforms_email_is_escaped():
    html = leads.notice_html("demo", "<b>Ana</b>", "ana@t.co", {"message": "<script>x</script>\nline two"})
    assert "<script>" not in html and "&lt;script&gt;" in html and "<b>Ana</b>" not in html
    assert "line two" in html and "<br>" in html


def test_a_contact_message_from_printcopilot_co_is_kept_but_a_shops_is_not(monkeypatch):
    from app.api.v1 import contact
    from app.services.partners import db as partner_db

    saved = []

    async def save_lead(db, request, kind, name, email, data):
        saved.append((kind, email, data))

    class Session:
        async def __aenter__(self):
            return Db()

        async def __aexit__(self, *a):
            return False

    from app.core import rate_limit

    async def no_limit(*a, **k):
        return None

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", no_limit)
    monkeypatch.setattr(leads, "save_lead", save_lead)
    monkeypatch.setattr(partner_db, "session", lambda: Session())
    msg = contact.ContactRequest(name="Ana", email="ana@t.co", department="partnerships", message="Hello")

    run(contact.submit_contact(msg, request(slug=None), Tasks()))
    assert saved and saved[0][0] == "contact" and saved[0][2]["department"] == "Partnerships"

    saved.clear()
    run(contact.submit_contact(msg, request(slug="innterflow"), Tasks()))
    assert saved == []


def test_only_the_platform_reads_the_list():
    from app.middleware.auth_middleware import AuthMiddleware

    # Every /api/v1/platform/ path is refused to anybody but a platform admin
    # by the auth middleware; the list lives there, and the form does not.
    from app.api.v1.platform import leads as platform_leads

    assert platform_leads.router.prefix == "/platform/leads"
    assert AuthMiddleware._is_public(None, "/api/v1/leads")
    # The contact form is a visitor's too; it answered them "authentication required".
    assert AuthMiddleware._is_public(None, "/api/v1/contact")
    assert not AuthMiddleware._is_public(None, "/api/v1/platform/leads")


def test_the_open_contact_form_mails_text_not_markup_and_echoes_nothing(monkeypatch):
    from app.api.v1 import contact
    from app.core.config import settings
    from app.services import email_service

    sent = []
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key", raising=False)
    monkeypatch.setattr(email_service, "notify_address", lambda: "team@printcopilot.example")
    monkeypatch.setattr(email_service.EmailService, "_send_via_resend",
                        lambda self, to_email, subject, body_html, reply_to=None: sent.append((to_email, body_html)))
    msg = contact.ContactRequest(name="<a href='https://evil.example'>Verify</a>", email="victim@anywhere.com",
                                 message="<h2>Your shop is suspended</h2>")
    contact._send_contact_email(msg)
    team = next(body for to, body in sent if to == "team@printcopilot.example")
    visitor = next(body for to, body in sent if to == "victim@anywhere.com")
    assert "<h2>Your shop is suspended</h2>" not in team and "&lt;h2&gt;Your shop is suspended" in team
    assert "<a href='https://evil.example'>" not in team + visitor
    assert "suspended" not in visitor  # the message is not repeated to the address given


def test_the_open_contact_form_drops_a_bot_and_bounds_every_field(monkeypatch):
    from app.api.v1 import contact
    from app.core import rate_limit

    async def no_limit(*a, **k):
        return None

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", no_limit)
    tasks = Tasks()
    bot = contact.ContactRequest(name="x", email="bot@spammer.com", message="hi", company_hp="Spam LLC")
    assert "Message received" in run(contact.submit_contact(bot, request(slug="innterflow"), tasks))["message"]
    assert tasks.added == []
    with pytest.raises(ValidationError):
        contact.ContactRequest(name="a", email="a@b.co", message="x" * 5001)
    with pytest.raises(ValidationError):
        contact.ContactRequest(name="", email="a@b.co", message="hi")
