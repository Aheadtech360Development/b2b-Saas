"""The design's product page, filled with a real product.

The design draws a product page: a gallery, a title, a price, some rows of
choices, a quantity box and a button. This puts the store's own product into
that drawing — its pictures, its words, its prices, and the choices it was
actually given in the admin.

Nothing here invents a choice. A row the design drew that the product has no
option for is removed rather than left standing with example values, because a
shopper picking "Spot UV" on a product that doesn't offer it is worse than not
being offered it. What the product does have is rendered in the design's own
markup for a choice, so the page still looks like the design.

Every generated control carries the ids it came from (`data-option-id`,
`data-value-id`, `data-variant-id`), which is what the buying script will bind
to next.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from bs4 import BeautifulSoup, Tag
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.product_option import ProductOption, ProductQtyTier


def _money(value: float | Decimal | None) -> str:
    return "" if value is None else f"${float(value):,.2f}"


def _clear(tag: Tag) -> None:
    tag.clear()


def _set_text(tag: Tag, value: str) -> None:
    keep = [c for c in tag.children if isinstance(c, Tag) and c.name in {"svg", "img", "br"}]
    tag.clear()
    for child in keep:
        tag.append(child)
    tag.append(value)


def _as_image(holder: Tag, url: str, alt: str = "") -> None:
    """Put a real picture where the design drew a grey box."""
    if holder.name == "img":
        holder["src"] = url
        holder["alt"] = alt
        return
    holder.clear()
    holder["class"] = [c for c in (holder.get("class") or []) if c != "placeholder"]
    style = holder.get("style") or ""
    holder["style"] = f"{style};overflow:hidden;padding:0;border:0;background:none".strip(";")
    img = BeautifulSoup("", "html.parser").new_tag("img", src=url)
    img["alt"] = alt
    img["loading"] = "lazy"
    img["style"] = "width:100%;height:100%;object-fit:cover;display:block"
    holder.append(img)


async def load(db: AsyncSession, product_id: Any) -> dict[str, Any] | None:
    """Everything the design's product page could need about one product."""
    product = (await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.images),
            selectinload(Product.variants),
            selectinload(Product.options).selectinload(ProductOption.values),
        )
    )).scalar_one_or_none()
    if product is None:
        return None

    tiers = (await db.execute(
        select(ProductQtyTier).where(ProductQtyTier.product_id == product.id).order_by(ProductQtyTier.min_qty)
    )).scalars().all()

    # Stock lives in the warehouses, not on the variant. A variant nobody
    # tracks stock for is treated as available, which is what the rest of the
    # storefront does with it.
    from sqlalchemy import func as _func

    from app.models.inventory import InventoryRecord

    variant_ids = [v.id for v in (product.variants or [])]
    on_hand: dict[Any, int] = {}
    if variant_ids:
        on_hand = {
            row[0]: int(row[1] or 0)
            for row in (await db.execute(
                select(InventoryRecord.variant_id, _func.sum(InventoryRecord.quantity))
                .where(InventoryRecord.variant_id.in_(variant_ids))
                .group_by(InventoryRecord.variant_id)
            )).all()
        }

    images = sorted(product.images or [], key=lambda i: (not getattr(i, "is_primary", False), getattr(i, "sort_order", 0)))
    variants = [v for v in (product.variants or []) if v.status == "active"]
    prices = [float(v.retail_price) for v in variants if v.retail_price is not None]
    if not prices and product.base_price is not None:
        prices = [float(product.base_price)]

    # Every buyable combination, so the page can price and add to cart from
    # what the store actually stocks rather than from what the design drew.
    combinations = [
        {
            "id": str(v.id),
            "colour": v.color or "",
            "size": v.size or "",
            "price": float(v.retail_price) if v.retail_price is not None else None,
            "stock": on_hand.get(v.id, 9999),
            "sku": v.sku,
        }
        for v in variants
    ]

    colours: list[dict[str, Any]] = []
    sizes: list[dict[str, Any]] = []
    for v in variants:
        if v.color and not any(c["label"] == v.color for c in colours):
            colours.append({"label": v.color, "hex": v.color_hex or "", "variant_id": str(v.id)})
        if v.size and not any(s["label"] == v.size for s in sizes):
            sizes.append({"label": v.size, "variant_id": str(v.id)})

    options = []
    for o in sorted(product.options or [], key=lambda x: x.position):
        if not o.is_active:
            continue
        values = [
            {"id": str(v.id), "label": v.label, "hex": v.swatch_hex or "", "image": v.image_url or "",
             "default": bool(v.is_default)}
            for v in sorted(o.values, key=lambda x: x.position) if v.enabled
        ]
        if values:
            options.append({"id": str(o.id), "name": o.name, "input_type": o.input_type,
                            "required": bool(o.required), "values": values})

    return {
        "id": str(product.id),
        "name": product.name,
        "slug": product.slug,
        "summary": (product.short_description or "").strip(),
        "description": (product.description or "").strip(),
        "pricing_mode": product.pricing_mode or "variant",
        "images": [
            {"url": getattr(i, "url_large", None) or getattr(i, "url_medium", ""), "alt": getattr(i, "alt_text", "") or product.name}
            for i in images
        ],
        "from_price": min(prices) if prices else None,
        "variants": combinations,
        "colours": colours,
        "sizes": sizes,
        "options": options,
        "qty_tiers": [{"min_qty": int(t.min_qty), "unit_price": float(t.unit_price)} for t in tiers],
        "review_count": int(getattr(product, "review_count", 0) or 0),
        "avg_rating": float(getattr(product, "avg_rating", 0) or 0),
        "size_chart": product.size_chart_data or [],
        "gang_sheet": bool(product.gang_sheet_enabled),
    }


# ── The parts of the design's buy box ───────────────────────────────────────

def _fill_gallery(root: Tag, data: dict[str, Any]) -> None:
    images = data["images"]
    main = root.select_one(".main-img") or root.select_one(".gallery .placeholder, .gallery img")
    if main is not None:
        if images:
            _as_image(main, images[0]["url"], images[0]["alt"])
        else:
            _clear(main)  # an empty box, not "[Main Photo: …]"

    thumbs_row = root.select_one(".thumbs")
    if thumbs_row is None:
        return
    thumbs = [t for t in thumbs_row.children if isinstance(t, Tag)]
    if not thumbs:
        return
    template = str(thumbs[0])
    rest = images[1:] if len(images) > 1 else []
    thumbs_row.clear()
    if not rest:
        thumbs_row.decompose()  # one picture needs no filmstrip
        return
    for image in rest:
        node = BeautifulSoup(template, "html.parser")
        tag = next((c for c in node.children if isinstance(c, Tag)), None)
        if tag is None:
            continue
        holder = tag if ("placeholder" in (tag.get("class") or []) or tag.name == "img") else (
            tag.select_one(".placeholder, img") or tag
        )
        _as_image(holder, image["url"], image["alt"])
        thumbs_row.append(tag)


def _fill_headline(root: Tag, data: dict[str, Any]) -> None:
    heading = root.find("h1")
    if heading is not None:
        _set_text(heading, data["name"])

    line = root.select_one(".value-line") or root.select_one(".buybox p")
    if line is not None:
        summary = data["summary"] or _first_sentence(data["description"])
        if summary:
            _set_text(line, summary)
        else:
            line.decompose()

    rating = root.select_one(".rating")
    if rating is not None:
        count = data["review_count"]
        if count:
            stars = "★" * max(1, min(5, round(data["avg_rating"] or 0))) or "★"
            rating.clear()
            rating.append(BeautifulSoup(
                f'<span class="stars-row">{stars}</span>{data["avg_rating"]:.1f} ({count} review{"" if count == 1 else "s"})',
                "html.parser",
            ))
        else:
            rating.decompose()  # a rating nobody gave is not a rating


def _first_sentence(text: str) -> str:
    plain = BeautifulSoup(text or "", "html.parser").get_text(" ", strip=True)
    for stop in (". ", "! ", "? "):
        if stop in plain:
            return plain.split(stop)[0] + stop.strip()
    return plain[:200]


def _fill_price(root: Tag, data: dict[str, Any]) -> None:
    tiers = data["qty_tiers"]
    table = root.select_one(".price-table")
    if table is not None:
        rows = [r for r in table.find_all("tr") if r.find("td")]
        if tiers and rows:
            template = str(rows[0])
            for row in rows:
                row.decompose()
            for tier in tiers:
                node = BeautifulSoup(template, "html.parser")
                tr = node.find("tr")
                cells = tr.find_all("td") if tr else []
                if len(cells) >= 3:
                    qty = tier["min_qty"]
                    _set_text(cells[0], f"{qty:,}")
                    _set_text(cells[1], _money(tier["unit_price"]))
                    _set_text(cells[2], _money(tier["unit_price"] * qty))
                    tr["data-qty"] = str(qty)
                    tr["data-unit-price"] = f"{tier['unit_price']:.2f}"
                    tr["class"] = [c for c in (tr.get("class") or []) if c != "best"]
                    table.append(tr)
        else:
            table.decompose()  # no price breaks set up: no table of them

    price_row = root.select_one(".price-row") or root.select_one(".price")
    if price_row is not None:
        if data["from_price"] is not None:
            keep = price_row.select_one(".from")
            price_row.clear()
            if keep is not None:
                price_row.append(keep)
            price_row.append(_money(data["from_price"]))
            price_row["data-from-price"] = f"{data['from_price']:.2f}"
        else:
            price_row.decompose()


def _group_templates(root: Tag) -> tuple[str | None, str | None]:
    """The design's own markup for a row of buttons, and for a row of swatches."""
    button_group = swatch_group = None
    for group in root.select(".variant-group"):
        if group.select_one(".swatch-row") is not None and swatch_group is None:
            swatch_group = str(group)
        elif group.select_one(".btn-select-row") is not None and button_group is None:
            button_group = str(group)
    return button_group, swatch_group


def _build_group(template: str, label: str, values: list[dict[str, Any]], *, swatches: bool,
                 option_id: str = "") -> Tag | None:
    node = BeautifulSoup(template, "html.parser")
    group = next((c for c in node.children if isinstance(c, Tag)), None)
    if group is None:
        return None
    if option_id:
        group["data-option-id"] = option_id

    label_tag = group.select_one(".vlabel") or group.find("label")
    if label_tag is not None:
        _set_text(label_tag, label)

    row = group.select_one(".swatch-row" if swatches else ".btn-select-row")
    if row is None:
        return None
    items = [i for i in row.children if isinstance(i, Tag)]
    if not items:
        return None
    item_template = str(items[0])
    row.clear()
    for index, value in enumerate(values):
        item_node = BeautifulSoup(item_template, "html.parser")
        item = next((c for c in item_node.children if isinstance(c, Tag)), None)
        if item is None:
            continue
        classes = [c for c in (item.get("class") or []) if c != "selected"]
        if index == 0 or value.get("default"):
            classes.append("selected")
        item["class"] = classes
        if value.get("id"):
            item["data-value-id"] = value["id"]
        if value.get("variant_id"):
            item["data-variant-id"] = value["variant_id"]
        item["data-label"] = value["label"]
        if swatches:
            hex_value = value.get("hex") or ""
            style = f"background:{hex_value};" if hex_value else ""
            if (hex_value or "").upper() in {"#FFFFFF", "#FFF"}:
                style += "border:1px solid var(--line);"
            item["style"] = style
            item["title"] = value["label"]
        else:
            _set_text(item, value["label"])
        row.append(item)
    return group


def _fill_choices(root: Tag, data: dict[str, Any]) -> None:
    """Replace the design's example choices with the product's real ones."""
    groups = root.select(".variant-group")
    if not groups:
        return
    button_template, swatch_template = _group_templates(root)
    fallback = button_template or swatch_template
    if fallback is None:
        return

    built: list[Tag] = []
    if data["pricing_mode"] == "configurable" or data["options"]:
        for option in data["options"]:
            wants_swatch = any(v.get("hex") for v in option["values"]) and swatch_template is not None
            template = swatch_template if wants_swatch else (button_template or fallback)
            group = _build_group(template, option["name"], option["values"],
                                 swatches=wants_swatch, option_id=option["id"])
            if group is not None:
                built.append(group)
    else:
        if data["colours"]:
            template = swatch_template or fallback
            group = _build_group(template, "Color", data["colours"], swatches=swatch_template is not None)
            if group is not None:
                built.append(group)
        if data["sizes"]:
            group = _build_group(button_template or fallback, "Size", data["sizes"], swatches=False)
            if group is not None:
                built.append(group)

    anchor = groups[0]
    for group in built:
        anchor.insert_before(group)
    for group in groups:
        group.decompose()  # the design's examples, once the real ones are in


def fill_product_block(html: str, data: dict[str, Any]) -> str:
    """The design's buying section, showing this product."""
    soup = BeautifulSoup(html or "", "html.parser")
    root = next((c for c in soup.children if isinstance(c, Tag)), None)
    if root is None:
        return html

    _fill_gallery(root, data)
    _fill_headline(root, data)
    _fill_price(root, data)
    _fill_choices(root, data)

    # What the page is for, and which controls belong to buying it, so the
    # script that makes them work binds to marks rather than to the design's
    # class names.
    root["data-product-id"] = data["id"]
    root["data-product-slug"] = data["slug"]
    root["data-pricing-mode"] = data["pricing_mode"]

    price_line = root.select_one(".price-row") or root.select_one(".price")
    if price_line is not None:
        price_line["data-theme-price"] = "1"

    qty = root.select_one(".qty-box")
    if qty is not None:
        qty["data-theme-qty"] = "1"

    for button in root.select("a.btn-primary, button.btn-primary, .btn.btn-primary"):
        text = (button.get_text() or "").strip().lower()
        button["data-theme-buy"] = "upload" if "upload" in text or "design" in text else "cart"
        if button.name == "a" and not button.get("href"):
            button["href"] = "#"

    table = root.select_one(".price-table")
    if table is not None:
        table["data-theme-price-table"] = "1"
    return str(soup)


# ── Elsewhere on the page ───────────────────────────────────────────────────

def fill_size_chart(html: str, rows: list[Any]) -> str:
    """The product's own size chart, where the design left room for one."""
    soup = BeautifulSoup(html or "", "html.parser")
    text = soup.get_text(" ", strip=True).lower()
    if "size chart" not in text and "size guide" not in text:
        return html

    holder = None
    for node in soup.find_all(["p", "div", "td"]):
        if node.find(True) is None and "[" in (node.get_text() or ""):
            holder = node
            break
    if holder is None:
        return html

    if not rows:
        # No chart set on the product: the section says nothing rather than
        # promising measurements that don't exist.
        section = holder.find_parent(["section", "details", "div"]) or holder
        section.decompose()
        return str(soup)

    header = rows[0] if isinstance(rows[0], (list, tuple)) else list((rows[0] or {}).keys())
    body = rows[1:] if isinstance(rows[0], (list, tuple)) else [list((r or {}).values()) for r in rows]
    table = BeautifulSoup("<table class='size-chart'><thead><tr></tr></thead><tbody></tbody></table>", "html.parser")
    head_row = table.select_one("thead tr")
    for cell in header:
        th = table.new_tag("th")
        th.string = str(cell)
        head_row.append(th)
    tbody = table.select_one("tbody")
    for row in body:
        tr = table.new_tag("tr")
        for cell in (row if isinstance(row, (list, tuple)) else [row]):
            td = table.new_tag("td")
            td.string = "" if cell is None else str(cell)
            tr.append(td)
        tbody.append(tr)
    holder.replace_with(table)
    return str(soup)
