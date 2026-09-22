"""Put the admin's values back into the design and hand over a page.

The design's HTML is never rewritten by the customizer; it is re-rendered.
Each saved value carries the position of its element inside its section
("2-0-1"), so a heading goes back into the same heading, an image into the
same box, and the layout, spacing and responsive behaviour of the original
design are untouched.
"""
from __future__ import annotations

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
        container.clear()
        for item in items:
            card = _fill_card(template_html, item)
            if card is not None:
                container.append(card)
        changed = True
    return str(soup) if changed else html


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

    blocks = []
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
        blocks.append({"id": sid, "html": html})
    return {
        "key": page_key,
        "label": page.get("label") or page_key.title(),
        "kind": page.get("kind") or "page",
        "css": definition.get("css") or "",
        "stylesheets": definition.get("stylesheets") or [],
        "svg_defs": definition.get("svg_defs") or "",
        "sections": blocks,
    }


def clean_state(definition: dict[str, Any], state: Any) -> dict[str, Any]:
    """What the customizer sent, checked against the design it belongs to.

    Unknown pages, sections and fields are dropped rather than stored: the
    design decides what exists, the admin only decides what it says.
    """
    pages_def = (definition or {}).get("pages") or {}
    incoming = ((state or {}).get("pages") or {}) if isinstance(state, dict) else {}
    out: dict[str, Any] = {"pages": {}}

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
                    "source": spec.get("source") if spec.get("source") in {"products", "collections", "none"} else "products",
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
