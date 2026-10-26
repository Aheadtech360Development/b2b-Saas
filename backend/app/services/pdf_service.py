"""PDFService: the shop's documents, drawn with ReportLab.

The owner's design "PrintCoPilot Documents and Emails" (invoice, receipt,
packing slip, statement): the shop's logo, name, address and contact at the
top left; the document's title and numbers at the top right; who it is for;
the lines; the totals; and a footer with the page count. The order and ship
confirmations wear the same look.

Everything printed is the shop's: its logo, its name, its address (the
ship-from address in Settings, Shipping and pickup), its phone and the address
its customers write to (core/database.use_brand_identity). What the shop has
not set is left out, never filled in with somebody else's.
"""
from __future__ import annotations

import io
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Sequence
from xml.sax.saxutils import escape as _x

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

if TYPE_CHECKING:
    from app.models.order import Order

logger = logging.getLogger(__name__)

# ── The design's colours ─────────────────────────────────────────────────────
INK = colors.HexColor("#1B2430")
BODY = colors.HexColor("#3A4A5E")
MUTED = colors.HexColor("#5A6A7E")
LINE = colors.HexColor("#E3E8EF")
DUE_BG, DUE_INK = colors.HexColor("#FDF1CC"), colors.HexColor("#7A5800")
PAID_BG, PAID_INK = colors.HexColor("#DDF4E6"), colors.HexColor("#17663F")
OPEN_BG, OPEN_INK = colors.HexColor("#EEF1F5"), colors.HexColor("#3A4A5E")

MARGIN = 0.6 * inch
WIDTH = letter[0] - 2 * MARGIN


def _style(name: str, size: float, color=BODY, *, bold: bool = False, align: int = TA_LEFT,
           leading: float | None = None) -> ParagraphStyle:
    return ParagraphStyle(name, fontName="Helvetica-Bold" if bold else "Helvetica", fontSize=size,
                          leading=leading or round(size * 1.42, 1), textColor=color, alignment=align)


SHOP = _style("shop", 13, INK, bold=True, leading=17)
SHOP_LINE = _style("shop_line", 9, BODY, leading=13)
TITLE = _style("title", 22, INK, bold=True, align=TA_RIGHT, leading=27)
META = _style("meta", 9, BODY, align=TA_RIGHT, leading=13)
LABEL = _style("label", 7.5, MUTED, bold=True, leading=11)
TEXT = _style("text", 9, BODY, leading=13)
CELL = _style("cell", 9, INK, leading=12)
CELL_R = _style("cell_r", 9, INK, align=TA_RIGHT, leading=12)
HEAD = _style("head", 7.5, MUTED, bold=True, leading=10)
HEAD_R = _style("head_r", 7.5, MUTED, bold=True, align=TA_RIGHT, leading=10)
CAPTION_R = _style("caption_r", 8.5, MUTED, align=TA_RIGHT, leading=12)
BIG_R = _style("big_r", 20, INK, bold=True, align=TA_RIGHT, leading=24)
SUM_L = _style("sum_l", 9, BODY, leading=13)
SUM_R = _style("sum_r", 9, INK, align=TA_RIGHT, leading=13)
FINAL_L = _style("final_l", 11, INK, bold=True, leading=15)
FINAL_R = _style("final_r", 11, INK, bold=True, align=TA_RIGHT, leading=15)
BOX_CAPTION = _style("box_caption", 8.5, MUTED, leading=12)
BOX_VALUE = _style("box_value", 14, INK, bold=True, leading=18)
BOX_VALUE_S = _style("box_value_s", 11, INK, bold=True, leading=14)
LINK = _style("link", 8.5, BODY, leading=13)


# ── Small helpers ────────────────────────────────────────────────────────────

def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(_x("" if text is None else str(text)), style)


def _lines(lines: Sequence[str], style: ParagraphStyle = TEXT) -> Paragraph:
    return Paragraph("<br/>".join(_x(str(x)) for x in lines if x), style)


def _money(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f"-${-amount:,.2f}" if amount < 0 else f"${amount:,.2f}"


def _day(value: date | datetime | str | None) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value[:10])
        except ValueError:
            return value
    return f"{value:%b} {value.day}, {value.year}"


def _loaded(obj: Any, name: str) -> Any:
    """A relationship only when it is already loaded: reading one that is not
    would go to the database from synchronous code."""
    try:
        from sqlalchemy import inspect as _inspect

        if name in _inspect(obj).unloaded:
            return None
    except Exception:  # noqa: BLE001 - not a mapped object (a stand-in)
        pass
    return getattr(obj, name, None)


def _snapshot(order: Any) -> dict:
    raw = getattr(order, "shipping_address_snapshot", None)
    try:
        data = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:  # noqa: BLE001
        data = {}
    return data if isinstance(data, dict) else {}


def _pick(source: dict, *keys: str) -> str:
    for key in keys:
        value = source.get(key)
        if value:
            return str(value).strip()
    return ""


def _address(source: dict) -> list[str]:
    """Street, the second line, "City, ST ZIP" and the country, skipping what
    is missing. The keys are the several the order snapshots have used."""
    region = " ".join(filter(None, [_pick(source, "state", "state_province"),
                                    _pick(source, "postal_code", "zip", "zip_code")]))
    country = _pick(source, "country")
    if country.upper().replace(".", "") in ("US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"):
        country = ""
    return [x for x in (
        _pick(source, "line1", "address_line1", "street1", "street_address", "address1"),
        _pick(source, "line2", "address_line2", "street2", "address2"),
        ", ".join(filter(None, [_pick(source, "city"), region])),
        country,
    ) if x]


def _options(item: Any) -> str:
    return ", ".join(x for x in (getattr(item, "color", None), getattr(item, "size", None)) if x)


def _is_pickup(order: Any) -> bool:
    from app.services.order_progress import is_pickup

    return is_pickup(getattr(order, "shipping_method", None))


def _method(order: Any) -> str:
    if _is_pickup(order):
        return "Pickup"
    carrier = " ".join(x for x in (getattr(order, "courier", None) or getattr(order, "carrier", None),
                                   getattr(order, "courier_service", None)) if x).strip()
    if carrier:
        return carrier
    return (getattr(order, "shipping_method", None) or "").replace("_", " ").strip().capitalize()


# ── The shop ─────────────────────────────────────────────────────────────────

def _shop() -> dict:
    """The shop's name, address lines, phone and the address its customers
    write to: the same one its mail's replies go to."""
    from app.core import tenant_context as ctx

    card = {}
    try:
        card = ctx.get_current_brand_card() or {}
    except Exception:  # noqa: BLE001
        card = {}
    try:
        from app.services.email_service import _tenant_email_cfg

        mail = _tenant_email_cfg()
    except Exception:  # noqa: BLE001
        mail = {}
    email = ((mail.get("reply_to") or "").strip() or (mail.get("notify_email") or "").strip()
             or (ctx.get_current_brand_contact() or ""))
    return {
        "name": (ctx.get_current_brand_name() or "").strip(),
        "lines": [str(x) for x in (card.get("lines") or []) if x],
        "phone": (card.get("phone") or "").strip(),
        "email": email.strip(),
        "site": (ctx.get_current_brand_site() or "").strip(),
    }


def _logo(url: str) -> Image | None:
    """The logo, at most 44pt high and 120pt wide, its own shape kept."""
    if not url:
        return None
    try:
        import urllib.request

        from reportlab.lib.utils import ImageReader

        with urllib.request.urlopen(url, timeout=5) as resp:
            data = resp.read()
        w, h = ImageReader(io.BytesIO(data)).getSize()
        scale = min(120 / w, 44 / h)
        return Image(io.BytesIO(data), width=w * scale, height=h * scale)
    except Exception:  # noqa: BLE001 - an SVG, a dead link: no logo rather than no document
        return None


def _header(doc_title: str, meta: Sequence[str] = ()) -> list:
    """The head of every document: the shop at the left, the title and the
    document's numbers at the right."""
    from app.core.config import settings as _cfg

    # The brand's own logo, or none. The platform's (LOGO_URL) is for the
    # platform's own documents only: it used to be read here for everybody, so
    # a shop's order PDF and invoice carried the platform's logo to the shop's
    # customer.
    try:
        from app.core.tenant_context import get_current_brand_logo, get_current_brand_name

        _sender = get_current_brand_name()
        _is_a_brand = bool(_sender) and _sender != _cfg.PLATFORM_NAME
        logo_url = get_current_brand_logo() or ("" if _is_a_brand else _cfg.LOGO_URL)
    except Exception:  # noqa: BLE001
        logo_url = ""
    logo = _logo(logo_url)

    shop = _shop()
    about: list = []
    if shop["name"]:
        about.append(_p(shop["name"], SHOP))
    # The phone kept whole: a narrow column breaks between the two, not inside one.
    contact = "\u00a0\u00a0 ".join(x for x in (shop["email"], shop["phone"].replace(" ", "\u00a0")) if x)
    lines = shop["lines"] + ([contact] if contact else [])
    if lines:
        about.append(_lines(lines, SHOP_LINE))

    right_w = max(WIDTH * 0.4, stringWidth(doc_title, "Helvetica-Bold", 22) + 6)
    left_w = WIDTH - right_w
    left: Any = about or [Spacer(1, 1)]
    if logo is not None:
        left = Table([[logo, about or ""]], colWidths=[logo.drawWidth + 12, left_w - logo.drawWidth - 12])
        left.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                  ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    right = [_p(doc_title, TITLE)] + ([_lines(meta, META)] if meta else [])

    head = Table([[left, right]], colWidths=[left_w, right_w])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return [head, Spacer(1, 22)]


# ── Blocks ───────────────────────────────────────────────────────────────────

def _pill(text: str, kind: str) -> Table:
    bg, ink = {"due": (DUE_BG, DUE_INK), "paid": (PAID_BG, PAID_INK)}.get(kind, (OPEN_BG, OPEN_INK))
    pill = Table([[text]])
    pill.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), ink), ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]), ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return pill


def _parties(columns: Sequence[tuple[str, Sequence[str]]], amount: tuple[str, str, str, str] | None = None) -> list:
    """Labelled blocks across the page (Bill to, Ship to...) and, at the right,
    the amount box: (pill text, pill kind, caption, amount)."""
    columns = [(label, [x for x in lines if x]) for label, lines in columns]
    columns = [(label, lines) for label, lines in columns if lines]
    cells: list = [[_p(label.upper(), LABEL), Spacer(1, 4), _lines(lines)] for label, lines in columns]
    widths: list[float] = []
    if amount:
        box_w = 2.1 * inch
        each = (WIDTH - box_w) / max(len(cells), 2)
        widths = [each] * len(cells)
        pill_text, kind, caption, value = amount
        box = ([_pill(pill_text, kind), Spacer(1, 6)] if pill_text else []) + [_p(caption, CAPTION_R), _p(value, BIG_R)]
        filler = WIDTH - box_w - each * len(cells)
        if filler > 1:
            cells.append("")
            widths.append(filler)
        cells.append(box)
        widths.append(box_w)
    else:
        if not cells:
            return []
        widths = [WIDTH / 3] * len(cells)
        if len(cells) < 3:
            cells.append("")
            widths.append(WIDTH - sum(widths))
    table = Table([cells], colWidths=widths)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (-1, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN", (-1, 0), (-1, 0), "RIGHT" if amount else "LEFT"),
    ]))
    return [table, Spacer(1, 22)]


def _table(head: Sequence[str], rows: Sequence[Sequence[Any]], widths: Sequence[float], right_from: int) -> list:
    """The lines: small grey headings over a dark rule, a light rule under
    each row. Columns from `right_from` on are figures, set right."""
    data = [[_p(h.upper(), HEAD_R if i >= right_from else HEAD) for i, h in enumerate(head)]]
    for row in rows:
        data.append([cell if isinstance(cell, Flowable) else _p(cell, CELL_R if i >= right_from else CELL)
                     for i, cell in enumerate(row)])
    table = Table(data, colWidths=list(widths), repeatRows=1)
    table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 1, INK), ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("ALIGN", (right_from, 0), (-1, -1), "RIGHT"),
    ]))
    return [table, Spacer(1, 14)]


def _totals(rows: Sequence[tuple[str, str]], final: tuple[str, str]) -> list:
    data = [[_p(label, SUM_L), _p(value, SUM_R)] for label, value in rows]
    data.append([_p(final[0], FINAL_L), _p(final[1], FINAL_R)])
    table = Table(data, colWidths=[1.75 * inch, 1.35 * inch], hAlign="RIGHT")
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEABOVE", (0, -1), (-1, -1), 1, INK), ("TOPPADDING", (0, -1), (-1, -1), 8),
    ]))
    return [table, Spacer(1, 22)]


class _Box(Flowable):
    """The empty square a packer ticks."""

    def __init__(self, size: float = 8.5):
        super().__init__()
        self.size = size
        self.width = self.height = size

    def draw(self) -> None:
        self.canv.setStrokeColor(INK)
        self.canv.setLineWidth(0.8)
        self.canv.rect(0, 0, self.size, self.size, stroke=1, fill=0)


def _qr(url: str, size: float = 72) -> Flowable | None:
    try:
        from reportlab.graphics.barcode import qr
        from reportlab.graphics.shapes import Drawing

        widget = qr.QrCodeWidget(url)
        x0, y0, x1, y1 = widget.getBounds()
        drawing = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
        drawing.add(widget)
        return drawing
    except Exception:  # noqa: BLE001
        return None


def _boxes(items: Sequence[tuple[str, str]], value_style: ParagraphStyle = BOX_VALUE) -> Table:
    """Figures in bordered boxes side by side (a statement's totals, its aging)."""
    gap = 10
    w = (WIDTH - gap * (len(items) - 1)) / len(items)
    cells, widths = [], []
    for i, (caption, value) in enumerate(items):
        box = Table([[_p(caption, BOX_CAPTION)], [_p(value, value_style)]], colWidths=[w])
        box.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (0, 0), 8), ("BOTTOMPADDING", (0, 0), (0, 0), 0),
            ("TOPPADDING", (0, 1), (0, 1), 1), ("BOTTOMPADDING", (0, 1), (0, 1), 9),
        ]))
        cells.append(box)
        widths.append(w)
        if i < len(items) - 1:
            cells.append("")
            widths.append(gap)
    row = Table([cells], colWidths=widths)
    row.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return row


# ── The page: footer and page count ──────────────────────────────────────────

def _pages(note: str):
    """A canvas that writes the footer once it knows how many pages there are."""

    class _Pages(Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._kept: list[dict] = []

        def showPage(self):  # noqa: N802 - ReportLab's name
            self._kept.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._kept)
            for state in self._kept:
                self.__dict__.update(state)
                self._footer(total)
                super().showPage()
            super().save()

        def _footer(self, total: int) -> None:
            y = 0.62 * inch
            self.setStrokeColor(LINE)
            self.setLineWidth(0.6)
            self.line(MARGIN, y, letter[0] - MARGIN, y)
            self.setFillColor(MUTED)
            self.setFont("Helvetica", 8.5)
            if note:
                self.drawString(MARGIN, y - 15, note[:140])
            self.drawRightString(letter[0] - MARGIN, y - 15, f"Page {self._pageNumber} of {total}")

    return _Pages


def _build(story: list, *, title: str, note: str) -> bytes:
    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=0.55 * inch, bottomMargin=0.95 * inch,
                          title=title, author=_shop()["name"] or "")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])
    doc.build(story, canvasmaker=_pages(note))
    return buf.getvalue()


# ── What an order says ───────────────────────────────────────────────────────

def _buyer(order: Any, snap: dict) -> str:
    """Who the order is for: the name on its address, else the guest's, else
    the account's that placed it."""
    who = _loaded(order, "placed_by")
    return (_pick(snap, "full_name", "name")
            or " ".join(x for x in (_pick(snap, "first_name"), _pick(snap, "last_name")) if x)
            or (getattr(order, "guest_name", "") or "")
            or " ".join(x for x in (getattr(who, "first_name", None), getattr(who, "last_name", None)) if x))


def _ship_to(order: Any) -> list[str]:
    if _is_pickup(order):
        return ["Pickup at the shop"]
    snap = _snapshot(order)
    name = _buyer(order, snap)
    company = _pick(snap, "company_name", "company") or getattr(_loaded(order, "company"), "name", "") or ""
    return [x for x in (name, company if company != name else "") if x] + _address(snap)


def _bill_to(order: Any) -> list[str]:
    """The company, its address and tax ID for a company's order; otherwise
    the buyer's name and the address on the order."""
    company = _loaded(order, "company")
    snap = _snapshot(order)
    if company is not None and getattr(company, "name", None):
        own = _address({"line1": getattr(company, "address_line1", None),
                        "line2": getattr(company, "address_line2", None),
                        "city": getattr(company, "city", None),
                        "state": getattr(company, "state_province", None),
                        "postal_code": getattr(company, "postal_code", None),
                        "country": getattr(company, "country", None)})
        tax_id = (getattr(company, "tax_id", None) or "").strip()
        return [company.name] + (own or _address(snap)) + ([f"Tax ID {tax_id}"] if tax_id else [])
    name = _buyer(order, snap)
    company_name = _pick(snap, "company_name", "company")
    return [x for x in (name, company_name if company_name != name else "") if x] + (
        [] if _is_pickup(order) else _address(snap))


def _priced_rows(order: Any) -> list[list[str]]:
    rows = []
    for item in getattr(order, "items", None) or []:
        what = ", ".join(x for x in (getattr(item, "product_name", "") or "", _options(item)) if x)
        rows.append([getattr(item, "sku", "") or "", what, str(getattr(item, "quantity", 0) or 0),
                     _money(getattr(item, "unit_price", 0)), _money(getattr(item, "line_total", 0))])
    return rows


PRICED = (["SKU", "Description", "Qty", "Unit", "Total"],
          [1.45 * inch, WIDTH - 1.45 * inch - 0.55 * inch - 0.9 * inch - 1.0 * inch, 0.55 * inch, 0.9 * inch, 1.0 * inch],
          2)


def _sums(order: Any) -> list[tuple[str, str]]:
    from app.services.order_money import discount_total, tax_label

    rows = [("Subtotal", _money(order.subtotal))]
    # An order does not store its discount; its total is what is left of its
    # parts after it, so that is where the figure comes from.
    discount = float(discount_total(order))
    if discount > 0:
        rows.append(("Discount", _money(-discount)))
    rows.append(("Pickup" if _is_pickup(order) else "Shipping", _money(getattr(order, "shipping_cost", 0))))
    tax = float(getattr(order, "tax_amount", 0) or 0)
    if tax > 0:
        rows.append((tax_label(order), _money(tax)))
    fee = float(getattr(order, "convenience_fee", 0) or 0)
    if fee > 0:
        rows.append(("Convenience fee", _money(fee)))
    return rows


def _paid_with(order: Any) -> str:
    method = (getattr(order, "payment_method", None) or "").lower()
    if method == "ach":
        last4 = getattr(order, "ach_account_last4", None)
        return f"Bank account ending {last4}" if last4 else "Bank transfer"
    if method == "cod":
        return "Cash on delivery"
    if method == "no_charge":
        return "No charge"
    if getattr(order, "stripe_payment_intent_id", None):
        return "Card"
    return ""


def _is_receipt(order: Any) -> bool:
    return (getattr(order, "payment_status", "") or "") in ("paid", "refunded")


class PDFService:
    """The shop's documents for an order, and a company's statement."""

    def generate_invoice(self, order: "Order", *, due_on: date | None = None,
                         issued_on: date | None = None) -> bytes:
        """The invoice, or once it is paid the receipt (the same numbers).

        `due_on` and `issued_on` are what the email sending it says; without
        them, the invoice date is when it was last sent, else when the order
        was placed, and it is due that many days later (the Invoices screen's
        rule, services/invoices)."""
        from app.services.invoices import TERMS_WORDS, balance_of, invoice_number, terms_days

        number = invoice_number(order.order_number, getattr(order, "created_at", None))
        if _is_receipt(order):
            return self._receipt(order, number)

        terms = getattr(order, "payment_terms", None) or "net_30"
        started = getattr(order, "invoice_sent_at", None) or getattr(order, "created_at", None) or datetime.now(timezone.utc)
        issued = issued_on or (started.date() if isinstance(started, datetime) else started)
        due = due_on or (issued + timedelta(days=terms_days(terms)))
        owed = balance_of(total=order.total, amount_paid=getattr(order, "amount_paid", None),
                          payment_status=getattr(order, "payment_status", None))
        terms_words = TERMS_WORDS.get(terms, "Net 30")

        meta = [f"Invoice {number}", f"Order {order.order_number}"]
        if getattr(order, "po_number", None):
            meta.append(f"PO {order.po_number}")
        meta += [f"Issued {_day(issued)}", f"Due {_day(due)} ({terms_words})"]

        head, widths, right_from = PRICED
        story = (
            _header("Invoice", meta)
            + _parties([("Bill to", _bill_to(order)), ("Ship to", _ship_to(order))],
                       amount=(f"Due {_day(due)}", "due", "Amount due", _money(owed)))
            + _table(head, _priced_rows(order), widths, right_from)
            + _totals(_sums(order) + ([("Paid", _money(-float(order.amount_paid)))]
                                      if float(getattr(order, "amount_paid", 0) or 0) > 0 else []),
                      ("Amount due", _money(owed)))
        )

        # Pay online, when there is something to pay: the invoice's own page,
        # opened by the order's view key (the link the invoice email carries).
        notes = (getattr(order, "notes", None) or "").strip()
        terms_line = ". ".join(x for x in (terms_words, notes) if x)
        cells, cell_widths = [], []
        if owed > 0:
            url = _pay_url(order)
            code = _qr(url) if url else None
            if url:
                shown = url.split("#")[0].replace("https://", "").replace("http://", "")
                cells.append([_p("PAY ONLINE", LABEL), Spacer(1, 4),
                              _lines(["Scan the code or open", shown, "Cards accepted."], LINK)])
                cell_widths.append(2.75 * inch)
                if code is not None:
                    cells.append(code)
                    cell_widths.append(1.35 * inch)
        cells.append([_p("TERMS AND NOTES", LABEL), Spacer(1, 4), _p(terms_line, TEXT)])
        cell_widths.append(WIDTH - sum(cell_widths))
        pay = Table([cells], colWidths=cell_widths)
        pay.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                 ("RIGHTPADDING", (0, 0), (-1, -1), 14), ("TOPPADDING", (0, 0), (-1, -1), 0),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        story.append(pay)
        return _build(story, title=f"Invoice {number}", note="Thank you for your business.")

    def _receipt(self, order: "Order", number: str) -> bytes:
        paid = float(getattr(order, "amount_paid", 0) or 0) or float(order.total or 0)
        refunded = float(getattr(order, "amount_refunded", 0) or 0)
        when = getattr(order, "marked_paid_at", None) or getattr(order, "created_at", None)
        meta = [f"Invoice {number}", f"Order {order.order_number}"]
        if getattr(order, "po_number", None):
            meta.append(f"PO {order.po_number}")
        if when:
            meta.append(f"Paid {_day(when)}")
        pill = ("Refunded", "open") if refunded >= paid > 0 else (
            ("Partly refunded", "open") if refunded > 0 else ("Paid", "paid"))

        head, widths, right_from = PRICED
        story = (
            _header("Receipt", meta)
            + _parties([("Billed to", _bill_to(order)), ("Paid with", [_paid_with(order)])],
                       amount=(pill[0], pill[1], "Amount paid", _money(paid)))
            + _table(head, _priced_rows(order), widths, right_from)
            + _totals(_sums(order), ("Paid", _money(paid)))
        )
        if refunded > 0:
            story += _totals([("Refunded", _money(-refunded))], ("Net paid", _money(max(paid - refunded, 0))))
        return _build(story, title=f"Receipt {number}", note="Keep this receipt for your records.")

    def generate_order_confirmation(self, order: "Order") -> bytes:
        meta = [f"Order {order.order_number}"]
        if getattr(order, "po_number", None):
            meta.append(f"PO {order.po_number}")
        if getattr(order, "created_at", None):
            meta.append(f"Placed {_day(order.created_at)}")
        paid = _is_receipt(order)
        head, widths, right_from = PRICED
        story = (
            _header("Order confirmation", meta)
            + _parties([("Bill to", _bill_to(order)), ("Ship to", _ship_to(order))],
                       amount=("Paid" if paid else "", "paid", "Order total", _money(order.total)))
            + _table(head, _priced_rows(order), widths, right_from)
            + _totals(_sums(order), ("Total", _money(order.total)))
        )
        then = "when it is ready for pickup" if _is_pickup(order) else "when it ships"
        return _build(story, title=f"Order {order.order_number}",
                      note=f"Thank you for your order. We will email you {then}.")

    def generate_ship_confirmation(self, order: "Order") -> bytes:
        meta = [f"Order {order.order_number}"]
        if getattr(order, "shipped_at", None):
            meta.append(f"Shipped {_day(order.shipped_at)}")
        method = [_method(order)]
        if getattr(order, "tracking_number", None):
            method.append(f"Tracking: {order.tracking_number}")
        head, widths, right_from = PRICED
        story = (
            _header("Shipping confirmation", meta)
            + _parties([("Ship to", _ship_to(order)), ("Shipping method", method)])
            + _table(head, _priced_rows(order), widths, right_from)
        )
        return _build(story, title=f"Order {order.order_number} shipped",
                      note="Your order is on its way. Track it with the number above.")

    def generate_pack_slip(self, order: "Order") -> bytes:
        meta = [f"Order {order.order_number}"]
        if getattr(order, "created_at", None):
            meta.append(f"Placed {_day(order.created_at)}")
        method = [_method(order)]
        if getattr(order, "tracking_number", None):
            method.append(f"Tracking: {order.tracking_number}")
        notes = (getattr(order, "notes", None) or "").strip()

        rows = [[getattr(i, "sku", "") or "", getattr(i, "product_name", "") or "", _options(i),
                 str(getattr(i, "quantity", 0) or 0), _Box()] for i in (getattr(order, "items", None) or [])]
        widths = [1.45 * inch, WIDTH - 1.45 * inch - 1.6 * inch - 0.85 * inch - 0.8 * inch,
                  1.6 * inch, 0.85 * inch, 0.8 * inch]
        story = (
            _header("Packing slip", meta)
            + _parties([("Ship to", _ship_to(order)), ("Shipping method", method), ("Order notes", [notes])])
            + _table(["SKU", "Item", "Options", "Ordered", "Packed"], rows, widths, 3)
        )
        shop = _shop()
        ask = (f"Problem with your order? Write to {shop['email']} and quote order {order.order_number}."
               if shop["email"] else f"Problem with your order? Reply to your order email and quote order {order.order_number}.")
        where = shop["site"].partition("?")[0].replace("https://", "").replace("http://", "").rstrip("/")
        if where:
            ask += f" Reprint or return? Sign in at {where} and open the order."
        story.append(_p(ask, TEXT))
        return _build(story, title=f"Packing slip {order.order_number}", note="No prices shown on this slip.")

    def generate_statement(self, *, account: str, period: str, rows: Sequence[dict], summary: dict,
                           aging: dict) -> bytes:
        """A company's statement: the same lines its Statements page lists,
        with the running balance, and what it owes by how late it is."""
        kinds = {"charge": "Invoice", "payment": "Payment", "refund": "Refund", "credit": "Credit"}
        lines = []
        for row in rows:
            charge = row.get("type") == "charge"
            amount = _money(row.get("amount"))
            lines.append([_day(row.get("date")), row.get("description") or "",
                          kinds.get(row.get("type"), str(row.get("type") or "").capitalize()),
                          row.get("reference") or "", amount if charge else "", "" if charge else amount,
                          _money(row.get("running_balance"))])
        widths = [0.98 * inch, WIDTH - 0.98 * inch - 0.75 * inch - 1.0 * inch - 0.85 * inch * 3,
                  0.75 * inch, 1.0 * inch, 0.85 * inch, 0.85 * inch, 0.85 * inch]
        shop = _shop()
        story = (
            _header("Statement", [x for x in (account, period) if x])
            + [_boxes([("Total charges", _money(summary.get("total_charges"))),
                       ("Total payments", _money(summary.get("total_payments"))),
                       ("Current balance", _money(summary.get("current_balance")))]), Spacer(1, 22)]
            + (_table(["Date", "Description", "Type", "Reference", "Charges", "Credits", "Balance"],
                      lines, widths, 4) if lines else [_p("Nothing in this period.", TEXT), Spacer(1, 18)])
            + [KeepTogether([
                _p("AGING", LABEL), Spacer(1, 6),
                _boxes([("Current", _money(aging.get("current"))), ("1 to 30 days", _money(aging.get("1_30"))),
                        ("31 to 60 days", _money(aging.get("31_60"))), ("Over 60 days", _money(aging.get("over_60")))],
                       BOX_VALUE_S)])]
        )
        note = f"Questions about this statement? Write to {shop['email']}." if shop["email"] else ""
        return _build(story, title=f"Statement, {account}", note=note)


def _pay_url(order: Any) -> str:
    """The invoice's own payment page on the shop's site, opened by the
    order's view key: the link the invoice email carries."""
    try:
        from app.core.config import settings
        from app.core.tenant_context import get_current_brand_site
        from app.services import order_view

        site = (get_current_brand_site() or settings.FRONTEND_URL or "").rstrip("/")
        if not site:
            return ""
        # A shop reached as "<platform>/?tenant=<slug>" (brand_urls.build,
        # where there are no subdomains) keeps its query after the path.
        base, _, query = site.partition("?")
        key = order_view.view_key(getattr(order, "id", ""), getattr(order, "tenant_id", None))
        return f"{base.rstrip('/')}/checkout/invoice/{order.order_number}{'?' + query if query else ''}#k={key}"
    except Exception:  # noqa: BLE001
        return ""
