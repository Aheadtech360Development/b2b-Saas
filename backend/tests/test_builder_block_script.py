"""JavaScript in a Custom HTML block (services/builder/scripts.py).

The manager asked for a JavaScript box beside the block's HTML and CSS. The
HTML still has every script taken out of it; the script has a field of its
own, which only an Administrator may add or change, which goes to the
storefront as written, and which the editor never runs.
No database or network.
"""
import copy
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.admin import builder as builder_api
from app.services.builder import scripts
from app.services.builder import site as site_svc
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
    assert scripts.scripts_in(d) == {CODE, "console.log('g')", "console.log('s')"}
    # A block with no script, or only spaces, has none.
    assert scripts.scripts_in(doc_with(block(""), block("   ", "blk9"))) == set()


def test_a_script_added_or_changed_is_new_one_kept_or_taken_out_is_not():
    before = doc_with(block())
    assert scripts.new_scripts(copy.deepcopy(before), before) == set()
    changed = doc_with(block(CODE + "\nalert(2);"))
    assert scripts.new_scripts(changed, before) == {CODE + "\nalert(2);"}
    assert scripts.new_scripts(doc_with(block(), block("x()", "blk2")), before) == {"x()"}
    assert scripts.new_scripts(doc_with(block("")), before) == set()
    # Copied or moved, the same script is not a new one.
    assert scripts.new_scripts(doc_with(block(), block(CODE, "blk7")), before) == set()
    # What the live site has already may be kept, though the draft had lost it.
    assert scripts.new_scripts(before, doc_with(), before) == set()


def test_only_an_administrator_or_the_platform_may_write_one():
    assert scripts.may_write_scripts("tenant_admin", None, False)
    assert scripts.may_write_scripts("tenant_editor", None, True)  # the platform
    for role in ("tenant_manager", "tenant_editor", "tenant_fulfillment", "tenant_viewer", "tenant_production", None):
        assert not scripts.may_write_scripts(role, None, False), role
    # An Administrator role cut down to some sections is a partial one.
    assert not scripts.may_write_scripts("tenant_admin", ["storefront"], False)


# ── The two ways a script can reach the live site: saving the draft, and going
#    back to an earlier version. The site service is stood in for, so this
#    runs the endpoints themselves without a database.

TENANT = uuid.uuid4()
LIVE = uuid.uuid4()
OLD = uuid.uuid4()  # an earlier version, with a script the site no longer has


class FakeDb:
    async def commit(self):
        pass


def who(role, scopes=None, platform=False):
    return SimpleNamespace(state=SimpleNamespace(tenant_id=TENANT, role=role, scopes=scopes,
                                                 is_platform_admin=platform))


@pytest.fixture
def shop(monkeypatch):
    state = {
        "site": SimpleNamespace(id=uuid.uuid4(), tenant_id=TENANT, draft=doc_with(),
                                published_version_id=LIVE, draft_revision=3),
        "versions": {LIVE: (doc_with(), 2), OLD: (doc_with(block()), 1)},
        "saved": [], "rolled": [],
    }

    async def get_site(db, tid):
        return state["site"]

    async def published_document(db, tid, vid):
        return state["versions"].get(vid)

    async def save_draft(db, site, draft, revision):
        state["saved"].append(draft)
        site.draft, site.draft_revision = draft, site.draft_revision + 1
        return site

    async def rollback(db, site, vid):
        v = site_svc._uuid(vid)
        if v not in state["versions"]:
            raise LookupError("That version is not one of this site's.")
        state["rolled"].append(v)
        site.published_version_id = v
        return SimpleNamespace(number=state["versions"][v][1])

    async def _state(db, site):
        return {}

    monkeypatch.setattr(site_svc, "get_site", get_site)
    monkeypatch.setattr(site_svc, "published_document", published_document)
    monkeypatch.setattr(site_svc, "save_draft", save_draft)
    monkeypatch.setattr(site_svc, "rollback", rollback)
    monkeypatch.setattr(builder_api, "_state", _state)
    return state


async def save(request, draft):
    return await builder_api.save_draft(builder_api.DraftIn(draft=draft, revision=3), request, None, db=FakeDb())


async def go_back(request, version_id):
    return await builder_api.rollback(builder_api.RollbackIn(version_id=str(version_id)), request, None, db=FakeDb())


async def refused(call):
    with pytest.raises(HTTPException) as exc:
        await call
    return exc.value


async def test_an_editor_cannot_save_a_draft_that_adds_a_script(shop):
    exc = await refused(save(who("tenant_editor"), doc_with(block())))
    assert exc.status_code == 403 and exc.detail["code"] == "SCRIPT_ADMIN_ONLY"
    assert shop["saved"] == []
    await save(who("tenant_admin"), doc_with(block()))
    assert len(shop["saved"]) == 1


async def test_an_editor_may_keep_or_take_out_the_administrators_script_but_not_change_it(shop):
    shop["site"].draft = doc_with(block())
    await save(who("tenant_editor"), doc_with(block()))
    exc = await refused(save(who("tenant_manager"), doc_with(block(CODE + "\nalert(2);"))))
    assert exc.status_code == 403
    await save(who("tenant_editor"), doc_with(block("")))
    assert len(shop["saved"]) == 2


async def test_going_back_to_a_version_with_a_script_the_site_no_longer_has_is_an_administrators(shop):
    exc = await refused(go_back(who("tenant_editor"), OLD))
    assert exc.status_code == 403 and exc.detail["code"] == "SCRIPT_ADMIN_ONLY"
    assert "version has JavaScript your site no longer has" in exc.detail["message"]
    assert shop["rolled"] == [] and shop["site"].published_version_id == LIVE
    await go_back(who("tenant_admin"), OLD)
    assert shop["rolled"] == [OLD]


async def test_an_editor_may_go_back_to_a_version_whose_scripts_the_site_still_has(shop):
    shop["site"].draft = doc_with(block())  # the Administrator's script, still in the draft
    await go_back(who("tenant_editor"), OLD)
    shop["site"].draft = doc_with()
    await go_back(who("tenant_editor"), LIVE)  # nothing in it to run
    assert shop["rolled"] == [OLD, LIVE]


async def test_going_back_to_something_that_is_not_a_version_is_still_not_found(shop):
    for version_id in ("not-a-version", uuid.uuid4()):
        exc = await refused(go_back(who("tenant_editor"), version_id))
        assert exc.status_code == 404, version_id


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
