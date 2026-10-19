"""The order sizes are shown in: XS before S before M, wherever a shopper sees them.

A size is free text on a variant, and the database hands variants back in the
order their rows happen to sit, which changes every time one is edited (an
updated row is written again at the end). A size list read straight from it
came out as XS, M, L, XL, S on the shop while the admin, which sorted, showed
XS, S, M, L, XL.

Known sizes sort by their place on a size chart: infant, toddler, youth, then
adult letters (with aliases: XXL and 2XL, Small and S, X-Large and XL), then
numbers, then one size. Anything else (11oz, 8x10 inch, a name) keeps the
order it was given in, after them. frontend/src/lib/utils.ts sizeRank is the
same rule for the screens that sort in the browser.
"""
from __future__ import annotations

import re
from typing import Iterable, Sequence

_WORDS = {
    "EXTRASMALL": "XS", "XSMALL": "XS", "XXSMALL": "XXS", "SMALL": "S", "SM": "S",
    "MEDIUM": "M", "MED": "M", "MD": "M",
    "LARGE": "L", "LG": "L", "XLARGE": "XL", "EXTRALARGE": "XL",
    "XXLARGE": "XXL", "2XLARGE": "XXL", "XXXLARGE": "XXXL", "3XLARGE": "XXXL", "4XLARGE": "XXXXL",
}
_ONE_SIZE = {"OS", "O/S", "OSFA", "OSFM", "ONESIZE", "ONESIZEFITSALL", "ONESIZEFITSMOST", "ONE"}
_LETTER = re.compile(r"^(X*)(S|M|L)$")
_TIMES_X = re.compile(r"^(\d)X(S|L)?$")
_MONTHS = r"(?:M|MO|MOS|MONTH|MONTHS)"

# Groups, in chart order.
_INFANT, _TODDLER, _YOUTH, _ADULT, _NUMBER, _ONE = range(6)


def _letter(code: str) -> float | None:
    """S = 0, M = 1, L = 2; each X before S goes down one, before L up one."""
    m = _TIMES_X.match(code)
    if m:
        code = "X" * int(m.group(1)) + (m.group(2) or "L")
    code = _WORDS.get(code, code)
    m = _LETTER.match(code)
    if not m:
        return None
    xs, base = len(m.group(1)), m.group(2)
    if base == "M":
        return 1.0 if xs == 0 else None
    return float(-xs) if base == "S" else float(2 + xs)


def size_rank(label: str | None) -> tuple[int, float, float] | None:
    """Where a size sits on the chart, or None for one it does not know."""
    raw = re.sub(r"\s+", " ", (label or "").strip().upper()).replace("–", "-")
    if not raw:
        return None
    # The same size however it is written: "X-Large", "2 XL", "M (Youth)".
    code = re.sub(r"[\s\-_()]", "", raw)
    if code in _ONE_SIZE:
        return (_ONE, 0.0, 0.0)

    # Infant, in months: NB, 0-3M, 3-6 MOS, 12M.
    if code in ("NB", "NEWBORN", "PREEMIE"):
        return (_INFANT, -1.0, 0.0)
    m = re.fullmatch(rf"(\d+)\s*(?:-|/|TO)\s*(\d+)\s*{_MONTHS}", raw) or re.fullmatch(rf"(\d+)\s*{_MONTHS}()", raw)
    if m:
        first = float(m.group(1))
        return (_INFANT, first, float(m.group(2) or first))

    # Toddler: 2T to 6T.
    m = re.fullmatch(r"(\d+)T", code)
    if m:
        return (_TODDLER, float(m.group(1)), 0.0)

    # Number ranges (kids' 8-10) and numbers (2, 10.5, 32, 30x32 by length),
    # read before the dashes and dots matter.
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(?:-|/)\s*(\d+(?:\.\d+)?)", raw)
    if m:
        return (_NUMBER, float(m.group(1)), float(m.group(2)))
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(?:\s*X\s*(\d+(?:\.\d+)?))?", raw)
    if m:
        return (_NUMBER, float(m.group(1)), float(m.group(2) or 0))

    # Youth: YS, YXL, Youth M, M (Youth), Y10.
    if "YOUTH" in code or (code.startswith("Y") and len(code) > 1):
        rest = code.replace("YOUTH", "") if "YOUTH" in code else code[1:]
        rank = _letter(rest)
        if rank is not None:
            return (_YOUTH, rank, 0.0)
        if re.fullmatch(r"\d+(?:\.\d+)?", rest):
            return (_YOUTH, 10.0 + float(rest), 0.0)

    # Adult letters; a tall size (LT, XLT, 2XLT) just after its own size, and
    # a two-size fit (S/M, L/XL) between the two.
    rank = _letter(code)
    if rank is not None:
        return (_ADULT, rank, 0.0)
    for tall in ("TALL", "T"):
        if code.endswith(tall):
            base = _letter(code[: -len(tall)])
            if base is not None:
                return (_ADULT, base, 0.5)
    if "/" in code:
        parts = [_letter(p) for p in code.split("/") if p]
        if len(parts) == 2 and None not in parts:
            return (_ADULT, (parts[0] + parts[1]) / 2, 0.0)
    return None


def _key(label: str, position: int) -> tuple:
    rank = size_rank(label)
    return (0, *rank, position) if rank is not None else (1, 0, 0.0, 0.0, position)


def sort_sizes(labels: Iterable[str | None]) -> list[str]:
    """Each size once, in chart order; unknown sizes after, as they were given."""
    seen: dict[str, int] = {}
    for label in labels:
        if label and label not in seen:
            seen[label] = len(seen)
    return sorted(seen, key=lambda s: _key(s, seen[s]))


def sort_variants(variants: Sequence) -> list:
    """Variants in the order a shopper should see them: colours as the brand
    added them (sort order, then when they were made), sizes on the chart
    within each colour."""
    base = sorted(variants, key=lambda v: (getattr(v, "sort_order", 0) or 0,
                                           getattr(v, "created_at", None) is None,
                                           getattr(v, "created_at", None) or 0))
    colours: dict[str, int] = {}
    for v in base:
        colours.setdefault(getattr(v, "color", None) or "", len(colours))
    position = {id(v): i for i, v in enumerate(base)}
    return sorted(base, key=lambda v: (colours[getattr(v, "color", None) or ""],
                                        _key(getattr(v, "size", None) or "", position[id(v)])))
