"""The print file a gang sheet is drawn into, checked against a plain drawing.

The renderer draws a band of rows at a time, decodes each artwork only while a
band needs it, and cuts from it only the rows a band covers. None of that may
show in the picture: it must be the picture a whole-sheet drawing gives, give
or take rounding. And it must not hold every design at once — on a long sheet
packed with designs, that is the size of the sheet.

No database: run with `python -m pytest tests/test_gang_sheet_render.py`.
"""
import asyncio
import io
import os
import weakref
from collections import Counter

from PIL import Image, ImageChops, ImageDraw

from app.services import gang_sheet_render as render


def picture(w, h, *, alpha=True, seed=0):
    """Artwork with edges, gradients and see-through parts — what shows a seam,
    a wrong turn or a dark fringe."""
    img = Image.new("RGBA" if alpha else "RGB", (w, h), (0, 0, 0, 0) if alpha else (255, 255, 255))
    d = ImageDraw.Draw(img)
    for i in range(0, w, max(1, w // 12)):
        d.rectangle((i, 0, i + max(1, w // 24), h // 2), fill=((i * 7 + seed * 40) % 256, 90, 200, 255))
    d.ellipse((w // 8, h // 3, w * 7 // 8, h - 2), fill=(240, 180 - seed * 30, 20, 200))
    d.text((w // 6, h // 6), "AB", fill=(10, 10, 10, 255))
    # A marker in the top-left corner, so a turn the wrong way is seen.
    d.rectangle((0, 0, w // 6, h // 6), fill=(255, 0, 0, 255))
    return img


def source_of(img, fmt="PNG"):
    buf = io.BytesIO()
    img.save(buf, fmt)
    buf.seek(0)
    return render.Source(img.width, img.height, file=buf)


def plain(sheet, sources):
    """The same sheet drawn the plain way: each piece resized whole and laid on
    one canvas the size of the sheet."""
    canvas = Image.new("RGBA", (sheet.width, sheet.height), (0, 0, 0, 0))
    for p in sheet.pieces:
        img = render._turned(sources[p.aid].decode(), p.rot)
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        canvas.alpha_composite(img.resize((p.w, p.h), Image.Resampling.LANCZOS), dest=(p.x, p.y))
    return canvas


def drawn(sheet, **kw):
    return Image.open(io.BytesIO(b"".join(render.png_stream(sheet, **kw))))


def premultiplied(img):
    """Colour as it shows: weighted by how opaque it is. A pixel at 1/255
    opacity has no colour worth comparing — straight RGB would make a rounding
    step there look like a jump of 255."""
    rgba = img.convert("RGBA")
    return Image.frombytes("RGBA", rgba.size, rgba.convert("RGBa").tobytes())


def worst(a, b):
    return max(hi for _, hi in ImageChops.difference(premultiplied(a), premultiplied(b)).getextrema())


def mean(a, b):
    diff = ImageChops.difference(premultiplied(a), premultiplied(b)).tobytes()
    return sum(diff) / len(diff)


def test_bands_turns_and_partial_cuts_do_not_show():
    # 10″ × 6″ at 100 DPI: three bands, with pieces across their edges.
    arts = {"a": picture(240, 160), "b": picture(90, 60, seed=1), "c": picture(300, 300, alpha=False, seed=2)}
    sources = {k: source_of(v) for k, v in arts.items()}
    sources["c"] = source_of(arts["c"], "JPEG")
    layout = [
        {"artwork_id": "a", "x_in": 0.2, "y_in": 0.3, "w_in": 3, "h_in": 2, "rotation": 0},
        {"artwork_id": "a", "x_in": 3.5, "y_in": 1.9, "w_in": 3, "h_in": 2, "rotation": 90},     # across 256
        {"artwork_id": "b", "x_in": 6.5, "y_in": 0.2, "w_in": 1.5, "h_in": 1, "rotation": 180},  # upscaled
        {"artwork_id": "b", "x_in": 8.2, "y_in": 4.4, "w_in": 1.5, "h_in": 1, "rotation": 270},  # across 512
        {"artwork_id": "c", "x_in": 0.4, "y_in": 3.1, "w_in": 2.6, "h_in": 2.6, "rotation": 30},
    ]
    names = {k: {"file_name": f"{k}.png", "file_type": "png"} for k in arts}
    sheet = render.plan(10, 6, layout, names, sources, 100)
    assert (sheet.width, sheet.height) == (1000, 600) and len(sheet.pieces) == 5 and not sheet.left_out
    expected = plain(sheet, sources)
    got = drawn(sheet)
    assert got.size == (1000, 600)
    assert round(got.info["dpi"][0]) == 100
    assert worst(got, expected) <= 2
    # The quarter turn is clockwise: the red corner of "a" turned 90° is at
    # the top-right of its footprint.
    p = sheet.pieces[1]
    assert got.convert("RGBA").getpixel((p.x + p.w - 3, p.y + 3))[:3] == (255, 0, 0)


def test_a_file_far_bigger_than_drawn_is_shrunk_first_and_looks_the_same():
    big = picture(1800, 1200)
    sources = {"big": source_of(big)}
    layout = [{"artwork_id": "big", "x_in": 0.5, "y_in": 0.5, "w_in": 3, "h_in": 2, "rotation": 90}]
    sheet = render.plan(4, 4, layout, {"big": {"file_name": "big.png"}}, sources, 100)
    p = sheet.pieces[0]
    assert p.scale < 0.5  # drawn at a sixth of its size: shrunk before it is cut up
    prepared = render._prepare(sources["big"], p.rot, p.scale)
    assert max(prepared.size) < 1800 / 2 and min(prepared.size) >= max(p.w, p.h) // 2
    expected = plain(sheet, sources)
    got = drawn(sheet)
    # A box filter then Lanczos, against Lanczos alone: the same picture, not
    # the same bits.
    assert worst(got, expected) <= 48
    assert mean(got, expected) < 1.0


def test_each_design_is_held_only_while_a_band_needs_it():
    # A 4″ × 40″ strip at 50 DPI: ten designs down it, and a logo six times
    # across one row.
    arts = {f"d{i}": picture(150, 120, seed=i % 3) for i in range(10)}
    arts["logo"] = picture(40, 40)
    sources = {k: source_of(v) for k, v in arts.items()}
    layout = [{"artwork_id": f"d{i}", "x_in": 0.5, "y_in": 0.5 + i * 4, "w_in": 3, "h_in": 2.4, "rotation": 0}
              for i in range(10)]
    layout += [{"artwork_id": "logo", "x_in": 0.1 + i * 0.65, "y_in": 3.1, "w_in": 0.6, "h_in": 0.6, "rotation": 0}
               for i in range(6)]
    sheet = render.plan(4, 40, layout, {k: {"file_name": k} for k in arts}, sources, 50)

    alive, peak, made = set(), [0], Counter()
    prepare = render._prepare

    def counted(src, rot, scale):
        img = prepare(src, rot, scale)
        key = id(img)
        alive.add(key)
        peak[0] = max(peak[0], len(alive))
        weakref.finalize(img, alive.discard, key)
        made[id(src)] += 1
        return img

    render._prepare = counted
    try:
        got = drawn(sheet)
    finally:
        render._prepare = prepare
    assert got.size == (200, 2000)
    # Never more than the designs one band of rows crosses — never all eleven.
    assert peak[0] <= 3, peak[0]
    # Each picture decoded once, however often it is placed.
    assert set(made.values()) == {1} and len(made) == 11
    assert not alive  # and nothing held once the file is written


def test_what_cannot_be_drawn_is_left_out_and_named(tmp_path, monkeypatch):
    monkeypatch.setattr(render, "MEDIA_ROOT", str(tmp_path))
    monkeypatch.setattr(render, "MAX_SOURCE_PIXELS", 500 * 500)
    os.makedirs(tmp_path / "art")
    picture(100, 100).save(tmp_path / "art" / "ok.png")
    picture(600, 600).save(tmp_path / "art" / "huge.png")
    arts = [
        {"id": "ok", "file_url": "/media/art/ok.png", "file_name": "ok.png", "file_type": "png"},
        {"id": "huge", "file_url": "/media/art/huge.png", "file_name": "huge.png", "file_type": "png"},
        {"id": "vector", "file_url": "/media/art/logo.svg", "file_name": "logo.svg", "file_type": "svg"},
        {"id": "gone", "file_url": "/media/art/gone.png", "file_name": "gone.png", "file_type": "png"},
        {"id": "outside", "file_url": "/media/../../etc/passwd.png", "file_name": "x.png", "file_type": "png"},
        {"id": "theirs", "file_url": "http://169.254.169.254/latest.png", "file_name": "y.png", "file_type": "png"},
    ]
    sources, missing = asyncio.run(render.load_sources(arts, {a["id"] for a in arts}))
    assert set(sources) == {"ok"}
    assert missing == {"huge": render.TOO_LARGE, "vector": render.NOT_DRAWABLE, "gone": render.UNREADABLE,
                       "outside": render.UNREADABLE, "theirs": render.UNREADABLE}
    layout = [{"artwork_id": a["id"], "x_in": 0, "y_in": 0, "w_in": 1, "h_in": 1, "rotation": 0} for a in arts]
    sheet = render.plan(2, 2, layout, {a["id"]: a for a in arts}, sources, 50, missing)
    assert len(sheet.pieces) == 1
    assert dict(sheet.left_out) == {"huge.png": render.TOO_LARGE, "logo.svg": render.NOT_DRAWABLE,
                                    "gone.png": render.UNREADABLE, "x.png": render.UNREADABLE,
                                    "y.png": render.UNREADABLE}
    drawn(sheet)
    assert sources["ok"].file is None  # nothing left open once it is written


def test_a_preview_shows_what_is_transparent():
    sources = {"a": source_of(picture(60, 60))}
    layout = [{"artwork_id": "a", "x_in": 1, "y_in": 1, "w_in": 1, "h_in": 1, "rotation": 0}]
    sheet = render.plan(3, 3, layout, {"a": {}}, sources, render.preview_dpi(3, 3))
    assert max(sheet.width, sheet.height) == min(render.PREVIEW_LONG_EDGE, 900)
    got = drawn(sheet, checker=True).convert("RGBA")
    assert got.getpixel((2, 2))[3] == 255  # the chequerboard, not nothing
