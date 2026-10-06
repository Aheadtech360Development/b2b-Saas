"""A gang sheet as the file a printer prints from.

A sheet is stored as its artwork and where each piece sits — inches and
quarter turns — not as a picture. Production needs the picture: the whole
sheet at its true size, at 300 DPI, transparent wherever nothing is printed,
as a PNG the RIP takes as it is. That is what a print shop's other tools hand
them, and what this draws.

It is drawn a band of rows at a time and written out as it goes. A 22″ × 240″
sheet is 6,600 × 72,000 pixels: 1.9 GB held whole, which no web worker has to
spare. A band is a few megabytes, and the file streams to the browser while
the rest of it is still being drawn.

The artwork is held the same way. A long sheet packed with designs is, decoded,
as big as the sheet, so a design is read when the first band reaches it and
let go after its last; until then it is a file on disk. A band takes from each
design only the rows it covers — Pillow's resize reads a little past them for
its filter, so the part is cut with that margin and bands meet without a seam.

Where a piece goes follows the builder and the print PDF exactly: a placement's
x and y are the top-left of its footprint on the sheet; a quarter turn swaps
the footprint; the picture is fitted inside it, centred, keeping its shape.
"""
from __future__ import annotations

import logging
import math
import os
import struct
import tempfile
import warnings
import zlib
from collections import Counter
from dataclasses import dataclass, field
from typing import IO, Iterator

from PIL import Image

logger = logging.getLogger(__name__)

PRINT_DPI = 300
PREVIEW_LONG_EDGE = 1600
# Above this the sheet is not drawn at all: 22″ × 400″ at 300 DPI, past any
# sheet a size can be set to, so only a broken record reaches it.
MAX_SHEET_PIXELS = 800_000_000
# The largest artwork drawn into a sheet: a 22″ × 80″ design at 300 DPI.
# Decoded it is 640 MB, and it is the most the drawing ever holds at once; a
# bigger file is left out and named, to print from the original.
MAX_SOURCE_PIXELS = 160_000_000
BAND_ROWS = 256
MAX_FETCH_BYTES = 60 * 1024 * 1024
FETCH_TIMEOUT = 30.0
FETCH_AT_ONCE = 4
MEDIA_ROOT = "/app/media"

# What Pillow can draw. Vector and layered formats (SVG, PDF, AI, EPS) are left
# out of the picture and named, so production prints those from the original.
DRAWABLE = {"png", "jpg", "jpeg", "webp", "gif", "tif", "tiff", "psd", "bmp"}

NOT_DRAWABLE = "can't be drawn into a PNG — print it from the original"
TOO_LARGE = "too large to draw here — print it from the original"
UNREADABLE = "couldn't be downloaded or read"


class TooLarge(ValueError):
    pass


@dataclass
class Source:
    """An artwork file, fetched but not decoded: where it is, and its size in
    pixels, read from its header."""
    width: int
    height: int
    path: str | None = None
    file: IO[bytes] | None = None

    def decode(self, scale: float = 1.0) -> Image.Image:
        """The picture, as RGB or RGBA. A JPEG drawn smaller than it is decodes
        straight to the smaller size (`scale` is how big it is drawn)."""
        fh = open(self.path, "rb") if self.path else self.file
        try:
            if self.file is not None:
                self.file.seek(0)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", Image.DecompressionBombWarning)
                img = Image.open(fh)
                if img.format == "JPEG" and scale < 0.5:
                    img.draft("RGB", (max(1, math.ceil(img.width * scale)), max(1, math.ceil(img.height * scale))))
                img.load()
        finally:
            if self.path:
                fh.close()
        if img.mode not in ("RGB", "RGBA"):
            alpha = "A" in img.getbands() or "transparency" in img.info
            img = img.convert("RGBA" if alpha else "RGB")
        return img

    def close(self) -> None:
        if self.file is not None:
            self.file.close()
            self.file = None


@dataclass
class Piece:
    """One placement: which artwork, turned how far clockwise, and where on the
    sheet (in pixels) it is drawn."""
    aid: str
    rot: int
    x: int
    y: int
    w: int
    h: int
    # How much of the artwork's own resolution the drawing uses: 0.25 is a
    # picture drawn at a quarter of its size.
    scale: float = 1.0


@dataclass
class Plan:
    width: int
    height: int
    dpi: float
    pieces: list[Piece] = field(default_factory=list)
    sources: dict[str, Source] = field(default_factory=dict)
    # Artwork that could not be drawn into the picture: (file name, why).
    left_out: list[tuple[str, str]] = field(default_factory=list)

    def close(self) -> None:
        for s in self.sources.values():
            s.close()


def sheet_pixels(width_in: float, height_in: float, dpi: float) -> tuple[int, int]:
    return max(1, round(width_in * dpi)), max(1, round(height_in * dpi))


def preview_dpi(width_in: float, height_in: float) -> float:
    """The DPI that makes the sheet's long edge PREVIEW_LONG_EDGE pixels."""
    long_edge = max(width_in, height_in, 0.01)
    return min(PRINT_DPI, PREVIEW_LONG_EDGE / long_edge)


_TURNS = {90: Image.Transpose.ROTATE_270, 180: Image.Transpose.ROTATE_180, 270: Image.Transpose.ROTATE_90}


def _turned(img: Image.Image, rotation: float) -> Image.Image:
    """The picture turned as the sheet shows it. SVG's rotate() is clockwise on
    screen; Pillow's rotate() is anticlockwise, so a quarter turn clockwise is
    Pillow's ROTATE_270."""
    turn = round(rotation or 0) % 360
    if turn == 0:
        return img
    if turn in _TURNS:
        return img.transpose(_TURNS[turn])
    return img.rotate(-turn, resample=Image.Resampling.BICUBIC, expand=True)


def _turned_size(w: int, h: int, turn: int) -> tuple[float, float]:
    """The size of a w × h picture once turned: swapped by a quarter turn, the
    box around it for any other angle."""
    if turn % 180 == 0:
        return float(w), float(h)
    if turn % 180 == 90:
        return float(h), float(w)
    c, s = abs(math.cos(math.radians(turn))), abs(math.sin(math.radians(turn)))
    return w * c + h * s, w * s + h * c


def plan(width_in: float, height_in: float, layout: list[dict], artworks: dict[str, dict],
         sources: dict[str, Source], dpi: float, missing: dict[str, str] | None = None) -> Plan:
    """Where every piece is drawn, at `dpi`.

    `artworks` maps an artwork id to its record (for its name and type);
    `sources` to its fetched file; `missing` to why one has none.
    """
    W, H = sheet_pixels(width_in, height_in, dpi)
    out = Plan(width=W, height=H, dpi=dpi, sources=dict(sources))
    named_out: set[str] = set()
    for p in layout or []:
        aid = str(p.get("artwork_id") or "")
        art = artworks.get(aid) or {}
        src = sources.get(aid)
        if src is None:
            if aid not in named_out:
                named_out.add(aid)
                kind = (art.get("file_type") or "").lower()
                why = (missing or {}).get(aid) or (NOT_DRAWABLE if kind and kind not in DRAWABLE else UNREADABLE)
                out.left_out.append((art.get("file_name") or "artwork", why))
            continue
        rot = round(float(p.get("rotation") or 0)) % 360
        w_in, h_in = float(p.get("w_in") or 0), float(p.get("h_in") or 0)
        if w_in <= 0 or h_in <= 0:
            continue
        # The footprint on the sheet: a quarter turn swaps it.
        fw_in, fh_in = (h_in, w_in) if rot % 180 == 90 else (w_in, h_in)
        x0, y0 = float(p.get("x_in") or 0) * dpi, float(p.get("y_in") or 0) * dpi
        fw, fh = fw_in * dpi, fh_in * dpi
        tw, th = _turned_size(src.width, src.height, rot)
        # Fitted inside the footprint, centred, keeping its shape.
        scale = min(fw / tw, fh / th)
        dw, dh = max(1, round(tw * scale)), max(1, round(th * scale))
        out.pieces.append(Piece(
            aid=aid, rot=rot,
            x=round(x0 + (fw - dw) / 2),
            y=round(y0 + (fh - dh) / 2),
            w=dw, h=dh, scale=scale,
        ))
    return out


def _shrink(img: Image.Image, factor: int) -> Image.Image:
    """The picture `factor` times smaller, a strip at a time. Pillow shrinks a
    transparent picture through a premultiplied copy of all of it — for a big
    file, twice the memory. A strip's copy is small. Transparent comes back
    premultiplied ("RGBa"), which is what the drawing resizes."""
    alpha = img.mode in ("RGBA", "RGBa")
    out = Image.new("RGBa" if alpha else "RGB", (-(-img.width // factor), -(-img.height // factor)))
    step = factor * max(1, 1024 // factor)  # rows per strip: a whole number of factors
    for top in range(0, img.height, step):
        strip = img.crop((0, top, img.width, min(img.height, top + step)))
        if strip.mode == "RGBA":
            strip = strip.convert("RGBa")
        out.paste(strip.reduce(factor), (0, top // factor))
    return out


def _prepare(src: Source, rot: int, scale: float) -> Image.Image:
    """An artwork ready to draw: decoded, made no bigger than its largest
    placement needs, and turned."""
    img = src.decode(scale)
    # Shrunk only by whole factors, so it is never smaller than it is drawn.
    factor = math.floor(min(img.width / src.width, img.height / src.height) / scale) if scale > 0 else 1
    if factor >= 2:
        img = _shrink(img, factor)
    return _turned(img, rot)


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _checker(width: int, rows: int, top: int, size: int = 12) -> Image.Image:
    """A light chequerboard, the usual way of showing what is transparent —
    white ink on a transparent preview is otherwise invisible."""
    tile = Image.new("RGBA", (size * 2, size * 2), (255, 255, 255, 255))
    grey = Image.new("RGBA", (size, size), (229, 231, 235, 255))
    tile.paste(grey, (0, 0))
    tile.paste(grey, (size, size))
    band = Image.new("RGBA", (width, rows))
    offset = top % (size * 2)
    for ty in range(-offset, rows, size * 2):
        for tx in range(0, width, size * 2):
            band.paste(tile, (tx, ty))
    return band


def _draw(band: Image.Image, top: int, piece: Piece, src: Image.Image, sheet_width: int) -> None:
    """The rows of one piece that fall in this band, drawn onto it."""
    bottom = top + band.height
    r0, r1 = max(top, piece.y), min(bottom, piece.y + piece.h)
    c0, c1 = max(0, piece.x), min(sheet_width, piece.x + piece.w)
    if r0 >= r1 or c0 >= c1:
        return
    sx, sy = src.width / piece.w, src.height / piece.h
    # Where in the artwork these pixels come from…
    bx0, by0 = (c0 - piece.x) * sx, (r0 - piece.y) * sy
    bx1, by1 = (c1 - piece.x) * sx, (r1 - piece.y) * sy
    # …cut out with what the filter reads around it: Lanczos reaches three
    # pixels out, three per pixel drawn when it shrinks.
    mx, my = math.ceil(3 * max(1.0, sx)) + 2, math.ceil(3 * max(1.0, sy)) + 2
    cx0, cy0 = max(0, math.floor(bx0) - mx), max(0, math.floor(by0) - my)
    cx1, cy1 = min(src.width, math.ceil(bx1) + mx), min(src.height, math.ceil(by1) + my)
    region = src.crop((cx0, cy0, cx1, cy1))
    if region.mode == "RGBA":
        # Premultiplied, as Pillow resizes transparency — here for the part
        # only, where Pillow would convert the whole picture every time.
        region = region.convert("RGBa")
    part = region.resize((c1 - c0, r1 - r0), Image.Resampling.LANCZOS,
                         box=(bx0 - cx0, by0 - cy0, bx1 - cx0, by1 - cy0))
    if part.mode != "RGBA":
        part = part.convert("RGBA")
    band.alpha_composite(part, dest=(c0, r0 - top))


def png_stream(sheet: Plan, *, checker: bool = False, level: int = 6) -> Iterator[bytes]:
    """The sheet as a PNG, a band at a time: true pixels, the DPI written into
    the file (pHYs) so it opens at its real size, transparent where empty.

    Each artwork is decoded when the first band reaches one of its pieces and
    let go when its last piece is drawn."""
    if sheet.width * sheet.height > MAX_SHEET_PIXELS:
        raise ValueError("sheet too large to draw")
    pieces = sorted(sheet.pieces, key=lambda p: p.y)
    # Pieces still to finish, per picture: a logo placed thirty times is
    # decoded once and kept until the last of the thirty is drawn.
    left = Counter((p.aid, p.rot) for p in pieces)
    largest: dict[tuple[str, int], float] = {}
    for p in pieces:
        largest[(p.aid, p.rot)] = max(largest.get((p.aid, p.rot), 0.0), p.scale)
    live: dict[tuple[str, int], Image.Image | None] = {}

    def draw(band: Image.Image, top: int, p: Piece) -> None:
        # Its own function, so no picture outlives the call by a stray name.
        key = (p.aid, p.rot)
        if key not in live:
            try:
                live[key] = _prepare(sheet.sources[p.aid], p.rot, largest[key])
            except Exception as exc:  # noqa: BLE001 — one bad file must not lose the sheet
                logger.warning("Could not draw artwork %s into the sheet: %s", p.aid, exc)
                live[key] = None
        if live[key] is not None:
            _draw(band, top, p, live[key], sheet.width)

    try:
        ppm = round(sheet.dpi / 0.0254)  # pixels per metre
        yield b"\x89PNG\r\n\x1a\n"
        yield _chunk(b"IHDR", struct.pack(">IIBBBBB", sheet.width, sheet.height, 8, 6, 0, 0, 0))
        yield _chunk(b"pHYs", struct.pack(">IIB", ppm, ppm, 1))
        pack = zlib.compressobj(level)
        stride = sheet.width * 4
        active: list[Piece] = []
        nxt = 0
        for top in range(0, sheet.height, BAND_ROWS):
            rows = min(BAND_ROWS, sheet.height - top)
            bottom = top + rows
            while nxt < len(pieces) and pieces[nxt].y < bottom:
                active.append(pieces[nxt])
                nxt += 1
            band = _checker(sheet.width, rows, top) if checker else Image.new("RGBA", (sheet.width, rows), (0, 0, 0, 0))
            for p in active:
                if p.y + p.h > top and p.y < bottom and p.x < sheet.width and p.x + p.w > 0:
                    draw(band, top, p)
            # Finished pieces go; a picture goes with the last of its pieces.
            for p in [p for p in active if p.y + p.h <= bottom]:
                active.remove(p)
                key = (p.aid, p.rot)
                left[key] -= 1
                if left[key] <= 0:
                    live.pop(key, None)
            raw = band.tobytes()
            del band
            # Each row of a PNG starts with its filter type: 0, none.
            data = b"".join(b"\x00" + raw[i * stride:(i + 1) * stride] for i in range(rows))
            out = pack.compress(data)
            if out:
                yield _chunk(b"IDAT", out)
        tail = pack.flush()
        if tail:
            yield _chunk(b"IDAT", tail)
        yield _chunk(b"IEND", b"")
    finally:
        live.clear()
        sheet.close()


def _header(fh) -> tuple[int, int]:
    """A file's size in pixels, from its header — nothing decoded."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", Image.DecompressionBombWarning)
        try:
            with Image.open(fh) as img:
                w, h = img.size
        except Image.DecompressionBombError as exc:
            raise TooLarge(str(exc)) from exc
    if w * h > MAX_SOURCE_PIXELS:
        raise TooLarge(f"{w} × {h} pixels")
    return w, h


async def fetch(url: str) -> Source:
    """An artwork file, from this platform's own storage only, onto disk.

    The same rule as the print check (services/artwork/inspect.py): a URL from
    a buyer is never fetched unless it is ours, or the server becomes a way to
    reach what only it can see. A local file under /media/ is read where it is,
    from inside the media folder and nowhere else.
    """
    import asyncio

    import httpx

    from app.services.artwork.inspect import NotOurFile, allowed_source

    url = (url or "").strip()
    if url.startswith("/media/"):
        root = os.path.realpath(MEDIA_ROOT)
        path = os.path.realpath(os.path.join(root, url[len("/media/"):]))
        if not path.startswith(root + os.sep) or not os.path.isfile(path):
            raise NotOurFile("not a file in this store's media")
        if os.path.getsize(path) > MAX_FETCH_BYTES:
            raise TooLarge("file too large to draw")
        w, h = await asyncio.to_thread(_header, path)
        return Source(w, h, path=path)
    if not allowed_source(url):
        raise NotOurFile("artwork must be a file uploaded to this store")
    tmp = tempfile.TemporaryFile()
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
            async with client.stream("GET", url) as res:
                res.raise_for_status()
                size = 0
                async for chunk in res.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_FETCH_BYTES:
                        raise TooLarge("file too large to draw")
                    tmp.write(chunk)
        tmp.seek(0)
        w, h = await asyncio.to_thread(_header, tmp)
        return Source(w, h, file=tmp)
    except BaseException:
        tmp.close()
        raise


async def load_sources(artworks: list[dict], wanted: set[str]) -> tuple[dict[str, Source], dict[str, str]]:
    """Every artwork the layout uses, fetched — a few at a time — and why any
    could not be: not a drawable type, too large, or not to be had."""
    import asyncio

    gate = asyncio.Semaphore(FETCH_AT_ONCE)

    async def one(art: dict) -> tuple[Source | None, str | None]:
        kind = (art.get("file_type") or art.get("file_url", "").rsplit(".", 1)[-1] or "").lower()
        if kind not in DRAWABLE:
            return None, NOT_DRAWABLE
        async with gate:
            try:
                return await fetch(art.get("file_url") or ""), None
            except TooLarge:
                return None, TOO_LARGE
            except Exception as exc:  # noqa: BLE001 — one bad file must not lose the sheet
                logger.warning("Could not load artwork %s for the print file: %s", art.get("id"), exc)
                return None, UNREADABLE

    todo = [a for a in artworks if str(a.get("id")) in wanted]
    results = await asyncio.gather(*(one(a) for a in todo))
    sources: dict[str, Source] = {}
    missing: dict[str, str] = {}
    for art, (src, why) in zip(todo, results):
        if src is not None:
            sources[str(art.get("id"))] = src
        else:
            missing[str(art.get("id"))] = why or UNREADABLE
    return sources, missing
