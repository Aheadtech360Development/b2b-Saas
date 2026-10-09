"""One demo shop in the LOCAL database, so the admin has something to show.

Run it through the local launcher, which points this process at the local
database before anything is imported, and refuses anything else:

    cd backend
    .venv\\Scripts\\python.exe run_local.py seed

It goes through the API's own routes wherever it can — a product is made the
way the admin makes one, an order is placed the way a customer places one —
so what the admin screens show is what they would show for real work, not
rows that only look right. Only the shop itself, and the dates (so the last
ten weeks have orders in them, not just today), are written directly.

Safe to run again: each part is skipped when it is already there.
"""
from __future__ import annotations

import datetime as dt
import random
import uuid
from typing import Any

import httpx
from sqlalchemy import text

from app.core.config import get_settings

assert get_settings().sync_db_url.endswith("@127.0.0.1:5440/printcopilot_local"), "refusing: not the local database"

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.features import ALL_FEATURES  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.tenant_context import set_bypass_scoping  # noqa: E402
from app.main import app  # noqa: E402

SLUG = "demo"
SHOP = "Northwind Print Co."
PASSWORD = "Local@12345"
ADMIN_EMAIL = "admin@example.com"
rnd = random.Random(7)

# ── Small tools ───────────────────────────────────────────────────────────────
failures: list[str] = []
made: dict[str, int] = {}


def count(what: str, n: int = 1) -> None:
    made[what] = made.get(what, 0) + n


async def sql(stmt: str, params: dict | None = None) -> list[Any]:
    """Straight to the local database, past the per-shop scoping."""
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT set_config('app.bypass_rls','on',true)"))
            # The activity log refuses changes to its rows; dates are moved there too.
            await db.execute(text("SELECT set_config('app.audit_admin','on',true)"))
            res = await db.execute(text(stmt), params or {})
            rows = list(res.fetchall()) if res.returns_rows else []
            await db.commit()
            return rows
    finally:
        set_bypass_scoping(False)


class Api:
    """The API, called in-process. Each call says which shop it is for and
    comes from its own address, so the sign-up limits meant for one visitor
    do not stop a script making twenty customers."""

    def __init__(self) -> None:
        self.http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://local", timeout=60)
        self._n = 0

    def _headers(self, token: str | None, tenant: str | None) -> dict[str, str]:
        self._n += 1
        h = {"X-Forwarded-For": f"10.{(self._n >> 16) & 255}.{(self._n >> 8) & 255}.{self._n & 255}",
             "Origin": f"http://{SLUG}.localhost:3000"}
        if tenant:
            h["X-Tenant-Slug"] = tenant
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    async def call(self, method: str, path: str, *, token: str | None = None, tenant: str | None = SLUG,
                   json: Any = None, params: dict | None = None, ok: tuple[int, ...] = (200, 201, 204)) -> Any:
        r = await self.http.request(method, path, headers=self._headers(token, tenant), json=json, params=params)
        if r.status_code not in ok:
            raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
        if r.status_code == 204 or not r.content:
            return None
        try:
            return r.json()
        except ValueError:
            return r.text

    async def login(self, email: str, password: str = PASSWORD, tenant: str | None = SLUG) -> str:
        out = await self.call("POST", "/api/v1/auth/login", tenant=tenant, json={"email": email, "password": password})
        return out["access_token"]


def rows_of(answer: Any) -> list[dict]:
    """The list inside a list answer, whatever key the route keeps it under."""
    if isinstance(answer, list):
        return answer
    if isinstance(answer, dict):
        for value in answer.values():
            if isinstance(value, list):
                return value
    return []


async def attempt(label: str, coro) -> Any:
    """One part failing does not stop the rest; it is listed at the end."""
    try:
        return await coro
    except Exception as exc:  # noqa: BLE001
        # An order refused because a size is nearly out is the shop's own rule
        # doing its job, on stock that was made low on purpose.
        if "INSUFFICIENT_STOCK" not in str(exc):
            failures.append(f"{label}: {str(exc)[:260]}")
        return None


# ── The shop's contents ───────────────────────────────────────────────────────
COLOURS = {
    "Black": "#111111", "White": "#FFFFFF", "Navy": "#1F2A44", "Heather Grey": "#B8BCC4", "Red": "#C62828",
    "Forest": "#14532D", "Royal": "#1D4ED8", "Sand": "#D8C3A5", "Maroon": "#7B1E3A",
}
APPAREL_SIZES = ["S", "M", "L", "XL", "2XL"]

# (name, category, price, colours, sizes, type, vendor, status)
PRODUCTS: list[tuple[str, str, float, list[str], list[str], str, str, str]] = [
    ("Heavyweight Tee", "T-Shirts", 14.00, ["Black", "White", "Navy", "Sand"], APPAREL_SIZES, "T-Shirt", "Northwind Blanks", "active"),
    ("Classic Cotton Tee", "T-Shirts", 9.50, ["Black", "White", "Heather Grey", "Red", "Royal"], APPAREL_SIZES, "T-Shirt", "Northwind Blanks", "active"),
    ("Long Sleeve Tee", "T-Shirts", 16.00, ["Black", "White", "Forest"], APPAREL_SIZES, "T-Shirt", "Northwind Blanks", "active"),
    ("Performance Tee", "T-Shirts", 18.50, ["Black", "Royal", "Red"], APPAREL_SIZES, "T-Shirt", "Summit Athletic", "active"),
    ("Ringer Tee", "T-Shirts", 13.00, ["White", "Heather Grey"], APPAREL_SIZES, "T-Shirt", "Northwind Blanks", "active"),
    ("Pocket Tee", "T-Shirts", 15.00, ["Black", "Navy", "Sand"], APPAREL_SIZES, "T-Shirt", "Northwind Blanks", "active"),
    ("V-Neck Tee", "T-Shirts", 12.50, ["Black", "White", "Maroon"], APPAREL_SIZES, "T-Shirt", "Northwind Blanks", "draft"),
    ("Youth Tee", "T-Shirts", 8.00, ["Black", "White", "Red", "Royal"], ["YS", "YM", "YL"], "T-Shirt", "Northwind Blanks", "active"),
    ("Pullover Hoodie", "Hoodies & Sweatshirts", 38.00, ["Black", "Heather Grey", "Navy", "Forest"], APPAREL_SIZES, "Hoodie", "Northwind Blanks", "active"),
    ("Zip Hoodie", "Hoodies & Sweatshirts", 44.00, ["Black", "Heather Grey", "Maroon"], APPAREL_SIZES, "Hoodie", "Northwind Blanks", "active"),
    ("Crewneck Sweatshirt", "Hoodies & Sweatshirts", 32.00, ["Black", "Sand", "Navy"], APPAREL_SIZES, "Sweatshirt", "Northwind Blanks", "active"),
    ("Quarter-Zip Fleece", "Hoodies & Sweatshirts", 46.00, ["Black", "Navy"], APPAREL_SIZES, "Sweatshirt", "Summit Athletic", "active"),
    ("Youth Hoodie", "Hoodies & Sweatshirts", 28.00, ["Black", "Royal"], ["YS", "YM", "YL"], "Hoodie", "Northwind Blanks", "draft"),
    ("Snapback Cap", "Headwear", 22.00, ["Black", "Navy", "Red"], ["One Size"], "Cap", "Crown Headwear", "active"),
    ("Dad Hat", "Headwear", 18.00, ["Black", "Sand", "Forest", "White"], ["One Size"], "Cap", "Crown Headwear", "active"),
    ("Trucker Cap", "Headwear", 16.00, ["Black", "Royal", "White"], ["One Size"], "Cap", "Crown Headwear", "active"),
    ("Cuffed Beanie", "Headwear", 14.00, ["Black", "Heather Grey", "Maroon"], ["One Size"], "Beanie", "Crown Headwear", "active"),
    ("Canvas Tote", "Bags", 12.00, ["Sand", "Black"], ["One Size"], "Bag", "Harbor Goods", "active"),
    ("Drawstring Bag", "Bags", 9.00, ["Black", "Royal", "Red"], ["One Size"], "Bag", "Harbor Goods", "active"),
    ("Zip Pouch", "Bags", 11.00, ["Sand", "Black"], ["One Size"], "Bag", "Harbor Goods", "active"),
    ("DTF Gang Sheet", "DTF Transfers", 0.00, [], [], "DTF Transfer", "Northwind Print Co.", "active"),
    ("UV DTF Sticker Sheet", "DTF Transfers", 19.00, ["White"], ["11 x 17", "22 x 24"], "DTF Transfer", "Northwind Print Co.", "active"),
    ("Blank DTF Film Roll", "DTF Transfers", 64.00, ["White"], ["13 in x 328 ft", "24 in x 328 ft"], "Supplies", "Northwind Print Co.", "active"),
]

# Photographs of the kind of thing each product is. Tried before use: any that
# does not answer is replaced by a plain placeholder with the product's name.
PHOTOS = {
    "T-Shirt": ["photo-1521572163474-6864f9cf17ab", "photo-1583743814966-8936f5b7be1a", "photo-1576566588028-4147f3842f27",
                "photo-1562157873-818bc0726f68", "photo-1618354691373-d851c5c3a990"],
    "Hoodie": ["photo-1556821840-3a63f95609a7", "photo-1620799140408-edc6dcb6d633", "photo-1578768079052-aa76e52ff62e"],
    "Sweatshirt": ["photo-1620799140408-edc6dcb6d633", "photo-1556821840-3a63f95609a7"],
    "Cap": ["photo-1588850561407-ed78c282e89b", "photo-1521369909029-2afed882baee", "photo-1575428652377-a2d80e2277fc"],
    "Beanie": ["photo-1576871337622-98d48d1cf531"],
    "Bag": ["photo-1544816155-12df9643f363", "photo-1597484662317-9bd7bdda2907"],
    "DTF Transfer": ["photo-1562408590-e32931084e23", "photo-1503694978374-8a2fa686963a"],
    "Supplies": ["photo-1503694978374-8a2fa686963a"],
}

PEOPLE = [
    ("Maya", "Thompson", "Riverbend Athletics"), ("Daniel", "Okafor", "Okafor Custom Tees"), ("Sofia", "Ramirez", None),
    ("Liam", "Chen", "Chen & Co. Merch"), ("Aisha", "Khan", None), ("Noah", "Bennett", "Bennett Brewing"),
    ("Emma", "Sullivan", None), ("Lucas", "Moreau", "Moreau Events"), ("Olivia", "Park", None),
    ("Ethan", "Brooks", "Brooks Fitness Club"), ("Zara", "Ali", None), ("Mateo", "Garcia", "Garcia Landscaping"),
    ("Hannah", "Weiss", None), ("Caleb", "Nguyen", "Nguyen Robotics Team"),
]
WHOLESALE = [
    ("Priya", "Shah", "Lone Star Screen Printing", "screen_printer", "Dallas", "TX", "75201"),
    ("Marcus", "Reed", "Reed Uniform Supply", "retailer", "Houston", "TX", "77002"),
    ("Elena", "Petrova", "Petrova Promo Group", "promotional", "Austin", "TX", "78701"),
    ("Jordan", "Hayes", "Hayes Team Sports", "retailer", "Denver", "CO", "80202"),
    ("Grace", "Kim", "Kim Embroidery Studio", "embroiderer", "Phoenix", "AZ", "85004"),
    ("Tyler", "Brandt", "Brandt School Spirit", "retailer", "Atlanta", "GA", "30303"),
]
PLACES = [
    ("1401 Elm St", "Dallas", "TX", "75202"), ("2200 Ross Ave", "Dallas", "TX", "75201"), ("500 W 2nd St", "Austin", "TX", "78701"),
    ("901 Bagby St", "Houston", "TX", "77002"), ("200 W Washington St", "Phoenix", "AZ", "85003"),
    ("1701 Wynkoop St", "Denver", "CO", "80202"), ("55 Trinity Ave SW", "Atlanta", "GA", "30303"),
    ("121 N LaSalle St", "Chicago", "IL", "60602"), ("1221 SW 4th Ave", "Portland", "OR", "97204"),
    ("100 N Garfield Ave", "Pasadena", "CA", "91101"),
]


def slugify(name: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-").replace("--", "-")


def address(person: str) -> dict[str, Any]:
    line1, city, state, zip_ = rnd.choice(PLACES)
    return {"label": "Default", "full_name": person, "line1": line1, "city": city, "state": state,
            "postal_code": zip_, "country": "US", "phone": f"214-555-{rnd.randint(1000, 9999)}"}


async def working_photos() -> dict[str, list[str]]:
    """Which of the photographs actually answer. Looked up once; a product
    never gets an address that draws a broken picture."""
    ok: dict[str, list[str]] = {}
    seen: dict[str, bool] = {}
    async with httpx.AsyncClient(timeout=8, follow_redirects=True) as web:
        for kind, ids in PHOTOS.items():
            for pid in ids:
                url = f"https://images.unsplash.com/{pid}?w=900&q=80&auto=format&fit=crop"
                if pid not in seen:
                    try:
                        seen[pid] = (await web.head(url)).status_code == 200
                    except Exception:  # noqa: BLE001  (no network: every product gets the plain placeholder)
                        seen[pid] = False
                if seen[pid]:
                    ok.setdefault(kind, []).append(url)
    return ok


def placeholder(name: str) -> str:
    return "https://placehold.co/900x900/EEF1F5/1F2430/png?text=" + name.replace(" ", "+")


# ── The parts ─────────────────────────────────────────────────────────────────
async def make_shop() -> str:
    rows = await sql("SELECT id FROM tenants WHERE slug = :s", {"s": SLUG})
    if rows:
        return str(rows[0][0])
    tid = str(uuid.uuid4())
    await sql("INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (:i, :s, :n, :e, 'active', 'scale')",
              {"i": tid, "s": SLUG, "n": SHOP, "e": ADMIN_EMAIL})
    await sql("""INSERT INTO tenant_branding (tenant_id, company_name, store_name, tagline, primary_color, secondary_color,
                                             accent_color, support_email, support_phone)
                 VALUES (:t, :n, :n, 'Custom apparel and DTF transfers, printed in Dallas', '#1C3557', '#16A34A',
                         '#F59E0B', 'hello@example.com', '214-555-0142')""", {"t": tid, "n": SHOP})
    # Paid up and on the top plan, with every feature on: the whole admin is there to look at.
    await sql("""INSERT INTO tenant_subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
                 VALUES (:t, 'scale', 'active', now() - interval '12 days', now() + interval '18 days')""", {"t": tid})
    for feature in ALL_FEATURES:
        await sql("INSERT INTO tenant_feature_flags (tenant_id, feature, is_enabled) VALUES (:t, :f, true)",
                  {"t": tid, "f": feature})
    await sql("""INSERT INTO users (id, tenant_id, email, hashed_password, first_name, last_name, role, is_admin,
                                    is_active, email_verified)
                 VALUES (gen_random_uuid(), :t, :e, :h, 'Sam', 'Carter', 'tenant_admin', true, true, true)""",
              {"t": tid, "e": ADMIN_EMAIL, "h": hash_password(PASSWORD)})
    count("shop")
    return tid


async def make_catalog(api: Api, admin: str, tid: str) -> None:
    if (await sql("SELECT count(*) FROM products WHERE tenant_id = :t", {"t": tid}))[0][0]:
        return
    wh = await attempt("warehouse", api.call("POST", "/api/v1/admin/warehouses", token=admin, json={
        "name": "Dallas Print Shop", "code": "DAL", "address_line1": "2200 Ross Ave", "city": "Dallas", "state": "TX",
        "postal_code": "75201", "country": "US"}))
    wh_id = (wh or {}).get("id")
    if not wh_id:
        rows = await sql("SELECT id FROM warehouses WHERE tenant_id = :t LIMIT 1", {"t": tid})
        wh_id = str(rows[0][0]) if rows else None

    cats: dict[str, str] = {}
    for i, name in enumerate(dict.fromkeys(p[1] for p in PRODUCTS)):
        out = await attempt(f"category {name}", api.call("POST", "/api/v1/admin/products/categories", token=admin,
                                                         json={"name": name, "sort_order": i}))
        if out:
            cats[name] = out["id"]
            count("categories")

    photos = await working_photos()
    for name, cat, price, colours, sizes, kind, vendor, status in PRODUCTS:
        gang = name == "DTF Gang Sheet"
        body = {
            "name": name, "slug": slugify(name), "status": status, "moq": 1, "product_type": kind, "vendor": vendor,
            "description": f"<p>{name}: soft, sturdy and made to be printed on. Ships from Dallas in two business days.</p>",
            "tags": [kind.lower(), cat.lower().split()[0]], "category_ids": [cats[cat]] if cat in cats else [],
            "gang_sheet_enabled": gang, "product_code": "NW-" + "".join(w[0] for w in name.split()).upper() + str(len(name)),
        }
        prod = await attempt(f"product {name}", api.call("POST", "/api/v1/admin/products", token=admin, json=body))
        if not prod:
            continue
        pid = prod["id"]
        count("products")
        pool = photos.get(kind) or []
        urls = rnd.sample(pool, k=min(len(pool), 2)) or [placeholder(name)]
        for n, url in enumerate(urls):
            await attempt(f"image {name}", api.call("POST", f"/api/v1/admin/products/{pid}/images/from-url", token=admin,
                                                    json={"url": url, "alt_text": name, "is_primary": n == 0}))
        variants = [{"sku": f"{body['product_code']}-{c[:3].upper()}-{s.replace(' ', '')[:6].upper()}", "color": c,
                     "color_hex": COLOURS.get(c), "size": s, "retail_price": price + (2 if s == "2XL" else 0), "status": "active"}
                    for c in colours for s in sizes]
        if variants:
            await attempt(f"variants {name}", api.call("POST", f"/api/v1/admin/products/{pid}/variants/batch",
                                                       token=admin, json={"variants": variants}))
            count("variants", len(variants))

    if wh_id:
        # Stock: plenty of most, a few low, a few out, so the inventory pages have something to say.
        rows = await sql("SELECT id FROM product_variants WHERE tenant_id = :t", {"t": tid})
        for (vid,) in rows:
            qty = rnd.choice([0, 3, 6] + [rnd.randint(20, 260)] * 9)
            if qty:
                await attempt("stock", api.call("POST", "/api/v1/admin/inventory/adjust", token=admin, json={
                    "variant_id": str(vid), "warehouse_id": wh_id, "quantity_delta": qty, "reason": "received",
                    "notes": "Opening stock"}))
        count("stock records", len(rows))


async def make_selling_rules(api: Api, admin: str, tid: str) -> None:
    if (await sql("SELECT count(*) FROM discount_codes WHERE tenant_id = :t", {"t": tid}))[0][0]:
        return
    await attempt("cash on delivery", api.call("PATCH", "/api/v1/admin/settings", token=admin, json={"cod_enabled": "true"}))
    soon = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=30)).isoformat()
    for code, kind, value, minimum, active in [
        ("WELCOME10", "percentage", 10, None, True), ("FREESHIP", "free_shipping", 0, 75, True),
        ("TEAM25", "percentage", 25, 500, True), ("SPRING5", "fixed_amount", 5, 40, True), ("BLACKFRIDAY", "percentage", 30, None, False),
    ]:
        if await attempt(f"discount {code}", api.call("POST", "/api/v1/admin/discounts", token=admin, json={
                "code": code, "discount_type": kind, "discount_value": value, "minimum_order_amount": minimum,
                "expires_at": soon if active else None, "is_active": active})):
            count("discounts")
    for name, w, h, price in [("22 x 12", 22, 12, 9.0), ("22 x 24", 22, 24, 15.0), ("22 x 60", 22, 60, 32.0), ("22 x 120", 22, 120, 58.0)]:
        if await attempt(f"sheet size {name}", api.call("POST", "/api/v1/admin/gang-sheets/sizes", token=admin, json={
                "name": name, "width_in": w, "height_in": h, "price_per_sheet": price, "bleed_in": 0.25, "spacing_in": 0.5})):
            count("gang sheet sizes")
    for name, region, rate in [("Texas sales tax", "TX", 8.25), ("Colorado sales tax", "CO", 7.65)]:
        if await attempt(f"tax {name}", api.call("POST", "/api/v1/admin/taxes", token=admin,
                                                 json={"name": name, "region": region, "rate": rate})):
            count("tax rates")
    await attempt("shipping tiers", api.call("POST", "/api/v1/admin/shipping-tiers/seed-defaults", token=admin))


async def make_customers(api: Api, admin: str, tid: str) -> list[tuple[str, str]]:
    """Returns (email, full name) of everybody who can sign in and buy."""
    buyers: list[tuple[str, str]] = []
    have = {r[0] for r in await sql("SELECT lower(email) FROM users WHERE tenant_id = :t", {"t": tid})}
    for first, last, company in PEOPLE:
        email = f"{first}.{last}@example.com".lower()
        buyers.append((email, f"{first} {last}"))
        if email in have:
            continue
        if await attempt(f"customer {email}", api.call("POST", "/api/v1/register-customer", json={
                "first_name": first, "last_name": last, "email": email, "password": PASSWORD,
                "phone": f"214-555-{rnd.randint(1000, 9999)}", "company_name": company})):
            count("customers")
    for first, last, company, kind, city, state, zip_ in WHOLESALE:
        email = f"{first}.{last}@example.com".lower()
        if email in have:
            continue
        if await attempt(f"wholesale {email}", api.call("POST", "/api/v1/register-wholesale", json={
                "company_name": company, "business_type": kind, "first_name": first, "last_name": last, "email": email,
                "password": PASSWORD, "phone": f"469-555-{rnd.randint(1000, 9999)}", "address_line1": rnd.choice(PLACES)[0],
                "city": city, "state_province": state, "postal_code": zip_, "country": "US",
                "expected_monthly_volume": rnd.choice(["$1,000 - $5,000", "$5,000 - $10,000", "Over $10,000"]),
                "how_heard": rnd.choice(["Google", "A friend", "Trade show"]), "website": f"https://{slugify(company)}.example.com"})):
            count("wholesale applications")
    # Four are let in, two are left waiting: the Applications page has both kinds on it.
    apps = await attempt("applications", api.call("GET", "/api/v1/admin/wholesale-applications", token=admin))
    everyone = rows_of(apps)
    waiting = [a for a in everyone if str(a.get("status", "")).lower() in ("pending", "submitted", "new")]
    # Only on the first run, when nobody has been let in yet: run again, it must not let the last two in.
    for a in (waiting[:4] if len(waiting) == len(everyone) else []):
        if await attempt("approve application", api.call(
                "POST", f"/api/v1/admin/wholesale-applications/{a['id']}/approve", token=admin, json={})):
            count("wholesale accounts approved")
    return buyers


async def make_orders(api: Api, admin: str, tid: str, buyers: list[tuple[str, str]]) -> None:
    if (await sql("SELECT count(*) FROM orders WHERE tenant_id = :t", {"t": tid}))[0][0]:
        return
    stock = await sql("""SELECT v.id, v.product_id, v.retail_price FROM product_variants v JOIN products p ON p.id = v.product_id
                         WHERE v.tenant_id = :t AND p.status = 'active' AND v.retail_price > 0""", {"t": tid})
    if not stock:
        failures.append("orders: no variants to sell")
        return

    def basket() -> dict[str, list[dict[str, Any]]]:
        """A few lines, grouped by product the way the order grid sends them."""
        by_product: dict[str, list[dict[str, Any]]] = {}
        for vid, pid, _price in rnd.sample(stock, k=rnd.randint(1, 4)):
            by_product.setdefault(str(pid), []).append({"variant_id": str(vid), "quantity": rnd.choice([1, 1, 2, 3, 6, 12, 24])})
        return by_product

    # Signed-in customers: through their own cart and checkout.
    for email, name in buyers:
        token = await attempt(f"sign in {email}", api.login(email))
        if not token:
            continue
        for _ in range(rnd.choice([1, 1, 2, 2, 3, 4])):
            added = False
            for pid, lines in basket().items():
                if await attempt(f"cart {email}", api.call("POST", "/api/v1/cart/add-matrix", token=token,
                                                           json={"product_id": pid, "items": lines})):
                    added = True
            if not added:
                continue
            if await attempt(f"order {email}", api.call("POST", "/api/v1/checkout/confirm", token=token, json={
                    "shipping_address": address(name), "shipping_method": "standard", "payment_method": "cod",
                    "shipping_cost": rnd.choice([0, 8.95, 12.5]), "order_notes": rnd.choice([None, None, "Please call before delivery."])})):
                count("orders")
    # Three of them leave something in the cart and walk away.
    for email, _name in buyers[:3]:
        token = await attempt(f"sign in {email}", api.login(email))
        if token:
            for pid, lines in basket().items():
                await attempt("abandoned cart", api.call("POST", "/api/v1/cart/add-matrix", token=token,
                                                         json={"product_id": pid, "items": lines}))
            count("carts left behind")

    # Guests.
    for i in range(12):
        first, last = rnd.choice(["Ava", "Leo", "Nora", "Omar", "Ivy", "Reza", "Tess", "Hugo"]), rnd.choice(
            ["Diaz", "Stone", "Mills", "Farah", "Lowe", "Vance", "Odom", "Frost"])
        lines = [{"variant_id": str(v), "quantity": rnd.choice([1, 2, 4, 10])} for v, _p, _pr in rnd.sample(stock, k=rnd.randint(1, 3))]
        if await attempt("guest order", api.call("POST", "/api/v1/guest/checkout", json={
                "guest_name": f"{first} {last}", "guest_email": f"{first}.{last}{i}@example.com".lower(),
                "guest_phone": f"972-555-{rnd.randint(1000, 9999)}", "items": lines, "shipping_address": address(f"{first} {last}"),
                "shipping_method": "standard", "payment_method": "cod", "shipping_cost": 8.95})):
            count("orders")

    # The last ten weeks, not just today: each order is moved back to a day of
    # its own, with everything that hangs off it, before the shop works on it.
    rows = await sql("SELECT id FROM orders WHERE tenant_id = :t ORDER BY created_at, id", {"t": tid})
    now = dt.datetime.now(dt.timezone.utc)
    ages = sorted((rnd.triangular(0, 70, 8) for _ in rows), reverse=True)
    when: dict[str, dt.datetime] = {}
    for (oid,), age in zip(rows, ages):
        t = now - dt.timedelta(days=age, hours=rnd.randint(0, 9), minutes=rnd.randint(0, 59))
        when[str(oid)] = t
        await sql("UPDATE orders SET created_at = :w, updated_at = :w WHERE id = :o", {"w": t, "o": oid})
        for table in ("order_items", "order_events"):
            await attempt(f"date {table}", sql(f"UPDATE {table} SET created_at = :w WHERE order_id = :o", {"w": t, "o": oid}))

    # The shop works on them: the older an order, the further along it is.
    for (oid,) in rows:
        age = (now - when[str(oid)]).days
        roll = rnd.random()
        steps: list[dict[str, Any]] = []
        paid = False
        if roll < 0.06:
            await attempt("cancel order", api.call("POST", f"/api/v1/admin/orders/{oid}/cancel", token=admin, json={
                "reason": rnd.choice(["Customer changed their mind", "Ordered the wrong size", "Duplicate order"]),
                "refund": False}))
            continue
        if age >= 1:
            steps.append({"status": "confirmed"})
        if age >= 2:
            steps.append({"status": "processing"})
        if age >= 4:
            steps.append({"status": "shipped", "tracking_number": f"9400{rnd.randint(10**15, 10**16 - 1)}",
                          "courier": "USPS", "courier_service": "Ground Advantage"})
            paid = True
        if age >= 8:
            steps.append({"status": "delivered"})
        for step in steps:
            await attempt(f"order {step['status']}", api.call("PATCH", f"/api/v1/admin/orders/{oid}/status",
                                                              token=admin, json=step))
        if paid or (age >= 2 and rnd.random() < 0.5):
            await attempt("mark paid", api.call("POST", f"/api/v1/admin/orders/{oid}/mark-paid", token=admin, json={}))
    # What happened to an order happened in its own days, not all this minute.
    await attempt("spread the events", sql("""
        UPDATE order_events e SET created_at = o.created_at + (x.rn * interval '26 hours')
          FROM (SELECT id, order_id, row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) - 1 AS rn
                  FROM order_events) x JOIN orders o ON o.id = x.order_id
         WHERE e.id = x.id AND o.tenant_id = :t AND o.created_at + (x.rn * interval '26 hours') < now()""", {"t": tid}))
    await attempt("customer figures", api.call("POST", "/api/v1/admin/segments/metrics/recompute-all", token=admin, json={}))


ART = "https://placehold.co/1800x1800/png?text="   # stands in for a customer's own artwork file


async def make_gang_sheets(api: Api, admin: str, tid: str, buyers: list[tuple[str, str]]) -> None:
    if (await sql("SELECT count(*) FROM gang_sheet_orders WHERE tenant_id = :t", {"t": tid}))[0][0]:
        return
    sizes = await sql("SELECT id, width_in, height_in FROM gang_sheet_sizes WHERE tenant_id = :t ORDER BY height_in", {"t": tid})
    product = await sql("SELECT id FROM products WHERE tenant_id = :t AND gang_sheet_enabled LIMIT 1", {"t": tid})
    if not sizes:
        failures.append("gang sheets: no sheet sizes")
        return
    for name, cat in [("Varsity Lettering", "Sports"), ("Flame Border", "Graphics"), ("Smiley Pack", "Fun"), ("Est. Badge", "Badges")]:
        if await attempt("library design", api.call("POST", "/api/v1/admin/gang-sheets/library", token=admin, json={
                "name": name, "file_url": ART + name.replace(" ", "+"), "file_type": "png", "category": cat})):
            count("ready-made designs")
    # Where each sheet has got to in the shop: one of every stage, so every tab of the page has a row.
    stages = [None, "in_review", "approved", "production", "completed", "revision_requested", "in_review", None]
    for (email, name), stage in zip(buyers[3:11], stages):
        token = await attempt(f"sign in {email}", api.login(email))
        if not token:
            continue
        size_id, w, h = rnd.choice(sizes)
        arts = [{"file_url": ART + label, "file_name": f"{label.lower()}.png", "file_type": "png",
                 "width_in": rnd.choice([3, 4, 6, 8]), "height_in": rnd.choice([3, 4, 5]), "quantity": rnd.choice([2, 4, 6, 12])}
                for label in rnd.sample(["Logo", "Mascot", "Team+Name", "Number+12", "Sponsor", "Slogan"], k=rnd.randint(1, 3))]
        order = await attempt(f"gang sheet {email}", api.call("POST", "/api/v1/gang-sheets/orders", token=token, json={
            "sheet_size_id": str(size_id), "sheet_quantity": rnd.choice([1, 1, 2, 5]), "artworks": arts,
            "product_id": str(product[0][0]) if product else None, "contact_email": email, "contact_name": name,
            "customer_notes": rnd.choice([None, "Please keep the colours bright.", "Needed for Saturday's game."])}))
        if not order:
            continue
        count("gang sheet orders")
        # Laid out the way the builder lays a sheet out: rows across the film,
        # inside the safe edge. A sheet with no layout cannot be bought.
        placed: list[dict[str, Any]] = []
        x = y = 0.25
        row = 0.0
        for art in order.get("artworks", []):
            aw, ah = float(art["width_in"]), float(art["height_in"])
            for _ in range(int(art.get("quantity", 1))):
                if x + aw > float(w) - 0.25:
                    x, y, row = 0.25, y + row + 0.5, 0.0
                if y + ah > float(h) - 0.25:
                    break
                placed.append({"artwork_id": art["id"], "x_in": round(x, 2), "y_in": round(y, 2), "rotation": 0,
                               "w_in": aw, "h_in": ah})
                x, row = x + aw + 0.5, max(row, ah)
        if placed:
            await attempt("gang sheet layout", api.call("PATCH", f"/api/v1/gang-sheets/orders/{order['id']}/layout",
                                                        token=token, json={"layout": placed}))
        # Most are bought, which is what sends a sheet to the shop's review queue.
        if stage is not None or rnd.random() < 0.5:
            if await attempt("gang sheet to cart", api.call("POST", "/api/v1/cart/add-gang-sheet", token=token,
                                                            json={"gang_sheet_order_id": order["id"]})):
                if await attempt("gang sheet checkout", api.call("POST", "/api/v1/checkout/confirm", token=token, json={
                        "shipping_address": address(name), "shipping_method": "standard", "payment_method": "cod",
                        "shipping_cost": 8.95})):
                    count("orders")
        if stage:
            note = "The logo is too small to print cleanly at this size. Please send a larger file." \
                if stage == "revision_requested" else None
            order_of = ["in_review", "approved", "production", "completed"]
            path = order_of[: order_of.index(stage) + 1] if stage in order_of else ["in_review", stage]
            for step in path:
                await attempt(f"gang sheet {step}", api.call(
                    "PATCH", f"/api/v1/admin/gang-sheets/orders/{order['id']}/status", token=admin,
                    json={"status": step, "supplier_notes": note if step == stage else None}))


async def make_extras(api: Api, admin: str, tid: str, buyers: list[tuple[str, str]]) -> None:
    """Everything else the admin has a page for."""
    products = await sql("SELECT id, name FROM products WHERE tenant_id = :t AND status = 'active' ORDER BY name", {"t": tid})

    if not (await sql("SELECT count(*) FROM product_reviews WHERE tenant_id = :t", {"t": tid}))[0][0]:
        words = [
            (5, "Prints beautifully", "Heavy, soft and the print sat perfectly on it. Reordering for the whole team."),
            (5, "Our go-to blank", "We have washed these thirty times and they still look new."),
            (4, "Good, runs a little large", "Quality is great. Size down if you are between sizes."),
            (5, "Fast turnaround", "Ordered Monday, on our doorstep Thursday."),
            (3, "Fine for the price", "Does the job. The collar could be a touch tighter."),
            (4, "Colours are spot on", "The navy is a true navy, which is harder to find than it should be."),
            (5, "Customers love them", "Sold out of the first run in a weekend."),
            (2, "Arrived creased", "Good shirt, but the box was crushed in the post."),
        ]
        for n in range(16):
            pid, _name = rnd.choice(products)
            rating, title, body = rnd.choice(words)
            who = rnd.choice(buyers)[1]
            if await attempt("review", api.call("POST", f"/api/v1/products/{pid}/reviews", json={
                    "rating": rating, "title": title, "body": body, "reviewer_name": who,
                    "reviewer_company": rnd.choice([None, "Riverbend Athletics", "Bennett Brewing"])})):
                count("reviews")
        # A review shows as soon as it is written; the shop has taken a few back down to look at.
        listed = await attempt("reviews list", api.call("GET", "/api/v1/admin/reviews", token=admin))
        for r in rows_of(listed)[:4]:
            await attempt("hold review", api.call("PATCH", f"/api/v1/admin/reviews/{r['id']}", token=admin,
                                                  json={"is_approved": False}))
        await attempt("date reviews", sql(
            "UPDATE product_reviews SET created_at = now() - (random() * interval '50 days') WHERE tenant_id = :t", {"t": tid}))

    if not (await sql("SELECT count(*) FROM messages WHERE tenant_id = :t", {"t": tid}))[0][0]:
        for (email, _name), (subject, body) in zip(buyers[:5], [
            ("Can I change the size on my order?", "I ordered a Large by mistake and need an XL. Is it too late?"),
            ("Bulk pricing for 300 hoodies", "We are kitting out a school. What can you do on 300 pullover hoodies?"),
            ("Where is my order?", "Tracking has not moved in three days. Could you check for me?"),
            ("Do you print on customer-supplied blanks?", "We have our own tees. Can we send them in?"),
            ("Invoice copy", "Could you send a copy of last month's invoice for our accountant?"),
        ]):
            token = await attempt(f"sign in {email}", api.login(email))
            if token and await attempt("message", api.call("POST", "/api/v1/account/messages", token=token,
                                                           json={"subject": subject, "body": body})):
                count("messages")
        for who, text_ in [("Dana Whitfield", "Do you offer same-day pickup in Dallas?"),
                           ("Rob Castellanos", "Looking for a quote on 500 DTF transfers, 4 inch wide.")]:
            if await attempt("contact form", api.call("POST", "/api/v1/storefront/contact", json={
                    "page_slug": "contact", "form_name": "Contact us",
                    "data": {"Name": who, "Email": who.split()[0].lower() + "@example.com", "Message": text_}})):
                count("contact form entries")

    if not (await sql("SELECT count(*) FROM blog_posts WHERE tenant_id = :t", {"t": tid}))[0][0]:
        for title, status in [("DTF or screen printing: which one for your order?", "published"),
                              ("How to size artwork for a gang sheet", "published"),
                              ("Five blanks our customers reorder most", "draft")]:
            if await attempt("blog post", api.call("POST", "/api/v1/admin/blog-posts", token=admin, json={
                    "title": title, "slug": slugify(title)[:60], "status": status, "read_time": "4 min",
                    "excerpt": "A short, practical guide from the print floor.", "tags": ["guides", "printing"],
                    "published_date": (dt.date.today() - dt.timedelta(days=rnd.randint(3, 40))).isoformat(),
                    "article_body": [{"type": "paragraph", "text": "Written by the people who run the presses."}]})):
                count("blog posts")

    if (await sql("SELECT count(*) FROM users WHERE tenant_id = :t AND is_admin", {"t": tid}))[0][0] < 2:
        for first, last, role in [("Nina", "Alvarez", "manager"), ("Owen", "Pruitt", "staff"), ("Lila", "Brandt", "staff")]:
            if await attempt("staff", api.call("POST", "/api/v1/admin/users", token=admin, json={
                    "email": f"{first}.{last}@example.com".lower(), "first_name": first, "last_name": last, "role": role,
                    "password": PASSWORD, "send_welcome_email": False})):
                count("staff accounts")

    if not (await sql("SELECT count(*) FROM pricing_tiers WHERE tenant_id = :t", {"t": tid}))[0][0]:
        for name, pct in [("Bronze", 5), ("Silver", 10), ("Gold", 15)]:
            if await attempt("customer tier", api.call("POST", "/api/v1/admin/pricing-tiers", token=admin, json={
                    "name": name, "description": f"{pct}% off list price", "discount_percent": pct})):
                count("customer tiers")

    if not (await sql("SELECT count(*) FROM collections WHERE tenant_id = :t", {"t": tid}))[0][0]:
        for i, name in enumerate(["Best sellers", "New arrivals", "Team and school"]):
            col = await attempt("collection", api.call("POST", "/api/v1/admin/collections", token=admin, json={
                "name": name, "match_type": "manual", "position": i, "description": f"{name}, picked by the shop."}))
            if col:
                count("collections")
                picks = [str(p[0]) for p in rnd.sample(products, k=min(len(products), 7))]
                await attempt("collection products", api.call(
                    "POST", f"/api/v1/admin/collections/{col['id']}/products", token=admin, json={"product_ids": picks}))

    if not (await sql("SELECT count(*) FROM manufacturers WHERE tenant_id = :t", {"t": tid}))[0][0]:
        variants = await sql("SELECT id FROM product_variants WHERE tenant_id = :t LIMIT 60", {"t": tid})
        for name, person in [("Northwind Blanks", "Carla Mendes"), ("Crown Headwear", "Dev Patel"), ("Harbor Goods", "Ines Roy")]:
            mfr = await attempt("manufacturer", api.call("POST", "/api/v1/admin/purchase-orders/manufacturers", token=admin, json={
                "name": name, "contact_name": person, "email": person.split()[0].lower() + "@example.com",
                "phone": f"800-555-{rnd.randint(1000, 9999)}", "address": "Los Angeles, CA"}))
            if not mfr:
                continue
            count("manufacturers")
            lines = [{"product_variant_id": str(v[0]), "qty_ordered": rnd.choice([48, 72, 144]),
                      "unit_cost_expected": round(rnd.uniform(3.2, 14.5), 2)} for v in rnd.sample(variants, k=4)]
            if await attempt("purchase order", api.call("POST", "/api/v1/admin/purchase-orders/", token=admin, json={
                    "manufacturer_id": mfr["id"], "notes": "Restock for next month",
                    "expected_delivery": (dt.date.today() + dt.timedelta(days=rnd.randint(5, 21))).isoformat(),
                    "line_items": lines})):
                count("purchase orders")

    if not (await sql("SELECT count(*) FROM rma_requests WHERE tenant_id = :t", {"t": tid}))[0][0]:
        done = await sql("""SELECT o.id, u.email, (SELECT oi.id FROM order_items oi WHERE oi.order_id = o.id LIMIT 1)
                              FROM orders o JOIN users u ON u.id = o.placed_by_id
                             WHERE o.tenant_id = :t AND o.status = 'delivered' LIMIT 3""", {"t": tid})
        for (oid, email, item), why in zip(done, ["Wrong size sent", "Print has a flaw", "No longer needed"]):
            token = await attempt(f"sign in {email}", api.login(email))
            if not (token and item):
                continue
            # This route saves the return and then fails to describe it back
            # (it answers 500 with the return already stored). The return is
            # what is wanted here, so the answer is not held against it.
            import logging

            logging.disable(logging.CRITICAL)      # its traceback is not news here
            try:
                await api.call("POST", "/api/v1/account/rma", token=token, json={
                    "order_id": str(oid), "reason": why, "items": [{"order_item_id": str(item), "quantity": 1, "reason": why}],
                    "notes": "Happy to exchange instead of a refund."})
            except Exception:  # noqa: BLE001
                pass
            finally:
                logging.disable(logging.NOTSET)
        saved = (await sql("SELECT count(*) FROM rma_requests WHERE tenant_id = :t", {"t": tid}))[0][0]
        if saved:
            count("returns", saved)
        elif done:
            failures.append("returns: none were saved")


async def main() -> None:
    api = Api()
    tid = await make_shop()
    admin = await api.login(ADMIN_EMAIL)
    await make_catalog(api, admin, tid)
    await make_selling_rules(api, admin, tid)
    buyers = await make_customers(api, admin, tid)
    await make_orders(api, admin, tid, buyers)          # before the gang sheets: buying one makes an order too
    await make_gang_sheets(api, admin, tid, buyers)
    await make_extras(api, admin, tid, buyers)
    await api.http.aclose()

    print("\nDemo shop:", SHOP, f"(http://{SLUG}.localhost:3000)")
    print("made this run:", ", ".join(f"{n} {what}" for what, n in made.items()) or "nothing new (already there)")
    for table in ("products", "product_variants", "inventory", "categories", "collections", "users", "companies",
                  "wholesale_applications", "orders", "order_items", "gang_sheet_orders", "rma_requests", "discount_codes",
                  "product_reviews", "messages", "contact_submissions", "blog_posts", "purchase_orders", "cart_items"):
        n = (await sql(f"SELECT count(*) FROM {table} WHERE tenant_id = :t", {"t": tid}))[0][0]
        print(f"  {table:<24}{n}")
    if failures:
        print(f"\n{len(failures)} thing(s) did not go through:")
        seen: dict[str, int] = {}
        for f in failures:
            key = f.split(":", 1)[0]
            seen[key] = seen.get(key, 0) + 1
            if seen[key] <= 2:
                print("  -", f)
        for key, n in seen.items():
            if n > 2:
                print(f"  - {key}: {n} times in all")
