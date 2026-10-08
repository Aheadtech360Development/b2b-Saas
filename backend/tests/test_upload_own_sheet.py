"""A buyer's own finished gang sheet goes into the cart.

"Upload your own gang sheet" sends one file that already is the sheet, and
adds it to the cart in the same click. The cart refuses a sheet with no saved
layout — right for the builder, where somebody still has to arrange the
designs, and wrong here, where there is nothing to arrange: every own sheet
was refused with "This gang sheet has no saved layout yet." The sheet is now
laid out when it is submitted, the file inside the bleed, as Upload by size
records its one design.

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
from PIL import Image  # noqa: E402
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
    tid, buyer, company = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    slug = f"own-{RUN}"
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (:i, :s, 'Own Sheet Shop', :e, 'active', 'wholesale')",
              {"i": str(tid), "s": slug, "e": f"{slug}@printshop-demo.com"})
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, is_admin, is_active, email_verified) "
              "VALUES (:i, :t, :e, 'x', 'Sam', 'Buyer', 'buyer', false, true, true)",
              {"i": str(buyer), "t": str(tid), "e": f"buyer-{RUN}@printshop-demo.com"})
    await sql("INSERT INTO companies (id, tenant_id, name, status) VALUES (:i, :t, 'Sam Prints', 'active')",
              {"i": str(company), "t": str(tid)})
    await sql("INSERT INTO company_users (id, tenant_id, company_id, user_id, role, is_active, user_group) "
              "VALUES (gen_random_uuid(), :t, :c, :u, 'owner', true, 'default')",
              {"t": str(tid), "c": str(company), "u": str(buyer)})
    token = create_access_token(subject=str(buyer), extra_claims={
        "tenant_id": str(tid), "role": "buyer", "is_admin": False, "is_platform_admin": False,
        "company_id": str(company), "account_type": "wholesale"})

    async def product(gtype):
        pid, size = uuid.uuid4(), uuid.uuid4()
        await sql("INSERT INTO products (id, tenant_id, name, slug, status, moq, pricing_mode, gang_sheet_enabled, gang_sheet_type) "
                  "VALUES (:i, :t, :n, :s, 'active', 1, 'variant', true, :g)",
                  {"i": str(pid), "t": str(tid), "n": f"{gtype} sheet", "s": f"{gtype}-{RUN}", "g": gtype})
        await sql("INSERT INTO gang_sheet_sizes (id, tenant_id, product_id, name, width_in, height_in, price_per_sheet, bleed_in, spacing_in, is_active, pricing_mode, price_per_inch, min_length_in, max_length_in, sort_order) "
                  "VALUES (:i, :t, :p, '22x40', 22, 40, 15.20, 0.125, 0.125, true, 'fixed', 0, 12, 240, 0)",
                  {"i": str(size), "t": str(tid), "p": str(pid)})
        return pid, size

    own_product, own_size = await product("upload_own")
    builder_product, builder_size = await product("gang_sheet")
    folder = f"/app/media/artwork/own-{RUN}"
    os.makedirs(folder, exist_ok=True)
    Image.new("RGBA", (1135, 541), (20, 120, 200, 255)).save(f"{folder}/sheet.png")
    sheet_file = f"/media/artwork/own-{RUN}/sheet.png"

    headers = {"X-Tenant-Slug": slug, "Authorization": f"Bearer {token}"}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
        print("a buyer's own finished sheet")
        # What the "Upload your own gang sheet" modal sends: one file filling
        # the sheet inside its bleed, as the size reports it (stored to the
        # hundredth: 0.125 is kept as 0.13).
        sizes = (await client.get(f"/api/v1/gang-sheets/sizes?product_id={own_product}")).json()
        bleed = float(next(z for z in sizes if z["id"] == str(own_size))["bleed_in"])
        w, h = round(22 - 2 * bleed, 2), round(40 - 2 * bleed, 2)
        r = await client.post("/api/v1/gang-sheets/orders", json={
            "sheet_size_id": str(own_size), "sheet_quantity": 1, "product_id": str(own_product),
            "artworks": [{"file_url": sheet_file, "file_name": "WhatsApp Image.jpeg", "file_type": "png",
                          "width_in": w, "height_in": h, "quantity": 1}],
        })
        check("is saved", r.status_code == 201, r.text[:300])
        job = r.json()
        art_id = (job.get("artworks") or [{}])[0].get("id")
        lay = job.get("layout") or [{}]
        check("…laid out as it is: the one file, inside the bleed",
              len(lay) == 1 and lay[0].get("artwork_id") == art_id and lay[0].get("rotation") == 0
              and (lay[0].get("w_in"), lay[0].get("h_in")) == (w, h)
              and round(lay[0].get("x_in", -1), 4) == round(bleed, 4) and round(lay[0].get("y_in", -1), 4) == round(bleed, 4),
              job.get("layout"))
        r = await client.post("/api/v1/cart/add-gang-sheet", json={"gang_sheet_order_id": job["id"]})
        check("…and goes into the cart — it used to be refused for having no layout",
              r.status_code == 200 and any(i.get("gang_sheet_order_id") == job["id"] for i in r.json().get("items", [])),
              r.text[:300])

        print("\na builder sheet nobody has arranged yet")
        r = await client.post("/api/v1/gang-sheets/orders", json={
            "sheet_size_id": str(builder_size), "sheet_quantity": 1, "product_id": str(builder_product),
            "artworks": [{"file_url": sheet_file, "file_name": "logo.png", "file_type": "png",
                          "width_in": 3, "height_in": 3, "quantity": 4}],
        })
        bjob = r.json()
        check("is saved with no layout — the builder's own save arranges it", r.status_code == 201
              and not bjob.get("layout"), bjob.get("layout"))
        r = await client.post("/api/v1/cart/add-gang-sheet", json={"gang_sheet_order_id": bjob["id"]})
        check("…and is still kept out of the cart until it is", r.status_code in (400, 422)
              and "no saved layout" in r.text, r.text[:200])

    print(f"\n{ok} passed, {fail} failed")
    return fail


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
