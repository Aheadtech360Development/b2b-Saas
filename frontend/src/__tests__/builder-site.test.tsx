/**
 * The builder's editor-side rules and its renderer.
 *
 * The first group holds the editor to the server: an element the editor
 * offers that the server refuses is a publish that fails for a reason the
 * merchant cannot see, so the two lists are read from their sources and
 * compared, not copied into this test.
 *
 * Then the document helpers (where an element lives, pages, templates,
 * shared sections, fonts), the editor's copy of the HTML cleaner, and what
 * the renderer actually puts on a storefront page.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BY_TYPE, REGISTRY, createNode } from "@/lib/builder/registry";
import { SYSTEM_FONTS } from "@/lib/builder/fonts";
import { findNode } from "@/lib/builder/tree";
import {
  addPage, addTemplate, assignProducts, detachShared, ensureFont, locate, makeShared, nodeForIssue, productsUsing,
  removeTemplate, renameSlug, setTreeAt, sharedUses, slugify, treeAt, usedFamilies,
} from "@/lib/builder/doc";
import { findType } from "@/lib/builder/tree";
import { cleanHtml, safeHref, safeSrc, scopeCss } from "@/lib/builder/sanitize";
import { BASE_CSS } from "@/lib/builder/baseCss";
import { Tree, type RenderCtx } from "@/components/builder/render";
import { REGISTRY_ICONS } from "@/components/builder/editor/icons";
import type { BuilderNode, SiteDoc, SitePayload } from "@/lib/builder/types";

const SCHEMA = readFileSync(path.resolve(__dirname, "../../../backend/app/services/builder/schema.py"), "utf-8");

function serverComponents(): Map<string, { container: boolean; children: string[] | null }> {
  const at = SCHEMA.indexOf("COMPONENTS: dict");
  const block = SCHEMA.slice(at, SCHEMA.indexOf("\n}\n", at));
  const out = new Map<string, { container: boolean; children: string[] | null }>();
  for (const m of block.matchAll(/"([a-z_]+)":\s*_c\(/g)) {
    // The arguments, up to the bracket that closes this _c( — they nest.
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const from = i;
    for (; i < block.length && depth > 0; i++) {
      if (block[i] === "(") depth++;
      else if (block[i] === ")") depth--;
    }
    const args = block.slice(from, i - 1);
    const kids = /child_types=\{([^}]*)\}/.exec(args);
    out.set(m[1]!, {
      container: /container=True/.test(args),
      children: kids ? Array.from(kids[1]!.matchAll(/"([a-z_]+)"/g)).map((k) => k[1]!) : null,
    });
  }
  return out;
}

function doc(): SiteDoc {
  return {
    schema: 1,
    settings: { fonts: [{ family: "Inter", source: "google", weights: [400, 700] }], typography: { heading: { family: "Inter" } } },
    parts: { header: { id: "hdr", type: "stack", children: [{ id: "hsec", type: "section", children: [{ id: "logo1", type: "logo" }] }] } },
    templates: {
      home: { default: { name: "Home", tree: { id: "home", type: "stack", children: [
        { id: "s1", type: "section", children: [{ id: "h1", type: "heading", props: { text: "Hi" }, style: { fontFamily: "Lora" } }] },
      ] } } },
      page: { default: { name: "Default page", tree: { id: "pt", type: "stack", children: [{ id: "pc", type: "page_content" }] } },
              landing: { name: "Landing", tree: { id: "lt", type: "stack", children: [] } } },
    },
    pages: { about: { title: "About", template: "landing", tree: { id: "ab", type: "stack", children: [] } } },
    assignments: { page: { default: "landing" } },
    globals: {},
    saved: {},
  };
}

describe("the editor and the server agree", () => {
  const server = serverComponents();

  it("reads the server's element list", () => {
    expect(server.size).toBeGreaterThanOrEqual(40);
  });

  it("offers exactly the elements the server accepts", () => {
    expect(REGISTRY.map((c) => c.type).sort()).toEqual([...server.keys()].sort());
  });

  it("agrees on which elements hold others", () => {
    for (const [type, spec] of server) {
      expect(!!BY_TYPE[type]?.container, type).toBe(spec.container);
    }
    expect(server.get("row")?.children).toEqual(["column"]);
  });

  it("makes new elements the server would accept", () => {
    for (const c of REGISTRY) {
      const node = c.create();
      expect(node.type).toBe(c.type);
      expect(node.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      if (node.children) expect(server.get(c.type)?.container).toBe(true);
    }
  });

  it("knows the same system fonts", () => {
    const block = /SYSTEM_FONTS = \{([^}]*)\}/.exec(SCHEMA)![1]!;
    const names = Array.from(block.matchAll(/"([^"]+)"/g)).map((m) => m[1]).sort();
    expect(SYSTEM_FONTS.map((f) => f.family).sort()).toEqual(names);
  });

  it("has an icon for every element in the Add panel", () => {
    for (const c of REGISTRY) expect(REGISTRY_ICONS[c.icon], c.type).toBeTruthy();
  });
});

describe("the document", () => {
  it("finds which tree an element is in", () => {
    expect(locate(doc(), "h1")).toEqual({ kind: "template", type: "home", id: "default" });
    expect(locate(doc(), "logo1")).toEqual({ kind: "part", key: "header" });
    expect(locate(doc(), "nope")).toBeNull();
  });

  it("replaces one tree and leaves the rest", () => {
    const d = doc();
    const next = setTreeAt(d, { kind: "page", slug: "about" }, { id: "ab", type: "stack", children: [{ id: "x", type: "text" }] });
    expect(findNode(treeAt(next, { kind: "page", slug: "about" }), "x")).toBeTruthy();
    expect(next.templates).toBe(d.templates);
  });

  it("gives a new page an address that is free and not one the shop uses", () => {
    expect(slugify("Shipping & Returns", [])).toBe("shipping-returns");
    expect(slugify("Cart", [])).toBe("cart-page");
    expect(slugify("About", ["about"])).toBe("about-2");
    const res = addPage(doc(), "FAQ");
    expect(res.slug).toBe("faq");
    expect(res.doc.pages.faq?.template).toBe("landing");
  });

  it("will not move a page onto an address in use", () => {
    expect(renameSlug(doc(), "about", "checkout")).toBeNull();
    expect(renameSlug(doc(), "about", "Not A Slug")).toBeNull();
    expect(Object.keys(renameSlug(doc(), "about", "our-story")!.pages)).toEqual(["our-story"]);
  });

  it("copies a template with fresh ids, and puts pages back on the default when one goes", () => {
    const res = addTemplate(doc(), "home", "Holiday");
    const copy = res.doc.templates.home?.[res.id]?.tree;
    expect(copy?.children?.[0]?.type).toBe("section");
    expect(copy?.id).not.toBe("home");
    const gone = removeTemplate(doc(), "page", "landing");
    expect(gone.templates.page?.landing).toBeUndefined();
    expect(gone.pages.about?.template).toBe("default");
    expect(gone.assignments.page?.default).toBe("default");
    expect(removeTemplate(doc(), "page", "default").templates.page?.default).toBeTruthy();
  });

  it("turns a section into a shared one, and back into a copy", () => {
    const res = makeShared(doc(), { kind: "template", type: "home", id: "default" }, "s1", "Promo")!;
    const home = treeAt(res.doc, { kind: "template", type: "home", id: "default" })!;
    expect(home.children?.[0]?.type).toBe("global_ref");
    expect(res.doc.globals[res.id]?.tree?.id).toBe("s1");
    expect(sharedUses(res.doc, res.id)).toHaveLength(1);
    const back = detachShared(res.doc, { kind: "template", type: "home", id: "default" }, res.refId)!;
    const again = treeAt(back, { kind: "template", type: "home", id: "default" })!;
    expect(again.children?.[0]?.type).toBe("section");
    expect(again.children?.[0]?.id).not.toBe("s1");
  });

  it("adds a Google font the site needs, once, and knows which fonts are in use", () => {
    const d = ensureFont(doc(), "Lora");
    expect(d.settings.fonts?.find((f) => f.family === "Lora")?.source).toBe("google");
    expect(ensureFont(d, "Lora")).toBe(d);
    expect(ensureFont(doc(), "Arial")).toEqual(doc());
    expect([...usedFamilies(doc())].sort()).toEqual(["Inter", "Lora"]);
  });

  it("gives a product its own template, and moves it rather than copying it", () => {
    let d = addTemplate(doc(), "product", "Gang sheets").doc;
    d = addTemplate(d, "product", "Apparel").doc;
    d = assignProducts(d, "gang_sheets", ["p1", "p2"]);
    expect(productsUsing(d, "gang_sheets").sort()).toEqual(["p1", "p2"]);
    d = assignProducts(d, "apparel", ["p2"]);
    expect(productsUsing(d, "gang_sheets")).toEqual(["p1"]);
    expect(productsUsing(d, "apparel")).toEqual(["p2"]);
    d = assignProducts(d, "gang_sheets", []);
    expect(d.assignments.product?.byId).toEqual({ p2: "apparel" });
    expect(removeTemplate(d, "product", "apparel").assignments.product?.byId).toEqual({});
  });

  it("points a server issue at the element it is about", () => {
    const hit = nodeForIssue(doc(), "templates.home.default.tree.children[0].children[0].props.text");
    expect(hit?.id).toBe("h1");
    expect(nodeForIssue(doc(), "parts.header.children[0]")?.id).toBe("hsec");
  });
});

describe("the editor's HTML cleaner", () => {
  it("removes scripts, handlers and javascript: links", () => {
    const out = cleanHtml('<p onclick="x()">Hi <a href="javascript:x()">a</a></p><script>x()</script><img src="x" onerror="y()">');
    expect(out).toContain("Hi");
    expect(out).not.toMatch(/script|onclick|onerror|javascript:/);
  });

  it("keeps formatting and safe links", () => {
    const out = cleanHtml('<p><strong>Bold</strong> <a href="/products" target="_blank">go</a></p>');
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain('href="/products"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("drops forms and iframes with what is inside them, and a script even inside a drawing", () => {
    expect(cleanHtml('<form><input name="card"></form><iframe src="https://x"></iframe><svg><script>1</script></svg>ok')).toBe("<svg></svg>ok");
  });

  it("keeps a drawing — stars, icons — but nothing in it that could run or load", () => {
    const stars = '<svg viewBox="0 0 83 15" role="img" aria-label="5 stars"><g fill="#f5a31a"><polygon transform="translate(17 0)" points="7.5,0.8 9.7,5.3"/></g></svg>';
    const out = cleanHtml(stars);
    expect(out).toContain('viewBox="0 0 83 15"');
    expect(out).toContain('<polygon transform="translate(17 0)" points="7.5,0.8 9.7,5.3"></polygon>');
    expect(out).toContain('fill="#f5a31a"');
    const bad = cleanHtml('<svg onload="x()"><a href="javascript:x"><circle r="2"/></a><use href="https://evil.test/s.svg#a"/><use href="#ok"/>'
      + '<rect fill="url(https://evil.test/p)" width="2"/><animate attributeName="href" values="javascript:x"/><foreignObject><p>t</p></foreignObject></svg>');
    expect(bad).not.toMatch(/onload|javascript|evil\.test|animate|foreignobject/i);
    expect(bad).toContain('<use href="#ok"></use>');
    expect(bad).toContain('<rect width="2"></rect>');
  });

  it("keeps a Google Fonts link and no other stylesheet", () => {
    expect(cleanHtml('<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" onload="x()">'))
      .toBe('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap">');
    expect(cleanHtml('<link rel="stylesheet" href="https://evil.test/x.css">ok')).toBe("ok");
  });

  it("confines CSS to its block and drops @import and fixed positioning", () => {
    const css = scopeCss('h2 { color: red } @import url(https://e.test/x.css); p { position: fixed; color: blue } @media (max-width: 600px) { h2 { color: green } }', '[data-b="b1"]');
    expect(css).toContain('[data-b="b1"] h2 { color: red }');
    expect(css).toContain('[data-b="b1"] p { color: blue }');
    expect(css).toContain('@media (max-width: 600px) { [data-b="b1"] h2 { color: green } }');
    expect(css).not.toMatch(/@import|fixed|e\.test/);
  });

  it("keeps what pasted designs are made of, @supports and @container too — as the server does", () => {
    const css = scopeCss(".hero { box-sizing: border-box; container-type: inline-size; cursor: pointer; outline-offset: 2px }"
      + ' .hero::before { content: "\\2605" } .icon { fill: #f60 } table { border-collapse: collapse }'
      + " @supports (font-size: 1cqw) { .logo { width: clamp(124px, 35.3cqw, 200px) } }"
      + " @container (min-width: 600px) { .grid { display: grid } }"
      + " .a { content: url(http://x.test/a.png); position: sticky }", '[data-b="b1"]');
    expect(css).toContain('[data-b="b1"] .hero { box-sizing: border-box; container-type: inline-size; cursor: pointer; outline-offset: 2px }');
    expect(css).toContain('[data-b="b1"] .hero::before { content: "\\2605" }');
    expect(css).toContain('[data-b="b1"] .icon { fill: #f60 }');
    expect(css).toContain('@supports (font-size: 1cqw) { [data-b="b1"] .logo { width: clamp(124px, 35.3cqw, 200px) } }');
    expect(css).toContain('@container (min-width: 600px) { [data-b="b1"] .grid { display: grid } }');
    expect(css).not.toMatch(/x\.test|sticky/);
  });

  it("keeps a Custom HTML block's drawing inside its own box", () => {
    // Without this, an absolutely positioned div in the header covered the cart's
    // checkout button with a link somewhere else (seen in the browser).
    const rule = /\.bsite \.b-html\{([^}]*)\}/.exec(BASE_CSS)?.[1] ?? "";
    for (const part of ["position:relative", "contain:paint", "isolation:isolate"]) expect(rule).toContain(part);
  });

  it("accepts only links and pictures that cannot run anything", () => {
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("//evil.test")).toBe("");
    expect(safeHref("/collections/tees")).toBe("/collections/tees");
    expect(safeSrc('https://x.test/a.png") , url(evil')).toBe("");
    expect(safeSrc("http://x.test/a.png")).toBe("");
  });
});

function data(over: Partial<SitePayload["data"]> = {}): SitePayload["data"] {
  return {
    product: null, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {},
    store: { name: "Innterflow", logo: "" }, ...over,
  };
}

function html(tree: BuilderNode, ctx: Partial<RenderCtx> = {}) {
  return renderToStaticMarkup(<Tree tree={tree} ctx={{ data: data(), globals: {}, page: null, query: "", route: "home", ...ctx }} />);
}

describe("what the storefront gets", () => {
  it("marks every element with its id, which its styles are scoped to", () => {
    const out = html({ id: "s1", type: "section", props: { width: "wide" }, children: [{ id: "h1", type: "heading", props: { text: "Hello", level: 1 } }] });
    expect(out).toContain('data-b="s1"');
    expect(out).toContain('<h1 data-b="h1" class="b-heading">Hello</h1>');
    expect(out).toContain("b-in-wide");
  });

  it("shows nothing — not a placeholder — for missing data on the storefront, and says why in the editor", () => {
    const grid: BuilderNode = { id: "g1", type: "product_grid", props: { source: "newest" } };
    expect(html(grid)).toBe("");
    expect(html(grid, { edit: true })).toContain("Loading products");
    const menu: BuilderNode = { id: "m1", type: "menu", props: { menuId: "gone" } };
    expect(html(menu)).toBe("");
  });

  it("draws a product grid from the cards it was handed", () => {
    const out = html({ id: "g1", type: "product_grid" }, { data: data({ grids: { g1: [
      { title: "Tee", url: "/products/tee", image: "https://ik.test/t.jpg", price: "$12.00", badge: "New", text: "" },
    ] } }) });
    expect(out).toContain('href="/products/tee"');
    expect(out).toContain("$12.00");
    expect(out).toContain("b-badge");
  });

  it("draws a menu with its dropdowns and a drawer button", () => {
    const out = html({ id: "m1", type: "menu", props: { menuId: "main" } }, { data: data({ menus: { main: [
      { label: "Shop", href: "/products", children: [{ label: "Hoodies", href: "/collections/hoodies" }] },
      { label: "Bad", href: "javascript:alert(1)" },
    ] } }) });
    expect(out).toContain("Hoodies");
    expect(out).toContain("b-menu-sub");
    expect(out).toContain("b-menu-toggle");
    expect(out).not.toContain("javascript:");
  });

  it("puts the marks on the buy box that the shop's own buying code binds to", () => {
    const product = {
      id: "p1", slug: "tee", name: "Tee", pricing_mode: "variant", from_price: 12, gang_sheet: false,
      images: [], variants: [], colours: [{ label: "Red", hex: "#ff0000" }], sizes: [{ label: "M" }], options: [], qty_tiers: [],
    };
    const ctxData = data({ product: product as unknown as Record<string, unknown> });
    const buy = html({ id: "b1", type: "product_buy", props: {} }, { data: ctxData, route: "product" });
    expect(buy).toContain('class="variant-group"');
    expect(buy).toContain('data-label="Red"');
    expect(buy).toContain('data-theme-buy="cart"');
    expect(buy).toContain('data-then="/cart"');
    expect(buy).toContain('data-theme-qty="1"');
    expect(html({ id: "pp", type: "product_price" }, { data: ctxData })).toContain('data-theme-price="1"');
  });

  it("sends a gang-sheet product to its builder, never to the cart directly", () => {
    const product = {
      id: "p2", slug: "gs", name: "Gang sheet", pricing_mode: "variant", from_price: 20, gang_sheet: true, gang_sheet_type: "gang_sheet",
      images: [], variants: [], colours: [], sizes: [], options: [], sheets: [{ sheet_id: "s22", label: "22 x 24", price: 20 }],
    };
    const out = html({ id: "b1", type: "product_buy" }, { data: data({ product: product as unknown as Record<string, unknown> }) });
    expect(out).toContain('data-theme-buy="builder"');
    expect(out).toContain('data-sheet-id="s22"');
    expect(out).not.toContain('data-theme-buy="cart"');
  });

  it("cleans Custom HTML drawn from a draft, and trusts what the server already cleaned", () => {
    const node: BuilderNode = { id: "hx", type: "html", props: { html: '<p onclick="x()">Hi</p><script>x()</script>', css: "p{color:red}" } };
    const draft = html(node, { edit: true });
    expect(draft).not.toMatch(/onclick|<script/);
    expect(draft).toContain('.bsite [data-b="hx"] p { color:red }'.replace("color:red", "color: red"));
  });

  it("does not let a shared section include itself", () => {
    const loop: BuilderNode = { id: "r1", type: "global_ref", props: { ref: "g1" } };
    const out = html(loop, { edit: true, globals: { g1: { id: "inner", type: "stack", children: [{ id: "r2", type: "global_ref", props: { ref: "g1" } }] } } });
    expect(out).toContain("cannot include itself");
  });

  it("puts a page's own content where its template says", () => {
    const tpl: BuilderNode = { id: "t", type: "stack", children: [{ id: "pt", type: "page_title" }, { id: "pc", type: "page_content" }] };
    const out = html(tpl, { route: "page", page: { title: "About us", tree: { id: "pg", type: "stack", children: [{ id: "tx", type: "text", props: { text: "We print." } }] } } });
    expect(out).toContain("About us");
    expect(out).toContain("We print.");
  });

  it("shows a still picture of a cart in the editor, never the admin's own cart", () => {
    const tpl: BuilderNode = { id: "c", type: "stack", children: [{ id: "ci", type: "cart_items" }] };
    expect(findType(tpl, "cart_items")?.id).toBe("ci");
    expect(findType(tpl, "product_buy")).toBeNull();
    const out = html(tpl, { edit: true, route: "cart" });
    expect(out).toContain('data-b="ci"');
    expect(out).toContain("The shopper&#x27;s cart shows here");
  });

  it("can draw every element the registry offers without throwing", () => {
    for (const c of REGISTRY) {
      const node = createNode(c.type)!;
      expect(() => html(node, { edit: true })).not.toThrow();
    }
  });
});
