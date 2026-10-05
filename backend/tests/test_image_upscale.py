"""AI upscaling: what is sent to ImageKit, and how its answer is put back together.

    python tests/test_image_upscale.py

No network. ImageKit is stood in for by a plain enlargement, which is enough to
check the part that is ours: a transparent design goes out as colour and
transparency side by side, and comes back transparent, the right size, with its
solid parts still solid and its clear parts still clear.
"""
import io
import os
import sys

os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:test@localhost:55432/at360test"
os.environ["DATABASE_URL_SYNC"] = "postgresql://postgres:test@localhost:55432/at360test"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from PIL import Image, ImageDraw  # noqa: E402

from app.services import image_upscale as up  # noqa: E402

ok = fail = 0


def check(name: str, cond: bool, detail: object = "") -> None:
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS  {name}")
    else:
        fail += 1
        print(f"  FAIL  {name} {detail}")


def png(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def design() -> Image.Image:
    """A red disc and a blue bar on nothing — and black stored under the nothing, as editors leave it."""
    im = Image.new("RGBA", (200, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((20, 20, 100, 100), fill=(220, 30, 30, 255))
    d.rectangle((120, 40, 190, 80), fill=(20, 60, 200, 255))
    return im


def enlarged(sent: up.Prepared, times: int) -> Image.Image:
    """What ImageKit does to the size, without the sharpening."""
    im = Image.open(io.BytesIO(sent.png))
    return im.resize((im.size[0] * times, im.size[1] * times), Image.BICUBIC)


print("a design with a transparent background")
sent = up.prepare(png(design()))
sheet = Image.open(io.BytesIO(sent.png))
check("is sent as colour and transparency side by side, with nothing transparent in it",
      sent.has_alpha and sheet.mode == "RGB" and sheet.size == (200 * 2 + 32, 120), (sent.has_alpha, sheet.mode, sheet.size))
check("…the transparency half is white where the design is and black where it is not",
      sheet.getpixel((232 + 60, 60)) == (255, 255, 255) and sheet.getpixel((232 + 5, 5)) == (0, 0, 0),
      (sheet.getpixel((232 + 60, 60)), sheet.getpixel((232 + 5, 5))))
r, g, b = sheet.getpixel((18, 60))       # just outside the disc's left edge
check("…and the colour half carries the design's own colour past its edge, not the black underneath",
      r > 150 and g < 90 and b < 90, (r, g, b))

out = Image.open(io.BytesIO(up.finish(enlarged(sent, 4), sent)))
check("comes back four times the size, transparent again", out.mode == "RGBA" and out.size == (800, 480), (out.mode, out.size))
check("…solid where the design is", out.getpixel((240, 240))[3] == 255 and out.getpixel((600, 240))[3] == 255,
      (out.getpixel((240, 240)), out.getpixel((600, 240))))
check("…clear where it is not", out.getpixel((10, 10))[3] == 0 and out.getpixel((440, 60))[3] == 0 and out.getpixel((790, 470))[3] == 0,
      (out.getpixel((10, 10)), out.getpixel((440, 60))))
check("…in the design's colours", out.getpixel((240, 240))[:3] == (220, 30, 30) and out.getpixel((600, 240))[:3] == (20, 60, 200),
      (out.getpixel((240, 240)), out.getpixel((600, 240))))
edge = [out.getpixel((x, 240)) for x in range(70, 92)]      # across the disc's left edge
check("…and no dark fringe where the edge fades out",
      all(px[0] > 150 for px in edge if px[3] > 40), [px for px in edge if px[3] > 40 and px[0] <= 150])

odd = Image.open(io.BytesIO(up.finish(enlarged(sent, 3).resize((1290, 361)), sent)))      # a size that does not divide evenly
check("an answer whose size does not divide evenly is still put together", odd.mode == "RGBA" and abs(odd.size[0] - 597) <= 1 and odd.size[1] == 361, odd.size)

print("\na design with no transparency")
flat = Image.new("RGB", (160, 100), (240, 240, 240))
ImageDraw.Draw(flat).rectangle((30, 30, 130, 70), fill=(10, 120, 60))
sent = up.prepare(png(flat))
check("is sent as it is", not sent.has_alpha and Image.open(io.BytesIO(sent.png)).size == (160, 100))
out = Image.open(io.BytesIO(up.finish(enlarged(sent, 4), sent)))
check("and comes back four times the size, still without any", out.mode == "RGB" and out.size == (640, 400), (out.mode, out.size))
opaque = Image.new("RGBA", (160, 100), (10, 120, 60, 255))
check("a file that only says it has transparency, and has none, is treated the same", not up.prepare(png(opaque)).has_alpha)

print("\nwhat is turned away")
for name, content, status in (
    ("something that is not an image", b"not an image at all", 400),
    ("an image already large enough to print well", png(Image.new("RGB", (2100, 2100), "white")), 400),
    ("an image a few pixels across", png(Image.new("RGB", (4, 4), "white")), 400),
    ("a file past the size limit", b"x" * (up.MAX_INPUT_BYTES + 1), 413),
):
    try:
        up.prepare(content)
        check(f"{name} is refused", False, "accepted")
    except up.UpscaleError as exc:
        check(f"{name} is refused, with something to say", exc.status == status and len(str(exc)) > 10, (exc.status, str(exc)))

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
