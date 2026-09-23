"""Icons for the ones a design points at but never shipped.

A design references its icons by id — `<use href="#i-truck">` — and keeps the
sprite that defines them somewhere in the document. Some designs keep it
outside everything the importer cuts into sections, so the ids survive and
the drawings do not, and the storefront renders an empty box wherever an icon
should be.

These are drawn here so that never shows. They are outlines with no fill and
no stroke of their own, which means the design's own rule — `.announce svg
{stroke:var(--white);fill:none;stroke-width:2}` — reaches straight through a
`<use>` and colours them exactly as it colours its own. A design that did
ship its sprite keeps it: only the missing ids are filled in.
"""
from __future__ import annotations

import re

_STROKE = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'

# Drawn on a 24×24 grid, the size nearly every icon set uses, so they sit at
# whatever size the design asked for.
ICONS: dict[str, str] = {
    "i-clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "i-pin": '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    "i-truck": (
        '<path d="M3 16V6h11v10"/><path d="M14 9h4l3 3.5V16h-7"/>'
        '<circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'
    ),
    "i-tag": '<path d="M3 11.5V4h7.5L21 14.5 14.5 21 4 10.5z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    "i-shield": '<path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
    "i-layers": '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    "i-drop": '<path d="M12 3.5S5.5 10 5.5 14a6.5 6.5 0 0 0 13 0c0-4-6.5-10.5-6.5-10.5z"/>',
    "i-search": '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    "i-cart": (
        '<path d="M3 4h2.2l2.3 10.5h9.6L19 7H6"/>'
        '<circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>'
    ),
    "i-menu": '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    "i-filter": '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    "i-refresh": '<path d="M20 11a8 8 0 1 0-1.2 5"/><path d="M20 5v6h-6"/>',
    "i-ruler": '<path d="M3.5 14.5L14.5 3.5 20.5 9.5 9.5 20.5z"/><path d="M8 9l2 2"/><path d="M11 6l2 2"/><path d="M5 12l2 2"/>',
    "i-star": '<path d="M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/>',
    "i-sun": (
        '<circle cx="12" cy="12" r="4"/><path d="M12 3v2"/><path d="M12 19v2"/>'
        '<path d="M3 12h2"/><path d="M19 12h2"/><path d="M5.6 5.6l1.4 1.4"/>'
        '<path d="M17 17l1.4 1.4"/><path d="M18.4 5.6L17 7"/><path d="M7 17l-1.4 1.4"/>'
    ),
}

_HREF = re.compile(r'(?:xlink:)?href="#([A-Za-z][\w-]*)"')
_ID = re.compile(r'\bid="([A-Za-z][\w-]*)"')


def fill_gaps(svg_defs: str, html: str) -> str:
    """The design's own sprite, plus drawings for the ids it left undefined."""
    wanted = set(_HREF.findall(html or ""))
    if not wanted:
        return svg_defs
    have = set(_ID.findall(svg_defs or ""))
    missing = [name for name in wanted - have if name in ICONS]
    if not missing:
        return svg_defs

    symbols = "".join(
        f'<symbol id="{name}" viewBox="0 0 24 24" {_STROKE}>{ICONS[name]}</symbol>'
        for name in sorted(missing)
    )
    return (svg_defs or "") + f'<svg width="0" height="0" aria-hidden="true">{symbols}</svg>'
