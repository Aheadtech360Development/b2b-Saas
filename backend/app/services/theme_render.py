"""Put the admin's values back into the design and hand over a page.

The design's HTML is never rewritten by the customizer; it is re-rendered.
Each saved value carries the position of its element inside its section
("2-0-1"), so a heading goes back into the same heading, an image into the
same box, and the layout, spacing and responsive behaviour of the original
design are untouched.
"""
from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup, Tag


def _element_at(root: Tag, path: str) -> Tag | None:
    node: Tag = root
    for step in path.split("-"):
        if not step.isdigit():
            return None
        children = [c for c in node.children if isinstance(c, Tag)]
        index = int(step)
        if index >= len(children):
            return None
        node = children[index]
    return node


def _set_text(tag: Tag, value: str) -> None:
    """Replace the element's own words, leaving any icons inside it alone."""
    keep = [child for child in tag.children if isinstance(child, Tag) and child.name in {"svg", "img", "br"}]
    tag.clear()
    for child in keep:
        tag.append(child)
    tag.append(value)


def _set_image(tag: Tag, url: str) -> None:
    if tag.name == "img":
        tag["src"] = url
        return
    # The design's placeholder box: fill it with the picture, keeping its
    # place in the layout so nothing moves.
    tag.clear()
    if "class" in tag.attrs:
        tag["class"] = [c for c in tag.get("class", []) if c != "placeholder"]
    style = tag.get("style") or ""
    tag["style"] = f"{style};overflow:hidden;padding:0;border:0;background:none".strip(";")
    img = BeautifulSoup("", "html.parser").new_tag("img", src=url)
    img["style"] = "width:100%;height:100%;object-fit:cover;display:block"
    img["loading"] = "lazy"
    img["alt"] = ""
    tag.append(img)


# ── Rows of cards ────────────────────────────────────────────────────────────
# The design draws one card and repeats it. To show the store's own products we
# take that card as the pattern and stamp it once per product, putting each
# product's picture, name and price where the example's were. Nothing about the
# card is redesigned — that is why the grid still looks like the design.

def _role(card: Tag, names: list[str], classes: list[str]) -> Tag | None:
    for cls in classes:
        found = card.select_one(f".{cls}")
        if found is not None:
            return found
    if names:
        return card.find(names)
    return None


def _fill_card(template_html: str, item: dict[str, Any]) -> Tag | None:
    soup = BeautifulSoup(template_html, "html.parser")
    card = next((c for c in soup.children if isinstance(c, Tag)), None)
    if card is None:
        return None

    image = card.find("img") or card.select_one(".placeholder")
    if image is not None:
        if item.get("image"):
            _set_image(image, str(item["image"]))
        elif image.name != "img":
            # No picture yet: leave the design's own empty box, without its
            # "[Photo]" note, so the grid keeps its shape.
            image.clear()

    title = _role(card, ["h1", "h2", "h3", "h4", "h5", "h6"], ["title", "product-title", "name"])
    if title is not None and item.get("title"):
        _set_text(title, str(item["title"]))

    price = _role(card, [], ["price", "product-price"])
    if price is not None:
        if item.get("price"):
            _set_text(price, str(item["price"]))
        else:
            price.decompose()

    badge = _role(card, [], ["badge", "tag"])
    if badge is not None:
        if item.get("badge"):
            _set_text(badge, str(item["badge"]))
        else:
            badge.decompose()  # the example's "Best Seller" is not a fact

    # A rating belongs to the product, not the design's example.
    for extra in card.select(".rating, .reviews"):
        extra.decompose()

    text = _role(card, ["p"], ["description", "excerpt"])
    if text is not None:
        if item.get("text"):
            _set_text(text, str(item["text"]))
        else:
            text.decompose()

    url = str(item.get("url") or "")
    if url:
        anchor = card if card.name == "a" else None
        if anchor is None:
            inner = card.find("a")
            if inner is not None and _text_of_tag(inner) == _text_of_tag(card):
                anchor = inner
        if anchor is not None:
            anchor["href"] = url
        else:
            # Make the whole card the link, keeping its classes and styling.
            card.name = "a"
            card["href"] = url
            style = card.get("style") or ""
            card["style"] = f"{style};display:block;color:inherit;text-decoration:none".strip(";")
    return card


def _text_of_tag(tag: Tag) -> str:
    return " ".join(tag.get_text(" ", strip=True).split())


def _fill_nav_item(template_html: str, item: dict[str, Any]) -> Tag | None:
    """One link of a menu, in the design's own markup."""
    soup = BeautifulSoup(template_html, "html.parser")
    node = next((c for c in soup.children if isinstance(c, Tag)), None)
    if node is None:
        return None
    anchor = node if node.name == "a" else node.find("a")
    if anchor is None:
        return None
    # A caret or icon that came with the design stays; the words are replaced.
    _set_text(anchor, str(item.get("title") or ""))
    anchor["href"] = str(item.get("url") or "#")
    return node


def fill_repeaters(html: str, repeaters: list[dict[str, Any]], items_by_key: dict[str, list[dict[str, Any]]]) -> str:
    """Put the store's own cards into this section's rows of cards."""
    if not repeaters or not items_by_key:
        return html
    soup = BeautifulSoup(html, "html.parser")
    root = next((c for c in soup.children if isinstance(c, Tag)), None)
    if root is None:
        return html

    changed = False
    for repeater in repeaters:
        items = items_by_key.get(repeater.get("key", ""))
        if items is None:
            continue  # this row was left as the design drew it
        container = _element_at(root, repeater.get("path", ""))
        if container is None:
            continue
        children = [c for c in container.children if isinstance(c, Tag)]
        if not children:
            continue
        template_html = str(children[0])
        is_menu = repeater.get("kind") == "menu"
        container.clear()
        for item in items:
            node = _fill_nav_item(template_html, item) if is_menu else _fill_card(template_html, item)
            if node is not None:
                container.append(node)
        changed = True
    return str(soup) if changed else html


# A design drawn as a preview document often reserves space at the top for a
# fixed toolbar of its own. That toolbar is not part of the store, so neither
# is the space: this takes the reservation out at the source rather than
# pulling the page back up with a negative margin.
_BODY_PAD = re.compile(r"(body\s*\{[^}]*?)padding-top\s*:\s*[^;}]+;?", re.IGNORECASE)


def normalise_css(css: str) -> str:
    """The design's stylesheet, with the space its own toolbar needed removed."""
    if not css:
        return css
    return _BODY_PAD.sub(r"\1", css)


def render_section(section: dict[str, Any], values: dict[str, Any] | None) -> str:
    """One section's HTML with this brand's values in it."""
    html = section.get("html") or ""
    if not values:
        return html
    soup = BeautifulSoup(html, "html.parser")
    root = next((c for c in soup.children if isinstance(c, Tag)), None)
    if root is None:
        return html

    for key, raw in values.items():
        value = "" if raw is None else str(raw)
        if not value.strip():
            continue  # nothing set → the design's own content stays
        kind, _, path = key.partition(":")
        target = _element_at(root, path)
        if target is None:
            continue
        if kind == "txt":
            _set_text(target, value)
        elif kind == "href":
            target["href"] = value
        elif kind == "img":
            _set_image(target, value)
    return str(soup)


_COUNT_RE = re.compile(r"^\s*[\d\[\]a-zA-Z]{1,6}\s+products?\s*$", re.IGNORECASE)


def apply_collection(page: dict[str, Any], collection: dict[str, Any], total: int,
                     next_page: int | None) -> dict[str, Any]:
    """Name this collection where the design named its example.

    The design's collection template was drawn showing one collection. The
    same template serves every collection, so its title, description, product
    count, breadcrumb and "load more" are filled from the one being viewed.
    """
    named = False
    for block in page.get("sections", []):
        soup = BeautifulSoup(block["html"], "html.parser")
        touched = False

        for crumb in soup.select(".breadcrumb"):
            # "Home / DTF & UV DTF" — only the last part is the collection.
            texts = [t for t in crumb.find_all(string=True) if t.strip()]
            if texts:
                texts[-1].replace_with(f" {collection.get('name', '')}")
                touched = True

        if not named:
            heading = soup.find(["h1"])
            if heading is not None:
                _set_text(heading, str(collection.get("name") or ""))
                named = True
                touched = True
                description = heading.find_next_sibling("p")
                if description is not None:
                    text = str(collection.get("description") or "")
                    if text:
                        _set_text(description, text)
                    else:
                        description.decompose()

        for node in soup.find_all(["p", "span", "div"]):
            if node.find(True) is None and _COUNT_RE.match(node.get_text() or ""):
                _set_text(node, f"{total} product{'' if total == 1 else 's'}")
                touched = True

        for button in soup.find_all(["button", "a"]):
            if "load more" not in (button.get_text() or "").strip().lower():
                continue
            if next_page:
                # The design drew a button; it becomes the link to the next page.
                button.name = "a"
                button["href"] = f"?page={next_page}"
                button["style"] = f"{button.get('style') or ''};display:inline-block".strip(";")
            else:
                button.decompose()
            touched = True

        if touched:
            block["html"] = str(soup)
    return page


def layout_for(product_name: str, layouts: dict[str, str]) -> str:
    """The layout meant for this product, by the names both carry.

    A design ships one layout per kind of thing it sells — business cards,
    blanks, signs — and a store's products are named after the same things.
    Matching on those words puts a business card in the business card layout
    instead of whichever layout happened to be listed first. The admin can
    always say otherwise on the product itself.
    """
    keys = list(layouts)
    if not keys:
        return ""

    def words(text: str) -> set[str]:
        out = set()
        for raw in re.split(r"[^a-z0-9]+", (text or "").lower()):
            if len(raw) > 2:
                # "signs" and "sign" are the same word for this purpose.
                out.add(raw[:-1] if raw.endswith("s") and len(raw) > 3 else raw)
        return out

    wanted = words(product_name)
    best, score = keys[0], 0
    for key, label in layouts.items():
        shared = len(wanted & words(label))
        if shared > score:
            best, score = key, shared
    return best


def apply_product(page: dict[str, Any], product: dict[str, Any]) -> dict[str, Any]:
    """Name this product where the design named its example.

    Only outside the buying section — that one is replaced wholesale by the
    real gallery, options and add to cart, which the store already has.
    """
    for block in page.get("sections", []):
        if block.get("role") == "product_block":
            continue
        soup = BeautifulSoup(block["html"], "html.parser")
        touched = False
        for crumb in soup.select(".breadcrumb"):
            texts = [t for t in crumb.find_all(string=True) if t.strip()]
            if texts:
                texts[-1].replace_with(f" {product.get('name', '')}")
                touched = True
        if touched:
            block["html"] = str(soup)
    return page


def _px(value: Any) -> str:
    """A number of pixels, or "" when nothing was set."""
    raw = str(value or "").strip()
    if not raw or raw.lower() == "auto":
        return ""
    return raw if raw.endswith(("px", "%", "em", "rem", "vw", "vh")) else f"{raw}px"


def apply_logo(page: dict[str, Any], logo: dict[str, Any] | None) -> dict[str, Any]:
    """Put the brand's own logo where the design keeps its logo.

    The design already decided where a logo sits and how the header is laid
    out around it; this only swaps the picture and, if asked, its size and the
    space around it. Nothing is moved.
    """
    url = str((logo or {}).get("url") or "").strip()
    href = str((logo or {}).get("href") or "").strip()
    if not url and not href:
        return page

    width = _px((logo or {}).get("width"))
    height = _px((logo or {}).get("height"))
    pad = (logo or {}).get("padding") or {}
    padding = " ".join(_px(pad.get(side)) or "0" for side in ("top", "right", "bottom", "left"))

    style = ["display:block", "max-width:100%", "object-fit:contain"]
    style.append(f"width:{width}" if width else "width:auto")
    style.append(f"height:{height}" if height else "height:auto")
    if padding != "0 0 0 0":
        style.append(f"padding:{padding}")

    for block in page.get("sections", []):
        soup = BeautifulSoup(block["html"], "html.parser")
        holder = soup.select_one(".logo, .site-logo, .brand-logo, .logo-wrap")
        if holder is None:
            header = soup.find("header") or (soup.find(class_="site-header"))
            holder = header.find("a") if header is not None else None
        if holder is None:
            continue

        # Where the logo goes, when the brand has said. The design's own link
        # stands otherwise.
        if href:
            anchor = holder if holder.name == "a" else (holder.find_parent("a") or holder.find("a"))
            if anchor is not None and anchor.name == "a":
                anchor["href"] = href

        if not url:
            block["html"] = str(soup)
            break

        img = soup.new_tag("img", src=url)
        img["alt"] = ""
        img["style"] = ";".join(style)
        if holder.name == "img":
            holder.replace_with(img)
        else:
            # Keep the link (and where it points) — replace what it shows.
            holder.clear()
            holder["style"] = f"{holder.get('style') or ''};display:inline-flex;align-items:center".strip(";")
            holder.append(img)
        block["html"] = str(soup)
        break  # a store has one logo, in one place
    return page


# Every section on the storefront answers to an id built from this, so a link
# can point at a part of a page: "/#s-<section id>".
ANCHOR_PREFIX = "s-"

_CHROME_TOP = ("announcement", "header")
_CHROME_BOTTOM = ("footer",)


def _chrome_source(definition: dict[str, Any], page_key: str) -> tuple[str, dict[str, Any]] | None:
    """The page whose header and footer the whole store uses.

    Designs draw them once — nearly always on the home page — and take for
    granted that every other page has them.
    """
    pages = (definition or {}).get("pages") or {}
    for key in ("home", *pages.keys()):
        page = pages.get(key)
        if not page or key == page_key:
            continue
        if any(s.get("role") in _CHROME_TOP + _CHROME_BOTTOM for s in page.get("sections", [])):
            return key, page
    return None


def render_chrome(definition: dict[str, Any], state: dict[str, Any] | None,
                  items: dict[str, list[dict[str, Any]]] | None = None) -> dict[str, Any] | None:
    """The store's announcement bar, header and footer, on their own.

    Every page of the storefront wears the same chrome, including the pages the
    app draws itself — the cart, the checkout, an account. Rendering it once
    here is what lets those pages look like the rest of the shop instead of
    like the app they used to be.
    """
    found = _chrome_source(definition, "")
    if found is None:
        return None
    source_key, source_page = found
    source_state = ((state or {}).get("pages") or {}).get(source_key) or {}
    hidden = set(source_state.get("hidden") or [])
    values = source_state.get("values") or {}

    top: list[dict[str, Any]] = []
    bottom: list[dict[str, Any]] = []
    for section in source_page.get("sections", []):
        role = section.get("role") or ""
        if role not in _CHROME_TOP + _CHROME_BOTTOM or section["id"] in hidden:
            continue
        html = render_section(section, values.get(section["id"]))
        if items:
            mine = {
                key.split("|", 1)[1]: rows
                for key, rows in items.items()
                if key.startswith(f"{section['id']}|")
            }
            html = fill_repeaters(html, section.get("repeaters") or [], mine)
        (top if role in _CHROME_TOP else bottom).append(
            {"id": section["id"], "html": html, "role": role}
        )
    if not top and not bottom:
        return None

    rendered = apply_logo({
        "key": "chrome",
        "label": "Chrome",
        "kind": "chrome",
        "css": normalise_css(definition.get("css") or ""),
        "stylesheets": definition.get("stylesheets") or [],
        "svg_defs": definition.get("svg_defs") or "",
        "sections": top + bottom,
    }, (state or {}).get("logo") or {})
    cut = len(top)
    return {
        "css": rendered["css"],
        "stylesheets": rendered["stylesheets"],
        "svg_defs": rendered["svg_defs"],
        "top": rendered["sections"][:cut],
        "bottom": rendered["sections"][cut:],
    }


def render_page(definition: dict[str, Any], state: dict[str, Any] | None, page_key: str,
                items: dict[str, list[dict[str, Any]]] | None = None) -> dict[str, Any] | None:
    """A whole page: the sections this brand shows, in its order, filled in."""
    pages = (definition or {}).get("pages") or {}
    page = pages.get(page_key)
    if not page:
        return None

    by_id = {s["id"]: s for s in page.get("sections", [])}
    page_state = ((state or {}).get("pages") or {}).get(page_key) or {}
    order = [sid for sid in (page_state.get("order") or []) if sid in by_id]
    # Sections the design has but the saved order doesn't (a re-import added
    # them) keep their original place at the end rather than disappearing.
    order += [s["id"] for s in page.get("sections", []) if s["id"] not in order]
    hidden = set(page_state.get("hidden") or [])
    values = page_state.get("values") or {}
    logo = (state or {}).get("logo") or {}

    blocks: list[dict[str, Any]] = []
    for sid in order:
        if sid in hidden:
            continue
        section = by_id[sid]
        html = render_section(section, values.get(sid))
        if items:
            mine = {
                key.split("|", 1)[1]: rows
                for key, rows in items.items()
                if key.startswith(f"{sid}|")
            }
            html = fill_repeaters(html, section.get("repeaters") or [], mine)
        blocks.append({"id": sid, "html": html, "role": section.get("role") or ""})

    # A page of its own with no header: borrow the store's, from the page the
    # design drew it on, with that page's own wording and images.
    if not any(b.get("role") in _CHROME_TOP for b in blocks):
        found = _chrome_source(definition, page_key)
        if found is not None:
            source_key, source_page = found
            source_state = ((state or {}).get("pages") or {}).get(source_key) or {}
            source_hidden = set(source_state.get("hidden") or [])
            source_values = source_state.get("values") or {}
            top, bottom = [], []
            for section in source_page.get("sections", []):
                role = section.get("role") or ""
                if role not in _CHROME_TOP + _CHROME_BOTTOM or section["id"] in source_hidden:
                    continue
                html = render_section(section, source_values.get(section["id"]))
                if items:
                    mine = {
                        key.split("|", 1)[1]: rows
                        for key, rows in items.items()
                        if key.startswith(f"{section['id']}|")
                    }
                    html = fill_repeaters(html, section.get("repeaters") or [], mine)
                block = {"id": section["id"], "html": html, "role": role}
                (top if role in _CHROME_TOP else bottom).append(block)
            blocks = top + blocks + bottom

    rendered = {
        "key": page_key,
        "label": page.get("label") or page_key.title(),
        "kind": page.get("kind") or "page",
        "css": normalise_css(definition.get("css") or ""),
        "stylesheets": definition.get("stylesheets") or [],
        "svg_defs": definition.get("svg_defs") or "",
        "sections": blocks,
    }
    return apply_logo(rendered, logo)


def clean_state(definition: dict[str, Any], state: Any) -> dict[str, Any]:
    """What the customizer sent, checked against the design it belongs to.

    Unknown pages, sections and fields are dropped rather than stored: the
    design decides what exists, the admin only decides what it says.
    """
    pages_def = (definition or {}).get("pages") or {}
    incoming = ((state or {}).get("pages") or {}) if isinstance(state, dict) else {}
    out: dict[str, Any] = {"pages": {}}

    # The brand's logo belongs to the theme, not to one page of it.
    logo_in = (state or {}).get("logo") if isinstance(state, dict) else None
    if isinstance(logo_in, dict):
        pad_in = logo_in.get("padding") or {}
        out["logo"] = {
            "url": str(logo_in.get("url") or "")[:1000],
            # Where clicking it goes. Blank means the design's own link.
            "href": str(logo_in.get("href") or "")[:1000],
            "width": str(logo_in.get("width") or "")[:12],
            "height": str(logo_in.get("height") or "")[:12],
            "padding": {side: str((pad_in or {}).get(side) or "")[:12] for side in ("top", "right", "bottom", "left")},
        }

    for key, page in pages_def.items():
        ids = [s["id"] for s in page.get("sections", [])]
        fields_by_section = {s["id"]: {f["key"] for f in s.get("fields", [])} for s in page.get("sections", [])}
        given = incoming.get(key) or {}

        order = [sid for sid in (given.get("order") or []) if sid in ids]
        order += [sid for sid in ids if sid not in order]
        hidden = [sid for sid in (given.get("hidden") or []) if sid in ids]

        dynamic: dict[str, dict[str, Any]] = {}
        rows_by_section = {
            s["id"]: {r["key"] for r in s.get("repeaters", [])} for s in page.get("sections", [])
        }
        for sid, slots in (given.get("dynamic") or {}).items():
            allowed_rows = rows_by_section.get(sid) or set()
            if not allowed_rows or not isinstance(slots, dict):
                continue
            kept_rows = {}
            for row_key, spec in slots.items():
                if row_key not in allowed_rows or not isinstance(spec, dict):
                    continue
                kept_rows[row_key] = {
                    "source": spec.get("source") if spec.get("source") in {"products", "collections", "menu", "none"} else "products",
                    "menu": str(spec.get("menu") or "")[:64],
                    "collection": str(spec.get("collection") or "")[:200],
                    "sort": str(spec.get("sort") or "newest")[:20],
                    "limit": max(1, min(int(spec.get("limit") or 6), 24)) if str(spec.get("limit") or "6").isdigit() else 6,
                    "ids": [str(i)[:64] for i in (spec.get("ids") or [])][:24],
                }
            if kept_rows:
                dynamic[sid] = kept_rows

        values: dict[str, dict[str, str]] = {}
        for sid, section_values in (given.get("values") or {}).items():
            if sid not in fields_by_section or not isinstance(section_values, dict):
                continue
            allowed = fields_by_section[sid]
            kept = {
                k: str(v)[:5000]
                for k, v in section_values.items()
                if k in allowed and v is not None and str(v).strip()
            }
            if kept:
                values[sid] = kept

        out["pages"][key] = {"order": order, "hidden": hidden, "values": values, "dynamic": dynamic}
    return out
