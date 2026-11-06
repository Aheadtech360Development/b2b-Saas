"""Home's sales over time (services/sales_over_time).

What each test holds, in the owner's terms:
* One day is drawn by the hour, a month by the day, a year by the week,
  longer by the month; every step is there, empty ones included.
* Each order and visit lands in the step it happened in, on the local clock.
* The numbers over time add up to the totals, and the change is against the
  same number of days just before; nothing to compare with says nothing.
No database or network.
"""
from datetime import date, datetime, timedelta

from app.services import sales_over_time as sot
from app.services.report_view import _span, before, change

OFFSET = timedelta(minutes=300)  # Pakistan's clock, as the owner sees Home


def span(first: date, last: date):
    return _span(first, last, OFFSET)


def test_the_steps_follow_the_length_of_the_stretch():
    assert [sot.unit_for(d) for d in (1, 7, 30, 92, 93, 365, 731, 732)] == \
        ["hour", "day", "day", "day", "week", "week", "week", "month"]


def test_every_step_is_there_from_the_first_day_chosen():
    day = sot.starts(span(date(2026, 11, 6), date(2026, 11, 6)), "hour")
    assert len(day) == 24 and day[0] == datetime(2026, 11, 6, 0, 0) and day[-1] == datetime(2026, 11, 6, 23, 0)
    weeks = sot.starts(span(date(2026, 1, 1), date(2026, 3, 31)), "week")
    assert weeks[0] == datetime(2026, 1, 1) and weeks[1] == datetime(2026, 1, 8) and len(weeks) == 13
    months = sot.starts(span(date(2024, 1, 15), date(2026, 3, 2)), "month")
    assert months[0] == datetime(2024, 1, 15) and months[1] == datetime(2024, 2, 1) and months[-1] == datetime(2026, 3, 1)


def test_orders_and_visits_land_in_their_step_and_empty_steps_stay():
    s = span(date(2026, 9, 1), date(2026, 9, 14))
    money = [{"at": datetime(2026, 9, 1), "revenue": 120.5, "orders": 2},
             {"at": datetime(2026, 9, 9), "revenue": 79, "orders": 1},
             {"at": datetime(2026, 8, 31), "revenue": 999, "orders": 9}]   # outside: left out
    seen = [{"at": datetime(2026, 9, 1), "sessions": 40, "converted": 2},
            {"at": datetime(2026, 9, 10), "sessions": 10, "converted": 0}]
    days = sot.fill(s, "day", money, seen)
    assert len(days) == 14 and days[0]["start"] == "2026-09-01"
    assert (days[0]["total"], days[0]["orders"], days[0]["sessions"], days[0]["conversion_rate"]) == (120.5, 2, 40, 5.0)
    assert days[1] == {"start": "2026-09-02", "total": 0.0, "orders": 0, "sessions": 0, "converted": 0,
                       "conversion_rate": None, "average": 0.0}
    weeks = sot.fill(s, "week", money, seen)
    assert [w["start"] for w in weeks] == ["2026-09-01", "2026-09-08"]
    assert (weeks[1]["total"], weeks[1]["orders"], weeks[1]["sessions"], weeks[1]["average"]) == (79.0, 1, 10, 79.0)


def test_one_day_by_the_hour():
    s = span(date(2026, 11, 6), date(2026, 11, 6))
    hours = sot.fill(s, "hour", [{"at": datetime(2026, 11, 6, 14), "revenue": 50, "orders": 1}], [])
    assert hours[14]["start"] == "2026-11-06T14:00" and hours[14]["total"] == 50.0 and hours[13]["orders"] == 0


def test_without_visits_the_money_still_draws():
    days = sot.fill(span(date(2026, 9, 1), date(2026, 9, 2)), "day", [{"at": datetime(2026, 9, 2), "revenue": 10, "orders": 1}], None)
    assert days[1]["total"] == 10.0 and days[1]["sessions"] is None and days[1]["conversion_rate"] is None
    assert sot.totals(days)["sessions"] is None


def test_the_steps_add_up_to_the_totals():
    days = sot.fill(span(date(2026, 9, 1), date(2026, 9, 3)), "day",
                    [{"at": datetime(2026, 9, 1), "revenue": 100, "orders": 1}, {"at": datetime(2026, 9, 3), "revenue": 50.25, "orders": 2}],
                    [{"at": datetime(2026, 9, 1), "sessions": 30, "converted": 1}, {"at": datetime(2026, 9, 3), "sessions": 20, "converted": 2}])
    assert sot.totals(days) == {"total": 150.25, "orders": 3, "average": 50.08, "sessions": 50,
                                "converted_sessions": 3, "conversion_rate": 6.0}


def test_the_change_is_against_the_days_just_before():
    s = span(date(2026, 9, 7), date(2026, 11, 6))
    p = before(s)
    assert (p.first, p.last) == (date(2026, 7, 8), date(2026, 9, 6)) and p.days == s.days
    assert change(55689.79, 56420.0, True) == -1.3
    assert change(10, 0, True) is None          # nothing before: no change shown
