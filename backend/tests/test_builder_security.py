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
        results = await asyncio.gather(*[
            c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={"note": f"p{i}"}) for i in range(6)
        ])
        numbers = sorted(x.json()["version"] for x in results if x.status_code == 200)
        rows = await sql("SELECT number FROM builder_versions WHERE tenant_id = :t ORDER BY number", {"t": str(a["tid"])}, fetch=True)
        live = await sql("SELECT v.number FROM builder_sites s JOIN builder_versions v ON v.id = s.published_version_id "
                         "WHERE s.tenant_id = :t", {"t": str(a["tid"])}, fetch=True)
        check("six publishes at once make six versions with six different numbers",
              numbers == list(range(1, 7)) and [r[0] for r in rows] == list(range(1, 7)), f"{numbers} {rows}")
        check("…and the live pointer is on the last of them", live and live[0][0] == 6, live)

        saves = await asyncio.gather(*[
            c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": draft_a, "revision": rev_a})
            for _ in range(4)
        ])
        codes = sorted(s.status_code for s in saves)
        check("four tabs saving the same revision at once: one wins, three are told", codes == [200, 409, 409, 409], codes)

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
              before == after and pointer0 == pointer1, f"{before} {after} {pointer0} {pointer1}")

        print("")
        print("one page made as expensive as a merchant can make it")
        heavy = json.loads(json.dumps(draft_a))
        heavy["templates"]["home"]["default"]["tree"]["children"] = [
            section(*[node("product_grid", source="newest", limit=48) for _ in range(10)]) for _ in range(20)
        ]
        r = await c.put("/api/v1/admin/storefront/builder/draft", headers=adm(a), json={"draft": heavy, "revision": None})
        r = await c.post("/api/v1/admin/storefront/builder/publish", headers=adm(a), json={})
        await c.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "visual_builder"})
        STATEMENTS[0] = 0
        t0 = asyncio.get_event_loop().time()
        r = await c.get("/api/v1/storefront/site", headers=pub(a), params={"route": "home"})
        took = asyncio.get_event_loop().time() - t0
        print(f"  INFO  200 product grids on one page: {STATEMENTS[0]} SQL statements, {took * 1000:.0f} ms, {len(r.content) // 1024} KB")
        # Reported, not asserted: there is no per-page cap on grids today.
        check("the heavy page still renders", r.status_code == 200 and publish_ok(r))
        await c.put("/api/v1/admin/storefront/builder/mode", headers=adm(a), json={"mode": "legacy"})

    print(f"\n{ok} passed, {fail} failed")
    return fail


def publish_ok(r):
    return r.json().get("mode") == "visual_builder"


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
