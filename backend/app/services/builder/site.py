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
import json
import logging
import os
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.builder import (
    RENDER_BUILDER, RENDER_LEGACY, RENDER_MODES, BuilderFont, BuilderSite, BuilderVersion,
)
from app.services.builder.schema import COMPONENTS, Issue, Known, all_trees, blocking, iter_nodes, validate

logger = logging.getLogger(__name__)

# ── Published documents, kept in memory ───────────────────────────────────────
# A published version never changes after it is written, so the document read
# for it once is the document for good: the cache needs no invalidation, only a
# size limit. The key is (tenant, version) and a lookup only happens after the
# tenant's own site row has said which version is live, so one shop's entry
# can never be handed to another. Drafts are never cached — they change on
# every save and are not public.
_DOCS: OrderedDict[tuple[str, str], tuple[dict[str, Any], int, int]] = OrderedDict()
_DOCS_BYTES = [0]
DOC_CACHE_BYTES = int(float(os.environ.get("BUILDER_DOC_CACHE_MB", "16")) * 1_000_000)

# How much publish history a site keeps. The live version and pinned versions
# are always kept; the oldest of the rest go once there are more than this.
KEEP_VERSIONS = max(5, int(os.environ.get("BUILDER_KEEP_VERSIONS", "30")))
MAX_PINNED = 20


def _cache_get(tenant_id: Any, version_id: Any) -> tuple[dict[str, Any], int] | None:
    key = (str(tenant_id), str(version_id))
    hit = _DOCS.get(key)
    if hit is None:
        return None
    _DOCS.move_to_end(key)
    return hit[0], hit[1]


def _cache_put(tenant_id: Any, version_id: Any, document: dict[str, Any], number: int) -> None:
    if DOC_CACHE_BYTES <= 0:
        return
    size = len(json.dumps(document, separators=(",", ":"), default=str))
    if size > DOC_CACHE_BYTES:
        return
    key = (str(tenant_id), str(version_id))
    old = _DOCS.pop(key, None)
    if old is not None:
        _DOCS_BYTES[0] -= old[2]
    _DOCS[key] = (document, number, size)
    _DOCS_BYTES[0] += size
    while _DOCS_BYTES[0] > DOC_CACHE_BYTES and _DOCS:
        _k, (_d, _n, gone) = _DOCS.popitem(last=False)
        _DOCS_BYTES[0] -= gone


def _cache_forget(tenant_id: Any, version_ids: list[Any]) -> None:
    """Drop removed versions, so memory goes with the rows."""
    for vid in version_ids:
        old = _DOCS.pop((str(tenant_id), str(vid)), None)
        if old is not None:
            _DOCS_BYTES[0] -= old[2]


async def published_document(db: AsyncSession, tenant_id: Any, version_id: Any) -> tuple[dict[str, Any], int] | None:
    """A version's document and number, from memory when it has been read before."""
    hit = _cache_get(tenant_id, version_id)
    if hit is not None:
        return hit
    row = (await db.execute(
        select(BuilderVersion.document, BuilderVersion.number)
        .where(BuilderVersion.id == version_id, BuilderVersion.tenant_id == tenant_id)
    )).first()
    if row is None:
        return None
    _cache_put(tenant_id, version_id, row.document, row.number)
    return row.document, row.number


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
        # The row as it is now that it is locked — not the copy this session read
        # before waiting for the lock, or a save made in the meantime is missed.
        .execution_options(populate_existing=True)
    )).scalar_one()
    if expected_revision is not None and locked.draft_revision != expected_revision:
        raise DraftConflict(locked.draft_revision)
    locked.draft = draft
    locked.draft_revision = (locked.draft_revision or 0) + 1
    await db.flush()
    return locked


@dataclass
class Published:
    """What a publish did."""

    version: BuilderVersion
    warnings: list[Issue] = field(default_factory=list)
    # Nothing had changed since the live version: no new version was made.
    unchanged: bool = False
    # Version numbers removed to keep history inside its limit.
    pruned: list[int] = field(default_factory=list)


async def publish(db: AsyncSession, site: BuilderSite, *, user_id: Any = None,
                  note: str | None = None) -> Published:
    """Make the draft live, all of it or none of it.

    The site row is locked for the length of this so two publishes cannot both
    take the same version number. The caller commits; if anything before that
    raises, the transaction is rolled back and the pointer has not moved.

    Publishing exactly what is already live makes no new version: a repeated
    click, a retried request or a second tab all land on the version that is
    there. Decided under the same lock, so concurrent publishes of one draft
    make one version between them.
    """
    locked = (await db.execute(
        select(BuilderSite).where(BuilderSite.id == site.id).with_for_update()
        # The row as it is now that it is locked — not the copy this session read
        # before waiting for the lock, or a save made in the meantime is missed.
        .execution_options(populate_existing=True)
    )).scalar_one()
    issues = await check(db, locked)
    errors = blocking(issues)
    if errors:
        raise PublishBlocked(errors)
    warnings = [i for i in issues if i.severity != "error"]

    if locked.published_version_id:
        live = await published_document(db, locked.tenant_id, locked.published_version_id)
        if live is not None and live[0] == (locked.draft or {}):
            current = (await db.execute(
                select(BuilderVersion).where(BuilderVersion.id == locked.published_version_id,
                                             BuilderVersion.tenant_id == locked.tenant_id)
            )).scalar_one()
            return Published(current, warnings, unchanged=True)

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
    previous = locked.published_version_id
    db.add(version)
    await db.flush()
    locked.published_version_id = version.id
    await db.flush()
    pruned = await _prune(db, locked, also_keep=previous)
    logger.info("Builder site %s published version %s", locked.tenant_id, version.number)
    return Published(version, warnings, pruned=pruned)


async def _prune(db: AsyncSession, site: BuilderSite, *, also_keep: Any = None) -> list[int]:
    """Remove the oldest versions beyond KEEP_VERSIONS — never the live one,
    never the one that was live until this publish (the first thing anyone
    rolls back to), never a pinned one. Part of the publish's transaction: a
    publish that fails removes nothing. Returns the numbers removed, which the
    publish reports, so nothing disappears without the merchant being told."""
    protected = {site.published_version_id, also_keep} - {None}
    rows = (await db.execute(
        select(BuilderVersion.id, BuilderVersion.number)
        .where(BuilderVersion.site_id == site.id, BuilderVersion.tenant_id == site.tenant_id,
               BuilderVersion.pinned.is_(False), BuilderVersion.id.not_in(protected))
        .order_by(BuilderVersion.number.desc())
    )).all()
    # The protected versions count toward what is kept.
    extra = rows[max(0, KEEP_VERSIONS - len(protected)):]
    if not extra:
        return []
    ids = [r.id for r in extra]
    from sqlalchemy import delete

    await db.execute(delete(BuilderVersion).where(BuilderVersion.id.in_(ids),
                                                  BuilderVersion.tenant_id == site.tenant_id))
    _cache_forget(site.tenant_id, ids)
    numbers = sorted(r.number for r in extra)
    logger.info("Builder site %s removed versions %s (keeps %s)", site.tenant_id, numbers, KEEP_VERSIONS)
    return numbers


class PinRefused(Exception):
    pass


async def set_pinned(db: AsyncSession, site: BuilderSite, version_id: Any, pinned: bool) -> BuilderVersion:
    """Keep a version out of the history limit, or let it go again."""
    vid = _uuid(version_id)
    version = None
    if vid:
        version = (await db.execute(
            select(BuilderVersion).where(BuilderVersion.id == vid, BuilderVersion.site_id == site.id,
                                         BuilderVersion.tenant_id == site.tenant_id)
        )).scalar_one_or_none()
    if version is None:
        raise LookupError("That version is not one of this site's.")
    if pinned and not version.pinned:
        count = len((await db.execute(
            select(BuilderVersion.id).where(BuilderVersion.site_id == site.id, BuilderVersion.pinned.is_(True))
        )).all())
        if count >= MAX_PINNED:
            raise PinRefused(f"Up to {MAX_PINNED} versions can be kept. Unkeep one first.")
    version.pinned = pinned
    await db.flush()
    return version


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
        # The row as it is now that it is locked — not the copy this session read
        # before waiting for the lock, or a save made in the meantime is missed.
        .execution_options(populate_existing=True)
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


async def versions(db: AsyncSession, site: BuilderSite, limit: int = 80) -> list[dict[str, Any]]:
    rows = (await db.execute(
        select(BuilderVersion.id, BuilderVersion.number, BuilderVersion.note,
               BuilderVersion.created_at, BuilderVersion.published_by, BuilderVersion.pinned)
        .where(BuilderVersion.site_id == site.id)
        .order_by(BuilderVersion.number.desc()).limit(limit)
    )).all()
    return [{
        "id": str(r.id), "number": r.number, "note": r.note,
        "published_at": r.created_at.isoformat() if r.created_at else None,
        "live": r.id == site.published_version_id,
        "pinned": bool(r.pinned),
    } for r in rows]


async def live_document(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[str, dict[str, Any] | None, int | None]:
    """What the storefront should render this brand through.

    ("legacy", None, None) unless the brand has switched to the builder *and*
    has a published version — which is every store that existed before the
    builder, and stays so until its owner chooses otherwise.
    """
    # The mode first, on its own: every storefront page asks this, and for a
    # shop on its imported theme the answer is all that is needed. The
    # published document — the whole site — is read only for a builder shop.
    site = (await db.execute(
        select(BuilderSite.render_mode, BuilderSite.published_version_id)
        .where(BuilderSite.tenant_id == tenant_id)
    )).first()
    if site is None or site.render_mode != RENDER_BUILDER or site.published_version_id is None:
        return RENDER_LEGACY, None, None
    found = await published_document(db, tenant_id, site.published_version_id)
    if found is None:
        return RENDER_LEGACY, None, None
    return RENDER_BUILDER, found[0], found[1]
