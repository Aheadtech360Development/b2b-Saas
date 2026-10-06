"""An order page that says what the total is made of, and what to print.

A manager reading a $7.35 order with a $1.17 total could not see the discount
that came between them, nor the tax's rate; and a gang sheet line said only
"Gang Sheet GS-… — 22x10", where the print apps shops know from Shopify list a
preview, an edit link, the print-ready file and whether any design is low
resolution. This checks both, for all three builders: the builder that
arranges designs on a sheet, Upload by size, and a buyer's own finished sheet.

The print-ready file is drawn by the server at 300 DPI and reached by a signed
link, so the checks here download it and look at the picture.

Runs against the local test Postgres (port 55432). It refuses anything else.
"""
import asyncio
import base64
import io
import os
import re
import sys
import time
import uuid
import zlib

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


def media_file(name, img):
    """An artwork file in this store's local media, where the server may read it."""
    folder = f"/app/media/artwork/test-{RUN}"
    os.makedirs(folder, exist_ok=True)
    img.save(f"{folder}/{name}")
    return f"/media/artwork/test-{RUN}/{name}"


async def main():
    tid = uuid.uuid4()
    slug = f"print-{RUN}"
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (:i, :s, 'Print Shop', :e, 'active', 'wholesale')",
              {"i": str(tid), "s": slug, "e": f"{slug}@printshop-demo.com"})
    admin_id, buyer_id, company_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, is_admin, is_active, email_verified) "
              "VALUES (:i, :t, :e, 'x', 'Shop', 'Owner', 'tenant_admin', true, true, true)",
              {"i": str(admin_id), "t": str(tid), "e": f"owner-{RUN}@printshop-demo.com"})
    await sql("INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, is_admin, is_active, email_verified) "
              "VALUES (:i, :t, :e, 'x', 'Sam', 'Buyer', 'buyer', false, true, true)",
              {"i": str(buyer_id), "t": str(tid), "e": f"buyer-{RUN}@printshop-demo.com"})
    await sql("INSERT INTO companies (id, tenant_id, name, status) VALUES (:i, :t, 'Sam Prints', 'active')",
              {"i": str(company_id), "t": str(tid)})
    await sql("INSERT INTO company_users (id, tenant_id, company_id, user_id, role, is_active, user_group) "
              "VALUES (gen_random_uuid(), :t, :c, :u, 'owner', true, 'default')",
              {"t": str(tid), "c": str(company_id), "u": str(buyer_id)})
    admin = create_access_token(subject=str(admin_id), extra_claims={
        "tenant_id": str(tid), "role": "tenant_admin", "is_admin": True, "is_platform_admin": False})
    buyer = create_access_token(subject=str(buyer_id), extra_claims={
        "tenant_id": str(tid), "role": "buyer", "is_admin": False, "is_platform_admin": False,
        "company_id": str(company_id), "account_type": "wholesale"})

    # ── The three builders' products ────────────────────────────────────────
    async def product(name, gtype):
        pid = uuid.uuid4()
        await sql("INSERT INTO products (id, tenant_id, name, slug, status, moq, pricing_mode, gang_sheet_enabled, gang_sheet_type) "
                  "VALUES (:i, :t, :n, :s, 'active', 1, 'variant', true, :g)",
                  {"i": str(pid), "t": str(tid), "n": name, "s": f"{gtype}-{RUN}", "g": gtype})
        return pid

    p_builder, p_size, p_own = (await product("DTF Gang Sheet", "gang_sheet"),
                                await product("Upload by Size", "upload_by_size"),
                                await product("Your Own Sheet", "upload_own"))
    size_id = uuid.uuid4()
    await sql("INSERT INTO gang_sheet_sizes (id, tenant_id, product_id, name, width_in, height_in, price_per_sheet, bleed_in, spacing_in, is_active, pricing_mode, price_per_inch, min_length_in, max_length_in, sort_order) "
              "VALUES (:i, :t, :p, '22x10', 22, 10, 7.35, 0.125, 0.125, true, 'fixed', 0, 12, 240, 0)",
              {"i": str(size_id), "t": str(tid), "p": str(p_builder)})

    # ── A paid order: one line per builder, a 90% code, tax ─────────────────
    oid = uuid.uuid4()
    await sql("INSERT INTO orders (id, tenant_id, order_number, company_id, placed_by_id, status, payment_status, "
              "subtotal, shipping_cost, tax_amount, tax_rate, tax_region, total, amount_refunded, is_guest_order, qb_sync_status) "
              "VALUES (:i, :t, :n, :c, :u, 'confirmed', 'paid', 7.35, 0, 0.44, 6.0, 'WY', 1.17, 0, false, 'pending')",
              {"i": str(oid), "t": str(tid), "n": f"P-{RUN}", "c": str(company_id), "u": str(buyer_id)})
    code_id = uuid.uuid4()
    await sql("INSERT INTO discount_codes (id, tenant_id, code, discount_type, discount_value, is_active) "
              "VALUES (:i, :t, :c, 'percentage', 90, true)", {"i": str(code_id), "t": str(tid), "c": f"SAVE90{RUN[:3].upper()}"})
    await sql("INSERT INTO discount_usage (id, tenant_id, discount_code_id, order_id, discount_amount_applied) "
              "VALUES (gen_random_uuid(), :t, :c, :o, 6.62)", {"t": str(tid), "c": str(code_id), "o": str(oid)})

    async def sheet(ref, product_id, size, w, h, layout_for, arts, qty=1, name=None):
        sid = uuid.uuid4()
        await sql("INSERT INTO gang_sheet_orders (id, tenant_id, reference, company_id, user_id, product_id, sheet_size_id, "
                  "sheet_name, sheet_width_in, sheet_height_in, price_per_sheet, sheet_quantity, subtotal, status, "
                  "revision_count, layout, version, versions, order_id) "
                  "VALUES (:i, :t, :r, :c, :u, :p, :s, :n, :w, :h, 0, :q, 0, 'in_review', 0, CAST(:l AS jsonb), 1, '[]'::jsonb, :o)",
                  {"i": str(sid), "t": str(tid), "r": ref, "c": str(company_id), "u": str(buyer_id), "p": str(product_id),
                   "s": str(size) if size else None, "n": name or f"{w}x{h}", "w": w, "h": h, "q": qty, "o": str(oid),
                   "l": "[]"})
        ids = []
        for i, (url, name, ftype, aw, ah, dpi) in enumerate(arts):
            aid = uuid.uuid4()
            ids.append(str(aid))
            insp = ('{"verdict": "check", "findings": [], "measured": {"effective_dpi": %d}}' % dpi) if dpi else None
            await sql("INSERT INTO gang_sheet_artworks (id, tenant_id, gang_sheet_order_id, file_url, file_name, file_type, width_in, height_in, quantity, sort_order, inspection) "
                      "VALUES (:i, :t, :g, :u, :n, :f, :w, :h, 1, :o, CAST(:x AS jsonb))",
                      {"i": str(aid), "t": str(tid), "g": str(sid), "u": url, "n": name, "f": ftype, "w": aw, "h": ah, "o": i, "x": insp})
        import json
        lay = layout_for(ids)
        await sql("UPDATE gang_sheet_orders SET layout = CAST(:l AS jsonb) WHERE id = :i", {"l": json.dumps(lay), "i": str(sid)})
        return sid

    red = media_file("red.png", Image.new("RGBA", (600, 600), (220, 30, 30, 255)))
    blue = media_file("blue.png", Image.new("RGBA", (300, 300), (30, 60, 220, 255)))
    own = media_file("own-sheet.png", Image.new("RGBA", (2000, 200), (20, 20, 20, 255)))
    ref_b, ref_s, ref_o = f"GS-T-{RUN}-1", f"GS-T-{RUN}-2", f"GS-T-{RUN}-3"
    s_builder = await sheet(ref_b, p_builder, size_id, 22, 10,
                            lambda ids: [{"artwork_id": ids[0], "x_in": 1, "y_in": 1, "w_in": 2, "h_in": 2, "rotation": 0},
                                         {"artwork_id": ids[1], "x_in": 5, "y_in": 1, "w_in": 2, "h_in": 2, "rotation": 90},
                                         {"artwork_id": ids[2], "x_in": 9, "y_in": 1, "w_in": 1, "h_in": 1, "rotation": 0}],
                            [(red, "red.png", "png", 2, 2, 300), (blue, "blue.png", "png", 2, 2, 142),
                             ("https://elsewhere.example/logo.ai", "logo.ai", "ai", 1, 1, None)], qty=2)
    # Upload by size lines are named for the design's size alone — no
    # reference — so two on one order are told apart by name. This one is
    # made first, so taking sheets in order would give it the other's line.
    size_small, size_big = 'Upload by Size — 3"x3"', 'Upload by Size — 4.21"x4.21"'
    s_size2 = await sheet(f"GS-T-{RUN}-4", p_size, None, 3, 3,
                          lambda ids: [{"artwork_id": ids[0], "x_in": 0, "y_in": 0, "w_in": 3, "h_in": 3, "rotation": 0}],
                          [(red, "small.png", "png", 3, 3, 300)], qty=3, name=size_small)
    s_size = await sheet(ref_s, p_size, None, 4.21, 4.21,
                         lambda ids: [{"artwork_id": ids[0], "x_in": 0, "y_in": 0, "w_in": 4.21, "h_in": 4.21, "rotation": 0}],
                         [(blue, "patch.png", "png", 4.21, 4.21, 250)], qty=8, name=size_big)
    s_own = await sheet(ref_o, p_own, size_id, 22, 2.25,
                        lambda ids: [],
                        [(own, "own-sheet.png", "png", 21.75, 2.0, 91)])
    for name, qty in ((size_big, 8), (f"Gang Sheet {ref_b} — 22x10", 2), (f"Gang Sheet {ref_o} — 22x2.25", 1), (size_small, 3)):
        await sql("INSERT INTO order_items (id, tenant_id, order_id, product_name, sku, quantity, unit_price, line_total) "
                  "VALUES (gen_random_uuid(), :t, :o, :n, 'GANG-SHEET', :q, 2.45, 2.45)",
                  {"t": str(tid), "o": str(oid), "n": name, "q": qty})

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        adm = {"X-Tenant-Slug": slug, "Authorization": f"Bearer {admin}"}
        r = await client.get(f"/api/v1/admin/orders/{oid}", headers=adm)
        check("the admin order opens", r.status_code == 200, r.text[:300])
        order = r.json()

        # ── 1. What the total is made of ────────────────────────────────────
        print("\nthe total, line by line")
        d = order.get("discounts") or []
        check("the discount is listed with its code, its kind and what it took off",
              len(d) == 1 and d[0]["code"].startswith("SAVE90") and d[0]["amount"] == 6.62
              and d[0]["label"].endswith("· 90% off"), d)
        check("the tax says where and at what rate", order.get("tax_label") == "Tax (WY · 6%)", order.get("tax_label"))
        check("…and the lines meet the total: 7.35 + 0.44 − 6.62 = 1.17",
              round(float(order["subtotal"]) + float(order["shipping_cost"]) + float(order["tax_amount"])
                    - sum(x["amount"] for x in d), 2) == float(order["total"]))
        r = await client.get(f"/api/v1/orders/{oid}", headers={"X-Tenant-Slug": slug, "Authorization": f"Bearer {buyer}"})
        mine = r.json()
        check("the buyer's own order says the same", r.status_code == 200 and len(mine.get("discounts") or []) == 1
              and mine.get("tax_label") == "Tax (WY · 6%)" and float(mine.get("tax_amount") or 0) == 0.44, r.text[:300])
        r = await client.get(f"/api/v1/orders/{oid}/pdf/invoice", headers={"X-Tenant-Slug": slug, "Authorization": f"Bearer {buyer}"})
        pdf = b""
        for raw in re.findall(rb"stream\s*(.*?)\s*endstream", r.content, re.S):
            # ReportLab writes its page text ASCII85 over Flate.
            raw = base64.a85decode(raw, adobe=True) if raw.endswith(b"~>") else raw
            try:
                pdf += zlib.decompress(raw)
            except zlib.error:
                pass
        check("…and so does the invoice: the discount it used to leave out, and the tax's rate",
              r.status_code == 200 and b"(Discount:)" in pdf and b"($6.62)" in pdf and b"(Tax \\(WY" in pdf, r.status_code)

        # ── 2. What to print, on each line ─────────────────────────────────
        print("\nwhat to print, under each gang sheet line")
        lines = {i["product_name"]: i.get("gang_sheet") for i in order["items"]}
        b = lines.get(f"Gang Sheet {ref_b} — 22x10") or {}
        s = lines.get(size_big) or {}
        s2 = lines.get(size_small) or {}
        o = lines.get(f"Gang Sheet {ref_o} — 22x2.25") or {}
        check("each line finds its own sheet by the reference in its name, whatever the order",
              b.get("reference") == ref_b and o.get("reference") == ref_o, [b.get("reference"), o.get("reference")])
        check("…and an Upload by size line, which has none, by its name",
              s.get("id") == str(s_size) and s2.get("id") == str(s_size2), [s.get("reference"), s2.get("reference")])
        check("…and knows which builder made it", (b.get("kind"), s.get("kind"), o.get("kind"))
              == ("gang_sheet", "upload_by_size", "upload_own"), (b.get("kind"), s.get("kind"), o.get("kind")))
        check("the size and how many", (b["width_in"], b["height_in"], b["quantity"]) == (22.0, 10.0, 2)
              and (s["width_in"], s["quantity"]) == (4.21, 8))
        check("the shop's own editor opens that sheet", b["admin_edit_url"] == f"/admin/gang-sheets?sheet={s_builder}")
        check("the buyer's edit link is given only while the buyer may still change it — not once it is in review",
              b.get("edit_url") is None and s.get("edit_url") is None)
        await sql("UPDATE gang_sheet_orders SET status = 'submitted' WHERE id = :i", {"i": str(s_builder)})
        await sql("UPDATE gang_sheet_orders SET status = 'revision_requested' WHERE id = :i", {"i": str(s_size)})
        await sql("UPDATE gang_sheet_orders SET status = 'submitted' WHERE id IN (:i, :j)", {"i": str(s_size2), "j": str(s_own)})
        again = {i["product_name"]: i.get("gang_sheet") for i in
                 (await client.get(f"/api/v1/admin/orders/{oid}", headers=adm)).json()["items"]}
        check("…and while it may: the builder reopens the sheet, Upload by size reopens the product to revise it",
              again[f"Gang Sheet {ref_b} — 22x10"]["edit_url"] == f"/gang-sheets?edit={s_builder}&product={p_builder}"
              and again[size_big]["edit_url"] == f"/products/upload_by_size-{RUN}?revise={s_size}"
              and again[size_small]["edit_url"] == f"/products/upload_by_size-{RUN}?revise={s_size2}",
              [again[f"Gang Sheet {ref_b} — 22x10"]["edit_url"], again[size_big]["edit_url"], again[size_small]["edit_url"]])
        check("…a sheet the buyer uploaded finished has no editor to send them to",
              again[f"Gang Sheet {ref_o} — 22x2.25"]["edit_url"] is None)
        check("low resolution: yes, naming the design and its DPI",
              b["resolution"]["low"] is True and b["resolution"]["low_files"] == [{"name": "blue.png", "dpi": 142}]
              and b["resolution"]["lowest_dpi"] == 142, b["resolution"])
        check("…no, when the lowest is still printable (250 DPI)",
              s["resolution"]["low"] is False and s["resolution"]["lowest_dpi"] == 250, s["resolution"])
        check("a file the PNG cannot hold is named, to print from the original", b.get("left_out") == ["logo.ai"], b.get("left_out"))
        check("a buyer's own sheet is already the print file: theirs, untouched",
              o["print_file"] == {"url": own, "name": "own-sheet.png", "signed": False}, o.get("print_file"))

        async def get(path):
            return await client.get(path)

        # ── 3. The files themselves ─────────────────────────────────────────
        print("\nthe files")
        r = await get(b["print_file"]["url"])
        check("the builder sheet's print file downloads as a PNG named for the job",
              r.status_code == 200 and r.headers["content-type"] == "image/png"
              and f'filename="{ref_b}-22x10in-300dpi.png"' in r.headers.get("content-disposition", ""), r.status_code)
        im = Image.open(io.BytesIO(r.content))
        check("…at its true size: 22″ × 10″ at 300 DPI is 6600 × 3000, and says 300 DPI",
              im.size == (6600, 3000) and round(im.info.get("dpi", (0,))[0]) == 300, (im.size, im.info.get("dpi")))
        im = im.convert("RGBA")
        check("…each design where the sheet puts it, transparent everywhere else",
              im.getpixel((600, 600))[:3] == (220, 30, 30) and im.getpixel((1650, 600))[:3] == (30, 60, 220)
              and im.getpixel((100, 100))[3] == 0 and im.getpixel((4000, 2500))[3] == 0)
        check("…and says which file it left out", "logo.ai" in r.headers.get("x-left-out", ""), r.headers.get("x-left-out"))

        r = await get(s["print_file"]["url"])
        im = Image.open(io.BytesIO(r.content))
        check("Upload by size: the design at exactly the size ordered, at 300 DPI", r.status_code == 200
              and im.size == (1263, 1263), im.size)
        r = await get(b["preview_url"])
        im = Image.open(io.BytesIO(r.content))
        check("a preview of the builder sheet, small enough to open at a glance", r.status_code == 200
              and r.headers.get("content-disposition", "").startswith("inline") and max(im.size) == 1600, im.size)
        check("…and a buyer's own sheet is its own preview: their file, not drawn again", o["preview_url"] == own,
              o["preview_url"])

        # ── 4. The links are the only way in ────────────────────────────────
        print("\nthe links")
        bad = b["print_file"]["url"].replace("sig=", "sig=0")
        r = await get(bad)
        check("a link that was changed opens nothing", r.status_code == 404, r.status_code)
        other = b["print_file"]["url"].replace("/print?", "/preview?")
        r = await get(other)
        check("…nor does one signed for the preview asked for the print file, or the other way", r.status_code == 404, r.status_code)
        from app.api.v1.gang_sheets import GangSheetOrder, file_link

        async with AsyncSessionLocal() as db:
            set_bypass_scoping(True)
            await db.execute(text("SELECT set_config('app.bypass_rls','on',true)"))
            row = (await db.get(GangSheetOrder, s_builder))
            set_bypass_scoping(False)
        old = file_link(row, "print", now=time.time() - 8 * 86400)
        r = await get(old)
        check("a link past its week says it has expired", r.status_code == 410 and "expired" in r.text, r.text[:120])
        r = await get(f"/api/v1/gang-sheets/files/{s_builder}/print?exp={int(time.time()) + 999}&sig=x")
        check("…and one without its signature opens nothing", r.status_code == 404)
        import hashlib
        import hmac

        from app.core.config import settings as _settings

        exp = int(time.time()) + 3600
        forged = hmac.new(_settings.APP_SECRET_KEY.encode(),
                          f"gang-sheet-file:{s_builder}:{tid}:print:{exp}".encode(), hashlib.sha256).hexdigest()[:40]
        r = await get(f"/api/v1/gang-sheets/files/{s_builder}/print?exp={exp}&sig={forged}")
        check("…nor one signed with the app key alone, which has a default in the code", r.status_code == 404,
              r.status_code)

    print(f"\n{ok} passed, {fail} failed")
    return fail


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
