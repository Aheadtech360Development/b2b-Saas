"""What a builder document may contain, and the checks a publish runs.

A document is the whole site as structure, never as rendered HTML:

    {
      "schema": 1,
      "settings":    colours, typography, the fonts in use, layout defaults
      "parts":       header, footer, announcement — drawn around every page
      "templates":   {type: {template_id: {"name", "tree"}}}
                     types: home, page, product, collection, search, cart, not_found
      "pages":       {slug: {"title", "template", "seo", "tree"}}
      "assignments": which template a product, collection or page uses
      "globals":     sections shared by reference; edit once, changes everywhere
      "saved":       sections kept as a starting point; inserting one copies it
    }

A tree is nested nodes — {id, type, props, style, tablet, mobile, hide,
children}. A node never holds product or collection data, only a reference to
it ("this collection", "the current product"); the data is read at render
time from the store's own tables.

validate() is pure: it is handed the ids that exist for this brand and checks
the document against them. It is what stands between a broken draft and the
live site — a publish with any error in it does not happen.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Iterator

SCHEMA_VERSION = 1

# Size guards. A storefront reads the published document on every page view,
# so it has to stay small enough to be cheap.
MAX_BYTES = 1_500_000
MAX_NODES = 3000
MAX_DEPTH = 20

TEMPLATE_TYPES = ("home", "page", "product", "collection", "search", "cart", "not_found")
PART_KEYS = ("header", "footer", "announcement")

# Paths the shop already owns. A builder page cannot take one of them.
RESERVED_SLUGS = {
    "products", "product", "collections", "collection", "cart", "checkout", "account",
    "login", "logout", "signup", "create-account", "admin", "api", "platform", "search",
    "gang-sheets", "wholesale", "quick-order", "orders", "track-order", "blog", "reviews",
    "register", "forgot-password", "reset-password", "activate-account", "site-builder",
    "theme-editor", "theme-preview", "ui-preview", "sitemap.xml", "robots.txt",
}
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_FAMILY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$")
_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

# Fonts every visitor already has. No file is fetched for these.
SYSTEM_FONTS = {
    "system-ui", "sans-serif", "serif", "monospace", "Arial", "Helvetica", "Georgia",
    "Times New Roman", "Verdana", "Tahoma", "Trebuchet MS", "Courier New",
}
FONT_SOURCES = ("system", "google", "custom")


@dataclass(frozen=True)
class Component:
    """What the server needs to know about a component type to check it."""

    container: bool = False
    # Which children it may hold, when that is restricted.
    child_types: frozenset[str] | None = None
    # Props holding a link or a picture, checked for a safe address.
    urls: tuple[str, ...] = ()
    # Props pointing at the store's own records: (prop, kind, many?).
    refs: tuple[tuple[str, str, bool], ...] = ()
    # Template types it belongs in. Elsewhere it has nothing to show.
    context: tuple[str, ...] = ()


def _c(**kw: Any) -> Component:
    if "child_types" in kw and kw["child_types"] is not None:
        kw["child_types"] = frozenset(kw["child_types"])
    return Component(**kw)


COMPONENTS: dict[str, Component] = {
    # ── Layout ──
    "section": _c(container=True),
    "row": _c(container=True, child_types={"column"}),
    "column": _c(container=True),
    "stack": _c(container=True),
    "spacer": _c(),
    "divider": _c(),
    # ── Content ──
    "heading": _c(urls=("href",)),
    "text": _c(),
    "rich_text": _c(),
    "button": _c(urls=("href",)),
    "link": _c(urls=("href",)),
    "image": _c(urls=("src", "href")),
    "video": _c(urls=("url",)),
    "icon": _c(urls=("href",)),
    "faq": _c(),
    "tabs": _c(),
    "testimonials": _c(),
    "gallery": _c(),
    "banner": _c(urls=("image", "href")),
    "newsletter": _c(),
    "contact_form": _c(),
    "html": _c(),
    # ── Store ──
    # Its picture can be chosen for it; an address that is not a safe one is
    # refused at publish like any other picture's.
    "logo": _c(urls=("image", "href")),
    "store_name": _c(),
    "menu": _c(refs=(("menuId", "menu", False),)),
    "search": _c(),
    "cart_link": _c(),
    # The shop's own working cart, placed by a cart template. Presentation only:
    # the cart's behaviour stays in the one cart component.
    "cart_items": _c(context=("cart",)),
    "account_link": _c(),
    "auth_buttons": _c(urls=("loginHref", "signupHref")),
    "breadcrumbs": _c(),
    "announcement_bar": _c(urls=("href",)),
    # ── Commerce: the product being viewed ──
    "product_title": _c(context=("product",)),
    "product_price": _c(context=("product",)),
    "product_description": _c(context=("product",)),
    "product_gallery": _c(context=("product",)),
    "product_buy": _c(context=("product",)),
    # The product's own reviews: the stars under a title, and the list. Read
    # from the reviews customers already write; nothing new is stored.
    "product_rating": _c(context=("product",)),
    "product_reviews": _c(context=("product",)),
    # ── Commerce: lists of products and collections ──
    "product_grid": _c(refs=(("collectionId", "collection", False), ("productIds", "product", True))),
    "collection_grid": _c(refs=(("collectionIds", "collection", True),)),
    # ── Commerce: the collection being viewed ──
    "collection_title": _c(context=("collection",)),
    "collection_description": _c(context=("collection",)),
    "collection_image": _c(context=("collection",)),
    "collection_products": _c(context=("collection",)),
    # ── Structure ──
    "page_title": _c(context=("page",)),
    "page_content": _c(context=("page",)),
    "global_ref": _c(refs=(("ref", "global", False),)),
}

# Style keys a node may set, per breakpoint. camelCase, as the editor holds
# them; the renderer turns them into CSS.
STYLE_KEYS = {
    "color", "backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition",
    "backgroundRepeat", "padding", "paddingTop", "paddingRight", "paddingBottom",
    "paddingLeft", "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "gap", "width", "maxWidth", "minHeight", "height", "borderRadius", "border",
    "borderColor", "borderWidth", "borderStyle", "boxShadow", "textAlign", "fontFamily",
    "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textTransform",
    "textDecoration", "justifyContent", "alignItems", "flexDirection", "flexWrap",
    "objectFit", "aspectRatio", "opacity", "overflow",
    # Not CSS: how many columns a row lays out at this breakpoint.
    "columns",
    # The layout engine: a container's layout, and where a child sits in it.
    # Kept per breakpoint like every other setting; frontend style.ts turns
    # them into CSS.
    "display", "rowGap", "columnGap", "alignContent", "justifyItems", "gridAutoFlow",
    "gridColumns", "gridRows", "gridAuto", "gridMin", "gridTemplate",
    "alignSelf", "justifySelf", "flexGrow", "flexShrink", "flexBasis", "minWidth", "order",
    "gridColumn", "gridRow", "gridColumnSpan", "gridRowSpan",
    # Colours a container sets for the links and headings inside it, and a
    # line on one side only — what a header and a footer are styled with.
    "linkColor", "linkHoverColor", "headingColor", "borderTopWidth", "borderBottomWidth",
}

# What the layout keys may hold. Anything else is refused at publish, the way
# an unsafe value is: the renderer would drop it, and a page that quietly
# loses its layout is worse than being told.
_LAYOUT_ENUMS = {
    "display": {"flex", "grid", "block"},
    "gridAuto": {"fit", "fill"},
    "gridAutoFlow": {"row", "column", "dense", "row dense", "column dense"},
}
_LAYOUT_INTS = {
    "gridColumns": (1, 12), "gridRows": (0, 12), "gridColumnSpan": (1, 12), "gridRowSpan": (1, 12),
    "gridColumn": (1, 12), "gridRow": (1, 12), "flexGrow": (0, 100), "flexShrink": (0, 100), "order": (-100, 100),
}
_TRACK = r"(?:\d+(?:\.\d+)?(?:fr|px|%|em|rem)|auto|min-content|max-content|minmax\(\s*\d+(?:\.\d+)?(?:px|%|em|rem)?\s*,\s*\d+(?:\.\d+)?(?:fr|px|%|em|rem)\s*\))"
_TRACKS = re.compile(rf"^\s*{_TRACK}(?:\s+{_TRACK}){{0,11}}\s*$")
_STYLE_DANGER = re.compile(r"[;{}<>]|expression\s*\(|javascript:|@import|\\", re.I)
_SAFE_URL = re.compile(r"^(https?://|/(?!/)|#|mailto:|tel:)", re.I)
_CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I)


@dataclass
class Issue:
    path: str
    code: str
    message: str
    severity: str = "error"  # "error" blocks a publish; "warning" does not

    def as_dict(self) -> dict[str, str]:
        return {"path": self.path, "code": self.code, "message": self.message, "severity": self.severity}


@dataclass
class Known:
    """What exists for this brand, gathered before validating."""

    menu_ids: set[str] = field(default_factory=set)
    product_ids: set[str] = field(default_factory=set)
    collection_ids: set[str] = field(default_factory=set)
    custom_font_families: set[str] = field(default_factory=set)


def iter_nodes(tree: Any, path: str = "") -> Iterator[tuple[dict[str, Any], str, int]]:
    """Every node in a tree, with where it is and how deep."""
    stack: list[tuple[Any, str, int]] = [(tree, path, 0)]
    while stack:
        node, here, depth = stack.pop()
        if not isinstance(node, dict):
            continue
        yield node, here, depth
        children = node.get("children")
        if isinstance(children, list):
            for i in range(len(children) - 1, -1, -1):
                stack.append((children[i], f"{here}.children[{i}]", depth + 1))


def all_trees(doc: dict[str, Any]) -> Iterator[tuple[str, Any, str]]:
    """(path, tree, template_type) for every tree in a document.

    template_type is the context the tree renders in, which decides whether a
    "current product" component has a product to show.
    """
    for key in PART_KEYS:
        tree = (doc.get("parts") or {}).get(key)
        if tree:
            yield f"parts.{key}", tree, "part"
    for ttype, group in (doc.get("templates") or {}).items():
        if isinstance(group, dict):
            for tid, tpl in group.items():
                if isinstance(tpl, dict):
                    yield f"templates.{ttype}.{tid}.tree", tpl.get("tree"), ttype
    for slug, page in (doc.get("pages") or {}).items():
        if isinstance(page, dict):
            yield f"pages.{slug}.tree", page.get("tree"), "page"
    for gid, glob in (doc.get("globals") or {}).items():
        if isinstance(glob, dict):
            yield f"globals.{gid}.tree", glob.get("tree"), "global"
    for sid, saved in (doc.get("saved") or {}).items():
        if isinstance(saved, dict):
            yield f"saved.{sid}.tree", saved.get("tree"), "saved"


def font_families(doc: dict[str, Any]) -> set[str]:
    """The families a document may use: its own font list, plus the system ones."""
    families = set(SYSTEM_FONTS)
    for font in ((doc.get("settings") or {}).get("fonts") or []):
        if isinstance(font, dict) and isinstance(font.get("family"), str):
            families.add(font["family"])
    return families


def _check_style(style: Any, where: str, families: set[str], issues: list[Issue]) -> None:
    if style in (None, {}):
        return
    if not isinstance(style, dict):
        issues.append(Issue(where, "style_shape", "Style settings are not in the expected form."))
        return
    for key, value in style.items():
        if key not in STYLE_KEYS:
            issues.append(Issue(f"{where}.{key}", "style_key", f"'{key}' is not a setting this builder knows.",
                                "warning"))
            continue
        if isinstance(value, bool) or value is None:
            continue
        if key in _LAYOUT_INTS:
            low, high = _LAYOUT_INTS[key]
            ok = value == "auto" and key in ("gridColumn", "gridRow")
            if not ok:
                try:
                    ok = float(value) == int(float(value)) and low <= int(float(value)) <= high
                except (TypeError, ValueError):
                    ok = False
            if not ok:
                issues.append(Issue(f"{where}.{key}", "layout_value", f"'{key}' must be a whole number from {low} to {high}."))
            continue
        if key in _LAYOUT_ENUMS:
            if str(value) not in _LAYOUT_ENUMS[key]:
                issues.append(Issue(f"{where}.{key}", "layout_value",
                                    f"'{value}' is not a {key} this builder knows."))
            continue
        if key == "gridTemplate":
            if not isinstance(value, str) or not _TRACKS.match(value):
                issues.append(Issue(f"{where}.{key}", "layout_value",
                                    "Column widths are sizes like 2fr 1fr or 240px 1fr, up to twelve of them."))
            continue
        if isinstance(value, (int, float)):
            if key == "columns" and not (1 <= value <= 6):
                issues.append(Issue(f"{where}.{key}", "columns", "A row has between 1 and 6 columns."))
            continue
        if not isinstance(value, str):
            issues.append(Issue(f"{where}.{key}", "style_value", f"'{key}' has a value that is not text or a number."))
            continue
        if _STYLE_DANGER.search(value):
            issues.append(Issue(f"{where}.{key}", "style_unsafe", f"'{key}' contains characters that are not allowed."))
            continue
        for match in _CSS_URL.finditer(value):
            if not re.match(r"^https://", match.group(2).strip(), re.I):
                issues.append(Issue(f"{where}.{key}", "style_url", "Background images must be https addresses."))
        if key == "fontFamily":
            # The family as chosen in the editor; the renderer adds fallbacks.
            name = value.split(",")[0].strip().strip("'\"")
            if name not in families:
                issues.append(Issue(f"{where}.{key}", "font_unknown",
                                    f"The font '{name}' is not in this site's fonts. Add it in Typography first."))
        if key in ("color", "backgroundColor", "borderColor") and value.startswith("#") and not _HEX.match(value):
            issues.append(Issue(f"{where}.{key}", "colour", f"'{value}' is not a valid colour."))


def _check_tree(
    tree: Any, base: str, context: str, doc: dict[str, Any], known: Known,
    families: set[str], seen_ids: dict[str, str], counts: list[int], issues: list[Issue],
) -> None:
    if tree is None:
        return
    if not isinstance(tree, dict):
        issues.append(Issue(base, "tree_shape", "This part of the site is not in the expected form."))
        return
    globals_ = doc.get("globals") or {}

    for node, path, depth in iter_nodes(tree, base):
        counts[0] += 1
        ntype = node.get("type")
        nid = node.get("id")

        if depth > MAX_DEPTH:
            issues.append(Issue(path, "too_deep", f"Nested more than {MAX_DEPTH} levels deep."))
            continue
        if not isinstance(nid, str) or not _ID.match(nid):
            issues.append(Issue(path, "node_id", "An element is missing its id."))
        elif nid in seen_ids:
            issues.append(Issue(path, "duplicate_id",
                                f"Two elements share the id '{nid}' (also at {seen_ids[nid]})."))
        else:
            seen_ids[nid] = path

        spec = COMPONENTS.get(ntype) if isinstance(ntype, str) else None
        if spec is None:
            issues.append(Issue(path, "unknown_type", f"'{ntype}' is not an element this builder has."))
            continue

        props = node.get("props", {})
        if props is not None and not isinstance(props, dict):
            issues.append(Issue(f"{path}.props", "props_shape", "Settings are not in the expected form."))
            props = {}
        props = props or {}

        children = node.get("children")
        if children not in (None, []):
            if not isinstance(children, list):
                issues.append(Issue(f"{path}.children", "children_shape", "Children are not a list."))
            elif not spec.container:
                issues.append(Issue(f"{path}.children", "not_container",
                                    f"A {ntype} cannot hold other elements."))
            elif spec.child_types:
                for i, child in enumerate(children):
                    if isinstance(child, dict) and child.get("type") not in spec.child_types:
                        issues.append(Issue(f"{path}.children[{i}]", "child_type",
                                            f"A {ntype} can only hold {', '.join(sorted(spec.child_types))}."))

        for key in spec.urls:
            value = props.get(key)
            if value and (not isinstance(value, str) or not _SAFE_URL.match(value.strip())):
                # Saying which address, so it can be found and put right.
                shown = value.strip()[:60] if isinstance(value, str) else ""
                issues.append(Issue(f"{path}.props.{key}", "url_unsafe",
                                    "Links and images must be a web address or a path on this shop."
                                    + (f" “{shown}” is neither: start it with https:// for another site,"
                                       " or / for a page of this shop." if shown else "")))

        for prop, kind, many in spec.refs:
            value = props.get(prop)
            if value in (None, "", []):
                continue
            values = value if many else [value]
            if not isinstance(values, list):
                issues.append(Issue(f"{path}.props.{prop}", "ref_shape", "This reference is not in the expected form."))
                continue
            pool = {
                "menu": known.menu_ids, "product": known.product_ids,
                "collection": known.collection_ids, "global": set(globals_.keys()),
            }[kind]
            for v in values:
                if str(v) not in pool:
                    label = {"menu": "menu", "product": "product", "collection": "collection",
                             "global": "shared section"}[kind]
                    issues.append(Issue(f"{path}.props.{prop}", f"missing_{kind}",
                                        f"This element points at a {label} that no longer exists."))

        if ntype == "global_ref" and context == "global":
            issues.append(Issue(path, "global_nested",
                                "A shared section cannot contain another shared section."))

        if spec.context and context not in spec.context and context not in ("saved", "global"):
            issues.append(Issue(path, "out_of_context",
                                f"A {ntype.replace('_', ' ')} only shows on {', '.join(spec.context)} templates.",
                                "warning"))

        if ntype == "html":
            from app.services.builder.sanitize import clean_html, scope_css
            html_out = clean_html(str(props.get("html") or ""))
            if html_out.removed:
                issues.append(Issue(f"{path}.props.html", "html_cleaned",
                                    "Some of this HTML is not allowed and will be left out: "
                                    + ", ".join(sorted(set(html_out.removed))[:6]), "warning"))
            css_out = scope_css(str(props.get("css") or ""), f'[data-b="{nid}"]')
            if css_out.removed:
                issues.append(Issue(f"{path}.props.css", "css_cleaned",
                                    "Some of this CSS is not allowed and will be left out: "
                                    + ", ".join(sorted(set(css_out.removed))[:6]), "warning"))

        for bp in ("style", "tablet", "mobile"):
            _check_style(node.get(bp), f"{path}.{bp}", families, issues)

        hide = node.get("hide")
        if hide is not None and not isinstance(hide, dict):
            issues.append(Issue(f"{path}.hide", "hide_shape", "Visibility settings are not in the expected form."))


def _check_settings(doc: dict[str, Any], known: Known, issues: list[Issue]) -> set[str]:
    settings = doc.get("settings") or {}
    fonts = settings.get("fonts") or []
    if not isinstance(fonts, list):
        issues.append(Issue("settings.fonts", "fonts_shape", "The font list is not in the expected form."))
        fonts = []
    for i, font in enumerate(fonts):
        where = f"settings.fonts[{i}]"
        if not isinstance(font, dict):
            issues.append(Issue(where, "font_shape", "A font is not in the expected form."))
            continue
        family = font.get("family")
        source = font.get("source")
        if not isinstance(family, str) or not _FAMILY.match(family):
            issues.append(Issue(where, "font_family", f"'{family}' is not a usable font name."))
            continue
        if source not in FONT_SOURCES:
            issues.append(Issue(where, "font_source", f"'{family}' has no source."))
        if source == "custom" and family not in known.custom_font_families:
            issues.append(Issue(where, "font_missing",
                                f"The uploaded font '{family}' is gone. Upload it again or pick another."))
        weights = font.get("weights") or []
        if not isinstance(weights, list) or any(
            not isinstance(w, int) or w < 100 or w > 900 or w % 100 for w in weights
        ):
            issues.append(Issue(where, "font_weights", f"'{family}' has weights that are not 100 to 900."))

    families = font_families(doc)
    typography = settings.get("typography") or {}
    for role in ("heading", "body", "button"):
        chosen = (typography.get(role) or {}).get("family")
        if chosen and chosen not in families:
            issues.append(Issue(f"settings.typography.{role}", "font_unknown",
                                f"The {role} font '{chosen}' is not in this site's fonts."))

    for key, value in (settings.get("colors") or {}).items():
        if isinstance(value, str) and value and not _HEX.match(value):
            issues.append(Issue(f"settings.colors.{key}", "colour", f"'{value}' is not a valid colour."))
    return families


# Mirrors the caps in resolve.py: what one rendered page will fill.
GRIDS_PER_PAGE = 60
COLLECTION_SOURCES_PER_PAGE = 8


def _check_page_cost(tree: Any, base: str, issues: list[Issue]) -> None:
    """Warn when one tree asks for more than a page will fill.

    A warning, not an error: the page still publishes and renders, the grids
    past the limit are simply left empty — and the merchant is told which.
    """
    if not isinstance(tree, dict):
        return
    grids = 0
    sources: set[str] = set()
    for node, _path, _depth in iter_nodes(tree, base):
        if node.get("type") in ("product_grid", "collection_grid"):
            grids += 1
            props = node.get("props") or {}
            if node.get("type") == "product_grid" and props.get("source") == "collection" and props.get("collectionId"):
                sources.add(str(props.get("collectionId")))
    if grids > GRIDS_PER_PAGE:
        issues.append(Issue(base, "too_many_grids",
                            f"This has {grids} product and collection grids; a page fills the first "
                            f"{GRIDS_PER_PAGE} and leaves the rest empty.", "warning"))
    if len(sources) > COLLECTION_SOURCES_PER_PAGE:
        issues.append(Issue(base, "too_many_collections",
                            f"This shows products from {len(sources)} different collections; a page fills "
                            f"grids from the first {COLLECTION_SOURCES_PER_PAGE} and leaves the rest empty.", "warning"))


def validate(doc: Any, known: Known) -> list[Issue]:
    """Everything wrong with a document, worst first.

    An empty list, or one with only warnings, means it can be published.
    """
    issues: list[Issue] = []
    if not isinstance(doc, dict):
        return [Issue("", "doc_shape", "The site is not in the expected form.")]

    size = len(json.dumps(doc, separators=(",", ":"), default=str))
    if size > MAX_BYTES:
        issues.append(Issue("", "too_large",
                            f"The site is {size // 1000} KB; the limit is {MAX_BYTES // 1000} KB."))

    if doc.get("schema") != SCHEMA_VERSION:
        issues.append(Issue("schema", "schema_version", "This site was saved by a different builder version."))

    families = _check_settings(doc, known, issues)

    templates = doc.get("templates") or {}
    if not isinstance(templates, dict):
        issues.append(Issue("templates", "templates_shape", "Templates are not in the expected form."))
        templates = {}
    for ttype in templates:
        if ttype not in TEMPLATE_TYPES:
            issues.append(Issue(f"templates.{ttype}", "template_type", f"'{ttype}' is not a template type."))
    for ttype in ("home", "page", "product", "collection"):
        group = templates.get(ttype) or {}
        if "default" not in group:
            issues.append(Issue(f"templates.{ttype}", "template_default",
                                f"There is no default {ttype} template."))

    pages = doc.get("pages") or {}
    if not isinstance(pages, dict):
        issues.append(Issue("pages", "pages_shape", "Pages are not in the expected form."))
        pages = {}
    for slug, page in pages.items():
        where = f"pages.{slug}"
        if not _SLUG.match(slug):
            issues.append(Issue(where, "page_slug",
                                f"'{slug}' is not a usable address. Use lower-case letters, numbers and hyphens."))
        elif slug in RESERVED_SLUGS:
            issues.append(Issue(where, "page_reserved", f"'/{slug}' is already used by the shop."))
        if not isinstance(page, dict):
            issues.append(Issue(where, "page_shape", "This page is not in the expected form."))
            continue
        if not str(page.get("title") or "").strip():
            issues.append(Issue(f"{where}.title", "page_title", "This page has no title."))
        template = page.get("template") or "default"
        if template not in (templates.get("page") or {}):
            issues.append(Issue(f"{where}.template", "page_template", f"The page template '{template}' is gone."))

    assignments = doc.get("assignments") or {}
    for kind in ("product", "collection", "page"):
        rule = assignments.get(kind) or {}
        group = templates.get(kind) or {}
        default = rule.get("default")
        if default and default not in group:
            issues.append(Issue(f"assignments.{kind}.default", "assignment",
                                f"The default {kind} template '{default}' is gone."))
        for rid, tid in (rule.get("byId") or {}).items():
            if tid not in group:
                issues.append(Issue(f"assignments.{kind}.byId.{rid}", "assignment",
                                    f"A {kind} is set to use the template '{tid}', which is gone."))
            pool = known.product_ids if kind == "product" else known.collection_ids if kind == "collection" else None
            if pool is not None and str(rid) not in pool:
                issues.append(Issue(f"assignments.{kind}.byId.{rid}", f"missing_{kind}",
                                    f"A template is assigned to a {kind} that no longer exists.", "warning"))

    seen_ids: dict[str, str] = {}
    counts = [0]
    for path, tree, context in all_trees(doc):
        _check_tree(tree, path, context, doc, known, families, seen_ids, counts, issues)
        _check_page_cost(tree, path, issues)
    if counts[0] > MAX_NODES:
        issues.append(Issue("", "too_many_nodes",
                            f"The site has {counts[0]} elements; the limit is {MAX_NODES}."))

    issues.sort(key=lambda i: (i.severity != "error", i.path))
    return issues


def blocking(issues: list[Issue]) -> list[Issue]:
    return [i for i in issues if i.severity == "error"]
