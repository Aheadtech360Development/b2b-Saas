"""AI upscaling for the print builders, done by ImageKit.

The image editor's "Upscale" used to draw the picture twice as large and call
that sharper. It was not: nothing is gained by stretching pixels. ImageKit's
`e-upscale` does the real thing — a logo with small text comes back up to four
times the size with clean edges.

It has one flaw that matters here more than anywhere: it throws transparency
away. A design with a see-through background, which is most of what is printed,
comes back on solid black. So a transparent design is not sent as it is. Its
colour and its transparency are laid side by side as two ordinary pictures in
one image, upscaled together in a single request, and put back together
afterwards — sharp colour, a sharp edge, and still see-through.

The pure parts (`prepare`, `finish`) know nothing about ImageKit, so they can be
tested without it.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass

import httpx
from PIL import Image

from app.services import imagekit_service

logger = logging.getLogger(__name__)

# ImageKit takes a picture under 16 megapixels and returns at most 16. A design
# already near that has nothing to gain, and holding one in memory several
# times over is not worth trying.
MAX_INPUT_PIXELS = 4_200_000
MAX_INPUT_BYTES = 12 * 1024 * 1024

# Between the colour half and the transparency half, so neither bleeds into
# the other when they are upscaled as one picture.
_GUTTER = 32


class UpscaleError(Exception):
    """Something the buyer can be told, with the status to tell it with."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass
class Prepared:
    """What was sent, and how to take the answer apart again."""

    png: bytes
    width: int
    height: int
    has_alpha: bool


def _has_alpha(im: Image.Image) -> bool:
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        lo, _hi = im.convert("RGBA").getchannel("A").getextrema()
        return lo < 250
    return False


def _bleed(rgba: Image.Image) -> Image.Image:
    """The design's colours carried outward into its see-through areas.

    An upscaler looks at neighbouring pixels. If the pixels beside an edge are
    whatever colour happens to be stored under "fully transparent" — usually
    black — the edge comes back with a dark fringe. Filling those areas with the
    colours nearest them means the edge has only its own colour to learn from.
    Done by laying the picture over blurrier and blurrier copies of itself.
    """
    w, h = rgba.size
    out = rgba.copy()
    level = rgba.convert("RGBa")          # premultiplied, so averaging ignores empty pixels
    size = (w, h)
    while max(size) > 1:
        size = (max(1, size[0] // 2), max(1, size[1] // 2))
        level = level.resize(size, Image.BOX)
        wider = level.resize((w, h), Image.BILINEAR).convert("RGBA")
        out = Image.alpha_composite(wider, out)
    grey = Image.new("RGBA", (w, h), (128, 128, 128, 255))
    return Image.alpha_composite(grey, out).convert("RGB")


def _edge(im: Image.Image, left: bool, width: int) -> Image.Image:
    """The picture's outermost column, repeated — padding that matches what it pads."""
    w, h = im.size
    column = im.crop((0, 0, 1, h)) if left else im.crop((w - 1, 0, w, h))
    return column.resize((width, h), Image.NEAREST)


def prepare(content: bytes) -> Prepared:
    """Read what was uploaded and make the picture that is sent for upscaling."""
    if len(content) > MAX_INPUT_BYTES:
        raise UpscaleError("That file is too large to upscale.", 413)
    try:
        im = Image.open(io.BytesIO(content))
        im.load()
    except Exception as exc:  # noqa: BLE001 — anything unreadable is the same answer
        raise UpscaleError("That file could not be read as an image.") from exc

    w, h = im.size
    if w * h > MAX_INPUT_PIXELS:
        raise UpscaleError("This image is already large enough to print well — upscaling is for small or blurry files.")
    if w < 8 or h < 8:
        raise UpscaleError("That image is too small to upscale.")

    buf = io.BytesIO()
    if not _has_alpha(im):
        im.convert("RGB").save(buf, "PNG")
        return Prepared(buf.getvalue(), w, h, False)

    rgba = im.convert("RGBA")
    colour = _bleed(rgba)
    alpha = rgba.getchannel("A").convert("RGB")
    half = _GUTTER // 2
    sheet = Image.new("RGB", (w * 2 + _GUTTER, h))
    sheet.paste(colour, (0, 0))
    sheet.paste(_edge(colour, left=False, width=half), (w, 0))
    sheet.paste(_edge(alpha, left=True, width=half), (w + half, 0))
    sheet.paste(alpha, (w + _GUTTER, 0))
    sheet.save(buf, "PNG")
    return Prepared(buf.getvalue(), w, h, True)


def _clean(v: int) -> int:
    """Solid stays solid and clear stays clear; only the edge between them is graded."""
    if v < 16:
        return 0
    if v > 239:
        return 255
    return round((v - 16) * 255 / 223)


def finish(upscaled: Image.Image, sent: Prepared) -> bytes:
    """Turn what came back into the PNG the buyer gets."""
    out = io.BytesIO()
    if not sent.has_alpha:
        upscaled.convert("RGB").save(out, "PNG")
        return out.getvalue()

    big = upscaled.convert("RGB")
    W, H = big.size
    scale = W / (sent.width * 2 + _GUTTER)
    size = (max(1, round(sent.width * scale)), H)
    colour = big.crop((0, 0, size[0], H))
    start = round((sent.width + _GUTTER) * scale)
    alpha = big.crop((start, 0, min(W, start + size[0]), H)).convert("L")
    if alpha.size != size:
        alpha = alpha.resize(size, Image.BILINEAR)
    colour = colour.convert("RGBA")
    colour.putalpha(alpha.point(_clean))
    colour.save(out, "PNG")
    return out.getvalue()


async def upscale(content: bytes, shop: str) -> bytes:
    """Upscale an image on ImageKit and return it as PNG bytes.

    The copy sent to ImageKit sits in a folder of its own under the shop's and
    is deleted as soon as the answer is in, whatever the answer was — it is
    working material, not something for the shop's media library.
    """
    if not imagekit_service.is_configured():
        raise UpscaleError("AI upscale is not set up.", 503)
    sent = prepare(content)

    uploaded = await imagekit_service.upload_bytes(sent.png, "upscale.png", tenant_id=f"{shop}/_upscale")
    try:
        async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
            resp = await client.get(uploaded["url"], params={"tr": "e-upscale"})
        if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image/"):
            logger.warning("ImageKit upscale refused: %s %s", resp.status_code, resp.text[:200])
            raise UpscaleError("AI upscale is not available just now. Your image is unchanged.", 502)
        try:
            big = Image.open(io.BytesIO(resp.content))
            big.load()
        except Exception as exc:  # noqa: BLE001
            raise UpscaleError("AI upscale is not available just now. Your image is unchanged.", 502) from exc
        return finish(big, sent)
    finally:
        try:
            await imagekit_service.delete_file(uploaded["file_id"])
        except Exception as exc:  # noqa: BLE001 — a leftover working file is not worth failing the request for
            logger.warning("could not remove the upscale working file: %s", exc)
