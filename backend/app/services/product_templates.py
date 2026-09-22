"""Product templates: the layout rules, validation, and which template a product gets.

A template has two parts.

``blocks`` — the product information column, top to bottom. Four of them are
the *standard* product information and every template has each exactly once:

    title      product code, title, and the fabric · weight · colours line
    price      the "from" price and the wholesale sign-in prompt
    highlight  the product's highlight box
    buy        variants / options, quantities and add to cart

They can be moved but never removed — a template decides what goes around the
product, not whether the product can be bought. Between them go any number of
custom blocks: an announcement (stripe) bar, a text block, or custom code.

``sections`` — full-width sections under the product, the same sections the
page builder uses (plus custom code), so a brand builds both with one tool.

Any custom text can print product data with tokens such as
``{{ product.title }}`` or ``{{ product.metafields.ship_days }}``; the
storefront fills them in. A block can also be told to show only when a given
metafield has a value, so one template can serve products that have the data
and products that don't.

Which template a product gets: its own (if published), else the brand's
default (if published), else none — and none means the product page exactly as
it was before templates existed.
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_template import ProductTemplate

STANDARD_BLOCKS: dict[str, str] = {
    "title": "Title",
    "price": "Price",
    "highlight": "Highlight box",
    "buy": "Variants & add to cart",
}
CUSTOM_BLOCKS: dict[str, str] = {
    "announcement": "Announcement bar",
    "text": "Text",
    "custom_code": "Custom code",
}
DEFAULT_ORDER = ["title", "price", "highlight", "buy"]

# Section types the page builder knows; a template's sections use the same set.
SECTION_TYPES = {
    "hero", "slideshow", "image_text", "rich_text", "gallery", "features",
    "testimonials", "faq", "logo_strip", "newsletter", "contact_form", "custom_code",
}

MAX_BLOCKS = 40
MAX_SECTIONS = 30
MAX_CODE_BYTES = 100_000          # html + css + js of one custom code block
MAX_LAYOUT_BYTES = 1_000_000      # a whole template, as stored
MAX_TEXT = 5_000
MAX_METAFIELDS = 50
MAX_METAFIELD_VALUE = 5_000

_COLOR = re.compile(r"^#[0-9a-fA-F]{3,8}$")
_KEY = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class TemplateError(ValueError):
    """The layout can't be saved as sent; the message says why, in plain words."""


# ── Small helpers ────────────────────────────────────────────────────────────

def _text(value: Any, limit: int = MAX_TEXT) -> str:
    if value is None:
        return ""
    return str(value)[:limit]


def _color(value: Any) -> str | None:
    return value if isinstance(value, str) and _COLOR.match(value) else None


def _block_id(value: Any) -> str:
    return value if isinstance(value, str) and _ID.match(value) else uuid.uuid4().hex[:12]


def _code_size(d: dict) -> int:
    return sum(len(str(d.get(k) or "").encode("utf-8")) for k in ("html", "css", "js"))


def _check_code(d: dict, where: str) -> None:
    if _code_size(d) > MAX_CODE_BYTES:
        raise TemplateError(
            f"{where}: custom code is over {MAX_CODE_BYTES // 1000} KB. "
            "Host large files elsewhere and link to them."
        )


# ── Blocks ───────────────────────────────────────────────────────────────────

def default_blocks() -> list[dict]:
    return [{"id": t, "type": t, "enabled": True} for t in DEFAULT_ORDER]


def _clean_block(raw: dict) -> dict:
    btype = raw.get("type")
    block: dict[str, Any] = {
        "id": _block_id(raw.get("id")),
        "type": btype,
        "enabled": raw.get("enabled") is not False,
    }
    cond = raw.get("show_if_metafield")
    if isinstance(cond, str) and cond.strip():
        key = cond.strip().lower()
        if not _KEY.match(key):
            raise TemplateError(f"'{cond}' is not a metafield key (lowercase letters, numbers and _).")
        block["show_if_metafield"] = key

    if btype == "price":
        block["show_from_price"] = raw.get("show_from_price") is not False
    elif btype == "announcement":
        block.update(
            text=_text(raw.get("text"), 500),
            icon=_text(raw.get("icon"), 8),
            bg_color=_color(raw.get("bg_color")) or "#1C3557",
            text_color=_color(raw.get("text_color")) or "#FFFFFF",
            align="left" if raw.get("align") == "left" else "center",
        )
    elif btype == "text":
        style = raw.get("style")
        block.update(
            heading=_text(raw.get("heading"), 200),
            body=_text(raw.get("body")),
            icon=_text(raw.get("icon"), 8),
            style=style if style in ("plain", "callout", "muted") else "plain",
        )
    elif btype == "custom_code":
        # Check before storing: cutting code off at a byte limit would save a
        # broken snippet without saying so.
        _check_code(raw, "A custom code block")
        block.update(html=_text(raw.get("html"), MAX_CODE_BYTES),
                     css=_text(raw.get("css"), MAX_CODE_BYTES),
                     js=_text(raw.get("js"), MAX_CODE_BYTES))
    return block


def clean_blocks(raw: Any) -> list[dict]:
    """Validate the product-info blocks; every standard block ends up there once."""
    if raw is None:
        return default_blocks()
    if not isinstance(raw, list):
        raise TemplateError("blocks must be a list.")
    if len(raw) > MAX_BLOCKS:
        raise TemplateError(f"A template can have at most {MAX_BLOCKS} blocks.")

    out: list[dict] = []
    seen_std: set[str] = set()
    seen_ids: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise TemplateError("Each block must be an object.")
        btype = item.get("type")
        if btype not in STANDARD_BLOCKS and btype not in CUSTOM_BLOCKS:
            raise TemplateError(f"Unknown block type '{btype}'.")
        if btype in STANDARD_BLOCKS:
            if btype in seen_std:
                continue  # a standard block appears once; the first one wins
            seen_std.add(btype)
        block = _clean_block(item)
        if btype in STANDARD_BLOCKS:
            # Standard blocks can't be hidden or made conditional: they are
            # how a shopper buys the product.
            block["id"] = btype
            block["enabled"] = True
            block.pop("show_if_metafield", None)
        # Standard blocks own their type names as ids; custom ones get a fresh
        # id if they collide with those or with each other.
        while block["id"] in seen_ids or (btype not in STANDARD_BLOCKS and block["id"] in STANDARD_BLOCKS):
            block["id"] = uuid.uuid4().hex[:12]
        seen_ids.add(block["id"])
        out.append(block)

    # A template can't lose the product: anything missing goes back, in the
    # usual order, at the end.
    for t in DEFAULT_ORDER:
        if t not in seen_std:
            out.append({"id": t, "type": t, "enabled": True})
    return out


# ── Sections (shared with the page builder) ─────────────────────────────────

def check_sections(raw: Any, *, strict_types: bool = True) -> list[dict]:
    """Validate a list of page-builder sections.

    Pages have always stored whatever the editor sent, so for pages only the
    limits are enforced (``strict_types=False``); a template's sections must be
    types the storefront can actually draw.
    """
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise TemplateError("sections must be a list.")
    if len(raw) > MAX_SECTIONS * (1 if strict_types else 2):
        raise TemplateError(f"Too many sections (at most {MAX_SECTIONS}).")
    out = []
    for i, s in enumerate(raw):
        if not isinstance(s, dict):
            raise TemplateError("Each section must be an object.")
        stype = s.get("type")
        if strict_types and stype not in SECTION_TYPES:
            raise TemplateError(f"Unknown section type '{stype}'.")
        if stype == "custom_code":
            _check_code(s, f"Section {i + 1}")
        out.append(s)
    return out


def clean_layout(raw: Any) -> dict:
    """The whole editor payload → what gets stored."""
    raw = raw or {}
    if not isinstance(raw, dict):
        raise TemplateError("The layout must be an object.")
    layout = {
        "blocks": clean_blocks(raw.get("blocks")),
        "sections": check_sections(raw.get("sections")),
    }
    if len(json.dumps(layout).encode("utf-8")) > MAX_LAYOUT_BYTES:
        raise TemplateError("This template is too large to save. Remove some content or code.")
    return layout


def normalise_stored(layout: Any) -> dict:
    """A stored layout, made safe to render even if it predates a rule change."""
    layout = layout if isinstance(layout, dict) else {}
    try:
        blocks = clean_blocks(layout.get("blocks"))
    except TemplateError:
        blocks = default_blocks()
    sections = [s for s in (layout.get("sections") or []) if isinstance(s, dict)]
    return {"blocks": blocks, "sections": sections}


# ── Metafields ───────────────────────────────────────────────────────────────

def clean_metafields(raw: Any) -> dict[str, str]:
    """{key: value} with lowercase keys and text values; empty values dropped."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise TemplateError("metafields must be an object of key → value.")
    out: dict[str, str] = {}
    for k, v in raw.items():
        key = str(k).strip().lower()
        if not _KEY.match(key):
            raise TemplateError(
                f"'{k}' can't be a metafield key — use lowercase letters, numbers and _, starting with a letter."
            )
        if v is None:
            continue
        if isinstance(v, (dict, list)):
            raise TemplateError(f"Metafield '{key}' must be text.")
        value = str(v).strip()
        if not value:
            continue
        if len(value) > MAX_METAFIELD_VALUE:
            raise TemplateError(f"Metafield '{key}' is longer than {MAX_METAFIELD_VALUE} characters.")
        out[key] = value
    if len(out) > MAX_METAFIELDS:
        raise TemplateError(f"A product can have at most {MAX_METAFIELDS} metafields.")
    return out


# ── Which template a product gets ───────────────────────────────────────────

def storefront_view(t: ProductTemplate, *, draft: bool = False) -> dict:
    layout = t.draft if draft else t.published
    return {
        "template_id": str(t.id),
        "name": t.name,
        "preview": draft,
        **normalise_stored(layout),
    }


async def resolve(db: AsyncSession, template_id: uuid.UUID | None) -> ProductTemplate | None:
    """The published template a product with this template_id should show.

    Runs inside the brand's tenant scope, so another brand's template can never
    be returned even if its id were stored on the product.
    """
    if template_id:
        # A select, not db.get(): get() can answer from the identity map
        # without going through the tenant filter.
        own = (await db.execute(
            select(ProductTemplate).where(ProductTemplate.id == template_id)
        )).scalar_one_or_none()
        if own is not None and own.published is not None:
            return own
    res = await db.execute(
        select(ProductTemplate)
        .where(ProductTemplate.is_default.is_(True), ProductTemplate.published.is_not(None))
        .limit(1)
    )
    return res.scalar_one_or_none()
