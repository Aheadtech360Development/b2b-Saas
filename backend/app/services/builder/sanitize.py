"""Custom HTML and CSS, made safe to put on a shopper's page.

A brand can paste its own markup into a Custom HTML block. That markup is
served on the brand's storefront, under the brand's domain, to its customers —
so a script in it is a script running with the shopper's session, and an
onclick is the same thing in a different coat. Neither is allowed through.

Allowlists, not blocklists: anything this module does not recognise is
removed. What survives is ordinary content — text, links, images, tables,
lists — and the brand's own classes and inline styles, with the dangerous
parts of those taken out too.

Every function returns what it removed, so the editor can tell the merchant
why their block looks different rather than leaving them to guess.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Comment, Tag

ALLOWED_TAGS = {
    "a", "abbr", "article", "aside", "b", "blockquote", "br", "caption", "cite",
    "code", "col", "colgroup", "dd", "del", "details", "div", "dl", "dt", "em",
    "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol",
    "p", "picture", "pre", "q", "s", "section", "small", "source", "span",
    "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th",
    "thead", "time", "tr", "u", "ul",
}

# Removed with everything inside them. Unwrapping a <script> would leave its
# code sitting in the page as text, which is a different problem, not a fix.
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "template",
                     "form", "input", "button", "select", "textarea", "link", "meta", "base",
                     "frame", "frameset", "applet", "math"}

# Drawings: icons, stars, logos pasted as SVG. Shapes, colours and lines only —
# nothing that animates, embeds a page, loads a file or runs anything
# (<animate>, <set>, <foreignObject>, <image>, <script> are not here, so they
# are unwrapped or dropped). Only inside an <svg>.
SVG_TAGS = {"svg", "g", "path", "polygon", "polyline", "circle", "ellipse", "rect", "line",
            "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "symbol",
            "use", "title", "desc", "text", "tspan"}
SVG_ATTRS = {
    "viewbox", "xmlns", "xmlns:xlink", "version", "width", "height", "fill", "fill-opacity",
    "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
    "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity", "opacity", "d", "points", "cx",
    "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "dx", "dy", "fx", "fy", "transform",
    "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod",
    "preserveaspectratio", "id", "clip-path", "clip-rule", "mask", "maskunits", "clippathunits",
    "href", "xlink:href", "focusable", "vector-effect", "text-anchor", "dominant-baseline",
    "font-size", "font-weight", "font-family", "letter-spacing", "shape-rendering", "color",
    "visibility", "pathlength",
}
# Inside a drawing a value may point at another part of the same drawing
# (url(#shine), href="#star") and nowhere else.
_SVG_VALUE_DANGER = re.compile(r"javascript:|vbscript:|data:|expression\s*\(|url\(\s*['\"]?(?!#)", re.I)

# A web font from Google Fonts may be linked; no other stylesheet.
_FONT_LINK = re.compile(r"^https://fonts\.googleapis\.com/css2?\?", re.I)

ALLOWED_ATTRS = {
    "*": {"class", "style", "title", "dir", "lang", "role", "aria-label", "aria-hidden"},
    "a": {"href", "target", "rel"},
    "img": {"src", "alt", "width", "height", "loading", "srcset", "sizes"},
    "source": {"srcset", "media", "type", "sizes"},
    "td": {"colspan", "rowspan", "align"},
    "th": {"colspan", "rowspan", "align", "scope"},
    "col": {"span"},
    "colgroup": {"span"},
    "time": {"datetime"},
    "ol": {"start", "reversed", "type"},
    "details": {"open"},
}

URL_ATTRS = {"href", "src"}
SRCSET_ATTRS = {"srcset"}

# What a link or a picture may point at. A path on the shop, a web address, a
# mail or phone link, or an in-page anchor. Never a javascript: or data: URL.
_SAFE_URL = re.compile(r"^(https?://|/(?!/)|#|mailto:|tel:)", re.I)

# Properties an inline style may set. Layout, colour, type and spacing — the
# things a design actually needs. Positioning that could lay something over the
# shop's own checkout (fixed, sticky with a high z-index) is not among them.
ALLOWED_CSS_PROPERTIES = {
    "align-items", "align-self", "background", "background-color", "background-image",
    "background-position", "background-repeat", "background-size", "border",
    "border-bottom", "border-color", "border-left", "border-radius", "border-right",
    "border-style", "border-top", "border-width", "box-shadow", "color", "column-gap",
    "display", "flex", "flex-basis", "flex-direction", "flex-grow", "flex-shrink",
    "flex-wrap", "font-family", "font-size", "font-style", "font-weight", "gap",
    "grid-column", "grid-row", "grid-template-columns", "grid-template-rows", "height",
    "justify-content", "letter-spacing", "line-height", "list-style", "margin",
    "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height",
    "max-width", "min-height", "min-width", "object-fit", "object-position", "opacity",
    "overflow", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top", "position", "row-gap", "text-align", "text-decoration",
    "text-transform", "transform", "transition", "vertical-align", "white-space",
    "width", "word-break", "z-index", "top", "left", "right", "bottom", "aspect-ratio",
    "font-variant", "text-shadow", "filter", "inset",
}

# Values that can run code or reach outside the page, in any property.
_CSS_DANGER = re.compile(r"expression\s*\(|javascript:|vbscript:|@import|behaviou?r\s*:|-moz-binding|</", re.I)
_CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I)


@dataclass
class Cleaned:
    """What came out, and what was taken out of it."""

    value: str
    removed: list[str] = field(default_factory=list)


def _safe_url(value: str) -> bool:
    return bool(_SAFE_URL.match((value or "").strip()))


def clean_style(style: str) -> Cleaned:
    """An inline style attribute, with only the safe declarations kept."""
    kept: list[str] = []
    removed: list[str] = []
    for decl in (style or "").split(";"):
        if not decl.strip():
            continue
        if ":" not in decl:
            removed.append(decl.strip())
            continue
        prop, _, value = decl.partition(":")
        prop = prop.strip().lower()
        value = value.strip()
        if prop not in ALLOWED_CSS_PROPERTIES or _CSS_DANGER.search(value):
            removed.append(prop or decl.strip())
            continue
        if prop == "position" and value.lower() in ("fixed", "sticky"):
            # Pinned to the window, a block can sit over the cart or the
            # checkout button. Static, relative and absolute stay within it.
            removed.append(f"position: {value}")
            continue
        bad_url = False
        for match in _CSS_URL.finditer(value):
            if not re.match(r"^https://", match.group(2).strip(), re.I):
                bad_url = True
        if bad_url:
            removed.append(f"{prop} (only https images are allowed)")
            continue
        kept.append(f"{prop}: {value}")
    return Cleaned("; ".join(kept), removed)


def clean_html(html: str) -> Cleaned:
    """Pasted markup, reduced to content that cannot run anything."""
    removed: list[str] = []
    soup = BeautifulSoup(html or "", "html.parser")

    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()

    for tag in list(soup.find_all(True)):
        if not isinstance(tag, Tag) or tag.parent is None:
            continue
        name = (tag.name or "").lower()
        if name == "link":
            href = str(tag.get("href", ""))
            if "stylesheet" in str(tag.get("rel", "")).lower() and _FONT_LINK.match(href):
                tag.attrs = {"rel": "stylesheet", "href": href}
                continue
        if name in SVG_TAGS and (name == "svg" or tag.find_parent("svg") is not None):
            for attr in list(tag.attrs):
                low = attr.lower()
                value = tag.attrs[attr]
                value = " ".join(value) if isinstance(value, list) else str(value)
                keep = (low in SVG_ATTRS or low in ALLOWED_ATTRS["*"]) and not low.startswith("on")
                if keep and low in ("href", "xlink:href") and not value.strip().startswith("#"):
                    keep = False
                if keep and _SVG_VALUE_DANGER.search(value):
                    keep = False
                if keep and low == "style":
                    styled = clean_style(value)
                    if styled.value:
                        tag.attrs[attr] = styled.value
                        continue
                    keep = False
                if not keep:
                    removed.append(f"{name}[{attr}]")
                    del tag.attrs[attr]
            continue
        if name in DROP_WITH_CONTENT:
            removed.append(f"<{name}>")
            tag.decompose()
            continue
        if name not in ALLOWED_TAGS:
            # Unknown but harmless wrappers keep their contents.
            removed.append(f"<{name}>")
            tag.unwrap()
            continue

        allowed = ALLOWED_ATTRS["*"] | ALLOWED_ATTRS.get(name, set())
        for attr in list(tag.attrs):
            low = attr.lower()
            if low.startswith("on"):
                removed.append(f"{name}[{attr}]")
                del tag.attrs[attr]
                continue
            if low.startswith("data-"):
                continue  # inert unless a script reads it, and none can
            if low not in allowed:
                removed.append(f"{name}[{attr}]")
                del tag.attrs[attr]
                continue
            value = tag.attrs[attr]
            if isinstance(value, list):
                value = " ".join(value)
            if low in URL_ATTRS and not _safe_url(str(value)):
                removed.append(f"{name}[{attr}={str(value)[:40]}]")
                del tag.attrs[attr]
                continue
            if low in SRCSET_ATTRS:
                parts = [p.strip() for p in str(value).split(",") if p.strip()]
                if not all(_safe_url(p.split()[0]) for p in parts):
                    removed.append(f"{name}[{attr}]")
                    del tag.attrs[attr]
                    continue
            if low == "style":
                styled = clean_style(str(value))
                removed.extend(f"{name} style {r}" for r in styled.removed)
                if styled.value:
                    tag.attrs[attr] = styled.value
                else:
                    del tag.attrs[attr]

        # A link that opens a new tab must not hand the shop's page to it.
        if name == "a" and str(tag.get("target", "")).lower() == "_blank":
            tag["rel"] = "noopener noreferrer"

    return Cleaned(str(soup), removed)


# A selector list may only name things; a block's CSS cannot reach the rest of
# the page because every selector is put under the block's own attribute.
_AT_RULE_OK = re.compile(r"^@media\s[^{]+$", re.I)


def scope_css(css: str, scope: str) -> Cleaned:
    """A block's custom CSS, confined to that block.

    Every selector is prefixed with the block's own attribute selector, so
    `h2 { color: red }` written for one block cannot turn every heading on the
    shop red. @media is kept (and its contents scoped); every other at-rule —
    @import above all — is dropped.
    """
    removed: list[str] = []
    out: list[str] = []
    text = re.sub(r"/\*.*?\*/", "", css or "", flags=re.S)
    if _CSS_DANGER.search(text.replace("@import", "")):
        # Something code-like in the body itself. Not worth parsing around.
        return Cleaned("", ["the whole stylesheet (it contained script)"])

    def scoped_rules(chunk: str) -> list[str]:
        rules: list[str] = []
        for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", chunk):
            selectors, body = match.group(1).strip(), match.group(2)
            if not selectors or selectors.startswith("@"):
                removed.append(selectors[:40] or "an empty rule")
                continue
            styled = clean_style(body)
            removed.extend(styled.removed)
            if not styled.value:
                continue
            scoped = ", ".join(
                f"{scope} {sel.strip()}" if sel.strip() not in (":host", "&") else scope
                for sel in selectors.split(",") if sel.strip()
            )
            rules.append(f"{scoped} {{ {styled.value} }}")
        return rules

    pos = 0
    while pos < len(text):
        at = text.find("@", pos)
        if at == -1:
            out.extend(scoped_rules(text[pos:]))
            break
        out.extend(scoped_rules(text[pos:at]))
        brace = text.find("{", at)
        semi = text.find(";", at)
        # A statement at-rule (@import, @charset, @namespace) ends at its
        # semicolon and has no block. Without this, the rule after it was
        # taken for its body and lost along with it.
        if semi != -1 and (brace == -1 or semi < brace):
            removed.append(text[at:semi].strip()[:40])
            pos = semi + 1
            continue
        if brace == -1:
            removed.append(text[at:at + 40].strip())
            break
        header = text[at:brace].strip()
        # Find the matching close brace for this at-rule.
        depth, end = 0, brace
        for end in range(brace, len(text)):
            if text[end] == "{":
                depth += 1
            elif text[end] == "}":
                depth -= 1
                if depth == 0:
                    break
        inner = text[brace + 1:end]
        if _AT_RULE_OK.match(header):
            inner_rules = scoped_rules(inner)
            if inner_rules:
                out.append(f"{header} {{ {' '.join(inner_rules)} }}")
        else:
            removed.append(header[:40])
        pos = end + 1

    return Cleaned("\n".join(out), removed)
