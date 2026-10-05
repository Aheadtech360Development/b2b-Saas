"""The visual builder under attack, and under load it should survive.

Brand A's admin tries to reach brand B through every handle a request has:
the X-Tenant-Slug header, version and font ids, product, collection and menu
ids inside a draft, B's uploaded font family, B's shared section. Then the
publish path is pushed: concurrent publishes, concurrent saves on one
revision, a failure halfway through a publish, and a template built to make
one page view as expensive as possible.

Runs against the local test Postgres (docker at360-sec-test) only.
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
from sqlalchemy import event, text  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402

from app.core.config import get_settings  # noqa: E402

assert "localhost:55432/at360test" in get_settings().sync_db_url, "refusing: not the local test database"

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.core.tenant_context import set_bypass_scoping  # noqa: E402
from app.main import app  # noqa: E402
from app.services.builder import site as site_svc  # noqa: E402

RUN = uuid.uuid4().hex[:8]
ok = fail = 0
STATEMENTS = [0]


@event.listens_for(Engine, "before_cursor_execute")
def _count(conn, cursor, statement, params, context, many):
    if not statement.lstrip().upper().startswith(("SELECT SET_CONFIG", "SAVEPOINT", "RELEASE", "SET LOCAL", "ROLLBACK TO")):
        STATEMENTS[0] += 1


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
    tid, uid, pid, mid, cid = (uuid.uuid4() for _ in range(5))
    slug = f"sec-{label}-{RUN}"
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (:i,:s,:n,:e,'active','wholesale')",
              {"i": str(tid), "s": slug, "n": f"Sec {label}", "e": f"{slug}@example.com"})
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, is_admin, "
              "is_active, email_verified) VALUES (:i,:t,:e,'x','T','A','tenant_admin',true,true,true)",
              {"i": str(uid), "t": str(tid), "e": f"admin-{slug}@example.com"})
    await sql("INSERT INTO products (id, tenant_id, name, slug, status, moq, pricing_mode, gang_sheet_enabled) "
              "VALUES (:i,:t,:n,:s,'active',1,'variant',false)",
              {"i": str(pid), "t": str(tid), "n": f"Secret {label} product", "s": f"secret-{label}-{RUN}"})
    await sql("INSERT INTO collections (id, tenant_id, name, slug, is_active) VALUES (:i,:t,:n,:s,true)",
              {"i": str(cid), "t": str(tid), "n": f"Secret {label} collection", "s": f"secret-col-{label}-{RUN}"})
    await sql("INSERT INTO collection_products (tenant_id, collection_id, product_id) VALUES (:t,:c,:p)",
              {"t": str(tid), "c": str(cid), "p": str(pid)})
    await sql("INSERT INTO tenant_menus (id, tenant_id, name, items) VALUES (:i,:t,'Main',CAST(:j AS jsonb))",
              {"i": str(mid), "t": str(tid), "j": json.dumps([{"label": f"Secret {label} link", "href": "/x"}])})
    token = create_access_token(subject=str(uid), extra_claims={
        "tenant_id": str(tid), "role": "tenant_admin", "is_admin": True, "is_platform_admin": False})
    return {"tid": tid, "slug": slug, "token": token, "product": pid, "collection": cid, "menu": mid,
            "product_slug": f"secret-{label}-{RUN}"}


def section(*children):
    return {"id": f"s{uuid.uuid4().hex[:10]}", "type": "section", "props": {}, "children": list(children)}


def node(ntype, **props):
    return {"id": f"n{uuid.uuid4().hex[:10]}", "type": ntype, "props": props}


async def main():
    a = await make_brand("a")
    b = await make_brand("b")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as c:
        def adm(brand, slug=None):
            return {"X-Tenant-Slug": slug or brand["slug"], "Authorization": f"Bearer {brand['token']}"}

        def pub(brand):
            return {"X-Tenant-Slug": brand["slug"]}

        # Both brands open the builder; B publishes something with a secret in it.
        r = await c.get("/api/v1/admin/storefront/builder", headers=adm(a))
        draft_a, rev_a = r.json()["draft"], r.json()["revision"]
        r = await c.get("/api/v1/admin/storefront/builder", headers=adm(b))
        draft_b = r.json()["draft"]
        draft_b["templates"]["home"]["default"]["tree"]["children"].insert(0, section(node("heading", text=f"B-DRAFT-SECRET-{RUN}")))
        draft_b["globals"] = {"gsecret": {"name": "B secret", "tree": section(node("text", text=f"B-GLOBAL-SECRET-{RUN}"))}}
        await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(b), json={"draft": draft_b, "revision": None})
        r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(b), json={"note": "b1"})
        b_versions = r.json()["versions"]
        await c.put("/api/v1/admin/storefront/builder/mode", headers=adm(b), json={"mode": "visual_builder"})
        await sql("INSERT INTO builder_fonts (id, tenant_id, family, weight, style, format, url) "
                  "VALUES (gen_random_uuid(), :t, 'Secret B Sans', 400, 'normal', 'woff2', 'https://example.com/secret-b.woff2')",
                  {"t": str(b["tid"])})
        b_font = (await sql("SELECT CAST(id AS text) FROM builder_fonts WHERE tenant_id = :t", {"t": str(b["tid"])}, fetch=True))[0][0]

        print("headers and ids")
        r = await c.get("/api/v1/admin/storefront/builder", headers=adm(a, slug=b["slug"]))
        check("A's token with B's shop header still opens A's builder, not B's",
              r.status_code == 200 and f"B-DRAFT-SECRET-{RUN}" not in r.text, r.text[:120])
        r = await c.get("/api/v1/admin/storefront/builder/versions", headers=adm(a, slug=b["slug"]))
        check("…and lists A's versions only", all(v["id"] not in {x["id"] for x in b_versions} for v in r.json()))
        r = await c.post("/api/v1/admin/storefront/builder/rollback", headers=adm(a), json={"version_id": b_versions[0]["id"]})
        check("A cannot make B's version A's live version", r.status_code == 404, r.status_code)
        r = await c.delete(f"/api/v1/admin/storefront/builder/fonts/{b_font}", headers=adm(a))
        still = await sql("SELECT 1 FROM builder_fonts WHERE id = CAST(:i AS uuid)", {"i": b_font}, fetch=True)
        check("A cannot delete B's uploaded font", r.status_code == 404 and still, r.status_code)
        r = await c.get("/api/v1/admin/storefront/builder/fonts", headers=adm(a, slug=b["slug"]))
        check("A's font list never shows B's fonts", "Secret B Sans" not in r.text)
        r = await c.get("/api/v1/admin/storefront/builder/preview", headers={"X-Tenant-Slug": a["slug"]})
        check("the draft preview needs an admin token", r.status_code in (401, 403), r.status_code)
        r = await c.get("/api/v1/storefront/site", headers=pub(b))
        check("the public site shows what B published",
              f"B-DRAFT-SECRET-{RUN}" in r.text, r.text[:80])  # published above, so present
        await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(b), json={
            "draft": {**draft_b, "templates": {**draft_b["templates"], "home": {"default": {"name": "Home", "tree": section(node("heading", text=f"B-UNPUBLISHED-{RUN}"))}}}},
            "revision": None})
        r = await c.get("/api/v1/storefront/site", headers=pub(b))
        check("an unpublished edit never reaches the public site", f"B-UNPUBLISHED-{RUN}" not in r.text)
        r = await c.get("/api/v1/storefront/theme-active", headers=pub(b))
        check("…nor the builder answer folded into theme-active", f"B-UNPUBLISHED-{RUN}" not in r.text)

        print("")
        print("B's records named inside A's draft")
        probe = json.loads(json.dumps(draft_a))
        tree = probe["templates"]["home"]["default"]["tree"]
        tree["children"] = [section(
            node("product_grid", source="manual", productIds=[str(b["product"])], limit=8),
            node("product_grid", source="collection", collectionId=str(b["collection"]), limit=8),
            node("collection_grid", collectionIds=[str(b["collection"])], limit=4),
            node("menu", menuId=str(b["menu"])),
            node("global_ref", ref="gsecret"),
        )]
        probe["settings"]["fonts"] = [*probe["settings"].get("fonts", []), {"family": "Secret B Sans", "source": "custom", "weights": [400]}]
        r = await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": probe, "revision": rev_a})
        rev_a = r.json()["revision"]
        r = await c.get("/api/v1/admin/storefront/builder/preview", headers=adm(a))
        body = r.text
        check("B's product, collection and menu never appear in A's preview",
              "Secret b" not in body and f"secret-b-{RUN}" not in body, body[:200])
        check("B's shared section is not reachable by its id from A's site", f"B-GLOBAL-SECRET-{RUN}" not in body)
        check("B's uploaded font file is never handed to A's pages", "secret-b.woff2" not in body)
        r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        codes = {i["code"] for i in (r.json().get("detail") or {}).get("issues", [])} if r.status_code == 422 else set()
        check("…and a draft naming any of them cannot be published",
              r.status_code == 422 and {"missing_product", "missing_collection", "missing_menu", "missing_global", "font_missing"} <= codes,
              f"{r.status_code} {sorted(codes)}")

        print("")
        print("publishing under pressure")
        r = await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": draft_a, "revision": rev_a})
        rev_a = r.json()["revision"]

        async def numbers_of(brand):
            rows = await sql("SELECT number FROM builder_versions WHERE tenant_id = :t ORDER BY number",
                             {"t": str(brand["tid"])}, fetch=True)
            return [r[0] for r in rows]

        async def live_number(brand):
            rows = await sql("SELECT v.number FROM builder_sites s JOIN builder_versions v ON v.id = s.published_version_id "
                             "WHERE s.tenant_id = :t", {"t": str(brand["tid"])}, fetch=True)
            return rows[0][0] if rows else None

        results = await asyncio.gather(*[
            c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={"note": f"p{i}"}) for i in range(6)
        ])
        got = sorted({x.json()["version"] for x in results if x.status_code == 200})
        check("six identical publishes at once make one version, and all six are told which",
              [x.status_code for x in results] == [200] * 6 and got == [1] and await numbers_of(a) == [1], f"{got} {await numbers_of(a)}")
        check("…five of them say nothing had changed", sum(1 for x in results if x.json().get("unchanged")) == 5)
        r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={"note": "again"})
        check("publishing again with nothing changed makes no new version",
              r.json().get("unchanged") is True and r.json()["version"] == 1 and await numbers_of(a) == [1], r.text[:200])

        def edited(doc, text_value):
            d = json.loads(json.dumps(doc))
            d["templates"]["home"]["default"]["tree"]["children"].insert(0, section(node("heading", text=text_value)))
            return d

        await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": edited(draft_a, "v2"), "revision": None})
        results = await asyncio.gather(*[
            c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={}) for _ in range(3)
        ])
        check("three tabs publishing one changed draft at once make exactly one new version",
              await numbers_of(a) == [1, 2] and await live_number(a) == 2
              and sorted(x.json()["version"] for x in results) == [2, 2, 2], await numbers_of(a))

        saves = await asyncio.gather(*[
            c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": draft_a, "revision": rev_a + 1})
            for _ in range(4)
        ])
        codes = sorted(s.status_code for s in saves)
        check("four tabs saving the same revision at once: one wins, three are told", codes == [200, 409, 409, 409], codes)

        # A real change, so the publish below gets as far as writing a version.
        await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": edited(draft_a, "doomed"), "revision": None})
        before = await sql("SELECT count(*) FROM builder_versions WHERE tenant_id = :t", {"t": str(a["tid"])}, fetch=True)
        pointer0 = await sql("SELECT CAST(published_version_id AS text) FROM builder_sites WHERE tenant_id = :t", {"t": str(a["tid"])}, fetch=True)
        original = site_svc.logger.info

        def boom(*args, **kwargs):
            raise RuntimeError("database went away mid-publish")

        site_svc.logger.info = boom   # raises after the version row and the pointer are written, before commit
        try:
            r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={"note": "doomed"})
        except Exception as exc:  # the ASGI transport re-raises the app's error
            r = exc
        finally:
            site_svc.logger.info = original
        after = await sql("SELECT count(*) FROM builder_versions WHERE tenant_id = :t", {"t": str(a["tid"])}, fetch=True)
        pointer1 = await sql("SELECT CAST(published_version_id AS text) FROM builder_sites WHERE tenant_id = :t", {"t": str(a["tid"])}, fetch=True)
        check("a publish that fails halfway leaves no version behind and the live site where it was",
              before == after and pointer0 == pointer1
              and (isinstance(r, Exception) or r.status_code >= 500), f"{before} {after} {pointer0} {pointer1}")

        print("")
        print("history is limited, and says what it removes")
        keep_was = site_svc.KEEP_VERSIONS
        site_svc.KEEP_VERSIONS = 5
        try:
            r = await c.get("/api/v1/admin/storefront/builder/versions", headers=adm(a))
            v2 = next(v for v in r.json() if v["number"] == 2)
            r = await c.put(f"/api/v1/admin/storefront/builder/versions/{v2['id']}/pin", headers=adm(a), json={"pinned": True})
            check("a version can be kept", r.status_code == 200 and any(v["pinned"] for v in r.json()["versions"] if v["number"] == 2))
            r = await c.put(f"/api/v1/admin/storefront/builder/versions/{b_versions[0]['id']}/pin", headers=adm(a), json={"pinned": True})
            check("…but not another shop's", r.status_code == 404, r.status_code)
            pruned_all = []
            for i in range(3, 10):
                await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": edited(draft_a, f"v{i}"), "revision": None})
                r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
                pruned_all += r.json().get("pruned") or []
            kept = await numbers_of(a)
            check("past the limit the oldest go, the kept one stays, the live one stays",
                  kept == [2, 5, 6, 7, 8, 9] and await live_number(a) == 9, kept)
            check("…and every publish that removed some said which", sorted(pruned_all) == [1, 3, 4], pruned_all)
            r = await c.post("/api/v1/admin/storefront/builder/rollback", headers=adm(a), json={"version_id": v2["id"]})
            check("the kept version is still there to go back to", r.status_code == 200 and await live_number(a) == 2, r.status_code)
            await c.put(f"/api/v1/admin/storefront/builder/versions/{v2['id']}/pin", headers=adm(a), json={"pinned": False})
            await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": edited(draft_a, "v10"), "revision": None})
            r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
            check("publishing after a rollback keeps the version that was live, unkept and old as it is",
                  2 in await numbers_of(a) and await live_number(a) == 10, await numbers_of(a))
        finally:
            site_svc.KEEP_VERSIONS = keep_was

        print("")
        print("published documents in memory")
        big = edited(draft_a, "big")
        big["pages"] = {f"p{i}": {"title": f"Page {i}", "template": "default", "seo": {},
                                  "tree": section(*[node("text", text="lorem ipsum dolor sit amet " * 20) for _ in range(6)])}
                        for i in range(220)}
        await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": big, "revision": None})
        r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        await c.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "visual_builder"})
        size_kb = len(json.dumps(big)) // 1024

        async def timed(n):
            STATEMENTS[0] = 0
            t0 = asyncio.get_event_loop().time()
            for _ in range(n):
                await c.get("/api/v1/storefront/site", headers=pub(a), params={"route": "home"})
            return (asyncio.get_event_loop().time() - t0) * 1000 / n, STATEMENTS[0] / n

        limit_was = site_svc.DOC_CACHE_BYTES
        site_svc.DOC_CACHE_BYTES = 0
        site_svc._DOCS.clear()
        site_svc._DOCS_BYTES[0] = 0
        cold_ms, cold_q = await timed(10)
        site_svc.DOC_CACHE_BYTES = limit_was
        await c.get("/api/v1/storefront/site", headers=pub(a), params={"route": "home"})
        warm_ms, warm_q = await timed(10)
        print(f"  INFO  {size_kb} KB published site, home page: without the cache {cold_ms:.0f} ms / {cold_q:.1f} SQL, "
              f"with it {warm_ms:.0f} ms / {warm_q:.1f} SQL")
        # The query saved is the guarantee. The time saved is printed above and
        # not asserted: ten requests on a busy machine can go either way.
        check("the cache saves a query on every page", warm_q <= cold_q - 1, f"{cold_q} {warm_q}")
        key = next(k for k in site_svc._DOCS if k[0] == str(a["tid"]) and "p1" in (site_svc._DOCS[k][0].get("pages") or {}))
        snapshot = json.dumps(site_svc._DOCS[key][0], sort_keys=True)
        for route in ("home", "page", "product", "cart", "not_found"):
            await c.get("/api/v1/storefront/site", headers=pub(a), params={"route": route, "slug": "p1"})
        check("rendering never changes the cached document", json.dumps(site_svc._DOCS[key][0], sort_keys=True) == snapshot)
        r = await c.get("/api/v1/storefront/site", headers=pub(b))
        check("brand B's shop still shows brand B's site with A's in memory", f"B-DRAFT-SECRET-{RUN}" in r.text and "lorem ipsum" not in r.text)
        r = await c.post("/api/v1/admin/storefront/builder/rollback", headers=adm(a), json={"version_id": v2["id"]})
        r = await c.get("/api/v1/storefront/site", headers=pub(a), params={"route": "page", "slug": "p1"})
        check("a rollback is seen at once — the cache follows the live pointer", r.json().get("notFound") is True)
        await c.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "legacy"})

        print("one page made as expensive as a merchant can make it")
        cols = []
        for i in range(20):
            cid = uuid.uuid4()
            await sql("INSERT INTO collections (id, tenant_id, name, slug, is_active) VALUES (:i,:t,:n,:s,true)",
                      {"i": str(cid), "t": str(a["tid"]), "n": f"A col {i}", "s": f"a-col-{i}-{RUN}"})
            await sql("INSERT INTO collection_products (tenant_id, collection_id, product_id) VALUES (:t,:c,:p)",
                      {"t": str(a["tid"]), "c": str(cid), "p": str(a["product"])})
            cols.append(str(cid))

        async def page_cost(children, label):
            doc = json.loads(json.dumps(draft_a))
            doc["templates"]["home"]["default"]["tree"]["children"] = children
            await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": doc, "revision": None})
            v = await c.post("/api/v1/admin/storefront/builder/validate", headers=adm(a))
            p = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
            await c.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "visual_builder"})
            await c.get("/api/v1/storefront/site", headers=pub(a), params={"route": "home"})  # warm caches
            STATEMENTS[0] = 0
            t0 = asyncio.get_event_loop().time()
            r = await c.get("/api/v1/storefront/site", headers=pub(a), params={"route": "home"})
            took = asyncio.get_event_loop().time() - t0
            print(f"  INFO  {label}: {STATEMENTS[0]} SQL statements, {took * 1000:.0f} ms, {len(r.content) // 1024} KB")
            return STATEMENTS[0], r.json(), v.json(), p.status_code

        newest200 = [section(*[node("product_grid", source="newest", limit=24) for _ in range(10)]) for _ in range(20)]
        q200, live, _v, status = await page_cost(newest200, "200 'newest' product grids (was 607 SQL before batching)")
        check("200 product grids of one kind cost a bounded number of queries", status == 200 and q200 <= 30, q200)

        def mixed(times):
            kids = []
            for i, cid in enumerate(cols):
                kids.append(node("product_grid", source="collection", collectionId=cid, limit=8))
                kids.append(node("collection_grid", collectionIds=[cid] if i % 2 else [], limit=4))
            for _ in range(times):
                kids.append(node("product_grid", source="newest", limit=8))
                kids.append(node("product_grid", source="manual", productIds=[str(a["product"])], limit=8))
                kids.append(node("product_grid", source="related", limit=8))
                kids.append(node("product_grid", source="search", limit=8))
            return [section(*kids)]

        q_mixed, live, v, status = await page_cost(mixed(10), "60 mixed product grids, 20 collections, 20 collection grids")
        q_double, _l, _v2, _s = await page_cost(mixed(20), "100 mixed product grids, same sources")
        check("a page using every kind of source stays inside a fixed budget", status == 200 and q_mixed <= 90, q_mixed)
        check("doubling the grids does not add queries — cost follows sources, not grids", q_double <= q_mixed + 2,
              f"{q_mixed} -> {q_double}")
        grids = live["data"]["grids"]
        tree = live["template"]["children"][0]["children"]
        manual_grid = next(n for n in tree if n["props"].get("source") == "manual")
        coll_grids = [n for n in tree if n["props"].get("source") == "collection"]
        check("hand-picked grids still show the products picked",
              [c["title"] for c in grids[manual_grid["id"]]] == ["Secret a product"], grids[manual_grid["id"]])
        filled = [n for n in coll_grids if grids.get(n["id"])]
        check("grids from the first 8 collections are filled, the rest left empty",
              len(filled) == 8 and all(grids[n["id"]][0]["title"] == "Secret a product" for n in filled), len(filled))
        codes = {i["code"] for i in v["issues"]}
        check("…and the publish check warns about it before anything goes live", "too_many_collections" in codes, sorted(codes))
        await c.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "legacy"})

    print(f"\n{ok} passed, {fail} failed")
    return fail


def publish_ok(r):
    return r.json().get("mode") == "visual_builder"


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
