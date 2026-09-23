"""Turn a client's HTML design into an editable theme.

The design is built for one client and arrives as a finished HTML file. It is
parsed once, here, into a *definition*:

    {"css": "...",                       # the design's own stylesheet
     "pages": {"home": {"label": "Home", "kind": "home",
                        "sections": [{"id", "label", "html", "fields": [...]}]}}}

A *section* is one band of the page — the announcement bar, the header, the
hero, the footer. A *field* is one thing inside it somebody may change: a
heading, a paragraph, a button's text or link, an image. Each field carries the
position of its element inside the section ("2-0-1"), so the value can be put
back exactly where it came from without the design being rewritten.

Nothing here decides how a page looks. The design's own HTML and CSS are kept
as they are — that is the point: the customizer edits content, never layout.
"""
from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

# Elements whose text somebody may want to change.
_TEXT_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption",
              "button", "a", "span", "strong", "em", "small", "label", "td", "th", "dt", "dd"}
# …but only these are worth offering on their own; a <span> inside a heading is
# part of that heading, not a field of its own.
_ALWAYS_OFFER = {"h1", "h2", "h3", "h4", "p", "button", "a", "li", "blockquote", "figcaption"}

_LABELS = {
    "h1": "Heading", "h2": "Heading", "h3": "Subheading", "h4": "Subheading",
    "h5": "Subheading", "h6": "Subheading", "p": "Text", "li": "List item",
    "button": "Button", "a": "Link", "blockquote": "Quote", "figcaption": "Caption",
    "span": "Label", "strong": "Label", "small": "Small print", "label": "Label",
    "td": "Cell", "th": "Cell", "dt": "Term", "dd": "Description", "em": "Label",
}

MAX_FIELDS_PER_SECTION = 60
MAX_TEXT_LENGTH = 600

# The wireframe's own furniture — a toolbar to switch pages and its review
# notes. They belong to the document we were sent, not to the store.
_WIREFRAME_ONLY = [".toolbar", ".wn", ".caption", ".section-badge"]


def _clean(soup: BeautifulSoup) -> None:
    """Drop anything that must not reach a shopper's browser."""
    for tag in soup.find_all(["script", "noscript"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()
    for selector in _WIREFRAME_ONLY:
        for tag in soup.select(selector):
            tag.decompose()
    # Inline handlers would run in the shopper's page; the design never needs them.
    for tag in soup.find_all(True):
        for attr in [a for a in tag.attrs if a.lower().startswith("on")]:
            del tag[attr]
        href = tag.get("href")
        if isinstance(href, str) and href.strip().lower().startswith("javascript:"):
            tag["href"] = "#"


def _text_of(tag: Tag) -> str:
    return re.sub(r"\s+", " ", tag.get_text(" ", strip=True)).strip()


def _path(section: Tag, tag: Tag) -> str | None:
    """Where this element sits inside its section, as element indexes."""
    steps: list[str] = []
    node: Tag | None = tag
    while node is not None and node is not section:
        parent = node.parent
        if not isinstance(parent, Tag):
            return None
        siblings = [c for c in parent.children if isinstance(c, Tag)]
        try:
            steps.append(str(siblings.index(node)))
        except ValueError:
            return None
        node = parent
    if node is not section:
        return None
    return "-".join(reversed(steps))


def _is_leafish(tag: Tag) -> bool:
    """True when the tag's text is its own, not a wrapper full of other tags."""
    for child in tag.children:
        if isinstance(child, Tag) and child.name not in {"br", "b", "i", "em", "strong", "span", "svg", "use"}:
            return False
    return bool(_text_of(tag))


def _section_label(tag: Tag, index: int) -> str:
    classes = " ".join(tag.get("class") or [])
    name = (tag.name or "").lower()
    if "announce" in classes:
        return "Announcement bar"
    if name == "header" or "header" in classes:
        return "Header & navigation"
    if name == "footer" or "footer" in classes:
        return "Footer"
    if "hero" in classes:
        return "Hero"
    heading = tag.find(["h1", "h2", "h3"])
    if heading is not None:
        text = _text_of(heading)
        if text:
            return (text[:48] + "…") if len(text) > 48 else text
    if "cta" in classes:
        return "Call to action"
    return f"Section {index + 1}"


_GUESSED_LINKS = [
    (("cart", "basket", "bag"), "/cart"),
    (("home",), "/"),
    (("shop", "browse", "all products", "catalog", "catalogue", "products"), "/products"),
    (("contact", "get a quote", "quote"), "/contact"),
    (("account", "sign in", "log in", "login"), "/login"),
    (("track", "order status"), "/track-order"),
    (("blog", "news"), "/blog"),
    (("quick order",), "/quick-order"),
]


def _guess_href(text: str, current: str) -> str:
    """Where a link that points nowhere probably meant to go."""
    if current and current not in {"#", ""}:
        return current
    words = text.strip().lower()
    for needles, href in _GUESSED_LINKS:
        if any(n in words for n in needles):
            return href
    return current or "#"


def _fields_for(section: Tag) -> list[dict[str, Any]]:
    """Every text, link and image in this section that can be edited."""
    fields: list[dict[str, Any]] = []
    seen: set[str] = set()

    for tag in section.find_all(True):
        if len(fields) >= MAX_FIELDS_PER_SECTION:
            break
        name = (tag.name or "").lower()

        # Images: a real <img>, or the design's grey placeholder box.
        classes = " ".join(tag.get("class") or [])
        if name == "img" or "placeholder" in classes.split():
            path = _path(section, tag)
            if not path or f"img:{path}" in seen:
                continue
            seen.add(f"img:{path}")
            fields.append({
                "key": f"img:{path}", "type": "image", "path": path,
                "label": "Image",
                "hint": _text_of(tag)[:80] if name != "img" else (tag.get("alt") or ""),
                "default": tag.get("src") or "",
            })
            continue

        if name not in _TEXT_TAGS:
            continue
        if name not in _ALWAYS_OFFER:
            # A label-ish tag only counts when it isn't inside something that
            # already offers its text.
            if tag.find_parent(list(_ALWAYS_OFFER)) is not None:
                continue
        if not _is_leafish(tag):
            continue
        text = _text_of(tag)
        if not text or len(text) > MAX_TEXT_LENGTH:
            continue
        path = _path(section, tag)
        if not path:
            continue

        key = f"txt:{path}"
        if key not in seen:
            seen.add(key)
            fields.append({
                "key": key, "type": "text", "path": path,
                "label": _LABELS.get(name, "Text"),
                "hint": "", "default": text,
            })
        if name == "a" and tag.get("href"):
            link_key = f"href:{path}"
            if link_key not in seen:
                seen.add(link_key)
                guessed = _guess_href(text, tag.get("href") or "")
                fields.append({
                    "key": link_key, "type": "link", "path": path,
                    "label": "Link", "hint": text[:60], "default": guessed,
                })
                if guessed != (tag.get("href") or ""):
                    tag["href"] = guessed
    return fields


def _page_key(panel_id: str, label: str) -> tuple[str, str]:
    """A stable key for a page, and what kind of page it is."""
    slug = re.sub(r"[^a-z0-9]+", "-", (panel_id or label or "page").lower()).strip("-")
    slug = re.sub(r"^tab-", "", slug) or "page"
    if slug in {"home", "index"}:
        return "home", "home"
    if "collection" in slug or "category" in slug:
        return "collection", "collection"
    return slug, "product"


def _panel_labels(soup: BeautifulSoup) -> dict[str, str]:
    """The names the design's own page switcher gave each page."""
    labels: dict[str, str] = {}
    for button in soup.find_all(["button", "a"]):
        onclick = button.get("onclick") or ""
        match = re.search(r"showTab\(\s*['\"]([^'\"]+)['\"]", onclick)
        if match:
            labels[f"tab-{match.group(1)}"] = _text_of(button)
    return labels


def import_html(html: str, *, name: str) -> dict[str, Any]:
    """Parse a design into a theme definition. Raises ValueError if unusable."""
    if not html or "<" not in html:
        raise ValueError("That file doesn't look like an HTML page.")

    soup = BeautifulSoup(html, "html.parser")
    labels = _panel_labels(soup)
    _clean(soup)

    css = "\n".join(style.get_text() for style in soup.find_all("style"))
    # The design's own page switcher was a fixed bar across the top, and its
    # stylesheet pushes the body down to clear it. That bar is not part of the
    # store, so neither is the space it needed.
    css += "\n/* the design's fixed preview toolbar is not part of the store */\nbody{padding-top:0 !important;}\n"
    # Fonts and stylesheets the design links to, kept so it looks like itself.
    links = [str(link) for link in soup.find_all("link", rel=lambda v: v and "stylesheet" in v)]

    panels = soup.select("div.tab-panel") or []
    if not panels:
        body = soup.body or soup
        panels = [body]

    pages: dict[str, Any] = {}
    for panel in panels:
        panel_id = panel.get("id") or "home"
        label = labels.get(panel_id) or _page_key(panel_id, "")[0].replace("-", " ").title()
        key, kind = _page_key(panel_id, label)
        if key in pages:
            key = f"{key}-{len(pages)}"

        sections = []
        for i, child in enumerate(c for c in panel.children if isinstance(c, Tag)):
            if not _text_of(child) and not child.find(["img", "svg"]):
                continue
            sections.append({
                "id": f"{key}-{i}",
                "label": _section_label(child, i),
                "html": str(child),
                "fields": _fields_for(child),
                # Rows of cards the store fills with its own products.
                "repeaters": _repeaters_for(child),
            })
        if not sections:
            continue
        pages[key] = {"label": label or key.title(), "kind": kind, "sections": sections}

    if not pages:
        raise ValueError("No sections were found in that file.")

    return {
        "name": name,
        "css": css,
        "stylesheets": links,
        # An icon sprite or other <defs> the sections reference by id.
        "svg_defs": "".join(str(s) for s in soup.select("svg[style*='display:none'], svg.sprite")),
        "pages": pages,
    }


def default_state(definition: dict[str, Any]) -> dict[str, Any]:
    """A fresh draft: every section shown, in the order the design has them,
    and every row of cards showing the store's newest products."""
    pages = {}
    for key, page in (definition.get("pages") or {}).items():
        dynamic: dict[str, Any] = {}
        for section in page.get("sections", []):
            slots = {
                # A menu starts as the design drew it: its links are already
                # written, and each one can be pointed somewhere real.
                rep["key"]: {
                    "source": "none" if rep["kind"] == "menu" else rep["kind"],
                    "collection": "", "menu": "", "ids": [], "limit": rep["count"],
                }
                for rep in section.get("repeaters", [])
            }
            if slots:
                dynamic[section["id"]] = slots
        pages[key] = {
            "order": [s["id"] for s in page.get("sections", [])],
            "hidden": [],
            "values": {},
            "dynamic": dynamic,
        }
    return {"pages": pages}


# ── Repeating card grids ─────────────────────────────────────────────────────
# A design shows its products and collections as a row of identical cards. We
# find those rows so the store can fill them with its own products instead of
# the design's examples — the card itself stays exactly as it was drawn.

_MONEY = re.compile(r"[$£€]\s*[\d\[]")
MIN_REPEAT = 3


def _signature(tag: Tag) -> str:
    return f"{tag.name}.{'.'.join(sorted(tag.get('class') or []))}"


def _guess_kind(container: Tag, item: Tag) -> str:
    """Whether this row of cards is showing products or collections."""
    words = " ".join((container.get("class") or []) + (item.get("class") or [])).lower()
    if "categor" in words or "collection" in words:
        return "collections"
    if "product" in words or _MONEY.search(_text_of(item)):
        return "products"
    return ""


def _nav_repeaters(section: Tag) -> list[dict[str, Any]]:
    """Lists of links — the header and footer menus the store can fill."""
    found: list[dict[str, Any]] = []
    for container in section.find_all(["ul", "nav", "div"]):
        children = [c for c in container.children if isinstance(c, Tag)]
        if len(children) < 2 or len({_signature(c) for c in children}) != 1:
            continue
        links = [c for c in children if c.name == "a" or c.find("a")]
        if len(links) != len(children):
            continue
        # A row of cards is not a menu, even though both repeat.
        if any(c.select(".placeholder") or c.find("img") or c.find(["h1", "h2", "h3", "h4"]) for c in children):
            continue
        path = _path(section, container)
        if not path:
            continue
        found.append({
            "key": f"nav:{path}", "path": path, "kind": "menu",
            "label": "Menu links", "count": len(children),
        })
    return found


def _repeaters_for(section: Tag) -> list[dict[str, Any]]:
    """Rows of identical cards, and what each is probably showing."""
    found: list[dict[str, Any]] = []
    for container in section.find_all(True):
        children = [c for c in container.children if isinstance(c, Tag)]
        if len(children) < MIN_REPEAT:
            continue
        first = children[0]
        if len({_signature(c) for c in children}) != 1:
            continue
        # A card has a picture or a heading — a row of plain <li>s is not a grid.
        if not (first.find(["img"]) or first.select(".placeholder") or first.find(["h1", "h2", "h3", "h4", "h5"])):
            continue
        kind = _guess_kind(container, first)
        if not kind:
            continue
        path = _path(section, container)
        if not path:
            continue
        found.append({
            "key": f"rep:{path}",
            "path": path,
            "kind": kind,
            "label": "Products" if kind == "products" else "Collections",
            "count": len(children),
        })
    found.extend(_nav_repeaters(section))
    return found
