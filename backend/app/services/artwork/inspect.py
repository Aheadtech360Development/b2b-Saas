"""Reading a piece of artwork and saying what will go wrong on press.

Deliberately not a model. Everything here is measured — pixels, alpha, the
colours in the border — because a reprint costs real money and "the AI thought
it looked low-res" is not a reason anyone can act on. Each finding says what was
measured, what that means at the size being printed, and what fixes it.

A vision model is useful for the things measurement can't see (a logo that reads
as a screenshot, text sitting on a busy photo) and that lives in `vision.py`,
layered on top of this and never overriding it.

Levels:
  blocker  the print will be wrong; the buyer has to do something
  warning  it will print, but not as well as it should
  ok       nothing to say
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from io import BytesIO

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Below this, a print looks soft. 300 is the industry's "good"; DTF holds up
# lower than litho does, so 150 is where it becomes a blocker rather than a note.
DPI_GOOD = 300
DPI_FAIR = 200
DPI_BAD = 150

# A design with less opaque area than this is effectively empty.
MIN_OPAQUE_RATIO = 0.005
# Border pixels this alike mean a solid backdrop the buyer probably wants gone.
BORDER_SAMENESS = 0.92
MAX_FETCH_BYTES = 40 * 1024 * 1024
FETCH_TIMEOUT = 20.0

VECTOR_TYPES = {"svg", "ai", "eps"}
PDF_TYPES = {"pdf"}


@dataclass
class Finding:
    level: str          # blocker | warning | ok
    code: str
    message: str
    fix: str | None = None


@dataclass
class Inspection:
    ok: bool
    verdict: str                     # ready | check | blocked | unknown
    findings: list[Finding] = field(default_factory=list)
    measured: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "verdict": self.verdict,
            "findings": [{"level": f.level, "code": f.code, "message": f.message, "fix": f.fix}
                         for f in self.findings],
            "measured": self.measured,
        }


def _unknown(reason: str, **measured) -> Inspection:
    return Inspection(
        ok=True, verdict="unknown",
        findings=[Finding("warning", "not_checked", reason,
                          "Ask the print team to check this file before production.")],
        measured=measured,
    )


class NotOurFile(ValueError):
    """The URL doesn't belong to this platform's own media storage."""


def allowed_source(url: str) -> bool:
    """Only fetch artwork we hosted.

    This service takes a URL and downloads it, which is exactly the shape of a
    request-forgery hole: an attacker who can name any URL can use the server to
    reach things only the server can see. Artwork always lives in our own media
    storage, so nothing else is fetched.
    """
    url = (url or "").strip()
    if not url.lower().startswith("https://"):
        return False
    allowed = [e for e in (settings.IMAGEKIT_URL_ENDPOINT,) if e]
    return any(url.startswith(prefix.rstrip("/") + "/") for prefix in allowed)


async def fetch_bytes(url: str) -> bytes:
    if not allowed_source(url):
        raise NotOurFile("artwork must be a file uploaded to this store")
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
        async with client.stream("GET", url) as res:
            res.raise_for_status()
            size, chunks = 0, []
            async for chunk in res.aiter_bytes():
                size += len(chunk)
                if size > MAX_FETCH_BYTES:
                    raise ValueError("file too large to inspect")
                chunks.append(chunk)
    return b"".join(chunks)


def _dpi_finding(dpi: int, width_in: float, height_in: float) -> Finding:
    at = f'at {width_in:g}" x {height_in:g}"'
    if dpi >= DPI_GOOD:
        return Finding("ok", "resolution", f"{dpi} DPI {at} — sharp.")
    if dpi >= DPI_FAIR:
        return Finding("warning", "resolution",
                       f"{dpi} DPI {at}. It will print, but fine detail and small text will soften.",
                       "Upscale it, or print it smaller.")
    if dpi >= DPI_BAD:
        return Finding("warning", "resolution",
                       f"Only {dpi} DPI {at}. Edges and text will look fuzzy.",
                       "Upscale it, send a bigger file, or reduce the print size.")
    return Finding("blocker", "resolution",
                   f"{dpi} DPI {at} is too low to print — it will come out visibly blurry.",
                   f'Send a file at least {int(width_in * DPI_FAIR)}px wide, or print it smaller.')


def _analyse_image(data: bytes, width_in: float, height_in: float) -> Inspection:
    from PIL import Image, ImageFile

    ImageFile.LOAD_TRUNCATED_IMAGES = False
    findings: list[Finding] = []

    with Image.open(BytesIO(data)) as img:
        img.load()
        px_w, px_h = img.size
        mode = img.mode
        # Sampling a small copy answers "is it transparent / is the background
        # solid" without reading tens of millions of pixels.
        small = img.convert("RGBA").resize((min(200, px_w), max(1, int(min(200, px_w) * px_h / px_w))))

    pixels = list(small.getdata())
    total = len(pixels)
    opaque = [p for p in pixels if p[3] > 16]
    opaque_ratio = len(opaque) / total if total else 0
    has_alpha = any(p[3] < 250 for p in pixels)

    dpi = int(min(px_w / width_in, px_h / height_in)) if width_in > 0 and height_in > 0 else 0
    measured = {
        "pixels": f"{px_w}x{px_h}",
        "print_size_in": f"{width_in:g}x{height_in:g}",
        "effective_dpi": dpi,
        "mode": mode,
        "transparent": has_alpha,
        "opaque_ratio": round(opaque_ratio, 4),
    }

    if width_in > 0 and height_in > 0:
        findings.append(_dpi_finding(dpi, width_in, height_in))

    # An almost-empty file is usually a background removal that ate the design.
    if opaque_ratio < MIN_OPAQUE_RATIO:
        findings.append(Finding(
            "blocker", "empty",
            "This file is almost entirely transparent — there is nothing to print.",
            "Upload the original artwork, or undo the background removal.",
        ))
    elif not has_alpha:
        # No transparency at all: check whether it is a photo on a solid backdrop.
        w, h = small.size
        border = [small.getpixel((x, y))
                  for x in range(w) for y in (0, h - 1)] + \
                 [small.getpixel((x, y))
                  for y in range(h) for x in (0, w - 1)]
        if border:
            first = border[0][:3]
            same = sum(1 for p in border if all(abs(p[i] - first[i]) <= 12 for i in range(3)))
            if same / len(border) >= BORDER_SAMENESS:
                light = sum(first) / 3 > 200
                findings.append(Finding(
                    "warning", "solid_background",
                    ("The design sits on a solid "
                     + ("white" if light else "coloured")
                     + " background, which will print as a rectangle around it."),
                    "Remove the background, unless you want that block printed.",
                ))
            else:
                findings.append(Finding(
                    "warning", "no_transparency",
                    "This file has no transparency, so everything in it prints, background included.",
                    "Remove the background if the design should have none.",
                ))

    aspect_file = px_w / px_h if px_h else 1
    aspect_print = width_in / height_in if height_in else 1
    if width_in > 0 and height_in > 0 and abs(aspect_file - aspect_print) / aspect_print > 0.02:
        findings.append(Finding(
            "warning", "stretched",
            f'The file is {aspect_file:.2f}:1 but the print size is {aspect_print:.2f}:1, '
            "so the design will be stretched or squashed.",
            "Set a size that matches the artwork's proportions.",
        ))

    if mode == "CMYK":
        findings.append(Finding(
            "warning", "colour_mode",
            "This file is CMYK. Printing converts it to the press profile, so colours may shift.",
            "Send RGB if exact colour matters.",
        ))

    return _verdict(findings, measured)


def _verdict(findings: list[Finding], measured: dict) -> Inspection:
    blockers = [f for f in findings if f.level == "blocker"]
    warnings = [f for f in findings if f.level == "warning"]
    if blockers:
        verdict = "blocked"
    elif warnings:
        verdict = "check"
    else:
        verdict = "ready"
    return Inspection(ok=not blockers, verdict=verdict, findings=findings, measured=measured)


async def inspect_artwork(url: str, width_in: float, height_in: float, file_type: str = "") -> Inspection:
    """Measure one artwork file against the size it will be printed at."""
    kind = (file_type or url.rsplit(".", 1)[-1] or "").lower().lstrip(".")

    if kind in VECTOR_TYPES:
        return Inspection(
            ok=True, verdict="ready",
            findings=[Finding("ok", "vector",
                              "Vector artwork — it stays sharp at any size.")],
            measured={"type": kind, "print_size_in": f"{width_in:g}x{height_in:g}"},
        )
    if kind in PDF_TYPES:
        return _unknown(
            "PDFs aren't measured automatically yet, so resolution and transparency haven't been checked.",
            type=kind,
        )

    try:
        data = await fetch_bytes(url)
    except NotOurFile:
        return _unknown("Only files uploaded to this store can be checked.", type=kind)
    except Exception as exc:
        logger.warning("artwork fetch failed for %s: %s", url, exc)
        return _unknown("The file couldn't be downloaded for checking.", type=kind)

    try:
        return _analyse_image(data, float(width_in or 0), float(height_in or 0))
    except Exception as exc:
        logger.warning("artwork inspect failed for %s: %s", url, exc)
        return _unknown("This file couldn't be read as an image, so it hasn't been checked.", type=kind)
