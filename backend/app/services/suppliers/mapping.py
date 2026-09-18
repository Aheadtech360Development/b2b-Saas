"""Match Fields: which supplier field fills which product field, and how.

Each mapping is {source, target, modify}. `source` is an S&S field, `target` a
field of our product or variant, and `modify` an optional Liquid-style template
that reshapes the value on the way in, e.g.

    {{ variant.customerPrice | times: 1.25 | round: 2 }}
    {{ style.brandName }} {{ style.styleName }}

Inside a template `value` is the mapped source field, `style.*` the S&S style
and `variant.*` the S&S SKU row, with S&S's own field names — so an expression
copied from another S&S tool keeps working.

The template language is a deliberately small, safe subset: a variable or
literal, then filters. Nothing is evaluated as code.
"""
from __future__ import annotations

import html
import math
import re
from typing import Any

# ── What can be mapped ───────────────────────────────────────────────────────

# (key, label, level) — level says where the value lives in S&S.
SOURCES: list[tuple[str, str, str]] = [
    ("title", "Title", "style"),
    ("description", "Description", "style"),
    ("brandName", "Brand Name", "style"),
    ("styleName", "Style Name", "style"),
    ("partNumber", "Part Number", "style"),
    ("baseCategory", "Base Category", "style"),
    ("styleID", "Style ID", "style"),
    ("sku", "Variant Sku", "variant"),
    ("gtin", "Variant Gtin", "variant"),
    ("colorName", "Variant Color Name", "variant"),
    ("sizeName", "Variant Size Name", "variant"),
    ("customerPrice", "Variant Customer Price", "variant"),
    ("salePrice", "Variant Sale Price", "variant"),
    ("piecePrice", "Variant Piece Price", "variant"),
    ("dozenPrice", "Variant Dozen Price", "variant"),
    ("casePrice", "Variant Case Price", "variant"),
    ("retailPrice", "Variant Retail Price (MSRP)", "variant"),
    ("mapPrice", "Variant MAP Price", "variant"),
    ("unitWeight", "Variant Unit Weight (lbs)", "variant"),
    ("caseQty", "Variant Case Qty", "variant"),
    ("countryOfOrigin", "Variant Country of Origin", "variant"),
]
SOURCE_LEVEL = {k: lvl for k, _, lvl in SOURCES}

# (key, label, level, kind, max_len)
TARGETS: list[tuple[str, str, str, str, int | None]] = [
    ("name", "Product Title", "product", "text", 255),
    ("description", "Product Description", "product", "text", None),
    ("short_description", "Product Short Description", "product", "text", 500),
    ("vendor", "Product Vendor", "product", "text", 255),
    ("product_type", "Product Type", "product", "text", 100),
    ("tags", "Product Tags", "product", "tags", 100),
    ("fabric", "Product Fabric", "product", "text", 255),
    ("weight", "Product Weight (text)", "product", "text", 100),
    ("gender", "Product Gender", "product", "text", 50),
    ("meta_title", "SEO Title", "product", "text", 255),
    ("meta_description", "SEO Description", "product", "text", 500),
    ("sku", "Variant Sku", "variant", "text", 100),
    ("retail_price", "Variant Price", "variant", "number", None),
    ("compare_price", "Variant Compare At Price", "variant", "number", None),
    ("msrp", "Variant MSRP", "variant", "number", None),
    ("cost_per_item", "Variant Cost", "variant", "number", None),
    ("weight_grams", "Variant Weight (grams)", "variant", "number", None),
    ("country_of_origin", "Variant Country of Origin", "variant", "text", 100),
]
TARGET = {k: {"label": lbl, "level": lvl, "kind": kind, "max": mx} for k, lbl, lvl, kind, mx in TARGETS}

# Fields that change with the supplier's price list — what "update prices" touches.
PRICE_TARGETS = {"retail_price", "compare_price", "msrp", "cost_per_item"}
# Always required, or a product can't be created.
REQUIRED_TARGETS = {"sku", "retail_price"}

DEFAULT_FIELDS: list[dict] = [
    {"source": "styleName", "target": "name", "modify": "{{ style.brandName }} {{ style.styleName }}"},
    {"source": "description", "target": "description", "modify": ""},
    {"source": "title", "target": "short_description", "modify": ""},
    {"source": "brandName", "target": "vendor", "modify": ""},
    {"source": "baseCategory", "target": "product_type", "modify": ""},
    {"source": "baseCategory", "target": "tags", "modify": ""},
    {"source": "sku", "target": "sku", "modify": ""},
    # A price with no Modify is priced by the brand's markup rules.
    {"source": "customerPrice", "target": "retail_price", "modify": ""},
    {"source": "customerPrice", "target": "cost_per_item", "modify": ""},
    {"source": "retailPrice", "target": "msrp", "modify": ""},
    {"source": "retailPrice", "target": "compare_price", "modify": ""},
    {"source": "unitWeight", "target": "weight_grams", "modify": "{{ value | times: 453.592 | round: 2 }}"},
    {"source": "countryOfOrigin", "target": "country_of_origin", "modify": ""},
]

MAX_FIELDS = 40


class MappingError(ValueError):
    pass


# ── Template engine ──────────────────────────────────────────────────────────

_SEG = re.compile(r"\{\{(.*?)\}\}", re.S)
_NUM = re.compile(r"^-?\d+(\.\d+)?$")


def _split(s: str, sep: str) -> list[str]:
    """Split on `sep` outside quotes."""
    out, cur, quote = [], [], ""
    for ch in s:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = ""
        elif ch in "\"'":
            quote = ch
            cur.append(ch)
        elif ch == sep:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if quote:
        raise MappingError("A quote is not closed.")
    out.append("".join(cur))
    return out


def _num(v: Any) -> float:
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v if v is not None else "").strip().replace(",", "").lstrip("$")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        raise MappingError(f"'{v}' is not a number.")


def _term(tok: str, ctx: dict) -> Any:
    tok = tok.strip()
    if not tok:
        raise MappingError("Something is missing in the expression.")
    if tok[0] in "\"'" and tok[-1] == tok[0] and len(tok) >= 2:
        return tok[1:-1]
    if _NUM.match(tok):
        return float(tok)
    if tok in ("true", "false"):
        return tok == "true"
    if tok in ("nil", "null", "blank", "empty"):
        return None
    if not re.match(r"^[A-Za-z_][\w.]*$", tok):
        raise MappingError(f"'{tok}' isn't a field name, number or quoted text.")
    head, *rest = tok.split(".")
    if head not in ctx:
        raise MappingError(f"Unknown field '{tok}'. Use value, style.<field> or variant.<field>.")
    cur = ctx[head]
    for part in rest:
        cur = cur.get(part) if isinstance(cur, dict) else None
    return cur


def _strip_html(v: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", v)).strip()


def _filter(name: str, val: Any, args: list[Any]) -> Any:
    a0 = args[0] if args else None
    if name == "times":
        return _num(val) * _num(a0)
    if name == "divided_by":
        d = _num(a0)
        if d == 0:
            raise MappingError("divided_by: 0 would divide by zero.")
        return _num(val) / d
    if name == "plus":
        return _num(val) + _num(a0)
    if name == "minus":
        return _num(val) - _num(a0)
    if name == "round":
        return round(_num(val), int(_num(a0)) if a0 is not None else 0)
    if name == "ceil":
        return float(math.ceil(_num(val)))
    if name == "floor":
        return float(math.floor(_num(val)))
    if name == "abs":
        return abs(_num(val))
    if name == "at_least":
        return max(_num(val), _num(a0))
    if name == "at_most":
        return min(_num(val), _num(a0))
    s = "" if val is None else _fmt(val)
    if name == "prepend":
        return f"{_fmt(a0)}{s}"
    if name == "append":
        return f"{s}{_fmt(a0)}"
    if name == "upcase":
        return s.upper()
    if name == "downcase":
        return s.lower()
    if name == "capitalize":
        return s[:1].upper() + s[1:]
    if name == "strip":
        return s.strip()
    if name == "strip_html":
        return _strip_html(s)
    if name == "replace":
        if len(args) < 2:
            raise MappingError("replace needs two values: replace: \"old\", \"new\"")
        return s.replace(_fmt(args[0]), _fmt(args[1]))
    if name == "remove":
        return s.replace(_fmt(a0), "")
    if name == "truncate":
        n = int(_num(a0)) if a0 is not None else 50
        return s if len(s) <= n else s[: max(0, n - 3)].rstrip() + "..."
    if name == "default":
        return a0 if val in (None, "", 0, 0.0) else val
    raise MappingError(f"Unknown filter '{name}'.")


def _eval(expr: str, ctx: dict) -> Any:
    parts = _split(expr, "|")
    val = _term(parts[0], ctx)
    for f in parts[1:]:
        name, _, argstr = f.partition(":")
        name = name.strip()
        args = [_term(a, ctx) for a in _split(argstr, ",")] if argstr.strip() else []
        val = _filter(name, val, args)
    return val


def _fmt(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else f"{v:.10f}".rstrip("0").rstrip(".")
    return str(v)


def render(template: str, ctx: dict) -> Any:
    """Evaluate a Modify template. One bare {{ }} keeps its type (numbers stay
    numbers); anything mixed with text comes back as text."""
    tpl = template or ""
    if tpl.count("{{") != tpl.count("}}"):
        raise MappingError("Every {{ needs a matching }}.")
    segs = list(_SEG.finditer(tpl))
    if not segs:
        return tpl
    if len(segs) == 1 and segs[0].group(0) == tpl.strip():
        return _eval(segs[0].group(1), ctx)
    out, last = [], 0
    for m in segs:
        out.append(tpl[last:m.start()])
        out.append(_fmt(_eval(m.group(1), ctx)))
        last = m.end()
    out.append(tpl[last:])
    return "".join(out)


# ── Config cleaning ──────────────────────────────────────────────────────────

_SAMPLE_STYLE = {k: "Sample" for k, _, lvl in SOURCES if lvl == "style"}
_SAMPLE_VARIANT = {k: "10.00" for k, _, lvl in SOURCES if lvl == "variant"}


def clean_fields(raw: list | None) -> list[dict]:
    """Validate mappings; a broken template is refused with a readable reason."""
    out: list[dict] = []
    for i, r in enumerate(raw or [], 1):
        src, tgt = (r or {}).get("source"), (r or {}).get("target")
        modify = str((r or {}).get("modify") or "").strip()[:500]
        if src not in SOURCE_LEVEL:
            raise MappingError(f"Row {i}: choose a supplier field.")
        if tgt not in TARGET:
            raise MappingError(f"Row {i}: choose a store field.")
        if modify:
            ctx = {"value": "10.00", "style": _SAMPLE_STYLE, "variant": _SAMPLE_VARIANT}
            try:
                render(modify, ctx)
            except MappingError as exc:
                raise MappingError(f"Row {i} ({TARGET[tgt]['label']}): {exc}")
        out.append({"source": src, "target": tgt, "modify": modify})
    if len(out) > MAX_FIELDS:
        raise MappingError(f"At most {MAX_FIELDS} field mappings.")
    missing = REQUIRED_TARGETS - {r["target"] for r in out}
    if missing:
        raise MappingError("Keep a mapping for " + " and ".join(TARGET[t]["label"] for t in sorted(missing)) + ".")
    return out


# ── Applying mappings ────────────────────────────────────────────────────────

def _coerce(target: str, raw: Any) -> Any:
    meta = TARGET[target]
    if meta["kind"] == "number":
        if raw in (None, ""):
            return None
        return round(_num(raw), 4)
    if meta["kind"] == "tags":
        items = raw if isinstance(raw, list) else str(raw or "").split(",")
        return [t.strip()[: meta["max"]] for t in items if str(t).strip()]
    s = _fmt(raw).strip()
    if meta["max"]:
        s = s[: meta["max"]]
    return s or None


def apply(fields: list[dict], style: dict, sku: dict, *, level: str, price_fn) -> dict:
    """Mapped values for one product (level='product', `sku` = its first SKU)
    or one variant (level='variant').

    `price_fn(cost)` prices a Variant Price mapping that has no Modify, with the
    brand's markup rules. Tags from several mappings are combined.
    """
    out: dict[str, Any] = {}
    for f in fields:
        tgt = f["target"]
        if TARGET[tgt]["level"] != level:
            continue
        src = f["source"]
        value = (style if SOURCE_LEVEL[src] == "style" else sku).get(src)
        if f.get("modify"):
            ctx = {"value": value, "style": style, "variant": sku}
            try:
                value = render(f["modify"], ctx)
            except MappingError:
                value = None
        elif tgt == "retail_price":
            value = price_fn(_num(value)) if value not in (None, "") else None
        try:
            v = _coerce(tgt, value)
        except MappingError:
            v = None
        if TARGET[tgt]["kind"] == "tags":
            merged = out.get(tgt) or []
            out[tgt] = merged + [t for t in (v or []) if t not in merged]
        elif v is not None or tgt not in out:
            out[tgt] = v
    return out
