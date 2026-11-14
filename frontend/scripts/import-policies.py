"""Turn the platform's policy PDFs into the printcopilot.co policy pages.

    pip install pymupdf
    python frontend/scripts/import-policies.py [folder with the PDFs]   (default: the repo root)

Reads the five PDFs the owner signs off (Privacy Policy, Terms of Service,
Cookie Policy, Affiliate Terms, Data Processing Addendum) and writes
frontend/src/components/marketing/site/policies/<key>.ts, which PolicyPage
draws. The words are the PDF's own, untouched: lines are joined back into
paragraphs, indented lines become list items, bold openings stay bold, and
tables stay tables. Run it again whenever a PDF changes; never hand-edit the
generated files.

How the PDFs are laid out (checked on all five): title 24pt, section headings
16.5pt ("1. Who we are"), body 12pt at x=54, list items 12pt at x=71 (the
bullet is drawn, not text), tables 11.3pt, page header/footer 6pt. Inside a
paragraph lines are 18pt apart, list items 21pt, paragraphs 25pt.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "src" / "components" / "marketing" / "site" / "policies"
POLICIES = {
    "privacy": ("Privacy Policy", "/privacy-policy"),
    "terms": ("Terms of Service", "/terms"),
    "cookies": ("Cookie Policy", "/cookie-policy"),
    "affiliate": ("Affiliate Terms", "/affiliate-terms"),
    "dpa": ("Data Processing Addendum", "/data-processing-addendum"),
}
BODY_X, ITEM_X = 54, 71
ENDS = tuple('.:;?!)"”')


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"^\d+\.\s*", "", text).lower().replace("'", "")).strip("-")


def join(lines: list[str]) -> str:
    out = ""
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if not out:
            out = ln
        elif out.endswith("-") and ln[:1].isalpha():
            out += ln  # a word broken at its own hyphen ("first-" / "party")
        else:
            out += " " + ln
    return re.sub(r"\s+", " ", out)


def is_bold(span: dict) -> bool:
    return bool(span["flags"] & 16) or "Bold" in span["font"]


def items_of(doc) -> list[tuple]:
    """Every line and table of the document in reading order."""
    seq = []
    for pno, page in enumerate(doc):
        tables = page.find_tables().tables
        boxes = [pymupdf.Rect(t.bbox) for t in tables]
        rows = []
        for t in tables:
            # Each cell's own text, read inside its box (the table reader's text drops the spaces).
            cells = [
                [join(page.get_text("text", clip=pymupdf.Rect(c)).split("\n")) if c else "" for c in row.cells]
                for row in t.rows
            ]
            rows.append((t.bbox[1], "table", {"head": cells[0], "rows": cells[1:]}))
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for line in b["lines"]:
                spans = [s for s in line["spans"] if s["text"]]
                text = "".join(s["text"] for s in spans)
                if not text.strip():
                    continue
                size = round(spans[0]["size"], 1)
                if size < 8:
                    continue  # page header and footer
                r = pymupdf.Rect(line["bbox"])
                if any(box.contains(r) or box.intersects(r) and size < 12 for box in boxes):
                    continue  # inside a table
                rows.append((r.y0, "line", {"text": text, "size": size, "x": round(r.x0), "right": r.x1, "spans": spans, "page": pno}))
        rows.sort(key=lambda x: x[0])
        seq.extend(rows)
    return seq


def convert(pdf: Path) -> dict:
    doc = pymupdf.open(pdf)
    title, updated, sections = "", "", []
    section = {"id": "intro", "heading": "", "blocks": []}
    block = None  # the paragraph or list being built
    last = None  # the previous body line
    warnings = []

    def close():
        nonlocal block
        if block is None:
            return
        if block["kind"] == "p":
            text = join(block["lines"])
            lead = block["lead"].strip()
            if lead and text.startswith(lead):
                section["blocks"].append({"lead": lead, "text": text[len(lead):].strip()})
            else:
                section["blocks"].append({"text": text})
        else:
            section["blocks"].append({"items": [join(i) for i in block["items"]]})
        block = None

    for y, kind, it in items_of(doc):
        if kind == "table":
            close()
            section["blocks"].append({"table": it})
            last = None
            continue
        size, text = it["size"], it["text"]
        if size >= 20:
            title = text.strip()
            continue
        if size > 13:
            close()
            if section["heading"] or section["blocks"]:
                sections.append(section)
            section = {"id": slug(text), "heading": text.strip(), "blocks": []}
            last = None
            continue
        m = re.match(r"\s*Last updated:\s*(.+?)\.?\s*$", text)
        if m and not updated:
            updated = m.group(1)
            continue
        item = it["x"] >= ITEM_X - 3
        if last is not None and last["page"] != it["page"]:
            # A page break: carry on the paragraph only if its last line ran full width and did not end it.
            new = last["right"] < 490 or last["text"].rstrip().endswith(ENDS)
        elif last is not None:
            gap = y - last["y"]
            new = gap > (19.5 if item else 21.5)
        else:
            new = True
        if block is not None and (block["kind"] == "ul") != item:
            new = True
        if new:
            if item and block is not None and block["kind"] == "ul":
                block["items"].append([text])
            else:
                close()
                if item:
                    block = {"kind": "ul", "items": [[text]]}
                else:
                    lead = ""
                    for s in it["spans"]:
                        if not is_bold(s):
                            break
                        lead += s["text"]
                    block = {"kind": "p", "lines": [text], "lead": lead}
        else:
            if block["kind"] == "ul":
                block["items"][-1].append(text)
            else:
                block["lines"].append(text)
                if block["lead"] and all(is_bold(s) for s in it["spans"]) and len(block["lines"]) == 2:
                    block["lead"] += " " + text
        if any(is_bold(s) for s in it["spans"][1:]) and not new:
            warnings.append(f"bold inside a paragraph: {text[:60]}")
        last = {**it, "y": y}
    close()
    sections.append(section)
    if not title or not updated:
        raise SystemExit(f"{pdf.name}: no title or 'Last updated' line found; the PDF's layout changed")
    return {"title": title, "updated": updated, "sections": sections, "warnings": warnings}


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT
    OUT.mkdir(parents=True, exist_ok=True)
    for key, (name, path) in POLICIES.items():
        data = convert(src / f"{name}.pdf")
        for w in data.pop("warnings"):
            print(f"  ! {key}: {w}")
        data = {"key": key, "path": path, **data}
        body = json.dumps(data, ensure_ascii=False, indent=1)
        (OUT / f"{key}.ts").write_text(
            "// Generated by frontend/scripts/import-policies.py from the owner's PDF. Do not edit by hand.\n"
            'import type { Policy } from "../PolicyPage";\n\n'
            f"const policy: Policy = {body};\n\nexport default policy;\n",
            encoding="utf-8",
        )
        blocks = [b for s in data["sections"] for b in s["blocks"]]
        print(f"{key}: {data['title']!r} updated {data['updated']!r}, {len(data['sections'])} sections, "
              f"{sum('text' in b for b in blocks)} paragraphs, {sum(len(b.get('items', [])) for b in blocks)} list items, "
              f"{sum('table' in b for b in blocks)} tables, {sum('lead' in b for b in blocks)} bold openings")


if __name__ == "__main__":
    main()
