"""The visual builder, end to end, against a real database.

The first group is the one that matters most: a shop that has not switched to
the builder must be told exactly what it was told before — byte for byte —
through every step of somebody opening the builder, editing, publishing, right
up until that brand's own admin switches its render mode, and again the moment
they switch back.

(These once also held an imported HTML theme byte for byte. Imported themes
are gone; what a shop is told about itself is what is left to hold.)

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


async def make_brand(label):
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
    token = create_access_token(subject=str(uid), extra_claims={
        "tenant_id": str(tid), "role": "tenant_admin", "is_admin": True, "is_platform_admin": False,
    })
    return {"tid": tid, "slug": slug, "token": token, "product": pid, "product_slug": f"tee-{label}-{RUN}",
            "menu": mid}


async def main():
    a = await make_brand("a")
    b = await make_brand("b")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        def pub(brand):
            return {"X-Tenant-Slug": brand["slug"]}

        def adm(brand):
            return {"X-Tenant-Slug": brand["slug"], "Authorization": f"Bearer {brand['token']}"}

        async def told(brand):
            """What every storefront page is told about the shop it is drawing."""
            return (await client.get("/api/v1/storefront/theme-active", headers=pub(brand))).text

        async def site(brand, **params):
            r = await client.get("/api/v1/storefront/site", headers=pub(brand), params=params)
            return r.json()

        def heading_text(doc):
            return doc["templates"]["home"]["default"]["tree"]["children"][0]["children"][0]["children"][0][
                "children"][0]["props"]["text"]

        def set_heading(doc, value):
            doc["templates"]["home"]["default"]["tree"]["children"][0]["children"][0]["children"][0][
                "children"][0]["props"]["text"] = value

        # ── 1. A shop that has not switched is untouched ─────────────────────
        print("a shop that has not switched is told exactly what it was")
        active0 = await told(a)
        first = json.loads(active0)
        check("a shop is told whose it is, and nothing about a builder or a theme",
              first.get("brand") == "Brand a" and "builder" not in first
              and first.get("active") is False and first.get("chrome") is None, active0[:200])
        gone = [(await client.get(f"/api/v1/storefront/theme/{path}", headers=pub(a))).status_code
                for path in ("home", f"product/{a['product_slug']}")]
        check("the imported theme's own pages are not served any more", gone == [404, 404], gone)
        check("the storefront asks and is told: legacy", await site(a) == {"mode": "legacy"})

        r = await client.get("/api/v1/admin/storefront/builder", headers=adm(a))
        state = r.json()
        check("opening the builder makes a draft", r.status_code == 200 and state.get("draft"), r.text[:200])
        check("opening the builder does not switch the storefront", state.get("mode") == "legacy")
        check("…and the storefront still says legacy", await site(a) == {"mode": "legacy"})
        check("…and it is told byte for byte the same", await told(a) == active0)

        draft = state["draft"]
        set_heading(draft, "Published heading v1")
        r = await client.put("/api/v1/admin/storefront/builder/draft", headers=adm(a),
                             json={"draft": draft, "revision": state["revision"]})
        rev = r.json().get("revision")
        check("a draft saves", r.status_code == 200, r.text[:200])

        r = await client.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={"note": "first"})
        check("the draft publishes", r.status_code == 200 and r.json().get("version") == 1, r.text[:300])
        check("publishing does not switch the storefront", await site(a) == {"mode": "legacy"})
        check("…and it is still told byte for byte the same", await told(a) == active0)

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

        # Which kind of shop this is — what the product page uses to decide whether
        # the older "Theme template" card still has a job to do.
        check("a shop switched to the builder, with a site published, is told the builder is live",
              st.get("builderLive") is True and st["mode"] == "visual_builder", str({k: st.get(k) for k in ("builderLive", "mode")}))
        other = (await choice(b, "product", b["product"])).json()
        check("a shop that opened the builder but has not switched to it is told it is not",
              other.get("available") is True and other.get("builderLive") is False and other["mode"] == "legacy"
              and other["live"] is None, str({k: other.get(k) for k in ("available", "builderLive", "mode", "live")}))

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
        check("a shop that never opened the builder is told there is nothing to choose, and that the builder is not live",
              r.status_code == 200 and r.json() == {"available": False, "builderLive": False} and r2.status_code == 404,
              f"{r.text[:100]} {r2.status_code}")
        check("…and asking does not make it a site", made[0][0] == 0, made)

        await sql("DELETE FROM collections WHERE id = :i", {"i": str(cid3)})
        await client.put(f"{BUILDER}/draft", headers=adm(a), json={"draft": assigned, "revision": None})
        await client.post(f"{BUILDER}/publish", headers=adm(a), json={})

        # ── 6e. The header's search finds this shop's real products ──────────
        print("")
        print("search on a builder shop")
        made: list[str] = []

        async def product(brand, name, *, status="active", code=None, short=None, vendor=None, tags=None,
                          price=None, image=None, ptype=None):
            pid = uuid.uuid4()
            await sql("INSERT INTO products (id, tenant_id, name, slug, status, moq, pricing_mode, gang_sheet_enabled, "
                      "product_code, short_description, vendor, tags, product_type) "
                      "VALUES (:i, :t, :n, :s, :st, 1, 'variant', false, :c, :sh, :v, :tg, :pt)",
                      {"i": str(pid), "t": str(brand["tid"]), "n": name, "s": f"srch-{uuid.uuid4().hex[:10]}",
                       "st": status, "c": code, "sh": short, "v": vendor, "tg": tags, "pt": ptype})
            made.append(str(pid))
            vid = None
            if price is not None:
                vid = uuid.uuid4()
                await sql("INSERT INTO product_variants (id, tenant_id, product_id, sku, color, size, retail_price, "
                          "status, sort_order) VALUES (:i, :t, :p, :sku, 'Black', 'M', :pr, 'active', 0)",
                          {"i": str(vid), "t": str(brand["tid"]), "p": str(pid), "sku": f"SK-{uuid.uuid4().hex[:8]}", "pr": price})
            if image:
                await sql("INSERT INTO product_images (id, tenant_id, product_id, url_thumbnail, url_medium, url_large, "
                          "is_primary, sort_order) VALUES (gen_random_uuid(), :t, :p, :u, :u, :u, true, 0)",
                          {"t": str(brand["tid"]), "p": str(pid), "u": image})
            return pid, vid

        hoodie, hoodie_variant = await product(a, "Harbor Pullover Hoodie", code="HPH-880", price=38,
                                               short="Brushed fleece, kangaroo pocket", vendor="Northwind Mills",
                                               tags=["winter", "heavyweight"], image="https://img.example/hoodie.jpg",
                                               ptype="Outerwear")
        await product(a, "Harbor Cap", code="HC-12", price=22)
        await product(a, "Hoodie Strings (spare)", price=3)
        await product(a, "100% Cotton Sample", price=1)
        await product(a, "Harbor Draft Jacket", status="draft", price=60)
        await product(a, "Harbor Retired Vest", status="archived", price=40)
        zebra_b, zebra_b_variant = await product(b, "Zebra Windbreaker", code="ZB-1", price=55, short="Harbor edition")
        for n in range(27):
            await product(a, f"Bulkline Sticker {n:02d}", price=2)

        async def search(q):
            r = await site(a, route="search", q=q)
            cards = next(iter(r["data"]["grids"].values()), [])
            return [c["title"] for c in cards], (r["data"].get("search") or {}), cards

        titles, found, cards = await search("hoodie")
        check("a search finds this shop's products by name", set(titles) == {"Harbor Pullover Hoodie", "Hoodie Strings (spare)"}
              and found.get("total") == 2 and found.get("query") == "hoodie", f"{titles} {found}")
        check("a name that starts with the words comes first", titles[:1] == ["Hoodie Strings (spare)"], titles)
        card = next(c for c in cards if c["title"] == "Harbor Pullover Hoodie")
        check("each result is a real product card: its picture, its price, the page it opens",
              card["image"] == "https://img.example/hoodie.jpg" and "38" in card["price"]
              and card["url"].startswith("/products/srch-"), str(card))
        opened = await site(a, route="product", slug=card["url"].rsplit("/", 1)[-1])
        check("…and that page is the product", (opened["data"]["product"] or {}).get("name") == "Harbor Pullover Hoodie"
              and opened.get("notFound") is False)

        for q, why in (("HPH-880", "its product code"), ("hph", "part of its code, in any case"),
                       ("fleece", "a word from its short description"), ("northwind mills", "its brand"),
                       ("heavyweight", "one of its tags"), ("outerwear", "its type"),
                       ("hoodie harbor", "its words in another order"), ("  HARBOR   pullover ", "capitals and stray spaces")):
            titles, found, _c = await search(q)
            check(f"…and by {why}", "Harbor Pullover Hoodie" in titles and found.get("total", 0) >= 1, f"{q!r} -> {titles}")

        titles, found, _c = await search("harbor")
        check("a product that is not on sale is never found — draft or archived",
              set(titles) == {"Harbor Pullover Hoodie", "Harbor Cap"} and found["total"] == 2, f"{titles} {found}")
        titles, found, _c = await search("zebra")
        check("another shop's product is never found, whatever is typed", titles == [] and found["total"] == 0, f"{titles} {found}")
        titles, found, _c = await search("windbreaker ZB-1 harbor edition")
        check("…by any of its words", titles == [] and found["total"] == 0, str(titles))
        r = await client.get("/api/v1/admin/storefront/builder/preview", headers=adm(b), params={"route": "search", "q": "zebra"})
        own = [c["title"] for c in next(iter(r.json()["data"]["grids"].values()), [])]
        check("…while its own shop finds it", own == ["Zebra Windbreaker"], str(own))

        titles, found, _c = await search("zzzz-nothing")
        check("a search that matches nothing says so: no products, a total of none, the words asked for",
              titles == [] and found == {"query": "zzzz-nothing", "total": 0, "shown": 0}, f"{titles} {found}")
        titles, found, _c = await search("")
        check("an empty search finds nothing rather than everything", titles == [] and found.get("total") == 0, f"{titles} {found}")
        titles, found, _c = await search("100%")
        check("a % typed by a shopper is a %, not a wildcard for the whole catalogue",
              titles == ["100% Cotton Sample"] and found["total"] == 1, f"{titles} {found}")
        titles, found, _c = await search("_")
        check("…and so is an underscore", titles == [] and found["total"] == 0, f"{titles} {found}")
        titles, found, _c = await search("' OR 1=1 --")
        check("…and nothing typed is ever run as a query", titles == [] and found["total"] == 0, f"{titles} {found}")
        titles, found, _c = await search("bulkline sticker")
        check("a search with more matches than fit shows the first of them and says how many there are",
              len(titles) == 24 and found["total"] == 27 and found["shown"] == 24
              and titles == sorted(titles), f"{len(titles)} {found}")
        home = await site(a, route="home")
        check("a page with no search on it runs no search", home["data"].get("search") is None)

        # ── 6e-2. Suggestions while typing ───────────────────────────────────
        print("")
        print("suggestions under the search box")

        async def suggest(brand, q):
            r = await client.get("/api/v1/storefront/search/suggest", headers=pub(brand), params={"q": q})
            return r.status_code, r.json()

        gang_pid, _v = await product(a, "Custom DTF Gang Sheet", price=None)
        await sql("UPDATE products SET gang_sheet_enabled = true, gang_sheet_type = NULL WHERE id = :i", {"i": str(gang_pid)})
        upload_pid, _v = await product(a, "Gang Sheet Upload By Size", price=None)
        await sql("UPDATE products SET gang_sheet_enabled = true, gang_sheet_type = 'upload_by_size' WHERE id = :i",
                  {"i": str(upload_pid)})
        status, got = await suggest(a, "gang")
        by_title = {i["title"]: i for i in got.get("items", [])}
        check("typing 'gang' suggests the shop's gang sheet products", status == 200
              and set(by_title) == {"Custom DTF Gang Sheet", "Gang Sheet Upload By Size"} and got["total"] == 2, str(got)[:300])
        check("…a gang sheet made in the builder opens the builder itself",
              by_title.get("Custom DTF Gang Sheet", {}).get("url") == f"/gang-sheets?product={gang_pid}"
              and by_title["Custom DTF Gang Sheet"]["builder"] is True, str(by_title.get("Custom DTF Gang Sheet")))
        check("…one ordered by uploading opens its own page, where the upload is",
              by_title.get("Gang Sheet Upload By Size", {}).get("url", "").startswith("/products/srch-")
              and by_title["Gang Sheet Upload By Size"]["builder"] is False, str(by_title.get("Gang Sheet Upload By Size")))
        status, got = await suggest(a, "hoodie")
        hood = next((i for i in got["items"] if i["title"] == "Harbor Pullover Hoodie"), {})
        check("a suggestion is a real card: picture, price, the product's page",
              hood.get("image") == "https://img.example/hoodie.jpg" and "38" in hood.get("price", "")
              and hood.get("url", "").startswith("/products/srch-"), str(hood))
        check("…found the way the search page finds them, in the same order",
              [i["title"] for i in got["items"]] == (await search("hoodie"))[0], str(got["items"])[:200])
        _s, got = await suggest(a, "bulkline")
        check("only the best few are suggested, with how many there are in all",
              len(got["items"]) == 6 and got["total"] == 27, f"{len(got['items'])} {got['total']}")
        _s, got = await suggest(a, "h")
        check("one letter suggests nothing yet", got["items"] == [] and got["total"] == 0, str(got))
        _s, got = await suggest(a, "harbor")
        check("a product not on sale is never suggested",
              {i["title"] for i in got["items"]} == {"Harbor Pullover Hoodie", "Harbor Cap"}, str(got["items"])[:200])
        _s, got = await suggest(a, "zebra")
        check("another shop's product is never suggested", got["items"] == [] and got["total"] == 0, str(got))
        _s, got = await suggest(b, "zebra")
        check("…and a shop not on the builder yet still gets suggestions — a draft's preview needs them",
              [i["title"] for i in got["items"]] == ["Zebra Windbreaker"], str(got))
        _s, got = await suggest(a, "' OR 1=1 --")
        check("nothing typed is ever run as a query", got["items"] == [], str(got))

        # ── 6e-3. All products ────────────────────────────────────────────────
        print("")
        print("all products on a builder shop")
        on_sale = [r[0] for r in await sql(
            "SELECT name FROM products WHERE tenant_id = :t AND status = 'active' ORDER BY created_at DESC, id",
            {"t": str(a["tid"])}, fetch=True)]
        everything = await site(a, route="products")
        cp = everything["data"]["collectionPage"] or {}
        check("/products is drawn with the shop's collection template, not the old catalogue",
              everything.get("templateType") == "collection" and everything.get("notFound") is False
              and '"collection_products"' in json.dumps(everything.get("template")), str(everything.get("templateType")))
        check("…called All products, with every product on sale counted",
              everything["data"]["collection"]["name"] == "All products" and cp.get("total") == len(on_sale),
              f"{cp.get('total')} vs {len(on_sale)}")
        check("…a page of them at a time, newest first, with more to load",
              [c["title"] for c in cp["items"]] == on_sale[:12] and cp["has_more"] is True, str([c["title"] for c in cp["items"]])[:200])
        last = await site(a, route="products", page=str(-(-len(on_sale) // 12)))
        titles = [c["title"] for c in last["data"]["collectionPage"]["items"]]
        check("Load more to the end shows every product on sale and nothing else",
              titles == on_sale and last["data"]["collectionPage"]["has_more"] is False
              and not {"Harbor Draft Jacket", "Harbor Retired Vest", "Zebra Windbreaker"} & set(titles), f"{len(titles)}")
        named = await site(a, route="products", sort="name")
        titles = [c["title"] for c in named["data"]["collectionPage"]["items"]]
        by_name = [r[0] for r in await sql(
            "SELECT name FROM products WHERE tenant_id = :t AND status = 'active' ORDER BY name, id LIMIT 12",
            {"t": str(a["tid"])}, fetch=True)]
        check("sorted by name, A to Z", titles == by_name, f"{titles[:4]} vs {by_name[:4]}")
        huge = await site(a, route="products", page="500")
        check("a far-off page asks for no more than there is", huge["data"]["collectionPage"]["total"] == len(on_sale)
              and len(huge["data"]["collectionPage"]["items"]) == len(on_sale))

        cat_parent, cat_child, cat_other = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        await sql("INSERT INTO categories (id, tenant_id, name, slug, sort_order, is_active, description) "
                  "VALUES (:i, :t, 'Hoodies', :s, 0, true, 'Warm ones')",
                  {"i": str(cat_parent), "t": str(a["tid"]), "s": f"hoodies-{RUN}"})
        await sql("INSERT INTO categories (id, tenant_id, name, slug, sort_order, is_active, parent_id) "
                  "VALUES (:i, :t, 'Zip hoodies', :s, 0, true, :p)",
                  {"i": str(cat_child), "t": str(a["tid"]), "s": f"zip-hoodies-{RUN}", "p": str(cat_parent)})
        await sql("INSERT INTO categories (id, tenant_id, name, slug, sort_order, is_active) "
                  "VALUES (:i, :t, 'Windbreakers', :s, 0, true)",
                  {"i": str(cat_other), "t": str(b["tid"]), "s": f"windbreakers-{RUN}"})
        cap_id = (await sql("SELECT id FROM products WHERE tenant_id = :t AND name = 'Harbor Cap'",
                            {"t": str(a["tid"])}, fetch=True))[0][0]
        for pid, cid, tid in ((hoodie, cat_parent, a["tid"]), (cap_id, cat_child, a["tid"]),
                              (zebra_b, cat_other, b["tid"])):
            await sql("INSERT INTO product_categories (id, tenant_id, product_id, category_id) "
                      "VALUES (gen_random_uuid(), :t, :p, :c)", {"t": str(tid), "p": str(pid), "c": str(cid)})
        old_link = await site(a, route="products", slug=f"hoodies-{RUN}")
        titles = {c["title"] for c in old_link["data"]["collectionPage"]["items"]}
        check("an old /products?category= link still means that category, and the ones under it",
              old_link["data"]["collection"]["name"] == "Hoodies" and titles == {"Harbor Pullover Hoodie", "Harbor Cap"}
              and old_link["data"]["collection"]["description"] == "Warm ones", f"{titles}")
        gone = await site(a, route="products", slug=f"windbreakers-{RUN}")
        check("another shop's category is no category here", gone.get("notFound") is True)
        gone = await site(a, route="products", slug=f"nope-{RUN}")
        check("a category that does not exist is the shop's page-not-found", gone.get("notFound") is True
              and gone.get("templateType") == "not_found")
        r = await client.get("/api/v1/admin/storefront/builder/preview", headers=adm(a), params={"route": "products"})
        check("the draft's preview draws All products too", r.status_code == 200
              and r.json()["data"]["collection"]["name"] == "All products")

        # ── 6f. One cart, and it belongs to the shop ─────────────────────────
        print("")
        print("the cart on a builder shop")

        async def customer(brand):
            cid, uid = uuid.uuid4(), uuid.uuid4()
            await sql("INSERT INTO companies (id, tenant_id, name, status) VALUES (:i, :t, :n, 'active')",
                      {"i": str(cid), "t": str(brand["tid"]), "n": f"Shopper {uuid.uuid4().hex[:6]}"})
            await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, "
                      "is_admin, is_active, email_verified) VALUES (:i, :t, :e, 'x', 'Sam', 'Shopper', 'buyer', "
                      "false, true, true)", {"i": str(uid), "t": str(brand["tid"]), "e": f"shop-{uuid.uuid4().hex[:8]}@example.com"})
            token = create_access_token(subject=str(uid), extra_claims={
                "tenant_id": str(brand["tid"]), "role": "buyer", "is_admin": False, "is_platform_admin": False,
                "company_id": str(cid), "account_type": "retail"})
            return {"X-Tenant-Slug": brand["slug"], "Authorization": f"Bearer {token}"}, cid

        buyer_a, company_a = await customer(a)
        buyer_b, company_b = await customer(b)
        cap, cap_variant = await product(a, "Cart Test Cap", price=22)

        r = await client.post("/api/v1/cart/add-matrix", headers=buyer_a,
                              json={"product_id": str(hoodie), "items": [{"variant_id": str(hoodie_variant), "quantity": 2}]})
        cart = r.json()
        line = (cart.get("items") or [{}])[0]
        check("the product found by search goes into the shop's own cart: that variant, that quantity, that price",
              r.status_code == 200 and len(cart["items"]) == 1 and line["variant_id"] == str(hoodie_variant)
              and line["quantity"] == 2 and float(line["unit_price"]) == 38 and float(line["line_total"]) == 76
              and line["color"] == "Black" and line["size"] == "M", r.text[:300])
        r = await client.post("/api/v1/cart/add-matrix", headers=buyer_a,
                              json={"product_id": str(cap), "items": [{"variant_id": str(cap_variant), "quantity": 1}]})
        cart = r.json()
        check("a second product joins it and the total is the sum",
              len(cart["items"]) == 2 and float(cart["subtotal"]) == 98 and cart["total_units"] == 3, r.text[:300])

        r = await client.post("/api/v1/cart/add-matrix", headers=buyer_a,
                              json={"product_id": str(zebra_b), "items": [{"variant_id": str(zebra_b_variant), "quantity": 1}]})
        after = (await client.get("/api/v1/cart", headers=buyer_a)).json()
        check("another shop's product cannot be put in this shop's cart",
              r.status_code in (400, 404, 422) and len(after["items"]) == 2 and float(after["subtotal"]) == 98,
              f"{r.status_code} {r.text[:200]}")
        r = await client.post("/api/v1/cart/add-configured", headers=buyer_a,
                              json={"product_id": str(zebra_b), "selections": {}, "quantity": 1})
        check("…by either way of adding", r.status_code in (400, 404, 422), f"{r.status_code} {r.text[:200]}")

        hoodie_line = next(i for i in after["items"] if i["variant_id"] == str(hoodie_variant))
        r = await client.patch(f"/api/v1/cart/items/{hoodie_line['id']}", headers=buyer_a, json={"quantity": 5})
        cart = r.json()
        check("changing a quantity re-totals the cart on the server",
              r.status_code == 200 and float(cart["subtotal"]) == 5 * 38 + 22 and cart["total_units"] == 6, r.text[:300])
        other = (await client.get("/api/v1/cart", headers=buyer_b)).json()
        check("another shop's customer has a cart of their own, and this one's lines are not in it",
              other["items"] == [] and float(other["subtotal"]) == 0, str(other)[:200])
        r = await client.patch(f"/api/v1/cart/items/{hoodie_line['id']}", headers=buyer_b, json={"quantity": 99})
        r2 = await client.delete(f"/api/v1/cart/items/{hoodie_line['id']}", headers=buyer_b)
        still = (await client.get("/api/v1/cart", headers=buyer_a)).json()
        # Removing is "make sure this is not in my cart": for a line that was never
        # theirs it removes nothing and answers with their own cart, still empty.
        check("…and can neither change nor remove a line in this one",
              r.status_code in (403, 404)
              and (r2.status_code in (403, 404) or r2.json().get("items") == [])
              and [(i["id"], i["quantity"]) for i in still["items"] if i["id"] == hoodie_line["id"]] == [(hoodie_line["id"], 5)]
              and len(still["items"]) == 2 and float(still["subtotal"]) == 5 * 38 + 22,
              f"{r.status_code} {r2.status_code} {r2.text[:120]} {str(still)[:160]}")
        cap_line = next(i for i in still["items"] if i["variant_id"] == str(cap_variant))
        r = await client.delete(f"/api/v1/cart/items/{cap_line['id']}", headers=buyer_a)
        cart = r.json()
        check("removing a line takes it out and re-totals",
              r.status_code == 200 and [i["variant_id"] for i in cart["items"]] == [str(hoodie_variant)]
              and float(cart["subtotal"]) == 190, r.text[:300])
        again = (await client.get("/api/v1/cart", headers=buyer_a)).json()
        check("the cart is the same when asked for again — it lives on the server, not in the page",
              [(i["variant_id"], i["quantity"]) for i in again["items"]] == [(str(hoodie_variant), 5)], str(again)[:200])
        r = await client.get("/api/v1/cart")
        check("a cart is never served without a signed-in customer", r.status_code in (401, 403), r.status_code)

        await sql("DELETE FROM cart_items WHERE company_id IN (:a, :b)", {"a": str(company_a), "b": str(company_b)})
        await sql("DELETE FROM products WHERE CAST(id AS text) = ANY(:ids)", {"ids": made + [str(cap)]})

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
        check("the owner can switch the shop off the builder", r.status_code == 200)
        check("the storefront says legacy again", await site(a) == {"mode": "legacy"})
        back = (await client.get("/api/v1/admin/storefront/builder/assignment", headers=adm(a),
                                 params={"kind": "product", "id": str(a["product"])})).json()
        check("and its product page is told the builder is no longer what shoppers see",
              back.get("available") is True and back.get("builderLive") is False and back["mode"] == "legacy"
              and back["live"] is not None, str({k: back.get(k) for k in ("available", "builderLive", "mode")}))
        check("and it is told exactly what it was before the builder", await told(a) == active0)

    print(f"\n{ok} passed, {fail} failed")
    return fail


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
