"""JavaScript in a Custom HTML block (services/builder/scripts.py).

The manager asked for a JavaScript box beside the block's HTML and CSS. The
HTML still has every script taken out of it; the script has a field of its
own, which only an Administrator may add or change, which goes to the
storefront as written, and which the editor never runs.
No database or network.
"""
import copy
import inspect

from app.api.v1.admin import builder as builder_api
from app.services.builder import scripts
from app.services.builder.resolve import _safe
from app.services.builder.schema import Known, blocking, validate
from app.services.builder.starter import starter_document

KNOWN = Known(menu_ids={"menu-main", "menu-foot"}, product_ids=set(), collection_ids=set(),
              custom_font_families=set())
CODE = "block.querySelector('p').textContent = 'From the script';"


def block(js=CODE, bid="blk1"):
    return {"id": bid, "type": "html",
            "props": {"html": "<p>Hi</p><script>alert(1)</script>", "css": ".x{color:red}", "js": js}}


def doc_with(*blocks):
    d = starter_document(store_name="Innterflow", primary="#1C3557",
                         header_menu="menu-main", footer_menu="menu-foot")
    d.setdefault("pages", {})["about"] = {"title": "About",
                                          "tree": {"id": "sec1", "type": "section", "props": {}, "children": list(blocks)}}
    return d


def codes(issues):
    return {i.code for i in issues}


def test_the_scripts_of_a_document_are_found_in_every_kind_of_tree():
    d = doc_with(block())
    d.setdefault("globals", {})["g1"] = {"name": "Banner", "tree": block("console.log('g')", "blk2")}
    d.setdefault("saved", {})["s1"] = {"name": "Saved", "tree": block("console.log('s')", "blk3")}
    assert scripts.scripts_in(d) == {("blk1", CODE), ("blk2", "console.log('g')"), ("blk3", "console.log('s')")}
    # A block with no script, or only spaces, has none.
    assert scripts.scripts_in(doc_with(block(""), block("   ", "blk9"))) == set()


def test_a_script_added_or_changed_is_new_one_kept_or_taken_out_is_not():
    before = doc_with(block())
    assert scripts.new_scripts(copy.deepcopy(before), before) == set()
    changed = doc_with(block(CODE + "\nalert(2);"))
    assert scripts.new_scripts(changed, before) == {("blk1", CODE + "\nalert(2);")}
    assert scripts.new_scripts(doc_with(block(), block("x()", "blk2")), before) == {("blk2", "x()")}
    assert scripts.new_scripts(doc_with(block("")), before) == set()
    # What the live site has already may be kept, though the draft had lost it.
    assert scripts.new_scripts(before, doc_with(), before) == set()


def test_only_an_administrator_or_the_platform_may_write_one():
    assert scripts.may_write_scripts("tenant_admin", None, False)
    assert scripts.may_write_scripts("tenant_editor", None, True)  # the platform
    for role in ("tenant_manager", "tenant_editor", "tenant_fulfillment", "tenant_viewer", "tenant_production", None):
        assert not scripts.may_write_scripts(role, None, False), role
    # An Administrator role cut down to some sections is a partial one.
    assert not scripts.may_write_scripts("tenant_admin", ["storefront"], False)


def test_saving_the_draft_asks_who_is_saving_before_it_saves():
    source = inspect.getsource(builder_api.save_draft)
    asked = source.index("may_write_scripts(")
    assert asked < source.index("new_scripts(") < source.index("site_svc.save_draft(")
    assert "SCRIPT_ADMIN_ONLY" in source and "status_code=403" in source


def test_a_script_is_text_of_a_sensible_size():
    assert not {"js_too_long", "js_shape"} & codes(validate(doc_with(block()), KNOWN))
    assert "js_too_long" in codes(blocking(validate(doc_with(block("x" * (scripts.MAX_SCRIPT + 1))), KNOWN)))
    assert "js_shape" in codes(blocking(validate(doc_with(block(["not", "text"])), KNOWN)))


def test_the_storefront_gets_the_script_as_written_and_the_html_still_without_one():
    tree = _safe(doc_with(block())["pages"]["about"]["tree"])
    props = tree["children"][0]["props"]
    assert props["js"] == CODE
    assert "<script" not in props["html"] and "alert(1)" not in props["html"]
    too_big = _safe(doc_with(block("x" * (scripts.MAX_SCRIPT + 1)))["pages"]["about"]["tree"])
    assert too_big["children"][0]["props"]["js"] == ""
    odd_id = _safe(doc_with(block(CODE, 'x"]; alert(1); //'))["pages"]["about"]["tree"])
    assert odd_id["children"][0]["props"]["js"] == ""
