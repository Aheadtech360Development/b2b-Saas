"""The logo a shop's buyers see.

A shop live on the website builder draws the logo block in its builder header,
whose picture the owner sets in the builder. The logo in the shop's branding
settings is only that block's fallback, and the logo every shop not on the
builder shows. The two drift apart: Innterflow's header showed its own logo
while its settings still held an older one (an image from another shop's
folder), so its account pages, its sign-in page, its emails and its PDFs
showed the older one.

One answer for every place a buyer sees the shop's logo: the live header's
logo picture when there is one, the settings' logo otherwise. Nothing is
written: the settings keep what the owner saved there.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _picture(value: Any) -> str | None:
    url = value.strip() if isinstance(value, str) else ""
    return url if url.startswith(("https://", "http://")) else None


def header_logo_of(doc: dict[str, Any] | None) -> str | None:
    """The first logo block's picture in a builder document's header, following
    a shared (global) section the header points to. None when the header has
    no logo block or its block shows the shop's name or settings logo."""
    if not isinstance(doc, dict):
        return None
    from app.services.builder.schema import iter_nodes

    header = (doc.get("parts") or {}).get("header")
    globals_ = doc.get("globals") or {}
    trees = [header]
    seen: set[str] = set()
    while trees:
        for node, _path, _depth in iter_nodes(trees.pop(0)):
            kind = node.get("type")
            props = node.get("props") or {}
            if kind == "logo":
                found = _picture(props.get("image"))
                if found:
                    return found
            elif kind == "global_ref":
                ref = str(props.get("ref") or "")
                shared = globals_.get(ref) if ref and ref not in seen else None
                if isinstance(shared, dict):
                    seen.add(ref)
                    trees.append(shared.get("tree"))
    return None


async def header_logo(db: AsyncSession, tenant_id: Any) -> str | None:
    """The logo in the header of the shop's live builder site, or None when the
    shop is not live on the builder or its header sets none. Read in a
    savepoint: a failure here never spoils the caller's transaction."""
    if not tenant_id:
        return None
    import uuid

    from app.models.builder import RENDER_BUILDER
    from app.services.builder import site as builder_site

    try:
        tid = tenant_id if isinstance(tenant_id, uuid.UUID) else uuid.UUID(str(tenant_id))
        async with db.begin_nested():
            mode, doc, _number = await builder_site.live_document(db, tid)
    except Exception:  # noqa: BLE001 — the settings' logo is the answer then
        logger.warning("shop_logo: builder lookup failed for %s", tenant_id, exc_info=True)
        return None
    if mode != RENDER_BUILDER:
        return None
    return header_logo_of(doc)


async def header_logo_unscoped(db: AsyncSession, tenant_id: Any) -> str | None:
    """header_logo for a caller that runs before the request's row-level scope
    is bound: the brand identity (core/database.use_brand_identity) is set
    while the tenant is still being resolved, when the builder's rows would
    read as none. Raw SQL in a savepoint that lifts the scope for its own
    statement and is rolled back after, so the caller's transaction and its
    settings are exactly as they were."""
    if not tenant_id:
        return None
    import json

    from sqlalchemy import text

    from app.models.builder import RENDER_BUILDER

    row = None
    try:
        nested = await db.begin_nested()
    except Exception:  # noqa: BLE001
        return None
    try:
        await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
        row = (await db.execute(
            text(
                "SELECT s.render_mode, v.document FROM builder_sites s "
                "JOIN builder_versions v ON v.id = s.published_version_id AND v.tenant_id = s.tenant_id "
                "WHERE s.tenant_id = CAST(:t AS uuid)"
            ),
            {"t": str(tenant_id)},
        )).first()
    except Exception:  # noqa: BLE001 — the settings' logo is the answer then
        logger.warning("shop_logo: unscoped builder lookup failed for %s", tenant_id, exc_info=True)
        row = None
    finally:
        await nested.rollback()
    if not row or row[0] != RENDER_BUILDER:
        return None
    doc = row[1]
    if isinstance(doc, str):
        try:
            doc = json.loads(doc)
        except ValueError:
            return None
    return header_logo_of(doc)
