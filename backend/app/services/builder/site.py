"""A brand's builder site: its draft, its versions, and which one is live.

The storefront only ever reads a published version, through the site's
pointer, and only when the brand has switched its render mode to the builder.
Everything else here — saving, validating, publishing, rolling back — happens
to the draft or to that pointer, so nothing a merchant does in the editor can
reach a shopper until a publish succeeds in full.

Publishing is one transaction: lock the site, check the draft, write the
version, move the pointer. If any part of that fails, none of it happened and
the live site is what it was.
"""
from __future__ import annotations

import copy
import logging
import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.builder import (
    RENDER_BUILDER, RENDER_LEGACY, RENDER_MODES, BuilderFont, BuilderSite, BuilderVersion,
)
from app.services.builder.schema import COMPONENTS, Issue, Known, all_trees, blocking, iter_nodes, validate

logger = logging.getLogger(__name__)


class DraftConflict(Exception):
    """The draft changed since this editor loaded it — another tab saved."""

    def __init__(self, current_revision: int) -> None:
        super().__init__("draft changed")
        self.current_revision = current_revision


class PublishBlocked(Exception):
    """The draft has problems that would break the live site."""

    def __init__(self, issues: list[Issue]) -> None:
        super().__init__(f"{len(issues)} problem(s)")
        self.issues = issues


class ModeRefused(Exception):
    pass


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


async def get_site(db: AsyncSession, tenant_id: uuid.UUID) -> BuilderSite | None:
    return (await db.execute(
        select(BuilderSite).where(BuilderSite.tenant_id == tenant_id)
    )).scalar_one_or_none()


async def ensure_site(db: AsyncSession, tenant_id: uuid.UUID, seed: dict[str, Any]) -> BuilderSite:
    """The brand's site, made with a starter draft if it has none.

    Created in legacy mode, always. Opening the builder is not switching to it.
    """
    site = await get_site(db, tenant_id)
    if site is not None:
        return site
    site = BuilderSite(tenant_id=tenant_id, render_mode=RENDER_LEGACY, draft=seed, draft_revision=1)
    db.add(site)
    await db.flush()
    return site


def referenced_ids(doc: dict[str, Any]) -> dict[str, set[str]]:
    """Every menu, product and collection a document points at.

    Gathered first so that checking them is one query per kind for just these
    ids, rather than loading a whole catalogue to find out whether three
    products exist.
    """
    found: dict[str, set[str]] = {"menu": set(), "product": set(), "collection": set()}
    for _path, tree, _ctx in all_trees(doc):
        for node, _p, _d in iter_nodes(tree):
            spec = COMPONENTS.get(node.get("type"))  # type: ignore[arg-type]
            if not spec:
                continue
            props = node.get("props") or {}
            for prop, kind, many in spec.refs:
                if kind not in found:
                    continue
                value = props.get(prop)
                if value in (None, "", []):
                    continue
                for v in (value if many and isinstance(value, list) else [value]):
                    found[kind].add(str(v))
    for kind in ("product", "collection"):
        for rid in ((doc.get("assignments") or {}).get(kind) or {}).get("byId", {}) or {}:
            found[kind].add(str(rid))
    return found


async def known_refs(db: AsyncSession, tenant_id: uuid.UUID, doc: dict[str, Any]) -> Known:
    """Which of the document's references exist for this brand.

    Filtered by tenant explicitly, not only by the session's scoping: this is
    the check that stops one brand's page pointing at another brand's product,
    and it should not depend on anything else having been set up right.
    """
    refs = referenced_ids(doc)
    known = Known()
    tid = str(tenant_id)

    async def existing(table: str, ids: set[str]) -> set[str]:
        valid = [str(u) for u in (_uuid(i) for i in ids) if u]
        if not valid:
            return set()
        rows = (await db.execute(
            text(f"SELECT CAST(id AS text) FROM {table} "
                 "WHERE tenant_id = CAST(:t AS uuid) AND CAST(id AS text) = ANY(:ids)"),
            {"t": tid, "ids": valid},
        )).scalars().all()
        return set(rows)

    known.menu_ids = await existing("tenant_menus", refs["menu"])
    known.product_ids = await existing("products", refs["product"])
    known.collection_ids = await existing("collections", refs["collection"])
    families = (await db.execute(
        select(BuilderFont.family).where(BuilderFont.tenant_id == tenant_id).distinct()
    )).scalars().all()
    known.custom_font_families = set(families)
    return known


async def check(db: AsyncSession, site: BuilderSite) -> list[Issue]:
    """What would stop this draft being published, and what is only a warning."""
    known = await known_refs(db, site.tenant_id, site.draft or {})
    return validate(site.draft or {}, known)


async def save_draft(db: AsyncSession, site: BuilderSite, draft: dict[str, Any],
                     expected_revision: int | None) -> BuilderSite:
    """Store the editor's working copy.

    `expected_revision` is the revision the editor loaded. If somebody else has
    saved since — another tab, another member of staff — this refuses rather
    than quietly throwing their work away.
    """
    locked = (await db.execute(
        select(BuilderSite).where(BuilderSite.id == site.id).with_for_update()
    )).scalar_one()
    if expected_revision is not None and locked.draft_revision != expected_revision:
        raise DraftConflict(locked.draft_revision)
    locked.draft = draft
    locked.draft_revision = (locked.draft_revision or 0) + 1
    await db.flush()
    return locked


async def publish(db: AsyncSession, site: BuilderSite, *, user_id: Any = None,
                  note: str | None = None) -> tuple[BuilderVersion, list[Issue]]:
    """Make the draft live, all of it or none of it.

    The site row is locked for the length of this so two publishes cannot both
    take the same version number. The caller commits; if anything before that
    raises, the transaction is rolled back and the pointer has not moved.
    """
    locked = (await db.execute(
        select(BuilderSite).where(BuilderSite.id == site.id).with_for_update()
    )).scalar_one()
    issues = await check(db, locked)
    errors = blocking(issues)
    if errors:
        raise PublishBlocked(errors)

    last = (await db.execute(
        select(BuilderVersion.number).where(BuilderVersion.site_id == locked.id)
        .order_by(BuilderVersion.number.desc()).limit(1)
    )).scalar_one_or_none() or 0

    version = BuilderVersion(
        tenant_id=locked.tenant_id,
        site_id=locked.id,
        number=last + 1,
        # A copy, never the draft object itself: the draft keeps changing
        # after this, and a version must not.
        document=copy.deepcopy(locked.draft or {}),
        note=(note or "").strip()[:200] or None,
        published_by=_uuid(user_id),
    )
    db.add(version)
    await db.flush()
    locked.published_version_id = version.id
    await db.flush()
    logger.info("Builder site %s published version %s", locked.tenant_id, version.number)
    return version, [i for i in issues if i.severity != "error"]


async def rollback(db: AsyncSession, site: BuilderSite, version_id: Any) -> BuilderVersion:
    """Point the live site back at an earlier version.

    Only a version of this same site: the lookup is by site and tenant, so an
    id from anywhere else simply is not found.
    """
    vid = _uuid(version_id)
    version = None
    if vid:
        version = (await db.execute(
            select(BuilderVersion).where(
                BuilderVersion.id == vid,
                BuilderVersion.site_id == site.id,
                BuilderVersion.tenant_id == site.tenant_id,
            )
        )).scalar_one_or_none()
    if version is None:
        raise LookupError("That version is not one of this site's.")
    locked = (await db.execute(
        select(BuilderSite).where(BuilderSite.id == site.id).with_for_update()
    )).scalar_one()
    locked.published_version_id = version.id
    await db.flush()
    logger.info("Builder site %s rolled back to version %s", locked.tenant_id, version.number)
    return version


async def set_mode(db: AsyncSession, site: BuilderSite, mode: str) -> BuilderSite:
    """Choose what the storefront renders through.

    Moving to the builder needs something published to show; moving back to
    legacy is always allowed, and puts the imported theme back exactly as it
    was, because nothing here ever touched it.
    """
    if mode not in RENDER_MODES:
        raise ModeRefused(f"'{mode}' is not a render mode.")
    if mode == RENDER_BUILDER and not site.published_version_id:
        raise ModeRefused("Publish the builder site at least once before switching the storefront to it.")
    site.render_mode = mode
    await db.flush()
    return site


async def versions(db: AsyncSession, site: BuilderSite, limit: int = 30) -> list[dict[str, Any]]:
    rows = (await db.execute(
        select(BuilderVersion.id, BuilderVersion.number, BuilderVersion.note,
               BuilderVersion.created_at, BuilderVersion.published_by)
        .where(BuilderVersion.site_id == site.id)
        .order_by(BuilderVersion.number.desc()).limit(limit)
    )).all()
    return [{
        "id": str(r.id), "number": r.number, "note": r.note,
        "published_at": r.created_at.isoformat() if r.created_at else None,
        "live": r.id == site.published_version_id,
    } for r in rows]


async def live_document(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[str, dict[str, Any] | None, int | None]:
    """What the storefront should render this brand through.

    ("legacy", None, None) unless the brand has switched to the builder *and*
    has a published version — which is every store that existed before the
    builder, and stays so until its owner chooses otherwise.
    """
    row = (await db.execute(
        select(BuilderSite.render_mode, BuilderVersion.document, BuilderVersion.number)
        .join(BuilderVersion, BuilderVersion.id == BuilderSite.published_version_id)
        .where(BuilderSite.tenant_id == tenant_id)
    )).first()
    if row is None or row.render_mode != RENDER_BUILDER:
        return RENDER_LEGACY, None, None
    return RENDER_BUILDER, row.document, row.number
