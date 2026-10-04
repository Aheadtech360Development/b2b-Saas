"""A builder page with the store's real data in it.

The document holds structure and references — "the current product", "this
collection", "the main menu". This module reads exactly the records one page
needs and hands them back next to the structure, so the storefront can render
in one pass:

  * a product page loads that one product, not the catalogue
  * a collection page loads one page of that collection's products
  * a menu is read only if something on the page shows it
  * a product grid runs one query, for the number of cards it shows

Every lookup is filtered by the brand explicitly. A reference that does not
resolve — a menu deleted since the publish, a product taken off sale — comes
back empty, and the element renders nothing rather than the page failing.

Nothing here reads or writes brand_themes. The data helpers it shares with the
imported-theme renderer (theme_data, theme_product) are called, not changed.
"""
from __future__ import annotations

import copy
import json
import re
import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.builder import BuilderFont
from app.services.builder.schema import PART_KEYS, iter_nodes

MAX_GRID = 48
_ID_OK = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def _template(doc: dict[str, Any], ttype: str, tid: str | None) -> tuple[str, dict[str, Any] | None]:
    group = (doc.get("templates") or {}).get(ttype) or {}
    if tid and tid in group:
        return tid, group[tid].get("tree")
    if "default" in group:
        return "default", group["default"].get("tree")
    return "", None


def _nodes(*trees: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for tree in trees:
        if tree:
            out.extend(node for node, _p, _d in iter_nodes(tree))
    return out


async def _menus(db: AsyncSession, tenant_id: uuid.UUID, ids: set[str]) -> dict[str, list]:
    valid = [str(u) for u in (_uuid(i) for i in ids) if u]
    if not valid:
        return {}
    rows = (await db.execute(
        text("SELECT CAST(id AS text) AS id, items FROM tenant_menus "
             "WHERE tenant_id = CAST(:t AS uuid) AND CAST(id AS text) = ANY(:ids)"),
        {"t": str(tenant_id), "ids": valid},
    )).all()
    out: dict[str, list] = {}
    for row in rows:
        items = row.items
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except ValueError:
                items = []
        out[row.id] = items if isinstance(items, list) else []
    return out


async def _collection_slug(db: AsyncSession, tenant_id: uuid.UUID, cid: Any) -> str:
    u = _uuid(cid)
    if not u:
        return ""
    return (await db.execute(
        text("SELECT slug FROM collections WHERE id = :i AND tenant_id = CAST(:t AS uuid) AND is_active"),
        {"i": str(u), "t": str(tenant_id)},
    )).scalar() or ""


async def _search_ids(db: AsyncSession, tenant_id: uuid.UUID, q: str, limit: int) -> list[str]:
    q = (q or "").strip()
    if not q:
        return []
    rows = (await db.execute(
        text("SELECT CAST(id AS text) FROM products "
             "WHERE tenant_id = CAST(:t AS uuid) AND status = 'active' "
             "AND (name ILIKE :q OR short_description ILIKE :q) "
             "ORDER BY name LIMIT :n"),
        {"t": str(tenant_id), "q": f"%{q[:80]}%", "n": limit},
    )).scalars().all()
    return list(rows)


async def _grid(db: AsyncSession, tenant_id: uuid.UUID, props: dict[str, Any], *,
                product: dict | None, query: str) -> list[dict[str, Any]]:
    from app.services import theme_data

    limit = max(1, min(int(props.get("limit") or 8), MAX_GRID))
    source = props.get("source") or "newest"
    if source == "manual":
        ids = [str(u) for u in (_uuid(i) for i in (props.get("productIds") or [])) if u]
        return await theme_data.products(db, limit=limit, ids=ids) if ids else []
    if source == "collection":
        slug = await _collection_slug(db, tenant_id, props.get("collectionId"))
        return await theme_data.products(db, limit=limit, collection_slug=slug) if slug else []
    if source == "search":
        ids = await _search_ids(db, tenant_id, query, limit)
        return await theme_data.products(db, limit=limit, ids=ids) if ids else []
    if source == "related":
        # The newest of everything else. One more than needed, so the product
        # being viewed can be left out and the row still fills.
        cards = await theme_data.products(db, limit=limit + 1)
        here = f"/products/{product['slug']}" if product else None
        return [c for c in cards if c.get("url") != here][:limit]
    return await theme_data.products(db, limit=limit)


async def _fonts(db: AsyncSession, tenant_id: uuid.UUID, doc: dict[str, Any]) -> dict[str, Any]:
    """Only the fonts this site uses, and only their weights.

    Google families go into one stylesheet request; uploaded ones become
    @font-face rules for the faces this brand has — and only this brand: the
    query is by its tenant id, so a family name another brand also used
    cannot pull in that brand's file.
    """
    google: list[dict[str, Any]] = []
    custom_families: set[str] = set()
    for font in ((doc.get("settings") or {}).get("fonts") or []):
        if not isinstance(font, dict):
            continue
        if font.get("source") == "google":
            google.append({"family": font.get("family"),
                           "weights": sorted({int(w) for w in (font.get("weights") or [400])}),
                           "italic": "italic" in (font.get("styles") or [])})
        elif font.get("source") == "custom":
            custom_families.add(str(font.get("family")))
    custom: list[dict[str, Any]] = []
    if custom_families:
        rows = (await db.execute(
            select(BuilderFont).where(BuilderFont.tenant_id == tenant_id,
                                      BuilderFont.family.in_(custom_families))
        )).scalars().all()
        custom = [{"family": r.family, "weight": r.weight, "style": r.style,
                   "url": r.url, "format": r.format} for r in rows]
    return {"google": google, "custom": custom}


def _safe(tree: Any) -> Any:
    """A copy of a tree with its merchant-written markup made safe to serve.

    The document keeps what the merchant typed, so the editor can show it back
    to them; what leaves here is what a shopper's browser gets, and that is
    always the cleaned version — Custom HTML without scripts or handlers, its
    CSS confined to its own block, rich text reduced to formatting. Cleaned on
    every answer rather than once at publish, so a rule tightened later
    applies to sites published before it.
    """
    if not isinstance(tree, dict):
        return tree
    from app.services.builder.sanitize import clean_html, scope_css

    out = copy.deepcopy(tree)
    for node, _p, _d in iter_nodes(out):
        props = node.get("props")
        if not isinstance(props, dict):
            continue
        if node.get("type") in ("html", "rich_text"):
            props["html"] = clean_html(str(props.get("html") or "")).value
        if node.get("type") == "html":
            nid = str(node.get("id") or "")
            css = str(props.get("css") or "")
            props["css"] = scope_css(css, f'.bsite [data-b="{nid}"]').value if css and _ID_OK.match(nid) else ""
    return out


async def _store(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    row = (await db.execute(
        text("SELECT t.name, b.store_name, b.logo_url FROM tenants t "
             "LEFT JOIN tenant_branding b ON b.tenant_id = t.id WHERE t.id = CAST(:t AS uuid)"),
        {"t": str(tenant_id)},
    )).first()
    if not row:
        return {"name": "", "logo": ""}
    return {"name": row.store_name or row.name or "", "logo": row.logo_url or ""}


async def render_payload(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    doc: dict[str, Any],
    *,
    route: str,
    slug: str = "",
    query: str = "",
    page: int = 1,
    sort: str = "",
    version: int | None = None,
    template_id: str = "",
) -> dict[str, Any]:
    """Everything one storefront page needs, in one answer.

    route="chrome" is the header, announcement and footer alone — what the
    shop wears around the pages the builder does not draw (the cart, the
    checkout, the account). template_id forces one template of the route's
    type; only the editor's preview passes it, to show a template that is not
    the one assigned.
    """
    from app.services import theme_data, theme_product

    assignments = doc.get("assignments") or {}
    parts = {k: (doc.get("parts") or {}).get(k) for k in PART_KEYS}
    data: dict[str, Any] = {"product": None, "collection": None, "collectionPage": None,
                            "menus": {}, "grids": {}, "collectionGrids": {}, "store": {}}
    page_data: dict[str, Any] | None = None
    not_found = False
    ttype = route
    tid: str | None = None

    if route == "product":
        u = None
        row = (await db.execute(
            text("SELECT CAST(id AS text) AS id FROM products "
                 "WHERE slug = :s AND status = 'active' AND tenant_id = CAST(:t AS uuid)"),
            {"s": slug, "t": str(tenant_id)},
        )).first()
        if row:
            u = row.id
            data["product"] = await theme_product.load(db, u)
        if not data["product"]:
            not_found, ttype = True, "not_found"
        else:
            rule = assignments.get("product") or {}
            tid = (rule.get("byId") or {}).get(u) or rule.get("default")

    elif route == "collection":
        found = await theme_data.collection_page(db, slug, page=page, sort=sort)
        if found is None:
            not_found, ttype = True, "not_found"
        else:
            cid = (await db.execute(
                text("SELECT CAST(id AS text) FROM collections "
                     "WHERE slug = :s AND tenant_id = CAST(:t AS uuid)"),
                {"s": slug, "t": str(tenant_id)},
            )).scalar()
            data["collection"] = found["collection"]
            data["collectionPage"] = {k: found[k] for k in ("items", "total", "page", "page_size", "has_more")}
            rule = assignments.get("collection") or {}
            tid = (rule.get("byId") or {}).get(cid or "") or rule.get("default")

    elif route == "page":
        page_doc = (doc.get("pages") or {}).get(slug)
        if not isinstance(page_doc, dict):
            not_found, ttype = True, "not_found"
        else:
            tid = page_doc.get("template") or (assignments.get("page") or {}).get("default")
            page_data = {"slug": slug, "title": page_doc.get("title") or "",
                         "seo": page_doc.get("seo") or {}, "tree": page_doc.get("tree")}

    elif route not in ("home", "search", "cart", "not_found", "chrome"):
        not_found, ttype = True, "not_found"

    if template_id and not not_found:
        tid = template_id
    if ttype == "chrome":
        template_id, tree = "", None
    else:
        template_id, tree = _template(doc, ttype, tid)

    # Shared sections the page uses, and only those.
    globals_all = doc.get("globals") or {}
    page_tree = page_data.get("tree") if page_data else None
    used: dict[str, Any] = {}
    for node in _nodes(tree, page_tree, *parts.values()):
        if node.get("type") == "global_ref":
            ref = str((node.get("props") or {}).get("ref") or "")
            if ref in globals_all:
                used[ref] = globals_all[ref].get("tree")
    nodes = _nodes(tree, page_tree, *parts.values(), *used.values())

    menu_ids = {str((n.get("props") or {}).get("menuId")) for n in nodes
                if n.get("type") == "menu" and (n.get("props") or {}).get("menuId")}
    data["menus"] = await _menus(db, tenant_id, menu_ids)

    for node in nodes:
        props = node.get("props") or {}
        if node.get("type") == "product_grid":
            data["grids"][node["id"]] = await _grid(db, tenant_id, props, product=data["product"], query=query)
        elif node.get("type") == "collection_grid":
            ids = [str(u) for u in (_uuid(i) for i in (props.get("collectionIds") or [])) if u]
            limit = max(1, min(int(props.get("limit") or 4), MAX_GRID))
            data["collectionGrids"][node["id"]] = await theme_data.collections(db, limit=limit, ids=ids or None)

    data["store"] = await _store(db, tenant_id)

    # Descriptions are written in the product and collection editors and can
    # carry markup. A builder page puts them in as HTML, so they leave here
    # cleaned like any other markup the shopper's browser is handed.
    from app.services.builder.sanitize import clean_html

    if data["product"] and data["product"].get("description"):
        data["product"] = {**data["product"], "description": clean_html(data["product"]["description"]).value}
    if data["collection"] and data["collection"].get("description"):
        data["collection"] = {**data["collection"],
                              "description": clean_html(data["collection"]["description"]).value}

    return {
        "mode": "visual_builder",
        "version": version,
        "route": route,
        "templateType": ttype,
        "templateId": template_id,
        "notFound": not_found,
        "settings": doc.get("settings") or {},
        "fonts": await _fonts(db, tenant_id, doc),
        "parts": {k: _safe(v) for k, v in parts.items()},
        "template": _safe(tree),
        "page": {**page_data, "tree": _safe(page_data.get("tree"))} if page_data else None,
        "globals": {k: _safe(v) for k, v in used.items()},
        "query": query,
        "data": data,
    }
