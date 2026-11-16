"""printcopilot.co/demo's calendar (services/demo_slots, api/v1/leads): the
team's hours (Mon to Fri, 9 to 5 US Eastern) in half hours, two weeks of
working days, no federal holidays, a couple of hours' notice; a booked slot
is gone; a booking is kept with the lead and the visitor gets a confirmation.

The database is faked.
"""
import asyncio
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.api.v1 import leads
from app.services import demo_slots

UTC = timezone.utc


def run(coro):
    return asyncio.run(coro)


def test_federal_holidays_as_observed():
    days = demo_slots.us_holidays(2026)
    assert date(2026, 11, 26) in days   # Thanksgiving, the fourth Thursday
    assert date(2026, 1, 19) in days    # Martin Luther King Jr. Day, third Monday
    assert date(2026, 5, 25) in days    # Memorial Day, last Monday
    assert date(2026, 7, 3) in days     # July 4th falls on a Saturday: kept on the Friday
    assert date(2026, 12, 25) in days
    assert date(2026, 11, 27) not in days


def test_the_grid_is_two_weeks_of_working_half_hours_in_eastern_time():
    # Monday Nov 16, 2026, 8:00 AM Eastern (EST, UTC-5).
    now = datetime(2026, 11, 16, 13, 0, tzinfo=UTC)
    slots = demo_slots.grid(now)
    # Two hours' notice: the first is 10:00 AM Eastern.
    assert slots[0] == datetime(2026, 11, 16, 15, 0, tzinfo=UTC)
    local = [s.astimezone(demo_slots.ZONE) for s in slots]
    assert all(s.weekday() < 5 for s in local)
    assert all(9 <= s.hour < 17 and s.minute in (0, 30) for s in local)
    assert not any(s.date() == date(2026, 11, 26) for s in local)  # Thanksgiving
    days = sorted({s.date() for s in local})
    assert len(days) == demo_slots.WORKING_DAYS_AHEAD
    assert days[-1] == date(2026, 11, 30)
    # Today from 10:00 to the last start at 4:30 PM, then 16 a day.
    assert len(slots) == 14 + 9 * 16


def test_a_day_with_no_slots_left_is_not_counted():
    # Monday 4:00 PM Eastern: nothing left today with two hours' notice.
    slots = demo_slots.grid(datetime(2026, 11, 16, 21, 0, tzinfo=UTC))
    first = slots[0].astimezone(demo_slots.ZONE)
    assert first.date() == date(2026, 11, 17) and first.hour == 9
    assert len({s.astimezone(demo_slots.ZONE).date() for s in slots}) == demo_slots.WORKING_DAYS_AHEAD


def test_labels_and_parsing_follow_daylight_saving():
    assert demo_slots.label(datetime(2026, 7, 7, 13, 30, tzinfo=UTC)) == "Tue, Jul 7, 9:30 AM ET"
    assert demo_slots.label(datetime(2026, 11, 18, 15, 30, tzinfo=UTC)) == "Wed, Nov 18, 10:30 AM ET"
    assert demo_slots.parse("2026-11-18T15:30:00Z") == datetime(2026, 11, 18, 15, 30, tzinfo=UTC)
    assert demo_slots.parse("2026-11-18T10:30:00-05:00") == datetime(2026, 11, 18, 15, 30, tzinfo=UTC)
    assert demo_slots.parse("2026-11-18T15:30:00") is None  # no zone: not a time we can trust
    assert demo_slots.parse("tomorrow") is None


class Db:
    """Answers the booked-slots query with what is already booked."""

    def __init__(self, booked=()):
        self.booked = list(booked)
        self.sql: list[tuple[str, dict]] = []

    async def execute(self, statement, params=None):
        self.sql.append((str(statement), params or {}))
        return SimpleNamespace(all=lambda: [(b,) for b in self.booked])


class Tasks:
    def __init__(self):
        self.added = []

    def add_task(self, fn, *args):
        self.added.append((fn, args))


@pytest.fixture
def setup(monkeypatch):
    async def none(*a, **k):
        return None

    monkeypatch.setattr(leads, "enforce_rate_limit", none)
    fixed = datetime(2026, 11, 16, 13, 0, tzinfo=UTC)
    real_grid = demo_slots.grid
    monkeypatch.setattr(demo_slots, "grid", lambda now=None: real_grid(fixed))


def request():
    return SimpleNamespace(client=SimpleNamespace(host="1.2.3.4"), headers={}, state=SimpleNamespace(tenant_slug=None))


def test_open_slots_leave_out_the_booked_ones(setup):
    db = Db(booked=["2026-11-16T15:00:00Z"])
    out = run(leads.demo_slot_list(request(), db))
    assert out["zone"] == "America/New_York" and out["slot_minutes"] == 30
    assert "2026-11-16T15:00:00Z" not in out["slots"]
    assert out["slots"][0] == "2026-11-16T15:30:00Z"


def test_a_booking_is_kept_with_the_lead_and_both_sides_are_emailed(setup):
    db, tasks = Db(), Tasks()
    body = leads.LeadIn(kind="demo", name="Ana Torres", email="ana@torrestees.com",
                        data={"business_name": "Torres Tees", "slot_start": "2026-11-18T15:30:00Z", "time_zone": "America/Chicago"})
    out = run(leads.create_lead(body, request(), tasks, db))
    assert out == {"ok": True, "meeting_time": "Wed, Nov 18, 10:30 AM ET"}
    insert = [p for s, p in db.sql if "INSERT INTO platform_leads" in s][0]
    import json
    data = json.loads(insert["data"])
    assert list(data)[0] == "meeting_time"
    assert data["slot_start"] == "2026-11-18T15:30:00Z" and data["time_zone"] == "America/Chicago"
    fns = [fn.__name__ for fn, _ in tasks.added]
    assert fns == ["_tell_platform", "_confirm_booking"]
    _, args = tasks.added[1]
    assert args == ("Ana Torres", "ana@torrestees.com", "Wed, Nov 18, 10:30 AM ET", "Wed, Nov 18, 9:30 AM")


def test_a_taken_or_made_up_time_is_refused(setup):
    for slot in ["2026-11-18T15:30:00Z", "2026-11-18T15:10:00Z", "2026-11-21T15:00:00Z", "soon"]:
        db, tasks = Db(booked=["2026-11-18T15:30:00Z"]), Tasks()
        body = leads.LeadIn(kind="demo", name="Ana", email="ana@x.com", data={"slot_start": slot})
        out = run(leads.create_lead(body, request(), tasks, db))
        assert out.status_code == 409, slot
        assert not any("INSERT" in s for s, _ in db.sql) and not tasks.added


def test_the_confirmation_names_both_times_and_escapes_the_name():
    html = leads.booking_html("<b>Ana</b>", "Wed, Nov 18, 10:30 AM ET", "Wed, Nov 18, 9:30 AM")
    assert "Wed, Nov 18, 10:30 AM ET" in html and "9:30 AM your time" in html
    assert "<b>Ana</b>" not in html and "&lt;b&gt;Ana&lt;/b&gt;" in html
    assert "mailto:support@printcopilot.co" in html
