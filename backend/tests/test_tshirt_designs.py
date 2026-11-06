"""The t-shirt designer's job records and finished files.

What the routes rely on, checked without a database: a design document is
read and refused the way a buyer is told; a finished file must name a real
shirt, side and kind; only PNGs of a sane size are kept; and a design's files
land in their own folder inside the shop's ImageKit folder.
"""
from __future__ import annotations

import io

import pytest
from PIL import Image

from app.api.v1.tshirt_designs import (
    MAX_OUTPUT_PX,
    check_output,
    output_folder,
    output_name,
    read_png,
    summarise_document,
)


def _doc(**over):
    doc = {
        "version": 2,
        "name": "Wildcats 2026",
        "method": "print",
        "products": [{"garmentId": "classic-tee", "colorIds": ["white", "navy"]}],
        "designs": {"classic-tee:white": {"front": [{"type": "i-text"}], "back": [], "left": [], "right": []}},
        "quantities": {"classic-tee:white": {"M": 6, "L": 4}, "classic-tee:navy": {"M": 2}, "gone:red": {"M": 9}},
    }
    doc.update(over)
    return doc


def _png(w: int, h: int, fmt: str = "PNG", dpi: int | None = 300) -> bytes:
    buf = io.BytesIO()
    kw = {"dpi": (dpi, dpi)} if dpi and fmt == "PNG" else {}
    Image.new("RGBA" if fmt == "PNG" else "RGB", (w, h)).save(buf, format=fmt, **kw)
    return buf.getvalue()


def test_a_design_is_read_into_what_the_job_keeps():
    s = summarise_document(_doc())
    assert s["shirts"] == ["classic-tee:white", "classic-tee:navy"]
    assert s["shirt_count"] == 2
    # Only shirts in the design count; a stale line for a removed garment does not.
    assert s["total_qty"] == 12
    assert s["name"] == "Wildcats 2026"
    assert s["method"] == "print"


@pytest.mark.parametrize("bad, message", [
    ({"products": []}, "Add a garment"),
    ({"products": [{"garmentId": "Classic Tee!", "colorIds": ["white"]}]}, "garments could not be read"),
    ({"designs": None}, "could not be read"),
])
def test_a_document_that_is_not_a_design_is_refused(bad, message):
    with pytest.raises(ValueError, match=message):
        summarise_document(_doc(**bad))


def test_an_unknown_method_is_printing():
    assert summarise_document(_doc(method="laser"))["method"] == "print"


def test_a_finished_file_must_name_a_real_shirt_side_and_kind():
    shirts = ["classic-tee:white"]
    check_output("classic-tee:white", "front", "print", shirts)
    with pytest.raises(ValueError, match="not in this design"):
        check_output("classic-tee:navy", "front", "print", shirts)
    with pytest.raises(ValueError, match="side"):
        check_output("classic-tee:white", "inside", "print", shirts)
    with pytest.raises(ValueError, match="kind"):
        check_output("classic-tee:white", "front", "pdf", shirts)


def test_only_pngs_of_a_sane_size_are_kept():
    assert read_png(_png(3600, 4200)) == (3600, 4200, 300)
    assert read_png(_png(10, 10, dpi=None))[2] is None
    with pytest.raises(ValueError, match="PNG"):
        read_png(_png(10, 10, fmt="JPEG"))
    with pytest.raises(ValueError, match="could not be read"):
        read_png(b"not a picture")
    with pytest.raises(ValueError, match="pixels"):
        read_png(_png(MAX_OUTPUT_PX + 1, 10))


def test_files_land_in_the_designs_own_folder_with_readable_names():
    assert output_folder("TS-AB-2611-0001") == "tshirt-designs/TS-AB-2611-0001"
    assert output_folder("../../etc") == "tshirt-designs/etc"
    assert output_name("classic-tee:navy", "back", "preview") == "classic-tee-navy-back-preview.png"


def test_the_designer_is_open_to_guests_but_a_buyers_list_is_not():
    from app.middleware.auth_middleware import AuthMiddleware

    def public(path: str) -> bool:
        return AuthMiddleware._is_public(AuthMiddleware.__new__(AuthMiddleware), path)

    assert public("/api/v1/tshirt-designs")
    assert public("/api/v1/tshirt-designs/0b6c0b8e-3a2f-4a8e-9b1e-2f6a1c9d0e11/outputs")
    assert not public("/api/v1/tshirt-designs/mine")
