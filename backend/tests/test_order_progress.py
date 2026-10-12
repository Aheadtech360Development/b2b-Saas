"""Where an order stands: the pills, the next step and the steps.

One definition feeds the order list, the panel beside it and the order's own
page, so what is tested here is that definition. No database.
"""
from app.services.order_progress import Facts, artwork, fulfilment, next_step, payment, steps, summary


def _keys(parts):
    return [(p["key"], p["state"]) for p in parts]


def test_a_new_order_is_to_confirm_and_that_is_the_next_thing_to_do():
    f = Facts(status="pending", payment_status="unpaid")
    assert fulfilment(f) == {"key": "to_confirm", "label": "To confirm", "tone": "amber"}
    assert payment(f)["label"] == "Unpaid"
    assert artwork(f)["label"] == "No file"
    assert next_step(f)["key"] == "confirm"


def test_a_paid_accepted_order_with_nothing_to_print_is_to_ship():
    f = Facts(status="confirmed", payment_status="paid", shipping_method="standard")
    assert fulfilment(f)["label"] == "To ship"
    assert fulfilment(f)["tone"] == "red"
    assert next_step(f)["key"] == "ship"
    assert next_step(f)["label"] == "Buy a shipping label"


def test_artwork_still_to_approve_holds_an_accepted_order_back():
    f = Facts(status="processing", payment_status="paid", jobs=("in_review",))
    assert artwork(f) == {"key": "in_review", "label": "In review", "tone": "amber"}
    assert fulfilment(f)["label"] == "Waiting on artwork"
    assert next_step(f)["key"] == "artwork"
    # Sent back to the customer: the shop has nothing to do but wait.
    back = Facts(status="confirmed", payment_status="paid", jobs=("approved", "revision_requested"))
    assert artwork(back)["key"] == "revision"
    assert next_step(back)["key"] == "customer"


def test_the_artwork_pill_follows_the_print_jobs():
    assert artwork(Facts(status="confirmed", jobs=("approved",)))["label"] == "Approved"
    assert artwork(Facts(status="confirmed", jobs=("approved", "production")))["label"] == "Printing"
    assert artwork(Facts(status="confirmed", jobs=("completed", "completed")))["label"] == "Printed"
    assert artwork(Facts(status="confirmed", jobs=("rejected",)))["label"] == "Rejected"
    # A rejected job beside a live one does not decide it.
    assert artwork(Facts(status="confirmed", jobs=("rejected", "approved")))["label"] == "Approved"
    # No print job, but a line carries the buyer's own file.
    assert artwork(Facts(status="confirmed", files=1))["label"] == "File attached"


def test_approved_artwork_is_in_production_until_it_is_packed():
    making = Facts(status="processing", payment_status="paid", jobs=("production",))
    assert fulfilment(making)["label"] == "In production"
    packed = Facts(status="processing", payment_status="paid", jobs=("completed",), packed=True)
    assert fulfilment(packed)["label"] == "Packed"
    # Packing is not required first: the next step is still the label.
    assert next_step(making)["key"] == "ship" and next_step(packed)["key"] == "ship"


def test_a_pickup_order_is_never_to_ship():
    f = Facts(status="confirmed", payment_status="paid", shipping_method="will_call")
    assert fulfilment(f)["label"] == "Preparing for pickup"
    assert next_step(f)["key"] == "ready"
    ready = Facts(status="ready_for_pickup", payment_status="paid", shipping_method="will_call")
    assert fulfilment(ready) == {"key": "ready_for_pickup", "label": "Ready for pickup", "tone": "blue"}
    assert next_step(ready)["key"] == "collected"
    done = Facts(status="delivered", payment_status="paid", shipping_method="will_call")
    assert fulfilment(done)["label"] == "Collected"


def test_after_it_ships():
    assert next_step(Facts(status="shipped", payment_status="paid"))["key"] == "deliver"
    assert next_step(Facts(status="delivered", payment_status="paid"))["key"] == "none"
    # Delivered on terms and not paid: the money is what is left.
    assert next_step(Facts(status="delivered", payment_status="unpaid"))["key"] == "collect"
    assert next_step(Facts(status="cancelled"))["key"] == "none"
    assert fulfilment(Facts(status="cancelled"))["label"] == "Cancelled"


def test_payment_in_words():
    assert payment(Facts(status="pending", payment_status="paid")) == {"key": "paid", "label": "Paid", "tone": "green"}
    assert payment(Facts(status="pending", payment_status="pending"))["label"] == "Unpaid"
    assert payment(Facts(status="pending", payment_status="unpaid", part_paid=True))["label"] == "Part paid"
    assert payment(Facts(status="refunded", payment_status="refunded"))["label"] == "Refunded"


def test_the_steps_of_an_order_that_ships():
    f = Facts(status="confirmed", payment_status="paid", shipping_method="standard", jobs=("in_review",))
    assert _keys(steps(f)) == [
        ("placed", "done"), ("paid", "done"), ("confirmed", "done"),
        ("artwork", "current"), ("packed", "todo"), ("shipped", "todo"), ("delivered", "todo"),
    ]
    shipped = Facts(status="shipped", payment_status="paid", jobs=("completed",))
    # Shipped means it was packed, whether or not anybody pressed the button.
    assert _keys(steps(shipped))[-3:] == [("packed", "done"), ("shipped", "done"), ("delivered", "current")]


def test_no_artwork_step_on_an_order_with_nothing_to_print():
    f = Facts(status="pending", payment_status="unpaid")
    assert [k for k, _ in _keys(steps(f))] == ["placed", "paid", "confirmed", "packed", "shipped", "delivered"]
    # Not paid: that is the first thing still open.
    assert _keys(steps(f))[:3] == [("placed", "done"), ("paid", "current"), ("confirmed", "todo")]


def test_the_steps_of_a_pickup_order_and_of_a_cancelled_one():
    f = Facts(status="ready_for_pickup", payment_status="paid", shipping_method="will_call")
    assert _keys(steps(f)) == [
        ("placed", "done"), ("paid", "done"), ("confirmed", "done"), ("ready", "done"), ("delivered", "current"),
    ]
    gone = Facts(status="cancelled", payment_status="unpaid")
    assert _keys(steps(gone)) == [("placed", "done"), ("paid", "todo"), ("cancelled", "stopped")]


def test_a_row_of_the_list_carries_all_of_it():
    row = summary(Facts(status="confirmed", payment_status="paid", shipping_method="will_call", packed=False))
    assert set(row) == {"payment", "artwork", "fulfilment", "next", "packed", "pickup"}
    assert row["pickup"] is True
