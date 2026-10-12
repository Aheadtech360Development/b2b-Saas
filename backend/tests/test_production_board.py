"""Where a print job stands: the Production board's columns, a job's steps and
its next step, said once in services/production_board."""
from types import SimpleNamespace

import pytest

from app.services import production_board as pb
from app.services.production_board import Job, board, clean_cutoff, column, kind_of, next_action, stage, steps


def test_a_sheet_nobody_checked_out_is_a_draft_and_stays_off_the_board():
    assert stage(Job("submitted")) == "draft"
    assert column("draft") is None


def test_an_ordered_sheet_is_in_the_queue_paid_or_not():
    # Cash on delivery is paid when it is handed over: the sheet is printed first.
    cod = Job("in_review", "o1", "confirmed", "unpaid")
    assert stage(cod) == "review" and column("review") == "review"
    assert pb.paid(cod) is False
    assert pb.paid(Job("in_review", "o1", "confirmed", "paid")) is True


def test_each_status_has_its_column():
    at = lambda status, order="confirmed": column(stage(Job(status, "o1", order, "paid")))
    assert at("submitted") == "review" and at("in_review") == "review"
    assert at("revision_requested") == "review"          # waits there for the new artwork
    assert at("approved") == "approved"
    assert at("production") == "production"
    assert at("completed") == "ready"
    assert at("completed", "shipped") is None and stage(Job("completed", "o1", "shipped")) == "shipped"
    assert at("rejected") is None
    assert stage(Job("in_review", "o1", "cancelled")) == "cancelled" and at("in_review", "cancelled") is None


def test_the_next_step_moves_the_job_on_one_column():
    assert next_action("review")["label"] == "Review artwork" and next_action("review")["to"] is None
    assert next_action("approved") == {"key": "start", "label": "Start printing", "to": "production"}
    assert next_action("production") == {"key": "finish", "label": "Mark ready to ship", "to": "completed"}
    assert next_action("ready")["key"] == "order"
    assert next_action("shipped") is None and next_action("draft") is None


def _states(job):
    return [(s["key"], s["state"]) for s in steps(job)]


def test_steps_stop_at_where_the_job_is():
    assert _states(Job("in_review", "o1", "confirmed", "paid")) == [
        ("paid", "done"), ("review", "current"), ("approved", "todo"), ("production", "todo"),
        ("ready", "todo"), ("shipped", "todo")]
    assert _states(Job("production", "o1", "processing", "paid"))[1:4] == [
        ("review", "done"), ("approved", "done"), ("production", "current")]
    assert all(state == "done" for _, state in _states(Job("completed", "o1", "shipped", "paid")))


def test_paid_stands_on_its_own_evidence():
    # A cash on delivery job on the press: printed before it is paid.
    first = steps(Job("production", "o1", "processing", "unpaid"))[0]
    assert first == {"key": "paid", "label": "Paid", "state": "todo"}


def test_a_rejected_job_and_a_cancelled_order_stop():
    assert _states(Job("rejected", "o1", "confirmed", "paid"))[-1] == ("rejected", "stopped")
    assert _states(Job("in_review", "o1", "cancelled", "paid"))[-1] == ("cancelled", "stopped")


def test_the_kind_of_job():
    assert kind_of("s1", "gang_sheet") == "gang_sheet"
    assert kind_of(None, None) == "upload_by_size"
    # A buyer's own finished sheet is bought on a sheet size; its product tells it apart.
    assert kind_of("s1", "upload_own") == "upload_own"


@pytest.mark.parametrize("given,saved", [("12:00", "12:00"), ("9:05", "09:05"), (" 15:30 ", "15:30"), ("", ""), (None, "")])
def test_a_cutoff_is_kept_as_hh_mm(given, saved):
    assert clean_cutoff(given) == saved


@pytest.mark.parametrize("bad", ["24:00", "12", "noon", "12:60", "1200"])
def test_a_cutoff_that_is_not_a_time_is_refused(bad):
    with pytest.raises(ValueError):
        clean_cutoff(bad)


def _job(status, **over):
    base = dict(id="j1", reference="GS-1", status=status, sheet_name="22 × 24", sheet_width_in=22, sheet_height_in=24,
                sheet_quantity=1, subtotal=15, contact_name=None, contact_email=None, revision_count=0,
                sheet_size_id="s1", updated_at=None)
    return SimpleNamespace(**{**base, **over})


def _order(status="confirmed", paid="paid", method=None):
    return {"id": "o1", "order_number": "1040", "status": status, "payment_status": paid,
            "payment_method": method, "shipping_method": "standard", "created_at": None}


def test_the_board_counts_what_it_shows():
    rows = [
        pb.row(_job("in_review"), _order(), "gang_sheet", "Moreau Events"),
        pb.row(_job("revision_requested", id="j2"), _order(), "gang_sheet"),
        pb.row(_job("approved", id="j3", subtotal=30), _order(paid="unpaid", method="cod"), "gang_sheet"),
        pb.row(_job("completed", id="j4"), _order(), "gang_sheet"),
        pb.row(_job("completed", id="j5"), _order(status="shipped"), "gang_sheet"),
    ]
    out = board(rows, drafts=15, drafts_value=210.5, cutoff="12:00")
    assert [j["id"] for j in out["jobs"]] == ["j1", "j2", "j3", "j4"]
    c = out["counts"]
    assert (c["queue"], c["review"], c["customer"], c["approved"], c["production"], c["ready"]) == (4, 2, 1, 1, 0, 1)
    assert c["value"] == 75 and c["unpaid"] == 1
    assert (c["drafts"], c["drafts_value"]) == (15, 210.5)
    assert out["cutoff"] == "12:00"
    first = out["jobs"][0]
    assert first["customer"] == "Moreau Events" and first["order_number"] == "1040" and first["paid"] is True
    assert out["jobs"][2]["payment_method"] == "cod" and out["jobs"][2]["paid"] is False
