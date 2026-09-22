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


def render_page(definition: dict[str, Any], state: dict[str, Any] | None, page_key: str) -> dict[str, Any] | None:
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

    blocks = [
        {"id": sid, "html": render_section(by_id[sid], values.get(sid))}
        for sid in order
        if sid not in hidden
    ]
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

        out["pages"][key] = {"order": order, "hidden": hidden, "values": values}
    return out
