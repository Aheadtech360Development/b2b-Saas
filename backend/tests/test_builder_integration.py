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
        active0 = (await client.get("/api/v1/storefront/theme-active", headers=pub(a))).text
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
        menu_node = broken["parts"]["header"]["children"][0]["children"][1]
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
        cross["parts"]["header"]["children"][0]["children"][1]["props"]["menuId"] = str(b["menu"])
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

        # ── 6b. The chrome on its own, and markup made safe ────────────────
        print("\nchrome, and markup made safe on the way out")
        live = await site(a, route="chrome")
        check("the chrome route is the header and footer alone, for pages the builder does not draw",
              live.get("templateType") == "chrome" and live.get("template") is None
              and live["parts"].get("header") and live["parts"].get("footer") and not live.get("notFound"),
              str(live)[:300])

        def find(tree, nid):
            if not isinstance(tree, dict):
                return None
            if tree.get("id") == nid:
                return tree
            for child in tree.get("children") or []:
                hit = find(child, nid)
                if hit:
                    return hit
            return None

        unsafe = json.loads(json.dumps(draft))
        unsafe["pages"]["about"]["tree"]["children"].append({"id": "hx1", "type": "html", "props": {
            "html": '<p onclick="steal()">Hi</p><script>steal()</script><a href="javascript:steal()">x</a>',
            "css": "p { color: red } @import url(https://evil.test/x.css); h2 { position: fixed }"}})
        unsafe["pages"]["about"]["tree"]["children"].append({"id": "rt1", "type": "rich_text", "props": {
            "html": '<p>Fine <strong>bold</strong></p><img src="x" onerror="steal()">'}})
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": unsafe, "revision": None})
        r = await client.get("/api/v1/admin/storefront/builder/preview", headers=adm(a),
                             params={"route": "page", "slug": "about"})
        tree = (r.json().get("page") or {}).get("tree")
        html_node = find(tree, "hx1") or {}
        out_html = (html_node.get("props") or {}).get("html", "")
        out_css = (html_node.get("props") or {}).get("css", "")
        check("custom HTML reaches the page without its script, handlers or javascript: links",
              "Hi" in out_html and "<script" not in out_html and "onclick" not in out_html
              and "javascript:" not in out_html, out_html)
        check("its CSS is confined to its own block, with @import and fixed positioning gone",
              out_css.startswith('.bsite [data-b="hx1"] p') and "@import" not in out_css
              and "evil.test" not in out_css and "fixed" not in out_css, out_css)
        rich = ((find(tree, "rt1") or {}).get("props") or {}).get("html", "")
        check("rich text keeps its formatting and loses its handlers",
              "<strong>bold</strong>" in rich and "onerror" not in rich, rich)
        r = await client.get("/api/v1/admin/storefront/builder", headers=adm(a))
        check("the draft still holds what the merchant typed, so the editor can show it back",
              "<script>steal()</script>" in json.dumps(r.json()["draft"]))
        r = await client.get("/api/v1/admin/storefront/builder/preview", headers=adm(a),
                             params={"route": "product", "slug": a["product_slug"], "template": "minimal"})
        check("the preview can show a template other than the assigned one",
              r.json().get("templateId") == "minimal", str(r.json().get("templateId")))
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": draft, "revision": None})

        # ── 6c. A product with a template of its own ─────────────────────────
        print("")
        print("product-specific templates")
        pid2 = uuid.uuid4()
        await sql("INSERT INTO products (id, tenant_id, name, slug, status, moq, pricing_mode, gang_sheet_enabled) "
                  "VALUES (:i, :t, 'Second tee', :s, 'active', 1, 'variant', false)",
                  {"i": str(pid2), "t": str(a["tid"]), "s": f"second-{RUN}"})
        assigned = json.loads(json.dumps(draft))
        assigned["assignments"]["product"]["byId"] = {str(a["product"]): "minimal"}

        def unmenu(node):
            # The menu was deleted in step 6; a draft that still shows it cannot publish.
            if isinstance(node, dict):
                if node.get("type") == "menu":
                    node.setdefault("props", {})["menuId"] = ""
                for child in node.get("children") or []:
                    unmenu(child)

        for part in assigned["parts"].values():
            unmenu(part)
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": assigned, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("a draft giving one product its own template publishes", r.status_code == 200, r.text[:200])
        live = await site(a, route="product", slug=a["product_slug"])
        check("that product renders with its own template", live.get("templateId") == "minimal", live.get("templateId"))
        live = await site(a, route="product", slug=f"second-{RUN}")
        check("every other product keeps the default template", live.get("templateId") == "default", live.get("templateId"))

        cross = json.loads(json.dumps(assigned))
        cross["assignments"]["product"]["byId"][str(b["product"])] = "minimal"
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": cross, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/validate", headers=adm(a))
        flagged = [i for i in r.json()["issues"] if i["code"] == "missing_product" and str(b["product"]) in i["path"]]
        check("another brand's product in an assignment is flagged as not this shop's", bool(flagged), r.text[:300])
        live = await site(a, route="product", slug=b["product_slug"])
        check("…and naming it never shows brand B's product on brand A's shop",
              live.get("notFound") is True and live["data"]["product"] is None)

        gone = json.loads(json.dumps(assigned))
        gone["assignments"]["product"]["byId"] = {str(a["product"]): "deleted_one"}
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": gone, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("an assignment to a template that is gone blocks the publish", r.status_code == 422, r.text[:200])
        # A published version from before a template was removed still renders.
        await sql("UPDATE builder_versions SET document = jsonb_set(document, '{assignments,product,byId}', "
                  "CAST(:j AS jsonb)) WHERE id = (SELECT published_version_id FROM builder_sites WHERE tenant_id = :t)",
                  {"j": json.dumps({str(a["product"]): "deleted_one"}), "t": str(a["tid"])})
        # Versions never change once written, so the server keeps them in memory;
        # this test rewrites one behind its back, so it forgets them first.
        from app.services.builder import site as _site_svc
        _site_svc._DOCS.clear()
        _site_svc._DOCS_BYTES[0] = 0
        live = await site(a, route="product", slug=a["product_slug"])
        check("a product pointing at a template that is gone falls back to the default",
              live.get("templateId") == "default" and (live["data"]["product"] or {}).get("name") == "Tee a",
              live.get("templateId"))

        # ── 6c-2. Two products, two different pages ──────────────────────────
        print("")
        print("different products, different templates")

        def node(ntype, props=None, children=None):
            n = {"id": "t" + uuid.uuid4().hex[:10], "type": ntype, "props": props or {}}
            if children is not None:
                n["children"] = children
            return n

        def fresh(tree):
            copy = json.loads(json.dumps(tree))

            def walk(n):
                n["id"] = "t" + uuid.uuid4().hex[:10]
                for c in n.get("children") or []:
                    walk(c)
            walk(copy)
            return copy

        def texts(payload):
            return json.dumps(payload.get("template"))

        two = json.loads(json.dumps(assigned))
        apparel = fresh(two["templates"]["product"]["default"]["tree"])
        apparel["children"].append(node("section", {"width": "contained"}, [
            node("heading", {"text": "Why Lyfelyke", "level": 3}),
            node("product_rating", {"showCount": True, "hideEmpty": False}),
            node("product_reviews", {"heading": "Customer reviews", "limit": 2, "allowWrite": True}),
        ]))
        dtf = fresh(two["templates"]["product"]["minimal"]["tree"])
        dtf["children"].append(node("section", {"width": "contained"}, [
            node("heading", {"text": "How it works", "level": 3}),
            node("html", {"html": "<p class=\"best\">Best for small runs</p>", "css": ""}),
        ]))
        two["templates"]["product"]["apparel"] = {"name": "Apparel", "tree": apparel}
        two["templates"]["product"]["dtf"] = {"name": "DTF transfers", "tree": dtf}
        two["assignments"]["product"]["byId"] = {str(a["product"]): "apparel", str(pid2): "dtf"}

        # Reviews: two approved and one held back for the first product, and one
        # that belongs to another brand's product.
        for rating, body, approved, pid, tid in (
            (5, "Soft and true to size.", True, a["product"], a["tid"]),
            (4, "Prints came out bright.", True, a["product"], a["tid"]),
            (1, "HELD BACK - not approved", False, a["product"], a["tid"]),
            (2, "BRAND B ONLY review", True, b["product"], b["tid"]),
        ):
            await sql("INSERT INTO product_reviews (id, tenant_id, product_id, rating, body, reviewer_name, "
                      "is_verified, is_approved, source) VALUES (gen_random_uuid(), :t, :p, :r, :b, 'Sam', "
                      "true, :a, 'site')", {"t": str(tid), "p": str(pid), "r": rating, "b": body, "a": approved})

        # Two collections, one with a template of its own.
        cid1, cid2 = uuid.uuid4(), uuid.uuid4()
        for cid, name, cslug in ((cid1, "Apparel", f"apparel-{RUN}"), (cid2, "DTF", f"dtf-{RUN}")):
            await sql("INSERT INTO collections (id, tenant_id, name, slug, match_type, rules_match, rules, sort_by, "
                      "is_active, position) VALUES (:i, :t, :n, :s, 'manual', 'all', '[]'::jsonb, 'manual', true, 0)",
                      {"i": str(cid), "t": str(a["tid"]), "n": name, "s": cslug})
        dtf_coll = fresh(two["templates"]["collection"]["default"]["tree"])
        dtf_coll["children"].insert(0, node("section", {"width": "contained"}, [
            node("heading", {"text": "Transfers, ready to press", "level": 2}),
        ]))
        two["templates"]["collection"]["dtf_coll"] = {"name": "DTF collections", "tree": dtf_coll}
        two["assignments"]["collection"]["byId"] = {str(cid2): "dtf_coll"}

        r = await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                             json={"draft": two, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        check("a site with two product templates and two collection templates publishes",
              r.status_code == 200, r.text[:300])

        one = await site(a, route="product", slug=a["product_slug"])
        other = await site(a, route="product", slug=f"second-{RUN}")
        check("the first product is drawn with the Apparel template",
              one.get("templateId") == "apparel" and "Why Lyfelyke" in texts(one), one.get("templateId"))
        check("…and has none of the other template's content",
              "How it works" not in texts(one) and "Best for small runs" not in texts(one))
        check("the second product is drawn with the DTF template",
              other.get("templateId") == "dtf" and "How it works" in texts(other), other.get("templateId"))
        check("…and has none of the first one's content",
              "Why Lyfelyke" not in texts(other) and "product_reviews" not in texts(other))
        check("both still carry the product's own data, from the product itself",
              one["data"]["product"]["name"] == "Tee a" and other["data"]["product"]["name"] == "Second tee")
        check("both templates still place the real buy box",
              '"product_buy"' in texts(one) and '"product_buy"' in texts(other))

        rv = one["data"].get("reviews") or {}
        bodies = " ".join(i["body"] for i in rv.get("items", []))
        check("a template that shows reviews gets the product's approved reviews",
              rv.get("total") == 2 and rv.get("avg") == 4.5 and len(rv.get("items", [])) == 2, str(rv)[:300])
        check("a review that is not approved never leaves the server", "HELD BACK" not in json.dumps(one))
        check("another brand's review never shows", "BRAND B ONLY" not in json.dumps(one) and "BRAND B" not in bodies)
        check("a template without reviews asks for none", other["data"].get("reviews") is None, str(other["data"].get("reviews")))

        coll1 = await site(a, route="collection", slug=f"apparel-{RUN}")
        coll2 = await site(a, route="collection", slug=f"dtf-{RUN}")
        check("a collection without a template of its own uses the default",
              coll1.get("templateId") == "default" and "Transfers, ready to press" not in texts(coll1), coll1.get("templateId"))
        check("a collection with its own template is drawn with it",
              coll2.get("templateId") == "dtf_coll" and "Transfers, ready to press" in texts(coll2), coll2.get("templateId"))
        check("each is still its own collection", coll1["data"]["collection"]["name"] == "Apparel"
              and coll2["data"]["collection"]["name"] == "DTF")

        r = await client.get("/api/v1/admin/storefront/builder/preview", headers=adm(a),
                             params={"route": "product", "slug": a["product_slug"], "template": "dtf"})
        check("the editor can preview any template with any product",
              r.json().get("templateId") == "dtf" and r.json()["data"]["product"]["name"] == "Tee a")

        out_of_place = json.loads(json.dumps(two))
        out_of_place["templates"]["home"]["default"]["tree"]["children"].append(
            node("section", {"width": "contained"}, [node("product_reviews", {"limit": 3})]))
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": out_of_place, "revision": None})
        r = await client.post("/api/v1/admin/storefront/builder/validate", headers=adm(a))
        check("reviews placed on a page that is not a product's are pointed out",
              any(i["code"] == "out_of_context" for i in r.json()["issues"]), r.text[:300])

        r = await client.post("/api/v1/admin/storefront/builder/products/lookup", headers=adm(a),
                              json={"ids": [str(a["product"]), str(pid2), str(b["product"]), "not-an-id"]})
        names = {row["id"]: row["name"] for row in r.json()}
        check("the editor can name the products a template is assigned to",
              r.status_code == 200 and names.get(str(a["product"])) == "Tee a" and names.get(str(pid2)) == "Second tee",
              r.text[:300])
        check("…and never another brand's product", str(b["product"]) not in names and len(names) == 2, str(names))
        r = await client.post("/api/v1/admin/storefront/builder/products/lookup", headers=pub(a),
                              json={"ids": [str(a["product"])]})
        check("…and only for a signed-in admin", r.status_code in (401, 403), r.status_code)

        await sql("DELETE FROM product_reviews WHERE product_id IN (:a, :b)",
                  {"a": str(a["product"]), "b": str(b["product"])})
        await sql("DELETE FROM collections WHERE id IN (:a, :b)", {"a": str(cid1), "b": str(cid2)})
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": assigned, "revision": None})
        await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})

        # ── 6c-3. The same choice, made from the product's own admin page ────
        print("")
        print("the Website template choice on a product's and a collection's admin page")
        BUILDER = "/api/v1/admin/storefront/builder"

        async def choice(brand, kind, rid, headers=None):
            return await client.get(f"{BUILDER}/assignment", headers=headers or adm(brand),
                                    params={"kind": kind, "id": str(rid)})

        async def choose(brand, kind, rid, template, headers=None):
            return await client.put(f"{BUILDER}/assignment", headers=headers or adm(brand),
                                    json={"kind": kind, "id": str(rid), "template": template})

        r = await choice(a, "product", pid2)
        st = r.json()
        check("the product page is told the templates there are, and the one this product has",
              r.status_code == 200 and st.get("available") is True
              and {t["id"] for t in st["templates"]} >= {"default", "minimal"}
              and st["assigned"] == "" and st["effective"] == "default" and st["defaultId"] == "default"
              and (st["live"] or {}).get("id") == "default" and st["pending"] is False, r.text[:300])
        rev0 = st["revision"]

        r = await choose(a, "product", pid2, "minimal")
        st = r.json()
        check("choosing one saves it to the draft", r.status_code == 200 and st["assigned"] == "minimal"
              and st["effective"] == "minimal", r.text[:300])
        check("…and says it is not live yet, and what shoppers see meanwhile",
              st["pending"] is True and st["live"]["id"] == "default" and st["live"]["name"] == "Default product", str(st["live"]))
        check("…as one more revision of the draft", st["revision"] == rev0 + 1, f"{rev0} -> {st['revision']}")
        by_id = (await client.get(BUILDER, headers=adm(a))).json()["draft"]["assignments"]["product"]["byId"]
        check("it is the assignment the builder's Templates panel makes, beside the ones already there",
              by_id == {str(a["product"]): "minimal", str(pid2): "minimal"}, str(by_id))
        live = await site(a, route="product", slug=f"second-{RUN}")
        check("shoppers still see what was published", live.get("templateId") == "default", live.get("templateId"))

        r = await client.put(f"{BUILDER}/draft", headers=adm(a), json={"draft": assigned, "revision": rev0})
        check("an editor left open in another tab is told the site changed, and cannot save over the choice",
              r.status_code == 409, r.status_code)
        r = await choose(a, "product", pid2, "minimal")
        check("choosing the same template again changes nothing", r.json()["revision"] == rev0 + 1, r.json()["revision"])

        r = await client.post(f"{BUILDER}/publish", headers=adm(a), json={})
        live = await site(a, route="product", slug=f"second-{RUN}")
        st = (await choice(a, "product", pid2)).json()
        check("after Publish shoppers see it, and the product page says it is live",
              r.status_code == 200 and live.get("templateId") == "minimal" and st["pending"] is False
              and st["live"]["id"] == "minimal", f"{r.status_code} {live.get('templateId')} {st}")

        st = (await choose(a, "product", pid2, "")).json()
        check("choosing Default takes the product's own template off — in the draft",
              st["assigned"] == "" and st["effective"] == "default" and st["pending"] is True
              and st["live"]["id"] == "minimal", str(st)[:300])
        live = await site(a, route="product", slug=f"second-{RUN}")
        check("…and again not for shoppers until the next publish", live.get("templateId") == "minimal")

        r = await choose(a, "product", pid2, "no_such_template")
        check("a template the draft does not have is refused, and nothing changes",
              r.status_code == 422 and (await choice(a, "product", pid2)).json()["assigned"] == "", r.text[:200])
        r = await choose(a, "product", b["product"], "minimal")
        r2 = await choice(a, "product", b["product"])
        by_id = (await client.get(BUILDER, headers=adm(a))).json()["draft"]["assignments"]["product"]["byId"]
        check("another brand's product can be neither given a template nor asked about",
              r.status_code == 404 and r2.status_code == 404 and str(b["product"]) not in by_id, f"{r.status_code} {r2.status_code}")
        r = await choice(a, "product", pid2, headers=pub(a))
        r2 = await choose(a, "product", pid2, "minimal", headers=pub(a))
        check("neither is open to anyone but a signed-in admin",
              r.status_code in (401, 403) and r2.status_code in (401, 403), f"{r.status_code} {r2.status_code}")
        r = await choice(a, "page", pid2)
        r2 = await choose(a, "page", pid2, "default")
        check("templates are chosen for products and collections, nothing else",
              r.status_code == 422 and r2.status_code == 422, f"{r.status_code} {r2.status_code}")

        # A collection, the same way.
        cid3 = uuid.uuid4()
        await sql("INSERT INTO collections (id, tenant_id, name, slug, match_type, rules_match, rules, sort_by, "
                  "is_active, position) VALUES (:i, :t, 'Transfers', :s, 'manual', 'all', '[]'::jsonb, 'manual', true, 0)",
                  {"i": str(cid3), "t": str(a["tid"]), "s": f"transfers-{RUN}"})
        with_alt = (await client.get(BUILDER, headers=adm(a))).json()["draft"]
        with_alt["templates"]["collection"]["alt"] = {
            "name": "Transfers layout", "tree": fresh(with_alt["templates"]["collection"]["default"]["tree"])}
        await client.put(f"{BUILDER}/draft", headers=adm(a), json={"draft": with_alt, "revision": None})
        st = (await choice(a, "collection", cid3)).json()
        check("the collection page lists the collection templates",
              [t["name"] for t in st["templates"]] == ["Default collection", "Transfers layout"] and st["assigned"] == "",
              str(st.get("templates")))
        st = (await choose(a, "collection", cid3, "alt")).json()
        check("a collection's template is chosen the same way, into the draft",
              st["assigned"] == "alt" and st["pending"] is True and st["live"]["id"] == "default", str(st)[:300])
        check("…and shoppers do not see it yet",
              (await site(a, route="collection", slug=f"transfers-{RUN}")).get("templateId") == "default")
        await client.post(f"{BUILDER}/publish", headers=adm(a), json={})
        check("…until the website is published",
              (await site(a, route="collection", slug=f"transfers-{RUN}")).get("templateId") == "alt"
              and (await choice(a, "collection", cid3)).json()["pending"] is False)

        # A brand that has never opened the builder has nothing to choose, and is not given a site by asking.
        c = await make_brand("c")
        r = await choice(c, "product", c["product"])
        r2 = await choose(c, "product", c["product"], "default")
        made = await sql("SELECT count(*) FROM builder_sites WHERE tenant_id = :t", {"t": str(c["tid"])}, fetch=True)
        check("a shop that never opened the builder is told there is nothing to choose",
              r.status_code == 200 and r.json() == {"available": False} and r2.status_code == 404, f"{r.text[:100]} {r2.status_code}")
        check("…and asking does not make it a site", made[0][0] == 0, made)

        await sql("DELETE FROM collections WHERE id = :i", {"i": str(cid3)})
        await client.put(f"{BUILDER}/draft", headers=adm(a), json={"draft": assigned, "revision": None})
        await client.post(f"{BUILDER}/publish", headers=adm(a), json={})

        await sql("DELETE FROM products WHERE id = :i", {"i": str(pid2)})

        # ── 6d. One request tells a page which shop it is drawing ────────────
        print("")
        print("builder answer folded into theme-active")
        r = await client.get("/api/v1/storefront/theme-active", headers=pub(a))
        body = r.json()
        check("a builder shop gets its header and footer with the theme answer",
              (body.get("builder") or {}).get("mode") == "visual_builder"
              and body["builder"].get("templateType") == "not_found" and body["builder"]["parts"].get("header")
              and body.get("chrome") is None, str(body)[:300])
        r = await client.get("/api/v1/storefront/theme-active", headers=pub(b))
        check("a shop not on the builder gets no builder answer at all", "builder" not in r.json(), r.text[:200])
        cart = await site(a, route="cart")
        check("the cart template places the shop's own cart",
              '"cart_items"' in json.dumps(cart.get("template")), str(cart.get("template"))[:200])
        await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                         json={"draft": draft, "revision": None})

        # ── 7. And back ──────────────────────────────────────────────────────
        print("\nswitching back")
        r = await client.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "legacy"})
        check("the owner can switch back to the imported theme", r.status_code == 200)
        check("the storefront says legacy again", await site(a) == {"mode": "legacy"})
        check("the imported theme renders byte for byte as it did before any of this",
              (await theme_home(a))[1] == home0)
        check("its row was never touched", await theme_row(a) == row0)
        check("and its theme-active answer is exactly what it was before the builder",
              (await client.get("/api/v1/storefront/theme-active", headers=pub(a))).text == active0)

    print(f"\n{ok} passed, {fail} failed")
    return fail


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
