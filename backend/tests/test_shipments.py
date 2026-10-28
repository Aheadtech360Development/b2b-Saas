"""Parcels for the order tracking page (services/shipments, Retail package 2):
the courier's words in ours, how often the courier is asked, and the buyer's
steps. Writing rows is checked against the local database separately."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services import shipments as sh

NOW = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)


@pytest.mark.parametrize("status,sub,expected", [
    ("PRE_TRANSIT", None, "label_created"),
    ("TRANSIT", "package_accepted", "in_transit"),
    ("TRANSIT", "out_for_delivery", "out_for_delivery"),
    ("DELIVERED", None, "delivered"),
    ("RETURNED", "return_to_sender", "returned"),
    ("FAILURE", "package_lost", "failure"),
    ("UNKNOWN", None, "unknown"),
    ("", None, "unknown"),
    ("transit", None, "in_transit"),
])
def test_the_couriers_words_in_ours(status, sub, expected):
    assert sh.from_courier(status, sub) == expected


def test_a_field_with_several_numbers_is_several_parcels():
    assert sh.numbers_in("1Z999, 9400 1000 ,1Z999,,") == ["1Z999", "9400 1000"]
    assert sh.numbers_in(None) == [] and sh.numbers_in("  ") == []


def test_the_courier_is_asked_often_at_first_then_less_then_not_at_all():
    assert sh.next_check("in_transit", NOW, NOW) == NOW + timedelta(hours=2)
    assert sh.next_check("in_transit", NOW - timedelta(days=4), NOW) == NOW + timedelta(hours=6)
    assert sh.next_check("in_transit", NOW - timedelta(days=31), NOW) is None
    assert sh.next_check("delivered", NOW, NOW) is None
    assert sh.next_check("returned", NOW, NOW) is None


def test_the_buyers_steps():
    done = lambda status: [s["key"] for s in sh.timeline(status) if s["done"]]  # noqa: E731
    assert [s["label"] for s in sh.timeline("label_created")] == [
        "Paid", "Packed", "Shipped", "Out for delivery", "Delivered"]
    assert done("label_created") == ["paid", "packed"]
    assert done("in_transit") == ["paid", "packed", "shipped"]
    assert done("out_for_delivery") == ["paid", "packed", "shipped", "out_for_delivery"]
    assert done("delivered") == ["paid", "packed", "shipped", "out_for_delivery", "delivered"]
    # An unpaid order (cash on delivery) has not passed "Paid".
    assert "paid" not in [s["key"] for s in sh.timeline("in_transit", paid=False) if s["done"]]


def test_an_unknown_status_or_source_is_refused():
    class P:
        status, status_detail, shipped_at, tenant_id, id, order_id = "in_transit", None, NOW, None, None, None

    import asyncio
    with pytest.raises(ValueError):
        asyncio.run(sh.set_status(None, P(), "lost_in_space", source="courier"))
    with pytest.raises(ValueError):
        asyncio.run(sh.set_status(None, P(), "delivered", source="psychic"))
