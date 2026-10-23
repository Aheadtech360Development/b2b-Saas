"""The strip above a gang sheet's print file that says whose it is.

Shops print many customers' sheets on one roll and cut them apart; the order's
number and the customer, printed above each sheet, say which piece is whose.
The strip is added above the sheet, so nothing on the sheet moves.
"""
from __future__ import annotations

import io
from types import SimpleNamespace

from PIL import Image

from app.api.v1.gang_sheets import _sheet_label
from app.services import gang_sheet_render as render


def _png(sheet: render.Plan, checker: bool = False) -> Image.Image:
    return Image.open(io.BytesIO(b"".join(render.png_stream(sheet, checker=checker))))


def _sheet(dpi: float = 100) -> render.Plan:
    w, h = render.sheet_pixels(22, 3, dpi)
    return render.Plan(width=w, height=h, dpi=dpi)


def test_the_label_is_a_strip_above_the_sheet():
    plain = _png(_sheet())
    assert plain.size == (2200, 300)

    labelled = _sheet()
    labelled.label = "Order #1009  ·  Faisal Hanif  ·  GS-IC-2610-0036  ·  22\" x 30\""
    img = _png(labelled)
    assert labelled.label_rows == 50                      # half an inch at 100 DPI
    assert img.size == (2200, 350)
    assert img.info.get("dpi", (0, 0))[0] > 99            # still opens at its true size

    strip = img.crop((0, 0, 2200, 50)).convert("RGBA")
    assert strip.getchannel("A").getbbox(), "the label is written in the strip"
    # In black: wherever it is solid, the ink is dark.
    solid = strip.getchannel("A").point(lambda a: 255 if a > 200 else 0)
    assert strip.convert("L").crop(solid.getbbox()).getextrema()[0] < 80

    # The sheet itself is exactly what it was: empty here, so all transparent.
    sheet_part = img.crop((0, 50, 2200, 350)).convert("RGBA")
    assert sheet_part.getextrema()[3] == (0, 0)


def test_a_long_label_shrinks_to_fit_a_narrow_sheet():
    narrow = render.Plan(width=300, height=200, dpi=100)
    narrow.label = "Order #100000  ·  A customer with a very long company name indeed  ·  GS-ABCDEFGH"
    img = _png(narrow)
    strip = img.crop((0, 0, 300, narrow.label_rows)).convert("RGBA")
    # Ink stays inside the quarter-inch margins on both sides.
    left, _, right, _ = strip.getchannel("A").getbbox()
    assert left >= 20 and right <= 280


def test_the_preview_shows_the_strip_too():
    sheet = _sheet(dpi=50)
    sheet.label = "Order #7"
    img = _png(sheet, checker=True)
    assert img.size == (1100, 150 + 25)


def test_what_the_label_says():
    o = SimpleNamespace(reference="GS-IC-2610-0036", sheet_width_in=22, sheet_height_in=30, sheet_quantity=1)
    assert _sheet_label(o, "1009", "Faisal Hanif") == 'Order #1009  ·  Faisal Hanif  ·  GS-IC-2610-0036  ·  22" x 30"'
    o.sheet_quantity = 3
    assert _sheet_label(o, "ORD-12", None) == 'Order ORD-12  ·  GS-IC-2610-0036  ·  22" x 30"  ·  Qty 3'
    # Not yet ordered: whose it is not known, the job's reference still is.
    assert _sheet_label(o, None, None).startswith("GS-IC-2610-0036")
