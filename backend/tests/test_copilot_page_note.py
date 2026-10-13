"""The owner's copilot is told which admin screen is open: once, beside the
newest question, as a fact. No database or network."""
from app.api.v1 import copilot as copilot_api


def test_the_open_screen_is_said_as_a_fact():
    note = copilot_api.page_note("Orders: Ship queue")
    assert "Orders: Ship queue" in note
    assert "only to understand" in note


def test_nothing_is_said_without_a_screen():
    assert copilot_api.page_note(None) == ""
    assert copilot_api.page_note("   ") == ""


def test_a_screen_name_is_one_short_line():
    note = copilot_api.page_note("Orders:\n\n  Ship   queue " + "x" * 400)
    assert "\n" not in note
    assert "Orders: Ship queue" in note
    # The name is held to 120 characters, whatever the page sends.
    assert len(note) < 220


def test_the_owner_chat_takes_a_page():
    body = copilot_api.OwnerChatIn(messages=[{"role": "user", "content": "Which of these are late?"}], page="Orders: Ship queue")
    assert body.page == "Orders: Ship queue"
    assert copilot_api.OwnerChatIn(messages=[{"role": "user", "content": "hi"}]).page is None
