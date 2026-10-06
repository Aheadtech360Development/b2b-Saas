"""One address, one account per shop — and a card order charged what it says.

The first group is the one a buyer met: an address that had an account at one
shop could neither sign up nor sign in at another. Signing up said the address
was taken; signing in at the second shop found nobody, because the account was
the first shop's. Now each shop's customers are its own: the same address opens
an account at each, signs in at each with that shop's password, and resets that
shop's password without touching the other's.

Then the platform's own admin seed, which used to match on the address alone,
and the root sign-in page, where nothing names a shop.

Last, the card charge: a discount code applied after the card form had opened
was left out of the card's amount while the order recorded it. The order now
follows what the card was priced with, and any gap left is written on it.

Runs against the local test Postgres (docker at360-sec-test, or one started on
port 55432). It refuses to run against anything else.
"""
import asyncio
import os
import sys
import uuid
from decimal import Decimal
from types import SimpleNamespace

os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:test@localhost:55432/at360test"
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
sys.path.insert(0, os.path.abspath("."))

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import get_settings  # noqa: E402

assert "localhost:55432/at360test" in get_settings().sync_db_url, "refusing: not the local test database"

from app.core.database import AsyncSessionLocal, email_owner  # noqa: E402
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


async def shop(label):
    tid = uuid.uuid4()
    slug = f"acct-{label}-{RUN}"
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) "
              "VALUES (:i, :s, :n, :e, 'active', 'wholesale')",
              {"i": str(tid), "s": slug, "n": f"Shop {label}", "e": f"{slug}@printshop-demo.com"})
    uid = uuid.uuid4()
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, "
              "is_admin, is_active, email_verified) VALUES (:i, :t, :e, 'x', 'Shop', 'Owner', "
              "'tenant_admin', true, true, true)",
              {"i": str(uid), "t": str(tid), "e": f"owner-{slug}@printshop-demo.com"})
    token = create_access_token(subject=str(uid), extra_claims={
        "tenant_id": str(tid), "role": "tenant_admin", "is_admin": True, "is_platform_admin": False,
    })
    return {"tid": tid, "slug": slug, "token": token}


async def accounts(email):
    return await sql("SELECT tenant_id, is_platform_admin, role FROM users WHERE lower(email) = :e",
                     {"e": email.lower()}, fetch=True)


class Events:
    """Stands in for order_events: what would have been written on the order."""

    def __init__(self):
        self.written = []

    async def record(self, db, order, kind, message=None, **kw):
        self.written.append((kind, message, kw.get("meta")))


async def main():
    try:
        import redis

        # Sign-up and sign-in are rate limited per address; a re-run in the
        # same hour must not trip over the last one.
        redis.Redis.from_url(os.environ["REDIS_URL"]).flushdb()
    except Exception:
        pass

    a, b = await shop("a"), await shop("b")
    email = f"Buyer-{RUN}@printshop-demo.com"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        def at(s, **extra):
            return {"X-Tenant-Slug": s["slug"], **extra}

        async def register(s, password):
            return await client.post("/api/v1/register-customer", headers=at(s), json={
                "first_name": "Sam", "last_name": "Lee", "email": email, "password": password,
                "company_name": f"Sam Prints {s['slug']}",
            })

        async def login(s, password, address=None):
            return await client.post("/api/v1/auth/login", headers=at(s) if s else {},
                                     json={"email": address or email, "password": password})

        # ── 1. The same buyer at two shops ──────────────────────────────────
        print("one address, an account at each shop")
        r = await register(a, "ShopAPass123")
        check("a buyer opens an account at the first shop", r.status_code == 201, r.text[:200])
        r = await register(b, "ShopBPass456")
        check("…and the same address opens one at the second — it used to be 'already exists'",
              r.status_code == 201, r.text[:200])
        rows = await accounts(email)
        check("two accounts, one at each shop", sorted(str(t) for t, *_ in rows) == sorted([str(a["tid"]), str(b["tid"])]),
              rows)
        r = await register(b, "Another789")
        check("a second sign-up at the same shop is still refused, and says to sign in",
              r.status_code == 409 and "sign in" in r.text.lower(), r.text[:200])

        r = await login(a, "ShopAPass123")
        check("signing in at the first shop works with that shop's password", r.status_code == 200, r.text[:200])
        r = await login(b, "ShopBPass456")
        check("…and at the second with the second's", r.status_code == 200, r.text[:200])
        r = await login(a, "ShopBPass456")
        check("one shop's password does not open the other shop's account", r.status_code == 401, r.text[:120])

        owner_a = await email_owner(email, a["tid"])
        check("asking who holds the address asks about one shop",
              owner_a is not None and str(owner_a["tenant_id"]) == str(a["tid"]), owner_a)
        nobody = await shop("c")
        check("…a shop the buyer never joined has nobody by that address", await email_owner(email, nobody["tid"]) is None)

        # ── 2. Resetting one shop's password ────────────────────────────────
        print("\na password reset at one shop")
        r = await client.post("/api/v1/forgot-password", headers=at(b), json={"email": email})
        check("asked for at the second shop", r.status_code == 204, r.text[:120])
        tokens = await sql("SELECT tenant_id, password_reset_token FROM users WHERE lower(email) = :e",
                           {"e": email.lower()}, fetch=True)
        with_token = [(str(t), tok) for t, tok in tokens if tok]
        check("…only that shop's account gets a reset link", len(with_token) == 1 and with_token[0][0] == str(b["tid"]),
              with_token)
        r = await client.post("/api/v1/reset-password", json={"token": with_token[0][1], "new_password": "ShopBNew2468"})
        check("…the link sets a new password", r.status_code == 204, r.text[:120])
        r = await login(b, "ShopBNew2468")
        check("…which opens the second shop's account", r.status_code == 200, r.text[:120])
        r = await login(a, "ShopAPass123")
        check("…and the first shop's password is untouched", r.status_code == 200, r.text[:120])

        # ── 3. A shop adding staff ──────────────────────────────────────────
        print("\na shop adding a person")
        r = await client.post("/api/v1/admin/users", headers=at(nobody, Authorization=f"Bearer {nobody['token']}"),
                              json={"email": email, "first_name": "Sam", "role": "staff"})
        check("an address with accounts at other shops can be added as staff at a third", r.status_code == 201, r.text[:200])
        r = await client.post("/api/v1/admin/users", headers=at(nobody, Authorization=f"Bearer {nobody['token']}"),
                              json={"email": email, "first_name": "Sam", "role": "staff"})
        check("…but not twice at the same shop, and the shop is told it is its own user",
              r.status_code == 409 and "your shop" in r.text, r.text[:200])

        # ── 4. The platform's own page ──────────────────────────────────────
        print("\nsigning in where nothing names a shop")
        r = await login(None, "ShopBNew2468")
        check("the account whose password it is, out of several with the address", r.status_code == 200, r.text[:200])
        r = await login(None, "ShopAPass123")
        check("…whichever shop it belongs to", r.status_code == 200, r.text[:200])
        r = await login(None, "not-a-password")
        check("…and a wrong password is still wrong", r.status_code == 401, r.text[:120])

    # ── 5. The platform admin seed ──────────────────────────────────────────
    print("\nthe platform admin seed")
    from app.main import _ensure_platform_admin

    admin_email = f"Platform-{RUN}@printshop-demo.com"
    shop_user = uuid.uuid4()
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, "
              "is_admin, is_active, email_verified) VALUES (:i, :t, :e, 'x', 'Shop', 'Buyer', 'buyer', "
              "false, true, true)", {"i": str(shop_user), "t": str(a["tid"]), "e": admin_email.lower()})
    os.environ["SEED_PLATFORM_ADMIN_EMAIL"] = admin_email
    os.environ["SEED_PLATFORM_ADMIN_PASSWORD"] = "SeedPass123"
    os.environ.pop("SEED_PLATFORM_ADMIN_RESET", None)
    await _ensure_platform_admin()
    await _ensure_platform_admin()
    rows = await accounts(admin_email)
    admins = [r for r in rows if r[0] is None]
    check("makes one platform admin, with no shop, however often it runs",
          len(admins) == 1 and admins[0][1] is True, rows)
    check("…and leaves a shop's customer with the same address a customer — it used to promote them",
          any(str(r[0]) == str(a["tid"]) and r[1] is False and r[2] == "buyer" for r in rows), rows)
    os.environ["SEED_PLATFORM_ADMIN_PASSWORD"] = "SeedPass999"
    os.environ["SEED_PLATFORM_ADMIN_RESET"] = "true"
    await _ensure_platform_admin()
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/v1/auth/login", json={"email": admin_email, "password": "SeedPass999"})
        check("…with RESET, the platform admin's password is the new one", r.status_code == 200, r.text[:200])
    for k in ("SEED_PLATFORM_ADMIN_EMAIL", "SEED_PLATFORM_ADMIN_PASSWORD", "SEED_PLATFORM_ADMIN_RESET"):
        os.environ.pop(k, None)

    # ── 6. A card order charged what it says ────────────────────────────────
    print("\nthe card charge against the order")
    from app.api.v1.checkout import _check_charge, charged_coupon

    check("an intent priced with a code: the order takes that code", charged_coupon("SAVE90", "save90") == "save90")
    check("an intent priced with no code, an order asking for one: the order takes none — the card paid full price",
          charged_coupon("none", "SAVE90") is None)
    check("an intent priced with a code the order lost: the order takes the code it was paid with",
          charged_coupon("SAVE90", None) == "SAVE90")
    check("an intent from before codes were recorded: the order as it asks", charged_coupon(None, "SAVE90") == "SAVE90")

    order = SimpleNamespace(order_number="ORD-1", total=Decimal("1.60"))
    ev = Events()
    paid = await _check_charge(None, order, SimpleNamespace(id="pi_1", amount=160), ev)
    check("charged what the order says: nothing written", paid == Decimal("1.60") and ev.written == [], ev.written)
    ev = Events()
    paid = await _check_charge(None, order, SimpleNamespace(id="pi_2", amount=795), ev)
    check("charged more: the order says so, in figures, and to refund the difference",
          paid == Decimal("7.95") and len(ev.written) == 1 and ev.written[0][0] == "note"
          and "$7.95" in ev.written[0][1] and "$6.35 more" in ev.written[0][1] and "refund" in ev.written[0][1],
          ev.written)
    ev = Events()
    paid = await _check_charge(None, order, SimpleNamespace(id="pi_3", amount=100), ev)
    check("charged less: the order says how much is still owed",
          paid == Decimal("1.00") and "$0.60 less" in ev.written[0][1] and "still owed" in ev.written[0][1], ev.written)

    print(f"\n{ok} passed, {fail} failed")
    return fail


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
