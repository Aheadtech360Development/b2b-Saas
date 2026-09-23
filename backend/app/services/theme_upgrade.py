"""Re-read a theme when the parser has learned something new.

The importer improves — it learned to find rows of cards, then navigation,
then where a product is bought. A theme parsed by an older version simply
doesn't have those parts, and its storefront keeps showing the design's
example products because there is nothing to fill.

Since migration 0050 the design file is kept with the theme, so it can be read
again in place. What the admin wrote is checked against the new definition and
kept wherever it still fits, and a published theme stays published.
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_theme import BrandTheme
from app.services import theme_import, theme_render

logger = logging.getLogger(__name__)


def upgrade_in_place(definition: dict) -> dict:
    """Re-read what the parser can see in a theme's own stored markup.

    Every section keeps the HTML it was cut from, so a theme parsed by an
    older version can be brought forward without the original file: its
    chrome, its rows of cards and its editable fields are all findable in
    that markup. Section ids and positions don't move, so everything the
    admin wrote still lands where it was written.
    """
    from bs4 import BeautifulSoup

    pages = (definition or {}).get("pages") or {}
    for page in pages.values():
        kind = page.get("kind") or "page"
        for section in page.get("sections", []):
            soup = BeautifulSoup(section.get("html") or "", "html.parser")
            root = next((c for c in soup.children if getattr(c, "name", None)), None)
            if root is None:
                continue
            section["role"] = theme_import._section_role(root)
            if section["role"] == "footer":
                theme_import._linkify_lists(root)
            elif section["role"] == "announcement":
                theme_import._marquee_announcement(root)
            section["repeaters"] = theme_import._repeaters_for(root)
            # Reading the fields is also what gives a link the design left
            # pointing nowhere a destination, so the markup is taken after it.
            section["fields"] = theme_import._fields_for(root)
            if section["role"] == "header":
                theme_import._mobile_header(root)
            section["html"] = str(soup)

        if kind == "product":
            scored = [
                (theme_import._buy_block_score(
                    BeautifulSoup(s.get("html") or "", "html.parser")), i)
                for i, s in enumerate(page.get("sections", [])) if not s.get("role")
            ] or [(0, 0)]
            best_score, best = max(scored)
            if best_score >= 5:
                page["sections"][best]["role"] = "product_block"
                page["sections"][best]["label"] = "Product — gallery, options, add to cart"

    definition["version"] = theme_import.PARSER_VERSION
    return definition


async def ensure_current(db: AsyncSession, theme: BrandTheme | None) -> BrandTheme | None:
    """Bring a theme up to the current parser, with or without its file."""
    if theme is None:
        return None
    version = int((theme.definition or {}).get("version") or 1)
    if version >= theme_import.PARSER_VERSION:
        return theme

    if theme.source_html:
        try:
            definition = theme_import.import_html(theme.source_html, name=theme.name)
        except Exception as exc:  # a file that no longer parses is left alone
            logger.warning("theme %s could not be re-read: %s", theme.id, exc)
            return theme
    else:
        # Imported before the file was kept: read its own markup instead.
        try:
            definition = upgrade_in_place(dict(theme.definition or {}))
        except Exception as exc:
            logger.warning("theme %s could not be upgraded in place: %s", theme.id, exc)
            return theme

    # Sections keep their positions, so what was written still lands where it
    # was written; anything the new parse doesn't have is dropped.
    draft = theme_render.clean_state(definition, theme.draft)
    published = theme_render.clean_state(definition, theme.published) if theme.published is not None else None

    # Rows of cards the older parse never saw: start them on the store's own
    # products, which is what they are for.
    defaults = theme_import.default_state(definition)
    for key, page in (defaults.get("pages") or {}).items():
        for target in (draft, published):
            if target is None:
                continue
            slots = (target.get("pages") or {}).get(key)
            if slots is None:
                continue
            for section_id, rows in (page.get("dynamic") or {}).items():
                existing = slots.setdefault("dynamic", {}).setdefault(section_id, {})
                for row_key, spec in rows.items():
                    existing.setdefault(row_key, spec)

    theme.definition = definition
    theme.draft = draft
    if published is not None:
        theme.published = published
    await db.commit()
    await db.refresh(theme)
    logger.info("theme %s re-read with parser v%s", theme.id, theme_import.PARSER_VERSION)
    return theme
