"""The times a printcopilot.co visitor can book a demo in (printcopilot.co/demo).

The platform team's hours are the ones printcopilot.co/contact gives: Monday
to Friday, 9am to 5pm US Eastern Time. A demo takes one half-hour slot inside
them, on the next two weeks of working days, not on a US federal holiday and
not sooner than a couple of hours from now. A slot one visitor has booked is
gone for the next.

A booking is a demo lead (platform_leads, kind "demo") whose data carries the
slot's start as `slot_start` (UTC, ISO 8601). Nothing else is stored, so the
Leads list in the platform console is the calendar.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ZONE = ZoneInfo("America/New_York")
ZONE_LABEL = "ET"
DAY_START = time(9, 0)
DAY_END = time(17, 0)
SLOT = timedelta(minutes=30)
WORKING_DAYS_AHEAD = 10  # two weeks of weekdays
MIN_NOTICE = timedelta(hours=2)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """The nth (1-based) weekday of a month; n = -1 for the last one."""
    if n > 0:
        first = date(year, month, 1)
        return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))
    last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1))
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _observed(day: date) -> date:
    """A holiday on a Saturday is kept on the Friday, on a Sunday on the Monday."""
    if day.weekday() == 5:
        return day - timedelta(days=1)
    if day.weekday() == 6:
        return day + timedelta(days=1)
    return day


def us_holidays(year: int) -> set[date]:
    """US federal holidays as observed (the days the team is off)."""
    mon, thu = 0, 3
    days = {
        _observed(date(year, 1, 1)),               # New Year's Day
        _nth_weekday(year, 1, mon, 3),             # Martin Luther King Jr. Day
        _nth_weekday(year, 2, mon, 3),             # Washington's Birthday
        _nth_weekday(year, 5, mon, -1),            # Memorial Day
        _observed(date(year, 6, 19)),              # Juneteenth
        _observed(date(year, 7, 4)),               # Independence Day
        _nth_weekday(year, 9, mon, 1),             # Labor Day
        _nth_weekday(year, 10, mon, 2),            # Columbus Day
        _observed(date(year, 11, 11)),             # Veterans Day
        _nth_weekday(year, 11, thu, 4),            # Thanksgiving
        _observed(date(year, 12, 25)),             # Christmas Day
    }
    # New Year's Day falling on a Saturday is observed on Dec 31 of the year before.
    if _observed(date(year + 1, 1, 1)).year == year:
        days.add(_observed(date(year + 1, 1, 1)))
    return days


def grid(now: datetime | None = None) -> list[datetime]:
    """Every slot start (UTC) a visitor could pick, before any are booked."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    earliest = now + MIN_NOTICE
    out: list[datetime] = []
    day = now.astimezone(ZONE).date()
    working = 0
    holidays: dict[int, set[date]] = {}
    while working < WORKING_DAYS_AHEAD:
        off = holidays.setdefault(day.year, us_holidays(day.year))
        if day.weekday() < 5 and day not in off:
            start = datetime.combine(day, DAY_START, tzinfo=ZONE)
            end = datetime.combine(day, DAY_END, tzinfo=ZONE)
            slot = start
            any_today = False
            while slot + SLOT <= end:
                at = slot.astimezone(timezone.utc)
                if at >= earliest:
                    out.append(at)
                    any_today = True
                slot += SLOT
            # Today counts as a working day only if it still has a slot left.
            if any_today:
                working += 1
        day += timedelta(days=1)
    return out


def iso(at: datetime) -> str:
    return at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(value: str | None) -> datetime | None:
    """A slot start as sent back by the page, or None if it is not a time."""
    try:
        at = datetime.fromisoformat((value or "").strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if at.tzinfo is None:
        return None
    return at.astimezone(timezone.utc).replace(microsecond=0)


def label(at: datetime) -> str:
    """The slot in the team's own time, for the team's email and the Leads list."""
    local = at.astimezone(ZONE)
    clock = local.strftime("%I:%M %p").lstrip("0")
    return f"{local:%a}, {local:%b} {local.day}, {clock} {ZONE_LABEL}"


async def booked(db: AsyncSession) -> set[str]:
    """Slot starts already taken by a demo booking."""
    rows = (await db.execute(text("""
        SELECT data->>'slot_start' FROM platform_leads
        WHERE kind = 'demo' AND data ? 'slot_start'
          AND created_at > now() - interval '45 days'
    """))).all()
    taken: set[str] = set()
    for (value,) in rows:
        at = parse(value)
        if at:
            taken.add(iso(at))
    return taken


async def free(db: AsyncSession, now: datetime | None = None) -> list[str]:
    taken = await booked(db)
    return [s for s in (iso(at) for at in grid(now)) if s not in taken]
