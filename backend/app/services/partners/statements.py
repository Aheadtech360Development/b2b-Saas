"""The program's PDFs: a payout's statement, an ended partner's final
statement, and the partner terms as published. Drawn with ReportLab, the way
the order PDFs are (services/pdf_service.py)."""
from __future__ import annotations

import io
from datetime import date, datetime
from html import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.partners import program
from app.services.partners.ledger import money
from app.services.partners.mail import platform_name

INK = colors.HexColor("#111318")
MUTED = colors.HexColor("#5A5F68")
RULE = colors.HexColor("#E7E5E2")
SOFT = colors.HexColor("#F6F7F9")

_base = getSampleStyleSheet()["Normal"]
_title = ParagraphStyle("PTitle", parent=_base, fontName="Helvetica-Bold", fontSize=18, textColor=INK, spaceAfter=4)
_kicker = ParagraphStyle("PKicker", parent=_base, fontName="Helvetica", fontSize=8, textColor=MUTED, spaceAfter=10)
_h2 = ParagraphStyle("PH2", parent=_base, fontName="Helvetica-Bold", fontSize=11, textColor=INK,
                     spaceBefore=14, spaceAfter=6)
_body = ParagraphStyle("PBody", parent=_base, fontName="Helvetica", fontSize=9, textColor=INK, leading=14)
_small = ParagraphStyle("PSmall", parent=_body, fontSize=8, textColor=MUTED)


def _day(value: date | datetime | None) -> str:
    if value is None:
        return ""
    return f"{value:%b} {value.day}, {value.year}"


def _doc(buf: io.BytesIO, title: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(buf, pagesize=letter, title=title, leftMargin=0.8 * inch,
                             rightMargin=0.8 * inch, topMargin=0.7 * inch, bottomMargin=0.7 * inch)


def _who(partner: dict) -> list:
    rows = [["Partner", partner.get("name") or ""], ["Email", partner.get("email") or ""]]
    if partner.get("business_name"):
        rows.insert(1, ["Business", partner["business_name"]])
    rows.append(["Code", partner.get("code") or ""])
    return [_pairs(rows)]


def _pairs(rows: list[list[str]]) -> Table:
    t = Table(rows, colWidths=[1.4 * inch, 5.4 * inch])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _lines_table(lines: list[dict]) -> Table:
    data = [["Earned", "Shop", "Plan", "Base", "Rate", "Amount"]]
    for ln in lines:
        what = {"clawback": "Clawback", "adjustment": "Adjustment"}.get(ln["kind"])
        data.append([
            _day(ln["earned_at"]), (ln.get("shop_name") or what or "")[:38],
            what if what and ln["kind"] != "commission" else program.plan_name(ln.get("plan_key")),
            money(ln["base_cents"]) if ln["kind"] != "adjustment" else "",
            program.rate_words(ln["rate_bps"]) if ln["kind"] != "adjustment" else "",
            money(ln["amount_cents"]),
        ])
    t = Table(data, colWidths=[0.95 * inch, 2.2 * inch, 0.95 * inch, 0.95 * inch, 0.6 * inch, 1.05 * inch],
              repeatRows=1)
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _footer() -> list:
    return [Spacer(1, 18), HRFlowable(width="100%", color=RULE, thickness=0.6), Spacer(1, 6),
            Paragraph(f"{platform_name()} partner program. Commission is a share of the base plan fee on paid "
                      "invoices; refunds and disputes are deducted from later payouts. All amounts in USD.", _small)]


def payout_statement(partner: dict, payout: dict, lines: list[dict], year_cents: int | None = None) -> bytes:
    """What one payout paid, line by line, and what the year has paid so far:
    the figure a partner's own tax records need."""
    buf = io.BytesIO()
    doc = _doc(buf, f"Payout statement {_day(payout['paid_on'])}")
    story = [
        Paragraph(f"{platform_name()} Partners", _kicker),
        Paragraph("Payout statement", _title),
        Spacer(1, 6), *_who(partner), Spacer(1, 8),
        _pairs([["Paid on", _day(payout["paid_on"])], ["Amount", money(payout["amount_cents"])],
                ["Method", {"paypal": "PayPal", "wise": "Wise", "bank": "Bank transfer"}.get(payout["method"],
                                                                                          payout["method"])],
                ["Reference", payout.get("reference") or ""], ["Lines", str(len(lines))]]
               + ([[f"Paid in {payout['paid_on'].year}", money(year_cents)]] if year_cents is not None else [])),
        Paragraph("Lines in this payout", _h2), _lines_table(lines), *_footer(),
    ]
    doc.build(story)
    return buf.getvalue()


def final_statement(partner: dict, lines: list[dict], payouts: list[dict]) -> bytes:
    """Everything a partnership earned and was paid, for a partner whose partnership ended."""
    buf = io.BytesIO()
    doc = _doc(buf, "Final statement")
    paid_total = sum(int(p["amount_cents"]) for p in payouts)
    open_total = sum(int(ln["amount_cents"]) for ln in lines if ln["status"] in ("open", "held"))
    story = [
        Paragraph(f"{platform_name()} Partners", _kicker),
        Paragraph("Final statement", _title),
        Spacer(1, 6), *_who(partner), Spacer(1, 8),
        _pairs([["Ended", _day(partner.get("ended_at"))], ["Paid to date", money(paid_total)],
                ["Still to settle", money(open_total) + (" (forfeited)" if partner.get("forfeit_pending") else "")]]),
        Paragraph("Payouts", _h2),
    ]
    if payouts:
        rows = [["Paid on", "Amount", "Method", "Reference"]] + [
            [_day(p["paid_on"]), money(p["amount_cents"]), p["method"], (p.get("reference") or "")[:40]]
            for p in payouts]
        t = Table(rows, colWidths=[1.3 * inch, 1.3 * inch, 1.3 * inch, 2.8 * inch])
        t.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
                               ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE), ("TEXTCOLOR", (0, 0), (-1, 0), MUTED)]))
        story.append(t)
    else:
        story.append(Paragraph("No payouts were made.", _body))
    story += [Paragraph("Every line", _h2), _lines_table(lines), *_footer()]
    doc.build(story)
    return buf.getvalue()


def terms_pdf(version: int, clauses: list[dict], published_at: datetime | None) -> bytes:
    buf = io.BytesIO()
    doc = _doc(buf, f"Partner terms, version {version}")
    story = [Paragraph(f"{platform_name()} Partners", _kicker),
             Paragraph(f"Partner terms, version {version}", _title),
             Paragraph(f"Published {_day(published_at)}", _small), Spacer(1, 10)]
    for n, clause in enumerate(clauses or [], 1):
        # Paragraph reads its text as markup; the terms are written by an admin.
        story.append(Paragraph(f"{n}. {escape(clause.get('title', ''))}", _h2))
        story.append(Paragraph(escape(clause.get("text", "")), _body))
    doc.build(story)
    return buf.getvalue()
