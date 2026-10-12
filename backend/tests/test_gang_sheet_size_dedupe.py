"""Remove duplicates on Gang sheet setup → Sheet sizes (gang_sheets.dedupe_plan).

Sizes that share a name in one set: one is kept, the rest go. A size a job was
made on is hidden instead of deleted, so the job still finds the size it was
built on."""
from app.api.v1.gang_sheets import dedupe_plan


def size(i, name, active=True, price=True, jobs=0, created="2026-01-01"):
    return {"id": i, "name": name, "is_active": active, "price": price, "jobs": jobs, "created": created}


def test_a_name_used_once_is_left_alone():
    assert dedupe_plan([size("a", "22x10"), size("b", "22x20")]) == ([], [])


def test_the_active_priced_one_is_kept_and_the_rest_deleted():
    plan = dedupe_plan([
        size("zero", "22x10", price=False, created="2026-01-01"),
        size("hidden", "22 X10", active=False, created="2026-01-02"),
        size("keep", "22x10 ", created="2026-01-03"),
    ])
    # "22 X10" is not the same name as "22x10": only spaces and case are ignored.
    assert plan == (["zero"], [])
    assert dedupe_plan([size("old", "DTF 22x60", created="2026-01-01"), size("new", "dtf  22x60", created="2026-02-01")]) == (["new"], [])


def test_the_size_jobs_were_made_on_is_the_one_kept():
    delete, hide = dedupe_plan([
        size("unused", "22x24"),
        size("used", "22x24", jobs=3, created="2026-02-01"),
        size("used-hidden", "22x24", active=False, jobs=1, created="2026-03-01"),
        size("spare", "22x24", created="2026-04-01"),
    ])
    assert delete == ["unused", "spare"]
    assert hide == []  # the other one jobs used is hidden already


def test_a_size_a_job_was_made_on_is_hidden_not_deleted():
    delete, hide = dedupe_plan([
        size("first", "22x24", jobs=2, created="2026-01-01"),
        size("second", "22x24", jobs=5, created="2026-02-01"),
    ])
    assert (delete, hide) == ([], ["second"])
