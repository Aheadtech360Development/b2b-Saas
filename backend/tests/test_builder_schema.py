"""The visual builder's document checks and its HTML/CSS sanitizer.

These are the rules that stand between a broken draft and a brand's live
storefront, so the cases are the ways a draft actually goes wrong: an element
that points at a deleted menu or another brand's product, a font that was
removed, a script pasted into a Custom HTML block.
"""
import copy
import os
import sys

sys.path.insert(0, os.path.abspath("."))

from app.services.builder.sanitize import clean_html, clean_style, scope_css
from app.services.builder.schema import Known, blocking, validate
from app.services.builder.starter import starter_document

ok = fail = 0


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS  {name}")
    else:
        fail += 1
        print(f"  FAIL  {name}{' - ' + str(extra) if extra else ''}")


def codes(issues):
    return {i.code for i in issues}


KNOWN = Known(menu_ids={"menu-main", "menu-foot"}, product_ids={"p1", "p2"},
              collection_ids={"c1"}, custom_font_families={"Brand Sans"})


def fresh():
    return starter_document(store_name="Innterflow", primary="#1C3557",
                            header_menu="menu-main", footer_menu="menu-foot")


print("the starter a brand opens")
doc = fresh()
issues = validate(doc, KNOWN)
check("validates with no errors", not blocking(issues), [i.as_dict() for i in blocking(issues)])
ids = set()
dupes = []
from app.services.builder.schema import all_trees, iter_nodes  # noqa: E402
for _p, tree, _ctx in all_trees(doc):
    for node, _path, _d in iter_nodes(tree):
        if node["id"] in ids:
            dupes.append(node["id"])
        ids.add(node["id"])
check("every element id is unique", not dupes, dupes[:5])
check("has every template type a store needs",
      set(doc["templates"]) == {"home", "page", "product", "collection", "search", "cart", "not_found"})
check("carries no product data, only references",
      "price" not in str(doc["templates"]["product"]).lower().replace("product_price", "").replace("showcompare", ""))

print("\nreferences to the store's own records")
d = fresh()
d["parts"]["header"]["children"][0]["children"][1]["props"]["menuId"] = "menu-deleted"
check("a deleted menu blocks the publish", "missing_menu" in codes(blocking(validate(d, KNOWN))))

d = fresh()
grid = d["templates"]["home"]["default"]["tree"]["children"][2]["children"][1]
grid["props"]["source"] = "manual"
grid["props"]["productIds"] = ["p1", "someone-elses-product"]
check("another brand's product id blocks the publish",
      "missing_product" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"][1]["children"][1]["props"]["collectionIds"] = ["c-gone"]
check("a deleted collection blocks the publish", "missing_collection" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"].append(
    {"id": "gref1", "type": "global_ref", "props": {"ref": "g-nope"}, "style": {}})
check("a shared section that does not exist blocks the publish",
      "missing_global" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["globals"]["g1"] = {"name": "Promo", "tree": {"id": "gtree", "type": "section", "props": {}, "style": {},
                                                 "children": [{"id": "gin", "type": "global_ref",
                                                               "props": {"ref": "g1"}, "style": {}}]}}
check("a shared section cannot contain another (no loops)",
      "global_nested" in codes(blocking(validate(d, KNOWN))))

print("\nthe shape of the tree")
d = fresh()
d["templates"]["home"]["default"]["tree"]["children"].append({"id": "x1", "type": "marquee", "props": {}})
check("an element type the builder does not have is refused", "unknown_type" in codes(blocking(validate(d, KNOWN))))

d = fresh()
tree = d["templates"]["home"]["default"]["tree"]
tree["children"].append(copy.deepcopy(tree["children"][0]))
check("two elements with the same id are refused", "duplicate_id" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"].append(
    {"id": "h1x", "type": "heading", "props": {"text": "x"}, "children": [{"id": "kid", "type": "text"}]})
check("a heading cannot hold other elements", "not_container" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"].append(
    {"id": "r1x", "type": "row", "props": {}, "children": [{"id": "t1x", "type": "text", "props": {}}]})
check("a row can only hold columns", "child_type" in codes(blocking(validate(d, KNOWN))))

d = fresh()
node = {"id": "deep0", "type": "stack", "props": {}, "children": []}
cur = node
for i in range(25):
    nxt = {"id": f"deep{i + 1}", "type": "stack", "props": {}, "children": []}
    cur["children"].append(nxt)
    cur = nxt
d["templates"]["home"]["default"]["tree"]["children"].append(node)
check("nesting past the limit is refused", "too_deep" in codes(blocking(validate(d, KNOWN))))

print("\nwhat a merchant can type into a setting")
d = fresh()
d["templates"]["home"]["default"]["tree"]["children"][0]["style"]["backgroundColor"] = "red; } body { display:none"
check("a style that breaks out of its rule is refused", "style_unsafe" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"][0]["style"]["backgroundImage"] = "url(http://x.test/a.png)"
check("a non-https background image is refused", "style_url" in codes(blocking(validate(d, KNOWN))))

d = fresh()
btn = d["templates"]["not_found"]["default"]["tree"]["children"][0]["children"][2]["children"][0]
btn["props"]["href"] = "javascript:alert(1)"
check("a javascript: link is refused", "url_unsafe" in codes(blocking(validate(d, KNOWN))))

print("\nfonts")
d = fresh()
d["settings"]["fonts"].append({"family": "Brand Sans", "source": "custom", "weights": [400]})
d["settings"]["typography"]["heading"]["family"] = "Brand Sans"
check("an uploaded font this brand has can be used", not blocking(validate(d, KNOWN)))

d = fresh()
d["settings"]["fonts"].append({"family": "Other Brand Font", "source": "custom", "weights": [400]})
check("an uploaded font this brand does not have is refused",
      "font_missing" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["settings"]["typography"]["body"]["family"] = "Comic Neue"
check("a body font that is not in the site's fonts is refused",
      "font_unknown" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"][0]["style"]["fontFamily"] = "Lobster"
check("an element's own font must be one the site has", "font_unknown" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"][0]["style"]["fontFamily"] = "Georgia"
check("a system font needs no setup", not blocking(validate(d, KNOWN)))

print("\npages and templates")
d = fresh()
d["pages"]["checkout"] = {"title": "Checkout", "template": "default", "tree": None}
check("a page cannot take an address the shop already uses", "page_reserved" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["pages"]["About Us!"] = {"title": "About", "template": "default", "tree": None}
check("a page address must be lower-case letters, numbers and hyphens",
      "page_slug" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["pages"]["about"]["template"] = "deleted-template"
check("a page cannot use a template that is gone", "page_template" in codes(blocking(validate(d, KNOWN))))

d = fresh()
del d["templates"]["product"]["default"]
check("there must be a default product template", "template_default" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["assignments"]["product"]["byId"]["p1"] = "nope"
check("a product cannot be pointed at a template that is gone", "assignment" in codes(blocking(validate(d, KNOWN))))

d = fresh()
d["templates"]["home"]["default"]["tree"]["children"].append(
    {"id": "pt1", "type": "product_title", "props": {}, "style": {}})
iss = validate(d, KNOWN)
check("a product element on the home page is a warning, not an error",
      "out_of_context" in codes(iss) and "out_of_context" not in codes(blocking(iss)))

print("\nsize")
d = fresh()
d["saved"]["huge"] = {"name": "huge", "tree": {"id": "huge0", "type": "text",
                                                "props": {"text": "x" * 1_600_000}, "style": {}}}
check("a document past the size limit is refused", "too_large" in codes(blocking(validate(d, KNOWN))))

print("\ncustom HTML")
out = clean_html('<p onclick="steal()">Hi</p><script>alert(1)</script><img src="javascript:x">'
                 '<a href="https://ok.test" target="_blank">ok</a>')
check("scripts are removed with their contents", "<script" not in out.value and "alert" not in out.value)
check("event handlers are removed", "onclick" not in out.value)
check("javascript: images are removed", "javascript" not in out.value)
check("text survives", "Hi" in out.value)
check("a new-tab link cannot reach back into the shop", 'rel="noopener noreferrer"' in out.value)
check("what was removed is reported", any("script" in r for r in out.removed))

out = clean_html('<iframe src="https://evil.test"></iframe><form action="/x"><input></form><p>ok</p>')
check("iframes and forms are removed", "iframe" not in out.value and "form" not in out.value and "ok" in out.value)

out = clean_html('<div style="position:fixed;top:0;color:red;background:url(javascript:x)">x</div>')
check("a block cannot pin itself over the checkout", "fixed" not in out.value)
check("safe styles stay", "color: red" in out.value)

out = clean_style("color: blue; width: expression(alert(1)); behavior: url(x.htc)")
check("expression() and behaviours are dropped", out.value == "color: blue")

print("\ncustom CSS")
out = scope_css("h2 { color: red } .card, p { padding: 4px }", '[data-b="n1"]')
check("every selector is confined to its block",
      '[data-b="n1"] h2' in out.value and '[data-b="n1"] .card' in out.value and '[data-b="n1"] p' in out.value)
check("nothing unscoped is left", "\nh2" not in out.value and not out.value.startswith("h2"))

out = scope_css('@import url(https://x.test/a.css); p { color: red }', '[data-b="n1"]')
check("@import is dropped", "@import" not in out.value and '[data-b="n1"] p' in out.value)

out = scope_css("@media (max-width: 600px) { h2 { font-size: 20px } }", '[data-b="n1"]')
check("@media is kept and its rules scoped",
      out.value.startswith("@media") and '[data-b="n1"] h2' in out.value)

out = scope_css("p { color: red } </style><script>alert(1)</script>", '[data-b="n1"]')
check("a style tag cannot be closed from inside", "<script" not in out.value and "</style" not in out.value)

print("\nlayout engine")
known = Known(menu_ids=set(), product_ids=set(), collection_ids=set(), custom_font_families=set())
laid = starter_document(store_name="Shop")
home = laid["templates"]["home"]["default"]["tree"]
home["children"].append({"id": "lg1", "type": "stack", "props": {},
                         "style": {"display": "grid", "gridColumns": 3, "gridRows": 2, "rowGap": "12px",
                                   "justifyItems": "center", "gridAutoFlow": "row dense"},
                         "tablet": {"gridColumns": 2}, "mobile": {"display": "flex", "flexDirection": "column"},
                         "children": [{"id": "lg2", "type": "column", "props": {},
                                       "style": {"gridColumn": 1, "gridColumnSpan": 2, "gridRow": "auto",
                                                 "gridRowSpan": 2, "alignSelf": "end", "flexGrow": 1, "order": -1}}]})
home["children"].append({"id": "lg3", "type": "stack", "props": {},
                         "style": {"display": "grid", "gridAuto": "fit", "gridMin": "220px", "gridTemplate": "2fr 1fr"}})
issues = [i for i in validate(laid, known) if i.path.startswith("templates.home") and "lg" in str(i.path) or i.code == "layout_value"]
check("every layout setting the editor writes is accepted", not [i for i in issues if i.code in ("layout_value", "style_key")],
      [i.as_dict() for i in issues])

bad = starter_document(store_name="Shop")
bad["templates"]["home"]["default"]["tree"]["children"].append({
    "id": "lb1", "type": "stack", "props": {},
    "style": {"display": "table", "gridColumns": 40, "gridAuto": "wide", "gridTemplate": "1fr; } body { x",
              "gridColumnSpan": 0, "gridRow": "first"}})
codes = [(i.path.rsplit(".", 1)[-1], i.code) for i in validate(bad, known) if "lb1" in str(i.path) or i.code in ("layout_value", "style_unsafe")]
refused = {k for k, c in codes if c in ("layout_value", "style_unsafe")}
check("anything a layout key cannot hold is refused before it goes live",
      {"display", "gridColumns", "gridAuto", "gridTemplate", "gridColumnSpan", "gridRow"} <= refused, codes)
check("…as errors that block the publish",
      all(i.severity == "error" for i in validate(bad, known) if i.code == "layout_value"))

print("\nheader and footer")
doc = fresh()
footer = doc["parts"]["footer"]
columns = footer["children"][0]
brand, *menus_ = columns["children"]
check("a new shop's footer is five columns: the brand, three menus, a column of text",
      columns["props"].get("direction") == "row" and columns["style"].get("flexWrap") == "wrap"
      and [c["type"] for c in brand["children"]] == ["logo", "text", "text"]
      and [(m["type"], m["props"].get("layout"), m["props"].get("title")) for m in menus_[:3]]
      == [("menu", "vertical", "Products"), ("menu", "vertical", "Support"), ("menu", "vertical", "Company")]
      and [c["type"] for c in menus_[3]["children"]] == ["heading", "rich_text"],
      [c["type"] for c in columns["children"]])
check("…the brand the widest, the others an equal share that wraps",
      brand["style"].get("flexGrow") == 3 and all(c["style"].get("flexGrow") == 1 and c["style"].get("flexBasis") == "160px"
                                                  for c in menus_))
check("…and the two menus not chosen yet do not stop a publish", not blocking(validate(doc, KNOWN)),
      [i.as_dict() for i in blocking(validate(doc, KNOWN))])
check("…using the shop's footer menu", menus_[0]["props"]["menuId"] == "menu-foot")
check("…with no fixed size on the logos: their height is a style like any other",
      all("height" not in n["props"] and n["style"].get("height") for n, _p, _d in iter_nodes(doc["parts"]["header"]) if n["type"] == "logo")
      and brand["children"][0]["style"].get("height") == "36px" and "height" not in brand["children"][0]["props"])

more = copy.deepcopy(doc)
cols = more["parts"]["footer"]["children"][0]["children"]
for i in range(6):
    cols.append({"id": f"extra{i}", "type": "menu", "props": {"title": f"Column {i}", "menuId": "menu-main", "layout": "vertical"}})
check("a footer takes as many menu columns as it is given", not blocking(validate(more, KNOWN)) and len(cols) == 11,
      [i.as_dict() for i in blocking(validate(more, KNOWN))])
gone = copy.deepcopy(more)
gone["parts"]["footer"]["children"][0]["children"][-1]["props"]["menuId"] = "menu-deleted"
check("a column pointing at a menu that is gone is caught before it goes live",
      any("menu" in i.code for i in validate(gone, KNOWN)), sorted({i.code for i in validate(gone, KNOWN)}))

styled = copy.deepcopy(doc)
styled["parts"]["header"]["style"].update({
    "linkColor": "#FFFFFF", "linkHoverColor": "#FFD400", "headingColor": "#FFFFFF", "borderBottomWidth": "2px",
    "borderColor": "#FFD400", "fontSize": "14px", "fontWeight": 600, "fontFamily": "Inter", "color": "#C9CED8",
})
styled["parts"]["footer"]["style"].update({"borderTopWidth": 3, "linkColor": "var(--b-primary)"})
issues = validate(styled, KNOWN)
check("link, hover and heading colours, a font, and a line above or below are all settings the builder knows",
      not [i for i in issues if i.code in ("style_key", "style_value", "style_unsafe", "layout_value")],
      [i.as_dict() for i in issues if i.code.startswith(("style", "layout"))])
unsafe = copy.deepcopy(doc)
unsafe["parts"]["header"]["style"]["linkColor"] = "red; } body { display:none"
check("…and a colour that tries to break out of its rule is refused", "style_unsafe" in {i.code for i in validate(unsafe, KNOWN)})

logo = copy.deepcopy(doc)
head_logo = next(n for n, _p, _d in iter_nodes(logo["parts"]["header"]) if n["type"] == "logo")
head_logo["props"].update({"image": "https://ik.imagekit.io/shop/logo.png", "alt": "Innterflow", "align": "center"})
head_logo["style"].update({"width": "180px", "maxWidth": "60%"})
head_logo["mobile"] = {"width": "110px"}
check("a logo can be given its own picture, a width, a widest size and a size for phones",
      not blocking(validate(logo, KNOWN)), [i.as_dict() for i in blocking(validate(logo, KNOWN))])
head_logo["props"]["image"] = "/media/logo.png"
check("…from the shop's own address too", not blocking(validate(logo, KNOWN)))
for bad_url in ("javascript:alert(1)", "//evil.example/logo.png", "data:text/html,<script>1</script>"):
    head_logo["props"]["image"] = bad_url
    found = [i for i in validate(logo, KNOWN) if "image" in i.path]
    check(f"…but not from {bad_url.split(':')[0].split('/')[0] or 'another site without a scheme'}: that is refused at publish",
          bool(found) and all(i.severity == "error" for i in found), [i.as_dict() for i in found])

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
