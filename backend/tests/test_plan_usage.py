"""A plan's limits (services/plan_usage): orders this month and staff against
the plan, the owner's notices at 80% and 100%, and the staff cap. Retail's
limits bind; the print plans' do not (owner, 2026-10-28). A buyer is never
stopped: nothing here is on the checkout path."""
import asyncio
from datetime import datetime, timezone

import pytest

from app.services import mails, plan_usage as pu


class FakeDB:
    """Answers the three questions plan_usage asks, by the SQL it sends."""

    def __init__(self, plan, orders=0, staff=1):
        self.plan, self.orders, self.staff = plan, orders, staff
        self.seen = []

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        self.seen.append((sql, params))
        value = self.plan if "SELECT plan" in sql else self.orders if "FROM orders" in sql else self.staff

        class R:
            def scalar_one_or_none(self_inner):
                return value

            def scalar(self_inner):
                return value
        return R()


def run(coro):
    return asyncio.run(coro)


def test_months_are_utc_calendar_months_and_december_rolls_over():
    start, end = pu.month_window(datetime(2026, 10, 28, 23, 59, tzinfo=timezone.utc))
    assert (start, end) == (datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2026, 11, 1, tzinfo=timezone.utc))
    start, end = pu.month_window(datetime(2026, 12, 31, 12, tzinfo=timezone.utc))
    assert end == datetime(2027, 1, 1, tzinfo=timezone.utc)


@pytest.mark.parametrize("count,expected", [(0, None), (159, None), (160, 80), (199, 80), (200, 100), (500, 100)])
def test_the_notice_levels_for_200_orders(count, expected):
    assert pu.level(count, 200) == expected


def test_no_limit_means_no_notice():
    assert pu.level(10_000, None) is None


def test_retail_usage_counts_every_order_and_raises_the_notice():
    db = FakeDB("retail", orders=160, staff=2)
    u = run(pu.usage(db, "t1", now=datetime(2026, 10, 5, tzinfo=timezone.utc)))
    assert (u["plan"], u["enforced"], u["orders"], u["orders_limit"], u["notice"]) == ("retail", True, 160, 200, 80)
    assert (u["staff"], u["staff_limit"], u["month"]) == (2, 2, "2026-10")
    # Every order created in the month, whatever its status: no status filter.
    orders_sql = next(sql for sql, _ in db.seen if "FROM orders" in sql)
    assert "status" not in orders_sql and "created_at >= :s" in orders_sql


def test_a_print_plan_past_its_figure_gets_no_notice():
    u = run(pu.usage(FakeDB("starter", orders=900), "t1"))
    assert (u["enforced"], u["orders_limit"], u["notice"]) == (False, 300, None)


def test_each_notice_goes_once_a_month_and_100_after_80_never_80_after_100():
    u80 = {"notice": 80, "month": "2026-10"}
    u100 = {"notice": 100, "month": "2026-10"}
    assert pu.due_level(u80, {}) == 80
    assert pu.due_level(u80, {"month": "2026-10", "sent": [80]}) is None
    assert pu.due_level(u100, {"month": "2026-10", "sent": [80]}) == 100
    assert pu.due_level(u80, {"month": "2026-10", "sent": [100]}) is None
    # A new month starts clean.
    assert pu.due_level({"notice": 80, "month": "2026-11"}, {"month": "2026-10", "sent": [80, 100]}) == 80
    assert pu.due_level({"notice": None, "month": "2026-10"}, {}) is None


def test_retail_has_room_for_two_users_the_owner_included():
    run(pu.check_staff_room(FakeDB("retail", staff=1), "t1"))
    with pytest.raises(pu.StaffLimitReached) as caught:
        run(pu.check_staff_room(FakeDB("retail", staff=2), "t1"))
    assert caught.value.limit == 2 and "the owner included" in str(caught.value)


def test_print_plans_are_not_held_to_their_staff_figure():
    run(pu.check_staff_room(FakeDB("starter", staff=50), "t1"))
    run(pu.check_staff_room(FakeDB("scale", staff=500), "t1"))


def test_the_owners_notice_says_buyers_are_not_stopped():
    subject, html = mails.order_limit_notice(level=100, orders=203, limit=200, plan="Retail", plans_url="https://x/admin/billing")
    assert "200 orders" in subject and "nothing is stopped" in html
    subject, html = mails.order_limit_notice(level=80, orders=160, limit=200, plan="Retail", plans_url="https://x/admin/billing")
    assert subject == "Your shop has used 80% of this month's orders" and "Buyers can always check out" in html
