"""The logo a shop's buyers see (services/shop_logo): a builder header's logo
block wins over the settings' logo, and only a real picture counts."""
from app.services.shop_logo import header_logo_of

LOGO = "https://ik.imagekit.io/x/tenants/innterflow/logo.png"


def _doc(header, globals_=None):
    return {"parts": {"header": header}, "globals": globals_ or {}}


def test_the_header_logo_block_picture():
    header = {"type": "section", "children": [
        {"type": "stack", "children": [
            {"type": "logo", "props": {"href": "https://innterflow.com", "image": LOGO, "fallback": "name"}},
            {"type": "menu", "props": {}},
        ]},
    ]}
    assert header_logo_of(_doc(header)) == LOGO


def test_a_logo_inside_a_shared_section():
    header = {"type": "section", "children": [{"type": "global_ref", "props": {"ref": "g1"}}]}
    shared = {"g1": {"tree": {"type": "stack", "children": [{"type": "logo", "props": {"image": LOGO}}]}}}
    assert header_logo_of(_doc(header, shared)) == LOGO


def test_no_picture_means_the_settings_logo():
    # A logo block that shows the shop's name, or the settings' logo, sets no picture.
    header = {"type": "section", "children": [{"type": "logo", "props": {"fallback": "name"}}]}
    assert header_logo_of(_doc(header)) is None
    assert header_logo_of(_doc({"type": "logo", "props": {"image": "  "}})) is None
    assert header_logo_of(_doc({"type": "logo", "props": {"image": "javascript:alert(1)"}})) is None


def test_no_header_or_no_document():
    assert header_logo_of(None) is None
    assert header_logo_of({}) is None
    assert header_logo_of(_doc(None)) is None


def test_a_shared_section_that_points_at_itself_ends():
    header = {"type": "global_ref", "props": {"ref": "loop"}}
    shared = {"loop": {"tree": {"type": "global_ref", "props": {"ref": "loop"}}}}
    assert header_logo_of(_doc(header, shared)) is None
