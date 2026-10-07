"""An admin deleting one of the shop's people, against a real database.

What broke was invisible to anything that does not run the database's own
rules: the activity log is append-only (a trigger, 0043), the log points at
the account that acted, and deleting the account empties that link — an
UPDATE the trigger refused, taking the delete with it. Since 0043 nobody who
had ever signed in could be deleted, and the page showed a button that did
nothing.

Held here: a buyer who signed up the way a shop's customer does can be deleted;
the activity log loses no entry and still refuses every other change; a person
with an order on record is refused with the reason; nobody deletes the account
they are signed in with.

Runs against the local test Postgres (docker at360-sec-test). It refuses to run
against anything else.
"""
import asyncio
import os
import sys
import uuid

os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:test@localhost:55432/at360test"
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
sys.path.insert(0, os.path.abspath("."))

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import get_settings  # noqa: E402

assert "localhost:55432/at360test" in get_settings().sync_db_url, "refusing: not the local test database"

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.core.tenant_context import set_bypass_scoping  # noqa: E402
from app.main import app  # noqa: E402

RUN = uuid.uuid4().hex[:8]
ok = fail = 0


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS  {name}")
    else:
        fail += 1
        print(f"  FAIL  {name}{' - ' + str(extra)[:300] if extra else ''}")


async def sql(stmt, params=None, fetch=False):
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT set_config('app.bypass_rls','on',true)"))
            res = await db.execute(text(stmt), params or {})
            rows = res.all() if fetch else None
            await db.commit()
            return rows
    finally:
        set_bypass_scoping(False)


async def one(stmt, params=None):
    return (await sql(stmt, params, fetch=True))[0][0]


async def refused(stmt, params=None):
    """True when the activity log refuses the change, as it must."""
    try:
        await sql(stmt, params)
        return False
    except Exception as exc:  # noqa: BLE001
        return "append-only" in str(exc)


async def main():
    tid, admin_id = uuid.uuid4(), uuid.uuid4()
    slug = f"usr-{RUN}"
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (:i, :s, :n, :e, 'active', 'starter')",
              {"i": str(tid), "s": slug, "n": "User Delete", "e": f"{slug}@example.com"})
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, "
              "is_admin, is_active, email_verified) VALUES (:i, :t, :e, 'x', 'Test', 'Admin', "
              "'tenant_admin', true, true, true)", {"i": str(admin_id), "t": str(tid), "e": f"admin-{slug}@example.com"})
    token = create_access_token(subject=str(admin_id), extra_claims={
        "tenant_id": str(tid), "role": "tenant_admin", "is_admin": True, "is_platform_admin": False,
    })
    # An address of its own for each run: sign-ups are limited per address per
    # hour, and a test that is run a few times must not be the one to hit it.
    pub = {"X-Tenant-Slug": slug, "X-Forwarded-For": f"10.{int(RUN[:2], 16)}.{int(RUN[2:4], 16)}.{int(RUN[4:6], 16)}"}
    adm = {"X-Tenant-Slug": slug, "Authorization": f"Bearer {token}"}

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

            async def sign_up(first):
                email = f"{first}-{RUN}@example.com"
                r = await client.post("/api/v1/register-customer", headers=pub, json={
                    "first_name": first, "last_name": "bravo", "email": email,
                    "password": "Passw0rd!x9", "phone": "5551234567",
                })
                assert r.status_code == 201, r.text[:200]
                return await one("SELECT id FROM users WHERE tenant_id = CAST(:t AS uuid) AND email = :e",
                                 {"t": str(tid), "e": email})

            print("a buyer who has signed in can be deleted")
            buyer = await sign_up("cj")
            logged = await one("SELECT count(*) FROM audit_log WHERE admin_user_id = CAST(:u AS uuid)", {"u": str(buyer)})
            check("signing up is written to the activity log against them", logged >= 1, logged)
            entries = await one("SELECT count(*) FROM audit_log WHERE tenant_id = CAST(:t AS uuid)", {"t": str(tid)})
            r = await client.delete(f"/api/v1/admin/users/{buyer}", headers=adm)
            check("the admin's delete is accepted", r.status_code == 204, f"{r.status_code} {r.text[:200]}")
            check("the account is gone", await one("SELECT count(*) FROM users WHERE id = CAST(:u AS uuid)", {"u": str(buyer)}) == 0)
            check("and so is their place in the company",
                  await one("SELECT count(*) FROM company_users WHERE user_id = CAST(:u AS uuid)", {"u": str(buyer)}) == 0)
            after = await one("SELECT count(*) FROM audit_log WHERE tenant_id = CAST(:t AS uuid)", {"t": str(tid)})
            check("the activity log lost no entry", after >= entries, f"{entries} -> {after}")
            check("its entries no longer point at an account that is not there",
                  await one("SELECT count(*) FROM audit_log WHERE admin_user_id = CAST(:u AS uuid)", {"u": str(buyer)}) == 0)

            print("the activity log still refuses everything else")
            a_row = "(SELECT id FROM audit_log WHERE tenant_id = CAST(:t AS uuid) AND admin_user_id IS NOT NULL LIMIT 1)"
            keeper = await sign_up("kept")
            check("rewriting an entry", await refused(f"UPDATE audit_log SET summary = 'x' WHERE id = {a_row}", {"t": str(tid)}))
            check("deleting an entry", await refused(f"DELETE FROM audit_log WHERE id = {a_row}", {"t": str(tid)}))
            check("emptying the link and changing the entry with it",
                  await refused(f"UPDATE audit_log SET admin_user_id = NULL, summary = 'x' WHERE id = {a_row}", {"t": str(tid)}))
            check("pointing an entry at somebody else",
                  await refused(f"UPDATE audit_log SET admin_user_id = CAST(:a AS uuid) WHERE id = {a_row} "
                                "AND admin_user_id <> CAST(:a AS uuid)", {"t": str(tid), "a": str(admin_id)}))

            print("a person with an order on record is kept, and the page is told why")
            company = await one("SELECT company_id FROM company_users WHERE user_id = CAST(:u AS uuid)", {"u": str(keeper)})
            order_id = uuid.uuid4()
            await sql("INSERT INTO orders (id, tenant_id, order_number, company_id, placed_by_id, is_guest_order, status, "
                      "payment_status, qb_sync_status, subtotal, shipping_cost, tax_amount, total) "
                      "VALUES (:i, :t, :n, :c, :u, false, 'pending', 'unpaid', 'skipped', 10, 0, 0, 10)",
                      {"i": str(order_id), "t": str(tid), "n": f"9{RUN[:6]}", "c": str(company), "u": str(keeper)})
            r = await client.delete(f"/api/v1/admin/users/{keeper}", headers=adm)
            check("refused", r.status_code == 409, f"{r.status_code} {r.text[:200]}")
            said = r.json().get("detail", "") if r.status_code == 409 else ""
            check("with the count and what to do instead", "1 order on record" in said and "Deactivate" in said, said)
            check("and they are still there", await one("SELECT count(*) FROM users WHERE id = CAST(:u AS uuid)", {"u": str(keeper)}) == 1)

            print("nobody deletes the account they are signed in with")
            r = await client.delete(f"/api/v1/admin/users/{admin_id}", headers=adm)
            check("refused", r.status_code == 409 and "signed in" in r.text, f"{r.status_code} {r.text[:200]}")
    finally:
        # Leave the database as it was found.
        for stmt in ("DELETE FROM orders WHERE tenant_id = CAST(:t AS uuid)",
                     "DELETE FROM company_users WHERE tenant_id = CAST(:t AS uuid)",
                     "DELETE FROM users WHERE tenant_id = CAST(:t AS uuid)",
                     "DELETE FROM companies WHERE tenant_id = CAST(:t AS uuid)",
                     "DELETE FROM tenants WHERE id = CAST(:t AS uuid)"):
            try:
                await sql(stmt, {"t": str(tid)})
            except Exception as exc:  # noqa: BLE001
                print("  (tidying up:", str(exc).splitlines()[0][:160], ")")

    print(f"\n{ok} passed, {fail} failed")
    sys.exit(1 if fail else 0)


asyncio.run(main())
