"""The customer list: accounts and guests in one list (services/customer_directory).

Pure parts only: how a customer's id is read, what the filters let through,
how the totals are shaped, and that every part of the list's query is held to
the shop asking. The query itself was run on the local demo shop.
"""
import uuid
from datetime import UTC, datetime

import pytest

from app.services import customer_directory as cd


def test_a_guest_is_known_by_their_address_and_an_account_by_its_id():
    assert cd.guest_key("  Ava.Lowe@Example.com ") == "guest:ava.lowe@example.com"
    assert cd.parse_key("guest:Ava.Lowe@example.com") == ("guest", "ava.lowe@example.com")
    some = uuid.uuid4()
    assert cd.parse_key(str(some)) == ("account", some)
    for bad in ("guest:", "guest:not-an-address", "1042", ""):
        with pytest.raises(ValueError):
            cd.parse_key(bad)


def test_only_known_kinds_and_statuses_reach_the_query():
    f = cd._filters("  aisha ", "WHOLESALE", "suspended")
    assert (f["q"], f["like"], f["kind"], f["status"]) == ("aisha", "%aisha%", "wholesale", "suspended")
    f = cd._filters(None, "staff", "deleted")
    assert (f["q"], f["kind"], f["status"]) == ("", "", "")


def test_a_sort_is_one_of_ours_or_the_newest():
    assert set(cd.SORTS) == {"newest", "oldest", "spent", "orders", "recent", "name"}
    assert all(";" not in v and "--" not in v for v in cd.SORTS.values())


def test_the_average_leaves_out_what_was_not_spent():
    s = cd._stats({"orders": 5, "spent": 300, "counted": 4, "last_order": datetime(2026, 10, 1, tzinfo=UTC)})
    assert s == {"orders": 5, "spent": 300.0, "average": 75.0, "last_order": "2026-10-01T00:00:00+00:00"}
    assert cd._stats({"orders": 2, "spent": 0, "counted": 0, "last_order": None})["average"] == 0.0


def test_a_row_says_what_the_list_shows():
    row = cd._row({"id": "guest:a@b.co", "kind": "guest", "name": "Ava", "contact": None, "email": "a@b.co",
                   "status": "guest", "logins": 0, "orders": 2, "spent": "60.955", "joined": None, "last_order": None})
    assert row["spent"] == 60.96 and row["orders"] == 2 and row["joined"] is None


def test_every_part_of_the_list_is_held_to_one_shop():
    # Raw SQL is not scoped by the ORM: each table it reads names the shop itself.
    for table in ("FROM orders", "FROM company_users cu", "FROM companies c"):
        assert table in cd._PEOPLE
    assert cd._PEOPLE.count("tenant_id = CAST(:t AS uuid)") >= 5
    assert "tenant_id = CAST(:t AS uuid)" in cd._whose("guest") and "tenant_id = CAST(:t AS uuid)" in cd._whose("account")


def test_a_customers_timeline_is_newest_first_and_ends_with_the_account_opening():
    import asyncio
    from datetime import datetime, timezone

    class R:
        def __init__(self, rows=None, scalar=None):
            self.rows, self.value = rows or [], scalar

        def mappings(self):
            return self

        def all(self):
            return self.rows

        def scalar(self):
            return self.value

    class DB:
        def __init__(self, *results):
            self.results, self.sql = list(results), []

        async def execute(self, stmt, params=None):
            self.sql.append(str(stmt))
            return self.results.pop(0)

    at = lambda d: datetime(2026, 10, d, 12, tzinfo=timezone.utc)
    rows = [
        {"at": at(9), "type": "shipped", "message": "Shipped by UPS", "order_id": "o1", "order_number": "1001", "total": None},
        {"at": at(8), "type": "order_placed", "message": None, "order_id": "o1", "order_number": "1001", "total": 64.5},
    ]
    company = "6f1c0d2e-8a8b-4b55-9a51-1d6a3b0b7c11"
    db = DB(R(rows), R(scalar=at(1)))
    out = asyncio.run(cd.timeline(db, "t", company))
    assert [i["message"] for i in out["items"]] == ["Shipped by UPS", "Order 1001 placed", "Account opened"]
    assert out["items"][1]["total"] == 64.5 and out["more"] is False
    assert "order_number NOT LIKE 'DRAFT-%'" in db.sql[0] and "e.type <> 'order_created'" in db.sql[0]
    assert db.sql[0].count("tenant_id = CAST(:t AS uuid)") >= 2

    # An account made later from a guest's orders: the opening sits by its date.
    out = asyncio.run(cd.timeline(DB(R(rows), R(scalar=at(8) + (at(9) - at(8)) / 2)), "t", company))
    assert [i["type"] for i in out["items"]] == ["shipped", "account_created", "order_placed"]

    # More than the limit: the oldest are left off, the opening with them.
    many = [dict(rows[0], at=at(9)) for _ in range(3)]
    out = asyncio.run(cd.timeline(DB(R(many), R(scalar=at(1))), "t", company, limit=2))
    assert len(out["items"]) == 2 and out["more"] is True
    assert all(i["type"] != "account_created" for i in out["items"])
