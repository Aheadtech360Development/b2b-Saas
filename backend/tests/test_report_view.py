"""The Reports screen's own rules: the days a report covers, when a change is
worth showing, and when a print job went out on time."""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.services import report_view as rv

NOW = datetime(2026, 10, 13, 22, 30, tzinfo=timezone.utc)


def test_last_30_days_are_the_viewers_days():
    # 22:30 UTC is already the 14th in Karachi (+5h).
    s = rv.span("30d", offset_minutes=300, now=NOW)
    assert (s.first, s.last, s.days) == (date(2026, 9, 15), date(2026, 10, 14), 30)
    # Midnight on the viewer's clock, as a UTC moment.
    assert s.start == datetime(2026, 9, 14, 19, 0, tzinfo=timezone.utc)
    assert s.end == datetime(2026, 10, 14, 19, 0, tzinfo=timezone.utc)


def test_today_and_the_period_before():
    s = rv.span("today", now=NOW)
    assert (s.first, s.last) == (date(2026, 10, 13), date(2026, 10, 13))
    p = rv.before(rv.span("7d", now=NOW))
    assert (p.first, p.last, p.days) == (date(2026, 9, 30), date(2026, 10, 6), 7)


def test_custom_range_turns_round_and_is_held_short():
    s = rv.span("custom", date_from="2026-10-10", date_to="2026-10-01", now=NOW)
    assert (s.first, s.last) == (date(2026, 10, 1), date(2026, 10, 10))
    long = rv.span("custom", date_from="2010-01-01", date_to="2026-10-01", now=NOW)
    assert long.days == rv.MAX_DAYS and long.last == date(2026, 10, 1)
    with pytest.raises(ValueError):
        rv.span("custom", date_from="", date_to="2026-10-01")


def test_change_is_only_given_against_real_history():
    assert rv.change(150, 100, True) == 50.0
    assert rv.change(150, 0, True) is None      # nothing to compare with
    assert rv.change(150, 100, False) is None   # the period before predates the shop
    assert rv.change(0, 100, True) == -100.0


def test_due_day_against_the_cutoff():
    morning = datetime(2026, 10, 13, 11, 59)
    noon = datetime(2026, 10, 13, 12, 0)
    assert rv.due_day(morning, "12:00") == date(2026, 10, 13)
    assert rv.due_day(noon, "12:00") == date(2026, 10, 14)


def test_on_time_reads_both_moments_on_the_viewers_clock():
    off = timedelta(hours=5)
    approved = datetime(2026, 10, 13, 6, 0, tzinfo=timezone.utc)  # 11:00 local, before noon
    same_evening = datetime(2026, 10, 13, 18, 30, tzinfo=timezone.utc)  # 23:30 local, same day
    next_morning = datetime(2026, 10, 13, 19, 30, tzinfo=timezone.utc)  # 00:30 local, the 14th
    assert rv.on_time(approved, same_evening, "12:00", off)
    assert not rv.on_time(approved, next_morning, "12:00", off)
    late_approval = datetime(2026, 10, 13, 8, 0, tzinfo=timezone.utc)  # 13:00 local, after noon
    assert rv.on_time(late_approval, next_morning, "12:00", off)


def test_state_of_a_snapshot():
    assert rv.state_of('{"state": " tx ", "city": "Dallas"}') == "TX"
    assert rv.state_of("not json") == ""
    assert rv.state_of(None) == ""
    assert rv.state_of('["TX"]') == ""
