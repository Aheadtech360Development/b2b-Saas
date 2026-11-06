"""The t-shirt designer, connected to the shop.

Which products it designs, what decoration costs there, and what a design
costs: the one place that is decided.

A product is put in the designer by switching it on (products.designer_enabled,
from Products → T-shirt designer or the product's own page). The designer then
draws it in its own colours and sizes, at its own variant prices, with the
shop's decoration prices on top: a price per printed side that drops at
quantity breaks (all pieces in the design count towards the break), embroidery
from a minimum number of pieces, and names and numbers per shirt.

The designer's live price follows the same rules (frontend lib/designer/
pricing.ts). What a design is recorded at is worked out here, from the
database; a figure the browser sends is never taken. A design is bought
through the cart: see "In the cart and on the order" below.
"""
from __future__ import annotations

import contextlib
import json
import re
import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

SETTINGS_KEY = "tshirt_designer"
FEATURE = "tshirt_designer"
VIEWS = ("front", "back", "left", "right")

# The garment shapes the designer has pictures of, every side (frontend
# public/designer/<shape>-<side>.webp, lib/designer/mockups.ts).
SILHOUETTES: dict[str, str] = {
    "tee": "T-shirt",
    "longsleeve": "Long sleeve tee",
    "tank": "Tank top",
    "muscle": "Muscle tee",
}

# Where a new shop starts. These are the designer's own starting figures, not
# any shop's prices: the shop sees them in Products → T-shirt designer → Prices
# and sets its own (the set-up list stays open until it has).
DEFAULT_RATES: dict[str, Any] = {
    "print": [
        {"min": 1, "per_side": 8.0},
        {"min": 12, "per_side": 5.5},
        {"min": 24, "per_side": 4.25},
        {"min": 48, "per_side": 3.5},
        {"min": 100, "per_side": 2.75},
    ],
    "embroidery": [
        {"min": 12, "per_side": 9.0},
        {"min": 24, "per_side": 7.5},
        {"min": 48, "per_side": 6.25},
        {"min": 100, "per_side": 5.0},
    ],
    "embroidery_minimum": 12,
    "name": 4.0,
    "number": 3.0,
}

MAX_TIERS = 12
MAX_PRICE = Decimal("1000")


class DesignerError(ValueError):
    """Something the shop or the buyer can be told, in these words."""


def _money(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ── The product's own settings ───────────────────────────────────────────────

def clean_config(raw: Any) -> dict[str, Any]:
    """{silhouette, embroidery} with defaults: a T-shirt, print only."""
    raw = raw if isinstance(raw, dict) else {}
    shape = raw.get("silhouette")
    return {
        "silhouette": shape if shape in SILHOUETTES else "tee",
        "embroidery": raw.get("embroidery") is True,
    }


# ── The shop's decoration prices ─────────────────────────────────────────────

def _tiers(raw: Any, what: str) -> list[dict[str, Any]]:
    if not isinstance(raw, list) or not raw:
        raise DesignerError(f"Add at least one {what} price.")
    if len(raw) > MAX_TIERS:
        raise DesignerError(f"Up to {MAX_TIERS} quantity breaks for {what}.")
    seen: dict[int, float] = {}
    for t in raw:
        if not isinstance(t, dict):
            raise DesignerError(f"A {what} price could not be read.")
        try:
            low = int(t.get("min"))
            price = _money(t.get("per_side"))
        except (TypeError, ValueError, ArithmeticError):
            raise DesignerError(f"Each {what} price needs a quantity and a price per side.")
        if isinstance(t.get("min"), bool) or low < 1 or low > 100000:
            raise DesignerError(f"A {what} quantity break is a whole number from 1 up.")
        if price < 0 or price > MAX_PRICE:
            raise DesignerError(f"A {what} price per side is from $0 to $1,000.")
        if low in seen:
            raise DesignerError(f"Each {what} quantity break once.")
        seen[low] = float(price)
    return [{"min": k, "per_side": v} for k, v in sorted(seen.items())]


def check_rates(raw: Any) -> dict[str, Any]:
    """The prices the shop sent, or DesignerError saying what is wrong."""
    if not isinstance(raw, dict):
        raise DesignerError("The prices could not be read.")
    printing = _tiers(raw.get("print"), "print")
    if printing[0]["min"] != 1:
        raise DesignerError("Print prices start at 1 piece, so every order has a price.")
    stitching = _tiers(raw.get("embroidery"), "embroidery")
    try:
        minimum = int(raw.get("embroidery_minimum"))
        name, number = _money(raw.get("name")), _money(raw.get("number"))
    except (TypeError, ValueError, ArithmeticError):
        raise DesignerError("The embroidery minimum and the name and number prices need numbers.")
    if minimum < 1 or minimum > 100000:
        raise DesignerError("The embroidery minimum is a whole number from 1 up.")
    if stitching[0]["min"] > minimum:
        raise DesignerError("The first embroidery price must start at or below the embroidery minimum.")
    for word, v in (("name", name), ("number", number)):
        if v < 0 or v > MAX_PRICE:
            raise DesignerError(f"The price of a {word} is from $0 to $1,000.")
    return {"print": printing, "embroidery": stitching, "embroidery_minimum": minimum,
            "name": float(name), "number": float(number)}


def settings_from(raw: Any) -> dict[str, Any]:
    """The stored settings: the shop's prices once it has saved them, else the starting ones."""
    data = raw if isinstance(raw, dict) else {}
    try:
        rates = check_rates(data.get("rates"))
        saved = bool(data.get("saved"))
    except DesignerError:
        rates, saved = json.loads(json.dumps(DEFAULT_RATES)), False
    return {"rates": rates, "saved": saved}


async def settings_for(db: AsyncSession, tenant_id: Any) -> dict[str, Any]:
    from app.core.tenant_settings import get_setting

    raw = await get_setting(db, SETTINGS_KEY, tenant_id=tenant_id)
    try:
        return settings_from(json.loads(raw) if raw else None)
    except (TypeError, ValueError):
        return settings_from(None)


async def save_rates(db: AsyncSession, tenant_id: Any, rates: Any) -> dict[str, Any]:
    from app.core.tenant_settings import set_setting

    clean = check_rates(rates)
    await set_setting(db, SETTINGS_KEY, json.dumps({"rates": clean, "saved": True}), tenant_id=tenant_id)
    return {"rates": clean, "saved": True}


async def active(db: AsyncSession, tenant_id: Any) -> bool:
    """The designer is in the shop's plan and the platform has not switched it off."""
    from app.services import entitlements

    try:
        return bool(tenant_id) and await entitlements.enabled(db, tenant_id, FEATURE)
    except Exception:  # noqa: BLE001
        return False


# ── The products, as the designer draws them ─────────────────────────────────

def colour_id(name: str) -> str:
    """A colour's id in a design: its name, lower case, words joined by dashes."""
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:60].strip("-")
    return slug or "colour"


def _plain(text: str | None, limit: int = 400) -> str:
    words = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text or "")).strip()
    return words if len(words) <= limit else words[: limit - 1].rstrip() + "…"


def garment_of(product: Any) -> dict[str, Any] | None:
    """One switched-on product as the designer's garment: its colours with
    their own swatch, its sizes in size order, and every colour and size's own
    price and variant. None when it has nothing on sale."""
    from app.services.size_order import sort_sizes

    cfg = clean_config(product.designer_config)
    colours: dict[str, dict[str, Any]] = {}
    prices: dict[str, float] = {}
    variants: dict[str, str] = {}
    sizes: list[str] = []
    for v in product.variants or []:
        if (v.status or "active") != "active" or v.retail_price is None:
            continue
        name = (v.color or "").strip() or "One colour"
        cid = colour_id(name)
        size = (v.size or "").strip() or "One size"
        colours.setdefault(cid, {"id": cid, "name": name, "hex": (v.color_hex or "").strip() or None})
        key = f"{cid}|{size}"
        if key in prices:
            continue
        prices[key] = float(_money(v.retail_price))
        variants[key] = str(v.id)
        if size not in sizes:
            sizes.append(size)
    if not prices:
        return None
    return {
        "id": str(product.id),
        "slug": product.slug,
        "name": product.name,
        "styleCode": product.product_code or "",
        "brand": product.vendor or "",
        "silhouette": cfg["silhouette"],
        "description": _plain(product.short_description or product.description),
        "fabric": product.fabric or "",
        "basePrice": min(prices.values()),
        "sizes": sort_sizes(sizes),
        "colors": list(colours.values()),
        "embroidery": cfg["embroidery"],
        "prices": prices,
        "variants": variants,
    }


async def designer_products(db: AsyncSession, *, only_ids: list[Any] | None = None) -> list[Any]:
    """The shop's switched-on products that are on sale (tenant-scoped by the session)."""
    from app.models.product import Product

    q = (select(Product).options(selectinload(Product.variants))
         .where(Product.designer_enabled.is_(True), Product.status == "active")
         .order_by(Product.name))
    if only_ids is not None:
        q = q.where(Product.id.in_(only_ids))
    return list((await db.execute(q)).scalars().all())


async def catalog(db: AsyncSession, tenant_id: Any) -> dict[str, Any]:
    """What the designer opens with: the products it designs, and the prices."""
    if not await active(db, tenant_id):
        return {"available": False, "garments": [], "rates": None}
    garments = [g for g in (garment_of(p) for p in await designer_products(db)) if g]
    return {"available": True, "garments": garments, "rates": (await settings_for(db, tenant_id))["rates"]}


# ── What a design costs ──────────────────────────────────────────────────────

def _sides(design: Any) -> list[str]:
    design = design if isinstance(design, dict) else {}
    return [v for v in VIEWS if isinstance(design.get(v), list) and len(design[v]) > 0]


def _tier(tiers: list[dict[str, Any]], qty: int) -> tuple[dict[str, Any], dict[str, Any] | None]:
    i = 0
    while i + 1 < len(tiers) and qty >= tiers[i + 1]["min"]:
        i += 1
    return tiers[i], (tiers[i + 1] if i + 1 < len(tiers) else None)


def _count(n: Any) -> int:
    return int(n) if isinstance(n, (int, float)) and not isinstance(n, bool) and n > 0 else 0


def quote(doc: dict[str, Any], garments: dict[str, dict[str, Any]], rates: dict[str, Any]) -> dict[str, Any]:
    """What the design costs, line by line, and what stops it being ordered.

    The same rules as the designer's own price (lib/designer/pricing.ts quote):
    each piece is its garment's price in that colour and size, plus the price
    per side for every side of that shirt with art on it, at the break the
    whole design's quantity reaches; names and numbers are per shirt on the
    roster. Nothing is charged while a problem stands.
    """
    method = doc.get("method") if doc.get("method") in ("print", "embroidery") else "print"
    designs = doc.get("designs") if isinstance(doc.get("designs"), dict) else {}
    products = doc.get("products") if isinstance(doc.get("products"), list) else []
    keys = [f"{p.get('garmentId')}:{c}" for p in products if isinstance(p, dict)
            for c in (p.get("colorIds") or [])]
    sides_by_line = {k: _sides(designs.get(k)) for k in keys}
    all_sides = [v for v in VIEWS if any(v in s for s in sides_by_line.values())]

    def sides_of(line: str) -> list[str]:
        return sides_by_line.get(line, all_sides)

    roster = [r for r in (doc.get("roster") or []) if isinstance(r, dict)]
    quantities: dict[str, dict[str, int]] = {}
    raw_q = doc.get("quantities") if isinstance(doc.get("quantities"), dict) else {}
    for line, sizes in raw_q.items():
        if isinstance(sizes, dict):
            quantities[str(line)] = {str(z): _count(n) for z, n in sizes.items()}
    # Every roster shirt is a piece: the grid is raised to cover them.
    counts: dict[str, dict[str, int]] = {}
    for r in roster:
        c = counts.setdefault(str(r.get("line")), {})
        c[str(r.get("size"))] = c.get(str(r.get("size")), 0) + 1
    for line, sizes in counts.items():
        row = quantities.setdefault(line, {})
        for z, n in sizes.items():
            row[z] = max(row.get(z, 0), n)

    problems: list[str] = []
    pending: list[tuple[str, str, str, int]] = []
    for line, sizes in quantities.items():
        gid, _, cid = line.partition(":")
        g = garments.get(gid)
        if not g:
            continue
        for z, qty in sizes.items():
            if qty > 0:
                pending.append((gid, cid, z, qty))
    line_order = list(dict.fromkeys(f"{gid}:{cid}" for gid, cid, _, _ in pending))

    def rank(item: tuple[str, str, str, int]) -> int:
        gid, cid, z, _ = item
        g_sizes = garments[gid]["sizes"]
        return line_order.index(f"{gid}:{cid}") * 1000 + (g_sizes.index(z) if z in g_sizes else 999)

    pending.sort(key=rank)
    total_qty = sum(q for *_, q in pending)

    tiers = rates["embroidery"] if method == "embroidery" else rates["print"]
    tier, nxt = _tier(tiers, total_qty)
    per_side = _money(tier["per_side"])
    lines: list[dict[str, Any]] = []
    for gid, cid, z, qty in pending:
        g = garments[gid]
        base = g["prices"].get(f"{cid}|{z}")
        colour = next((c["name"] for c in g["colors"] if c["id"] == cid), cid)
        if base is None:
            problems.append(f"{g['name']} in {colour}, size {z}, is not on sale. Remove it from your sizes.")
            continue
        sides = sides_of(f"{gid}:{cid}")
        unit = cents(_money(base) + per_side * len(sides))
        lines.append({"garment_id": gid, "color_id": cid, "colour": colour, "size": z, "qty": qty,
                      "variant_id": g["variants"].get(f"{cid}|{z}"), "unit": float(unit),
                      "subtotal": float(cents(unit * qty)), "sides": sides})

    counted = {k for k in quantities if k.partition(":")[0] in garments}
    personal = Decimal("0")
    for r in roster:
        if str(r.get("line")) in counted:
            if str(r.get("name") or "").strip():
                personal += _money(rates["name"])
            if str(r.get("number") or "").strip():
                personal += _money(rates["number"])
    personal = cents(personal)

    if not all_sides:
        problems.insert(0, "Add artwork to at least one side.")
    bare = [line for line in line_order if not sides_of(line)] if all_sides else []
    for line in bare:
        gid, _, cid = line.partition(":")
        g = garments[gid]
        colour = next((c["name"] for c in g["colors"] if c["id"] == cid), cid)
        problems.append(f"Add artwork to the {g['name']} in {colour}, or remove its sizes.")
    if not total_qty:
        problems.append("Add at least one size and quantity.")
    if method == "embroidery":
        for gid in {gid for gid, *_ in pending}:
            if not garments[gid]["embroidery"]:
                problems.append(f"{garments[gid]['name']} is not embroidered here. Choose print for it.")
        if 0 < total_qty < rates["embroidery_minimum"]:
            problems.append(f"Embroidery starts at {rates['embroidery_minimum']} pieces. "
                            f"Add {rates['embroidery_minimum'] - total_qty} more to order.")
    for line in quantities:
        if line.partition(":")[0] not in garments and any(n > 0 for n in quantities[line].values()):
            problems.append("A product in this design is no longer offered. Remove it and choose another.")
            break

    ready = not problems
    total = cents(sum((Decimal(str(x["subtotal"])) for x in lines), Decimal("0")) + personal) if ready else Decimal("0")
    return {
        "method": method,
        "total_qty": total_qty,
        "per_side": float(per_side),
        "lines": lines,
        "personalization": float(personal),
        "total": float(total),
        "next_break": {"qty": nxt["min"]} if nxt else None,
        "problems": problems,
    }


async def priced(db: AsyncSession, tenant_id: Any, doc: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """The design's quote from the shop's products and prices as they stand
    now, and the garments it was priced on."""
    ids: list[uuid.UUID] = []
    for p in doc.get("products") or []:
        gid = p.get("garmentId") if isinstance(p, dict) else None
        try:
            ids.append(uuid.UUID(str(gid)))
        except ValueError:
            continue
    found = await designer_products(db, only_ids=ids) if ids else []
    garments = {g["id"]: g for g in (garment_of(p) for p in found) if g}
    rates = (await settings_for(db, tenant_id))["rates"]
    return quote(doc, garments, rates), garments


async def price_design(db: AsyncSession, tenant_id: Any, doc: dict[str, Any]) -> dict[str, Any]:
    """The design's price from the shop's products and prices as they stand now."""
    return (await priced(db, tenant_id, doc))[0]


# ── In the cart and on the order ─────────────────────────────────────────────
#
# A design is bought the way a gang sheet is: one line in the cart for the
# whole design, priced here. On the order it becomes one line per garment,
# colour and size, on that blank's own variant, so its stock comes off the
# shelf like any other line's, and one more for names and numbers. The design
# then belongs to the order and goes into the print team's review queue.

CART_LINE = "tshirt_design"
UNNAMED = "Untitled design"


def design_info(configuration: Any) -> dict[str, Any] | None:
    """The design a cart or order line is for, or None for any other line."""
    info = configuration.get("tshirt_design") if isinstance(configuration, dict) else None
    return info if isinstance(info, dict) and info.get("id") else None


def line_label(design: Any) -> str:
    """What the cart calls the line: the buyer's own name for the design."""
    name = (getattr(design, "name", None) or "").strip()
    return (name if name and name != UNNAMED else "Custom design")[:300]


def may_buy(design: Any, company_id: Any, user_id: Any) -> bool:
    """A design made signed in is its account's to buy; one made as a guest,
    whoever holds its id (as with a gang sheet)."""
    if design.company_id is not None:
        return str(design.company_id) == str(company_id or "")
    if design.user_id is not None:
        return str(design.user_id) == str(user_id or "")
    return True


def snapshot(design: Any, q: dict[str, Any], garments: dict[str, Any]) -> dict[str, Any]:
    """A priced design as its cart line keeps it: enough to show it, and to
    make the order's lines from it if the shop's prices or products change in
    the moment between the card being charged and the order being made."""
    return {
        "id": str(design.id),
        "reference": design.reference,
        "name": design.name or UNNAMED,
        "method": q["method"],
        "pieces": q["total_qty"],
        "per_side": q["per_side"],
        "personalization": q["personalization"],
        "total": q["total"],
        "lines": [{
            "garment_id": x["garment_id"],
            "garment": (garments.get(x["garment_id"]) or {}).get("name") or "Shirt",
            "variant_id": x["variant_id"],
            "colour": x["colour"],
            "size": x["size"],
            "qty": x["qty"],
            "unit": x["unit"],
            "subtotal": x["subtotal"],
            "sides": x.get("sides") or [],
        } for x in q["lines"]],
    }


async def for_cart(db: AsyncSession, tenant_id: Any, design: Any) -> dict[str, Any]:
    """The design as a cart line, priced now, or DesignerError saying why it
    cannot be ordered as it stands."""
    if not await active(db, tenant_id):
        raise DesignerError("The t-shirt designer is not open in this shop.")
    q, garments = await priced(db, tenant_id, design.document or {})
    if q["problems"]:
        raise DesignerError(q["problems"][0])
    return snapshot(design, q, garments)


async def stock_problem(db: AsyncSession, lines: list[dict[str, Any]], *, lock: bool = False) -> str | None:
    """Why the blanks a design needs cannot all be sold, or None when they can.

    The shop's one stock rule (inventory_service.sellable_stock): a product
    that counts its stock sells what it has, one that does not sells without a
    limit. `lock` holds the variant rows until the order is made, as checkout
    does for any other line, so two orders cannot both take the last shirts.
    """
    from app.models.product import Product, ProductVariant
    from app.services.inventory_service import sellable_stock
    from app.services.inventory_service import stock_problem as short_of

    ids: list[uuid.UUID] = []
    for x in lines:
        with contextlib.suppress(ValueError):
            ids.append(uuid.UUID(str(x.get("variant_id"))))
    q = (select(ProductVariant, Product).join(Product, Product.id == ProductVariant.product_id)
         .where(ProductVariant.id.in_(ids or [uuid.uuid4()])))
    if lock:
        q = q.with_for_update()
    found = {str(v.id): (v, p) for v, p in (await db.execute(q)).all()}
    for x in lines:
        what = f"{x.get('garment') or 'A shirt'} in {x.get('colour')}, size {x.get('size')}"
        hit = found.get(str(x.get("variant_id")))
        if hit is None or (hit[0].status or "active") != "active":
            return f"{what}, is no longer on sale. Open the design and choose another."
        variant, product = hit
        problem = short_of(await sellable_stock(db, variant, tracked=product.track_inventory), int(x["qty"]), what)
        if problem:
            return problem
    return None


async def preview_of(db: AsyncSession, design_id: Any) -> str | None:
    """The design's picture for a cart or order line: the first shirt's front,
    else its first preview."""
    from app.api.v1.tshirt_designs import TShirtDesignOutput

    rows = (await db.execute(
        select(TShirtDesignOutput.view, TShirtDesignOutput.file_url)
        .where(TShirtDesignOutput.design_id == design_id, TShirtDesignOutput.kind == "preview")
        .order_by(TShirtDesignOutput.shirt_key, TShirtDesignOutput.created_at)
    )).all()
    front = next((url for view, url in rows if view == "front"), None)
    return front or (rows[0][1] if rows else None)


async def order_items(db: AsyncSession, snap: dict[str, Any]) -> list[dict[str, Any]]:
    """The order's lines for one design (see the note above), from its priced
    snapshot. Their totals add up to the design's total."""
    from app.models.product import ProductVariant

    ids: list[uuid.UUID] = []
    for x in snap["lines"]:
        with contextlib.suppress(ValueError):
            ids.append(uuid.UUID(str(x.get("variant_id"))))
    skus = dict((await db.execute(
        select(ProductVariant.id, ProductVariant.sku).where(ProductVariant.id.in_(ids or [uuid.uuid4()]))
    )).all())
    about = {"id": snap["id"], "reference": snap["reference"], "name": snap.get("name") or UNNAMED,
             "method": snap.get("method") or "print"}
    out: list[dict[str, Any]] = []
    for x in snap["lines"]:
        try:
            vid: uuid.UUID | None = uuid.UUID(str(x.get("variant_id")))
        except ValueError:
            vid = None
        try:
            pid: uuid.UUID | None = uuid.UUID(str(x.get("garment_id")))
        except ValueError:
            pid = None
        out.append({
            "variant_id": vid,
            "product_id": pid,
            "product_name": f"{x.get('garment') or 'Shirt'} · Custom design {snap['reference']}"[:255],
            "sku": str(skus.get(vid) or snap["reference"])[:100],
            "color": str(x.get("colour") or "")[:100] or None,
            "size": str(x.get("size") or "")[:50] or None,
            "quantity": int(x["qty"]),
            "unit_price": _money(x["unit"]),
            "line_total": _money(x["subtotal"]),
            "configuration": {"tshirt_design": {**about, "sides": list(x.get("sides") or []),
                                                "per_side": snap.get("per_side")}},
        })
    personal = _money(snap.get("personalization") or 0)
    if personal > 0:
        out.append({
            "variant_id": None,
            "product_id": None,
            "product_name": f"Names and numbers · Custom design {snap['reference']}"[:255],
            "sku": "TS-NAMES",
            "color": None,
            "size": None,
            "quantity": 1,
            "unit_price": personal,
            "line_total": personal,
            "configuration": {"tshirt_design": {**about, "names_and_numbers": True}},
        })
    return out


async def lines_for_order(db: AsyncSession, tenant_id: Any, design: Any, kept: dict[str, Any] | None,
                          *, charged: bool) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """A design's order lines at checkout, and the snapshot they were made from.

    Priced again, so the order is what the design costs now (the cart priced it
    the same way a moment ago, and so did the card). When it can no longer be
    ordered as it stands and a card has already paid for it, the cart's own
    snapshot stands, rather than keep the money and make no order; otherwise
    the buyer is told why (DesignerError). Its blanks must be in stock: the
    rows are held until the order is made (InsufficientStockError otherwise,
    as for any line).
    """
    from app.core.exceptions import InsufficientStockError

    try:
        snap = await for_cart(db, tenant_id, design)
    except DesignerError:
        if not (charged and kept and kept.get("lines")):
            raise
        snap = kept
    problem = await stock_problem(db, snap["lines"], lock=True)
    if problem:
        raise InsufficientStockError(problem)
    return await order_items(db, snap), snap


async def link_to_order(db: AsyncSession, design_ids: list[Any], order: Any) -> list[Any]:
    """The designs this checkout bought now belong to the order and go into
    the print team's review queue, as a gang sheet does. One made as a guest
    takes the name and email the order has, so the shop can reach them."""
    from datetime import UTC, datetime

    from app.api.v1.tshirt_designs import STATUS_IN_REVIEW, STATUS_SUBMITTED, TShirtDesign

    ids = [i for i in design_ids if i]
    if not ids:
        return []
    rows = list((await db.execute(select(TShirtDesign).where(TShirtDesign.id.in_(ids)))).scalars().all())
    who_name, who_email = (order.guest_name or None), (order.guest_email or None)
    if (not who_name or not who_email) and (order.placed_by_id or order.company_id):
        from app.models.company import Company
        from app.models.user import User

        if order.company_id and not who_name:
            who_name = (await db.execute(select(Company.name).where(Company.id == order.company_id))).scalar()
        if order.placed_by_id:
            first, last, email = (await db.execute(
                select(User.first_name, User.last_name, User.email).where(User.id == order.placed_by_id)
            )).first() or (None, None, None)
            who_name = who_name or " ".join(x for x in (first, last) if x).strip() or None
            who_email = who_email or email
    for d in rows:
        d.order_id = order.id
        if order.payment_status == "paid":
            d.paid_at = datetime.now(UTC)
        if d.status == STATUS_SUBMITTED:
            d.status = STATUS_IN_REVIEW
        if not d.contact_name and who_name:
            d.contact_name = str(who_name)[:255]
        if not d.contact_email and who_email:
            d.contact_email = str(who_email)[:255]
    await db.flush()
    return rows


def bought(doc: Any) -> dict[str, Any]:
    """What a design orders, apart from its artwork: each shirt's sizes and
    quantities, its printed sides, the method and the roster. A design that is
    paid for may have its artwork changed and nothing else."""
    doc = doc if isinstance(doc, dict) else {}
    designs = doc.get("designs") if isinstance(doc.get("designs"), dict) else {}
    raw_q = doc.get("quantities") if isinstance(doc.get("quantities"), dict) else {}
    sizes = {str(line): {str(z): _count(n) for z, n in row.items() if _count(n)}
             for line, row in raw_q.items() if isinstance(row, dict)}
    roster = sorted(
        (str(r.get("line")), str(r.get("size")), bool(str(r.get("name") or "").strip()),
         bool(str(r.get("number") or "").strip()))
        for r in (doc.get("roster") or []) if isinstance(r, dict)
    )
    return {
        "method": doc.get("method") if doc.get("method") in ("print", "embroidery") else "print",
        "sizes": {k: v for k, v in sizes.items() if v},
        "sides": {k: _sides(designs.get(k)) for k in sorted(sizes) if sizes[k]},
        "roster": roster,
    }
