"""The visual builder, end to end, against a real database.

The first group is the one that matters most: a brand whose storefront was
imported from HTML must render exactly as it did, byte for byte, through every
step of somebody opening the builder, editing, publishing — right up until that
brand's own admin switches its render mode, and again the moment they switch
back.

Then: the draft never reaches shoppers; publish and rollback do what they say;
a broken draft is refused with the live site untouched; and one brand can never
reach another's products, menus, fonts or versions.

Runs against the local test Postgres (docker at360-sec-test). It refuses to run
against anything else.
"""
import asyncio
import json
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


async def make_brand(label, *, imported_theme=False):
    tid = uuid.uuid4()
    slug = f"bld-{label}-{RUN}"
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) "
              "VALUES (:i, :s, :n, :e, 'active', 'wholesale')",
              {"i": str(tid), "s": slug, "n": f"Brand {label}", "e": f"{slug}@example.com"})
    uid = uuid.uuid4()
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, "
              "is_admin, is_active, email_verified) VALUES (:i, :t, :e, 'x', 'Test', 'Admin', "
              "'tenant_admin', true, true, true)",
              {"i": str(uid), "t": str(tid), "e": f"admin-{slug}@example.com"})
    pid = uuid.uuid4()
    await sql("INSERT INTO products (id, tenant_id, name, slug, status, moq, pricing_mode, gang_sheet_enabled) "
              "VALUES (:i, :t, :n, :s, 'active', 1, 'variant', false)",
              {"i": str(pid), "t": str(tid), "n": f"Tee {label}", "s": f"tee-{label}-{RUN}"})
    mid = uuid.uuid4()
    items = [{"label": "Shop", "href": "/products",
              "children": [{"label": "Hoodies", "href": "/collections/hoodies"}]},
             {"label": "About", "href": "/about"}]
    await sql("INSERT INTO tenant_menus (id, tenant_id, name, items) VALUES (:i, :t, 'Main', CAST(:j AS jsonb))",
              {"i": str(mid), "t": str(tid), "j": json.dumps(items)})
    if imported_theme:
        # A real imported design, copied from an existing published theme.
        await sql("INSERT INTO brand_themes (id, tenant_id, name, definition, draft, published, "
                  "published_at, is_active, source_html) "
                  "SELECT gen_random_uuid(), :t, name, definition, draft, published, now(), true, source_html "
                  "FROM brand_themes WHERE published IS NOT NULL AND is_active ORDER BY created_at DESC LIMIT 1",
                  {"t": str(tid)})
    token = create_access_token(subject=str(uid), extra_claims={
        "tenant_id": str(tid), "role": "tenant_admin", "is_admin": True, "is_platform_admin": False,
    })
    return {"tid": tid, "slug": slug, "token": token, "product": pid, "product_slug": f"tee-{label}-{RUN}",
            "menu": mid}


async def main():
    a = await make_brand("a", imported_theme=True)
    b = await make_brand("b")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        def pub(brand):
            return {"X-Tenant-Slug": brand["slug"]}

        def adm(brand):
            return {"X-Tenant-Slug": brand["slug"], "Authorization": f"Bearer {brand['token']}"}

        async def theme_home(brand):
            r = await client.get("/api/v1/storefront/theme/home", headers=pub(brand))
            return r.status_code, r.text

        async def site(brand, **params):
            r = await client.get("/api/v1/storefront/site", headers=pub(brand), params=params)
            return r.json()

        async def theme_row(brand):
            rows = await sql("SELECT definition::text, published::text, draft::text FROM brand_themes "
                             "WHERE tenant_id = :t", {"t": str(brand["tid"])}, fetch=True)
            return rows[0] if rows else None

        def heading_text(doc):
            return doc["templates"]["home"]["default"]["tree"]["children"][0]["children"][0]["children"][0][
                "children"][0]["props"]["text"]

        def set_heading(doc, value):
            doc["templates"]["home"]["default"]["tree"]["children"][0]["children"][0]["children"][0][
                "children"][0]["props"]["text"] = value

        # ── 1. The imported brand is untouched ────────────────────────────────
        print("an imported-HTML brand renders exactly as before")
        status0, home0 = await theme_home(a)
        row0 = await theme_row(a)
        check("the imported theme renders today", status0 == 200 and '"page":null' not in home0.replace(" ", ""),
              home0[:200])
        check("the storefront asks and is told: legacy", await site(a) == {"mode": "legacy"})

        r = await client.get("/api/v1/admin/storefront/builder", headers=adm(a))
        state = r.json()
        check("opening the builder makes a draft", r.status_code == 200 and state.get("draft"), r.text[:200])
        check("opening the builder does not switch the storefront", state.get("mode") == "legacy")
        check("…and the storefront still says legacy", await site(a) == {"mode": "legacy"})
        check("…and the imported theme renders byte for byte the same", (await theme_home(a))[1] == home0)

        draft = state["draft"]
        set_heading(draft, "Published heading v1")
        r = await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                             json={"draft": draft, "revision": state["revision"]})
        rev = r.json().get("revision")
        check("a draft saves", r.status_code == 200, r.text[:200])

        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={"note": "first"})
        check("the draft publishes", r.status_code == 200 and r.json().get("version") == 1, r.text[:300])
        check("publishing does not switch the storefront", await site(a) == {"mode": "legacy"})
        check("…and the imported theme still renders byte for byte the same", (await theme_home(a))[1] == home0)
        check("the imported theme's own row was never written to", await theme_row(a) == row0)

        # ── 2. Switching, and the draft staying a draft ──────────────────────
        print("\nswitching to the builder, and the draft staying a draft")
        r = await client.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "visual_builder"})
        check("the owner can switch to the builder", r.status_code == 200 and r.json()["mode"] == "visual_builder",
              r.text[:200])
        live = await site(a)
        check("the storefront now renders the published version",
              live.get("mode") == "visual_builder" and live.get("version") == 1, str(live)[:200])
        check("…with the published heading",
              live["template"]["children"][0]["children"][0]["children"][0]["children"][0]["props"]["text"]
              == "Published heading v1")

        set_heading(draft, "DRAFT ONLY")
        r = await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                             json={"draft": draft, "revision": rev})
        rev = r.json().get("revision")
        live = await site(a)
        check("an unpublished edit never reaches shoppers",
              live["template"]["children"][0]["children"][0]["children"][0]["children"][0]["props"]["text"]
              == "Published heading v1")
        r = await client.get("/api/v1/admin/storefront/builder/preview", headers=adm(a))
        check("…but the owner's preview shows it",
              r.json()["template"]["children"][0]["children"][0]["children"][0]["children"][0]["props"]["text"]
              == "DRAFT ONLY")
        r = await client.get("/api/v1/storefront/site", headers=pub(a), params={"draft": "1"})
        check("asking the public endpoint for the draft does not get it",
              "DRAFT ONLY" not in r.text)

        r = await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                             json={"draft": draft, "revision": rev - 1})
        check("a save from a stale window is refused, not merged", r.status_code == 409, r.text[:200])

        # ── 3. Publish and rollback ──────────────────────────────────────────
        print("\npublish and rollback")
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("a second publish is version 2", r.json().get("version") == 2, r.text[:200])
        v1 = next(v for v in r.json()["versions"] if v["number"] == 1)
        live = await site(a)
        check("version 2 is live",
              live["template"]["children"][0]["children"][0]["children"][0]["children"][0]["props"]["text"]
              == "DRAFT ONLY")
        r = await client.post("/api/v1/admin/storefront/builder/rollback", headers=adm(a),
                              json={"version_id": v1["id"]})
        live = await site(a)
        check("rollback puts version 1 back",
              r.status_code == 200 and live.get("version") == 1
              and live["template"]["children"][0]["children"][0]["children"][0]["children"][0]["props"]["text"]
              == "Published heading v1", r.text[:200])

        # ── 4. A broken draft is refused, and the live site does not move ───
        print("\na broken draft is refused")
        broken = json.loads(json.dumps(draft))
        menu_node = broken["parts"]["header"]["children"][0]["children"][1]["children"][0]
        menu_node["props"]["menuId"] = str(uuid.uuid4())
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": broken, "revision": None})
        before = (await client.get("/api/v1/admin/storefront/builder/versions", headers=adm(a))).json()
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        after = (await client.get("/api/v1/admin/storefront/builder/versions", headers=adm(a))).json()
        check("a draft pointing at a deleted menu is refused",
              r.status_code == 422 and any(i["code"] == "missing_menu" for i in r.json()["detail"]["issues"]),
              r.text[:300])
        check("…no version was written", len(before) == len(after))
        check("…and the live site is still version 1", (await site(a)).get("version") == 1)

        # ── 5. One brand cannot reach another ────────────────────────────────
        print("\none brand cannot reach another's")
        cross = json.loads(json.dumps(draft))
        grid = cross["templates"]["home"]["default"]["tree"]["children"][2]["children"][1]
        grid["props"] = {"source": "manual", "productIds": [str(b["product"])], "limit": 4}
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": cross, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("brand A cannot publish a grid of brand B's products",
              r.status_code == 422 and any(i["code"] == "missing_product" for i in r.json()["detail"]["issues"]),
              r.text[:300])

        cross = json.loads(json.dumps(draft))
        cross["parts"]["header"]["children"][0]["children"][1]["children"][0]["props"]["menuId"] = str(b["menu"])
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": cross, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("brand A cannot show brand B's menu",
              r.status_code == 422 and any(i["code"] == "missing_menu" for i in r.json()["detail"]["issues"]))

        await sql("INSERT INTO builder_fonts (tenant_id, family, weight, style, format, url) "
                  "VALUES (:t, 'Brand B Sans', 400, 'normal', 'woff2', 'https://example.com/b.woff2')",
                  {"t": str(b["tid"])})
        cross = json.loads(json.dumps(draft))
        cross["settings"]["fonts"].append({"family": "Brand B Sans", "source": "custom", "weights": [400]})
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": cross, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("brand A cannot use a font brand B uploaded",
              r.status_code == 422 and any(i["code"] == "font_missing" for i in r.json()["detail"]["issues"]))
        r = await client.get("/api/v1/admin/storefront/builder/fonts", headers=adm(a))
        check("…and does not see it in its font list", "Brand B Sans" not in r.text)

        await client.get("/api/v1/admin/storefront/builder", headers=adm(b))
        r = await client.post("/api/v1/admin/storefront/builder/rollback", headers=adm(b),
                              json={"version_id": v1["id"]})
        check("brand B cannot roll back to brand A's version", r.status_code == 404, r.text[:200])
        r = await client.get("/api/v1/admin/storefront/builder", headers=adm(b))
        check("brand B's builder is its own, not A's draft", "DRAFT ONLY" not in r.text)
        check("brand B, never switched, still renders legacy", await site(b) == {"mode": "legacy"})
        r = await client.put("/api/v1/admin/storefront/builder/mode", headers=adm(b),
                             json={"mode": "visual_builder"})
        check("a brand with nothing published cannot switch to the builder", r.status_code == 409)

        # put A's draft back to something valid, then publish v3
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": draft, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("a corrected draft publishes", r.status_code == 200, r.text[:200])

        # ── 6. Real data, filled in ──────────────────────────────────────────
        print("\nreal data in the templates")
        live = await site(a, route="product", slug=a["product_slug"])
        check("a product page carries that one product",
              live.get("templateType") == "product" and (live["data"]["product"] or {}).get("name") == "Tee a",
              str(live)[:300])
        live = await site(a, route="product", slug=b["product_slug"])
        check("brand B's product is not found on brand A's shop",
              live.get("notFound") is True and live["data"]["product"] is None)
        live = await site(a, route="collection", slug=f"nope-{RUN}")
        check("a missing collection is the not-found template", live.get("notFound") is True
              and live.get("templateType") == "not_found")
        live = await site(a, route="page", slug="about")
        check("a builder page renders with its title", (live.get("page") or {}).get("title") == "About us")
        live = await site(a, route="page", slug=f"nope-{RUN}")
        check("a page that does not exist is not found", live.get("notFound") is True)
        live = await site(a)
        menus = live["data"]["menus"]
        main_items = menus.get(str(a["menu"])) or []
        check("the header's menu comes back with its submenu intact",
              main_items and main_items[0].get("children") and main_items[0]["children"][0]["label"] == "Hoodies",
              str(menus)[:300])
        await sql("DELETE FROM tenant_menus WHERE id = :i", {"i": str(a["menu"])})
        live = await site(a)
        check("a menu deleted after publishing renders nothing, and the page still renders",
              live.get("mode") == "visual_builder" and str(a["menu"]) not in live["data"]["menus"])
        check("only the fonts the site uses are sent",
              [f["family"] for f in live["fonts"]["google"]] == ["Inter"] and live["fonts"]["custom"] == [])

        # ── 7. And back ──────────────────────────────────────────────────────
        print("\nswitching back")
        r = await client.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "legacy"})
        check("the owner can switch back to the imported theme", r.status_code == 200)
        check("the storefront says legacy again", await site(a) == {"mode": "legacy"})
        check("the imported theme renders byte for byte as it did before any of this",
              (await theme_home(a))[1] == home0)
        check("its row was never touched", await theme_row(a) == row0)

    print(f"\n{ok} passed, {fail} failed")
    return fail


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
