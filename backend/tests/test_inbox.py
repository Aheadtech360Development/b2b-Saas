"""The Inbox (services/inbox.py): who wrote and what they said, read out of a
form's own labels; what is a quote request; and a reply written as mail."""
from datetime import UTC, datetime

from app.services import inbox


def test_the_parts_are_found_under_the_labels_forms_use():
    who = inbox.sender({"Name": "Dana Whitfield", "Email": "Dana@Example.com", "Message": "Same-day pickup?"})
    assert (who["name"], who["email"], who["message"], who["fields"]) == ("Dana Whitfield", "dana@example.com", "Same-day pickup?", [])
    who = inbox.sender({"first_name": "Rob", "Last Name": "Castellanos", "Your email": "rob@example.com",
                        "Company name": "Rob's Tees", "Phone number": "555-0101", "Project details": "500 DTF transfers",
                        "Quantity": "500", "Empty": "  "})
    assert (who["name"], who["email"], who["company"], who["phone"], who["message"]) == (
        "Rob Castellanos", "rob@example.com", "Rob's Tees", "555-0101", "500 DTF transfers")
    # The quote form's own fields are said the way a person reads them.
    assert who["fields"] == [{"label": "How many", "value": "500"}]


def test_the_storefront_quote_form_sends_its_fields_by_name():
    who = inbox.sender({"name": "Quinn", "email": "q@example.com", "phone": "555", "company": "Parker Print",
                        "product": "DTF transfers", "quantity": "300", "deadline": "Friday", "message": "Thanks"})
    assert (who["name"], who["company"], who["message"]) == ("Quinn", "Parker Print", "Thanks")
    assert who["fields"] == [{"label": "What to print", "value": "DTF transfers"},
                             {"label": "How many", "value": "300"}, {"label": "Needed by", "value": "Friday"}]


def test_an_address_under_an_odd_label_is_still_the_address():
    who = inbox.sender({"Contact": "Sam", "Reach me at": "sam@shop.co", "Notes": "hi"})
    assert who["email"] == "sam@shop.co" and who["message"] == "hi"
    assert {"label": "Contact", "value": "Sam"} in who["fields"]


def test_a_quote_request_is_from_the_quote_form():
    assert inbox.is_quote("Quote request", "quote") and inbox.is_quote(None, "get-a-quote")
    assert not inbox.is_quote("Contact form", "contact") and not inbox.is_quote(None, None)


def test_a_row_says_what_the_inbox_shows():
    r = inbox.row({"id": "6a1f", "page_slug": "quote", "form_name": None, "is_read": False,
                   "data": '{"Name": "Rob", "Email": "rob@example.com"}', "answered_at": None,
                   "archived_at": None, "created_at": datetime(2026, 10, 8, tzinfo=UTC)})
    assert (r["kind"], r["form_name"], r["from"]["name"], r["is_read"], r["answered_at"]) == ("quote", "Quote request", "Rob", False, None)


def test_a_reply_is_the_words_typed_and_nothing_else():
    html = inbox.reply_html("Hi Rob,\n\nYes: 500 at $1.10.\nSend artwork <today>.")
    assert html.count("<p ") == 2 and "&lt;today&gt;" in html and "<br>" in html


def test_each_box_reads_only_this_shop():
    import inspect

    for box in inbox.BOXES:
        assert "archived_at" in inbox._box_sql(box)
    # Raw SQL is not scoped by the ORM: every query names the shop itself.
    for fn in (inbox.listing, inbox.counts, inbox.one, inbox._customers):
        assert "tenant_id = CAST(:t AS uuid)" in inspect.getsource(fn), fn.__name__
