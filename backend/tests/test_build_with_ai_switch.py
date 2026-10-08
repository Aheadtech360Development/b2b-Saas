""""Build with AI" is switched on brand by brand, from the platform console.

It used to take two switches in code — an environment variable on the server
and a constant in the shop's builder page — so turning it on for one brand
meant turning it on for all of them, and a deploy. It is now a feature like any
other in the brand's Manage screen, in no plan by default: On shows the button
in that brand's builder and lets the assistant answer, Off or Plan hides it and
the assistant refuses, whoever asks.

Runs against the local test Postgres (port 55432). It refuses anything else.
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

from app.core.billing_plans import BILLING_PLANS  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.features import PLAN_FEATURES, feature_for_path  # noqa: E402
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


async def sql(stmt, params=None):
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT set_config('app.bypass_rls','on',true)"))
            await db.execute(text(stmt), params or {})
            await db.commit()
    finally:
        set_bypass_scoping(False)


async def main():
    print("the catalogue")
    check("no plan includes it, the top one neither — the platform turns it on per brand",
          all("gang_sheet_ai" not in feats for feats in PLAN_FEATURES.values())
          and all("gang_sheet_ai" not in p["features"] for p in BILLING_PLANS.values()))
    check("the assistant's route is gated by it, not by the admin's analytics agent",
          feature_for_path("/api/v1/copilot/studio", public=True) == "gang_sheet_ai"
          and feature_for_path("/api/v1/copilot/chat", public=True) == "ai_agent")

    tid = uuid.uuid4()
    slug = f"ai-{RUN}"
    # On the top plan, so nothing but the switch can be what turns it on.
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (:i, :s, 'AI Switch Shop', :e, 'active', 'scale')",
              {"i": str(tid), "s": slug, "e": f"{slug}@printshop-demo.com"})
    platform = create_access_token(subject=str(uuid.uuid4()), extra_claims={
        "role": "platform_admin", "is_admin": True, "is_platform_admin": True})

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        shop = {"X-Tenant-Slug": slug}  # a guest in the shop's builder
        console = {"Authorization": f"Bearer {platform}"}

        async def switch(feature, value):
            r = await client.put(f"/api/v1/platform/tenants/{slug}/features",
                                 json={"feature": feature, "is_enabled": value}, headers=console)
            assert r.status_code == 200, r.text
            return next(f for f in r.json()["features"] if f["feature"] == feature)

        async def shown():
            r = await client.get("/api/v1/gang-sheets/assistant", headers=shop)
            return r.status_code, r.json()

        async def ask(body=None):
            # An empty question: past the switch it is refused as invalid
            # (422), so no model is ever called here.
            return await client.post("/api/v1/copilot/studio", json=body or {}, headers=shop)

        print("\nthe brand's Manage screen")
        r = await client.get(f"/api/v1/platform/tenants/{slug}/features", headers=console)
        row = next((f for f in r.json().get("features", []) if f["feature"] == "gang_sheet_ai"), None)
        check("lists it with the builder, off by default", r.status_code == 200 and row is not None
              and row["group"] == "Gang Sheet Builder" and row["in_plan"] is False
              and row["override"] is None and row["enabled"] is False, row or r.text)

        print("\nleft at Plan")
        check("the builder does not show it", await shown() == (200, {"available": False}), await shown())
        r = await ask()
        check("and the assistant refuses before anything is asked", r.status_code == 403
              and r.json().get("error", {}).get("code") == "FEATURE_NOT_IN_PLAN", r.text[:200])

        print("\nswitched On")
        row = await switch("gang_sheet_ai", True)
        check("the screen says so", row["override"] is True and row["enabled"] is True, row)
        check("the builder shows it straight away", await shown() == (200, {"available": True}), await shown())
        r = await ask()
        check("and the assistant is reached (the empty question is all it refuses)", r.status_code == 422, r.text[:200])

        print("\nOn, but the builder itself taken away")
        await switch("gang_sheet", False)
        check("there is no builder to show it in", (await shown())[0] == 403, await shown())
        r = await ask({"messages": [{"role": "user", "content": "hi"}]})
        check("and the assistant refuses on its own, not only the button", r.status_code == 503, r.text[:200])
        await switch("gang_sheet", None)

        print("\nswitched Off")
        row = await switch("gang_sheet_ai", False)
        check("the screen says so", row["override"] is False and row["enabled"] is False, row)
        check("the builder hides it", await shown() == (200, {"available": False}), await shown())
        check("and the assistant refuses", (await ask()).status_code == 403)

        print("\nback to Plan")
        row = await switch("gang_sheet_ai", None)
        check("off again, nothing left decided", row["override"] is None and row["enabled"] is False, row)
        check("the builder hides it", await shown() == (200, {"available": False}), await shown())

        print("\nanother brand is not touched by this one's switch")
        other = f"ai2-{RUN}"
        await sql("INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (gen_random_uuid(), :s, 'Other Shop', :e, 'active', 'scale')",
                  {"s": other, "e": f"{other}@printshop-demo.com"})
        await switch("gang_sheet_ai", True)
        r = await client.get("/api/v1/gang-sheets/assistant", headers={"X-Tenant-Slug": other})
        check("its builder still hides it", r.status_code == 200 and r.json() == {"available": False}, r.text)

    print(f"\n{ok} passed, {fail} failed")
    return fail


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
