"""Settings → Notifications (design 34): a shop's own switch and wording for
each customer email (services/notifications).

The setting is faked here (get_setting / set_setting); what the routes and the
send sites do with it is walked against the local API.
"""
import asyncio
import json

import pytest

from app.core import tenant_settings
from app.services import notifications as n


@pytest.fixture
def store(monkeypatch):
    """One shop's "notifications" setting, in memory."""
    saved = {}

    async def get_setting(db, key, *, tenant_id=None, default=None):
        return saved.get(key, default)

    async def set_setting(db, key, value, *, tenant_id=None):
        saved[key] = value

    monkeypatch.setattr(tenant_settings, "get_setting", get_setting)
    monkeypatch.setattr(tenant_settings, "set_setting", set_setting)
    return saved


def run(coro):
    return asyncio.run(coro)


def test_it_is_kept_per_shop():
    assert n.KEY in tenant_settings.TENANT_SCOPED_KEYS


def test_fields_are_filled_and_unknown_brackets_stay():
    values = {"order": "1052", "customer": "Jordan", "total": "$248.00", "tracking": None}
    text = "Hi [Customer], order [order] for [total]. Tracking: [tracking]. [discount]"
    assert n.fill(text, values) == "Hi Jordan, order 1052 for $248.00. Tracking: . [discount]"


def test_the_message_is_escaped_into_paragraphs():
    out = n.paragraphs("Hi <b>there</b>\n\nSecond & last")
    assert out.count("<p ") == 2
    assert "&lt;b&gt;there&lt;/b&gt;" in out and "Second &amp; last" in out
    assert "<b>" not in out


def test_an_untouched_email_goes_out_as_it_always_has(store):
    w = run(n.wording(None, "order_shipped", {"order": "1"}))
    assert w == n.Wording(True, None, None)


def test_switched_off_means_not_sent(store):
    run(n.save(None, "order_shipped", enabled=False, subject=None, message=None))
    w = run(n.wording(None, "order_shipped", {"order": "1"}))
    assert w.send is False
    # Only that email: the others still go.
    assert run(n.wording(None, "order_confirmed", {"order": "1"})).send is True


def test_own_wording_replaces_the_subject_and_the_opening(store):
    run(n.save(None, "order_shipped", enabled=True, subject="On its way: [order]",
               message="Hey [customer]!\nTracking [tracking]"))
    w = run(n.wording(None, "order_shipped", {"order": "1052", "customer": "Sam", "tracking": "1Z9"}))
    assert w.send and w.subject == "On its way: 1052"
    assert "Hey Sam!" in w.intro_html and "Tracking 1Z9" in w.intro_html


def test_wording_equal_to_the_default_is_not_kept(store):
    kind = n.BY_KEY["quote_ready"]
    run(n.save(None, "quote_ready", enabled=True, subject=kind.subject, message=kind.message))
    assert json.loads(store[n.KEY]) == {}
    # Only the part that differs is kept; the default fills the rest.
    run(n.save(None, "quote_ready", enabled=True, subject="Your price, [customer]", message=kind.message))
    assert json.loads(store[n.KEY]) == {"quote_ready": {"enabled": True, "subject": "Your price, [customer]", "message": None}}
    w = run(n.wording(None, "quote_ready", {"customer": "Ana"}))
    assert w.subject == "Your price, Ana" and w.intro_html is None


def test_a_broken_setting_never_stops_an_email(store, monkeypatch):
    store[n.KEY] = "{not json"
    assert run(n.wording(None, "order_confirmed", {})) == n.Wording(True, None, None)

    async def fails(*a, **k):
        raise RuntimeError("database down")

    monkeypatch.setattr(tenant_settings, "get_setting", fails)
    assert run(n.wording(None, "order_confirmed", {})) == n.Wording(True, None, None)


def test_unknown_emails_in_the_setting_are_ignored():
    assert n._clean({"nope": {"enabled": False}, "order_shipped": "x"}) == {}


def test_the_editor_lists_every_email_with_its_default():
    rows = n.editor_rows({"refund_issued": {"enabled": False, "subject": None, "message": "Done, [customer]."}})
    assert [r["key"] for r in rows] == [k.key for k in n.CATALOG]
    refund = next(r for r in rows if r["key"] == "refund_issued")
    assert refund["enabled"] is False and refund["custom"] is True
    assert refund["subject"] == refund["default_subject"] and refund["message"] == "Done, [customer]."
    shipped = next(r for r in rows if r["key"] == "order_shipped")
    assert shipped["enabled"] is True and shipped["custom"] is False


def test_the_preview_uses_a_sample_order_and_the_shop_frame():
    made = n.preview("order_shipped", "Shipped [order]", "Hi [customer]", lambda body: f"<frame>{body}</frame>")
    assert made["subject"] == f"Shipped {n.SAMPLE['order']}"
    assert made["html"].startswith("<frame>") and "Hi Jordan" in made["html"]
    assert n.SAMPLE["tracking"] in made["html"]
