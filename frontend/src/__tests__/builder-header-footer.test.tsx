/**
 * The header and footer, and staying inside a phone's screen.
 *
 * Three things are held here. A footer is a brand column and as many menu
 * columns as the merchant adds. A header and a footer are styled with what a
 * merchant asks for by name — link colour, hover, heading colour, a font, a
 * line under it — and a logo is sized by its own settings, never a fixed cap.
 * And nothing a merchant sets for a desktop is allowed to make a phone's page
 * wider than its screen: a fixed width, a row told not to wrap, a pasted table.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tree, type RenderCtx } from "@/components/builder/render";
import { BASE_CSS } from "@/lib/builder/baseCss";
import { addFooterColumn, addFooterTextColumn, withSimpleFooter } from "@/lib/builder/doc";
import { BY_TYPE, PRESETS, menuColumn, simpleFooter, textColumn } from "@/lib/builder/registry";
import { nodeCss, treeCss } from "@/lib/builder/style";
import { findNode, walk } from "@/lib/builder/tree";
import type { BuilderNode, SiteDoc, SitePayload } from "@/lib/builder/types";
import { EDITOR_CSS } from "@/components/builder/editor/ui";
import starter from "./fixtures/starter-doc.json";

const TABLET = "@container bsite (max-width:1024px)";
const PHONE = "@container bsite (max-width:640px)";
const n = (type: string, props: Record<string, unknown> = {}, style: BuilderNode["style"] = {}, children?: BuilderNode[], more: Partial<BuilderNode> = {}): BuilderNode =>
  ({ id: `${type}_${Math.random().toString(36).slice(2, 8)}`, type, props, style, ...(children ? { children } : {}), ...more });
const row = (children: BuilderNode[], style: BuilderNode["style"] = {}, more: Partial<BuilderNode> = {}) =>
  n("stack", { direction: "row" }, { flexWrap: "nowrap", ...style }, children, more);
const types = (tree: BuilderNode | null) => { const out: string[] = []; walk(tree, (x) => { out.push(x.type); }); return out; };

function data(over: Partial<SitePayload["data"]> = {}): SitePayload["data"] {
  return { product: null, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "Northwind", logo: "https://cdn.example/shop-logo.png" }, ...over };
}
const html = (tree: BuilderNode, ctx: Partial<RenderCtx> = {}) =>
  renderToStaticMarkup(<Tree tree={tree} ctx={{ data: data(), globals: {}, page: null, query: "", route: "home", ...ctx }} />);

// ── A phone's screen ─────────────────────────────────────────────────────────
describe("nothing set for a desktop makes a phone's page wider than its screen", () => {
  it("guards the page itself, and holds every element to what holds it", () => {
    expect(BASE_CSS).toMatch(/\.bsite\{[^}]*overflow-x:clip/);
    expect(BASE_CSS).toContain(".bsite :where([data-b]){max-width:100%}");
  });

  it("treats a least width as a wish, never a way to be wider than the screen", () => {
    expect(nodeCss(n("stack", {}, { minWidth: "700px" }))).toContain("min-width:min(700px,100%)");
    expect(nodeCss(n("stack", {}, { minWidth: 320 }))).toContain("min-width:min(320px,100%)");
    // A share of the space is already relative: left alone.
    expect(nodeCss(n("stack", {}, { minWidth: "50%" }))).toContain("min-width:50%");
  });

  it("lets a row told not to wrap move on to a second line on a narrower screen", () => {
    const css = nodeCss(row([n("button", { text: "One" }), n("button", { text: "Two" })]));
    expect(css).toContain("flex-wrap:nowrap");
    expect(css).toContain(`${TABLET}{`);
    expect(css.slice(css.indexOf(TABLET))).toContain("flex-wrap:wrap");
  });

  it("keeps what the merchant chose for that device", () => {
    const kept = nodeCss(row([n("button")], {}, { tablet: { flexWrap: "nowrap" } }));
    expect(kept.slice(kept.indexOf(TABLET))).not.toContain("flex-wrap:wrap");
    const scroller = nodeCss(row([n("button")], { overflow: "auto" }));
    expect(scroller).not.toContain("flex-wrap:wrap");
    const column = nodeCss(n("stack", { direction: "column" }, { flexWrap: "nowrap" }, [n("button")]));
    expect(column).not.toContain("flex-wrap:wrap");
  });

  it("leaves a header bar on one line — its logo gives way instead", () => {
    const bar = row([
      n("logo"), n("menu", { menuId: "m", layout: "horizontal", mobile: "drawer" }),
      row([n("search", { style: "icon" }), n("cart_link")]),
    ]);
    expect(treeCss(bar)).not.toContain("flex-wrap:wrap");
    expect(BASE_CSS).toMatch(/\.b-logo\)\{[^}]*min-width:0/);
    expect(BASE_CSS).toContain(".bsite :where(.b-iconlink,.b-menu-toggle){flex:0 0 auto}");
  });

  it("but wraps a bar that carries more than a phone's line can hold", () => {
    const full = row([n("logo"), n("menu", { menuId: "m", layout: "horizontal", mobile: "inline" }), n("cart_link")]);
    expect(nodeCss(full)).toContain("flex-wrap:wrap");
    const searching = row([n("store_name"), n("search", { style: "field" }), n("cart_link")]);
    expect(nodeCss(searching)).toContain("flex-wrap:wrap");
  });

  it("holds a negative side margin to the screen's gutter on a tablet and a phone", () => {
    const css = nodeCss(n("text", { text: "x" }, { marginLeft: "-60px", marginRight: -60 }));
    expect(css).toContain("margin-left:-60px");
    expect(css).toContain(`${TABLET}{`);
    expect(css).toContain("margin-left:max(-60px,-20px)");
    expect(css).toContain("margin-right:max(-60px,-20px)");
    expect(css).toContain("margin-left:max(-60px,-16px)");
    // A small pull, or one set for the phone itself, is the merchant's own.
    expect(nodeCss(n("text", {}, { marginLeft: "-8px" }))).not.toContain("max(");
    const own = nodeCss(n("text", {}, { marginLeft: "-60px" }, undefined, { mobile: { marginLeft: "-40px" } }));
    expect(own.slice(own.indexOf(PHONE))).toContain("margin-left:-40px");
    expect(own.slice(own.indexOf(PHONE))).not.toContain("max(");
  });

  it("changes nothing for a site made before this", () => {
    const doc = starter as unknown as SiteDoc;
    const css = treeCss(doc.parts.header, doc.parts.footer, doc.templates.home!.default!.tree);
    // No row re-wrapped, no margin held back, no least width rewritten: the
    // starter's rules are, character for character, what they were (the file
    // snapshot in builder-layout-compat holds the whole stylesheet to that).
    expect(css).not.toContain("flex-wrap:wrap");
    expect(css).not.toMatch(/margin-(left|right):max\(/);
    expect(css).not.toMatch(/min-width:min\(/);
  });
});

describe("pasted markup stays inside its block", () => {
  it("keeps Custom HTML's drawing inside its own box, and lets wide content scroll there", () => {
    const rule = /\.bsite \.b-html\{([^}]*)\}/.exec(BASE_CSS)?.[1] ?? "";
    for (const part of ["position:relative", "contain:paint", "isolation:isolate", "overflow-y:hidden"]) expect(rule).toContain(part);
    expect(BASE_CSS).toContain(".bsite :where(.b-rich,.b-html){max-width:100%;overflow-x:auto;overflow-wrap:anywhere;scrollbar-width:thin}");
  });

  it("makes whatever is pasted no wider than the block, without outweighing the merchant's own CSS", () => {
    // :where() weighs nothing, so a rule the merchant writes for their own markup wins.
    expect(BASE_CSS).toContain(".bsite :where(.b-rich,.b-html) :where(*){max-width:100%}");
    expect(BASE_CSS).toContain(".bsite :where(.b-rich,.b-html) :where(img[width],video[width]){height:auto}");
    expect(BASE_CSS).toContain(".bsite :where(.b-rich,.b-html) :where(pre){overflow-x:auto");
  });

  it("keeps a table's words whole so it scrolls, rather than squeezing it a letter wide", () => {
    expect(BASE_CSS).toContain(".bsite :where(.b-rich,.b-html) :where(table){max-width:none;overflow-wrap:normal;word-break:normal}");
  });

  it("lets a long label wrap inside its button, and a long word break in a heading or a question", () => {
    const btn = /\.bsite :where\(\.b-btn\)\{([^}]*)\}/.exec(BASE_CSS)?.[1] ?? "";
    expect(btn).toContain("white-space:normal");
    expect(btn).toContain("max-width:100%");
    expect(BASE_CSS).toMatch(/\.b-heading\)\{overflow-wrap:anywhere/);
    expect(BASE_CSS).toMatch(/\.b-faq summary\)\{[^}]*overflow-wrap:anywhere/);
  });
});

// ── The editor around the page ───────────────────────────────────────────────
describe("the editor's own styles stay off the page being edited", () => {
  // The page is drawn inside the editor. A rule there for "every button" took
  // the white label off the page's Add to cart and Subscribe buttons — dark on
  // dark with a dark brand colour, and only in the editor.
  it("never names a bare element without leaving the page's own out", () => {
    const bare = EDITOR_CSS.split(/\r?\n/).filter((line) => /^\.sbe (?::is\()?(?:button|input|select|textarea|a|h[1-6]|p|ul|li|img)\b/.test(line));
    expect(bare.length).toBeGreaterThanOrEqual(3);
    for (const rule of bare) expect(rule, rule).toMatch(/:not\(\.bsite \*\)\)?\{/);
  });

  it("so a button on the page keeps the label colour the shop gives it", () => {
    expect(EDITOR_CSS).toContain(".sbe button:where(:not(.bsite *)){font:inherit;color:inherit}");
    expect(EDITOR_CSS).toContain(".sbe :is(input,select,textarea):where(:not(.bsite *)){font:inherit;color:#14161B}");
    expect(EDITOR_CSS).not.toMatch(/^\.sbe button\{/m);
    expect(BASE_CSS).toContain(".bsite :where(.b-btn-solid){background:var(--b-primary,#14161B);color:#fff}");
  });

  it("without outweighing the editor's own buttons — Publish keeps its white label", () => {
    // Leaving the page out must not add weight: bare, ":not(.bsite *)" counts as
    // a class and the reset then beats ".sbe-btn.primary" — black on black.
    // Inside :where() it counts for nothing, as it did before the page was left out.
    expect(EDITOR_CSS).not.toMatch(/^\.sbe button:not\(/m);
    expect(EDITOR_CSS).not.toMatch(/^\.sbe :is\(input,select,textarea\):not\(/m);
    expect(EDITOR_CSS).toContain(".sbe-btn.primary{background:#14161B;border-color:#14161B;color:#fff}");
  });
});

// ── Styling a header and a footer ────────────────────────────────────────────
describe("a header and a footer are styled by name", () => {
  it("hands link, hover and heading colours down to everything inside", () => {
    const css = nodeCss(n("section", {}, { linkColor: "#ffffff", linkHoverColor: "#FFD400", headingColor: "#eeeeee" }));
    expect(css).toContain("--b-link:#ffffff");
    expect(css).toContain("--b-link-hover:#FFD400");
    expect(css).toContain("--b-head:#eeeeee");
    expect(BASE_CSS).toContain(".bsite :where(a){color:var(--b-link,inherit)}");
    expect(BASE_CSS).toContain(".bsite :where(a:hover){color:var(--b-link-hover,var(--b-link,inherit))}");
    expect(BASE_CSS).toMatch(/\.b-heading\)\{[^}]*color:var\(--b-head,inherit\)/);
  });

  it("draws nothing differently until one of them is set", () => {
    // The fallbacks are what the rules were before: links and headings inherit.
    expect(nodeCss(n("section", {}, { backgroundColor: "#111111" }))).not.toContain("--b-");
  });

  it("colours the phone's menu button and the dropdown arrows like the links they stand for", () => {
    // Left to inherit, they took the bar's text colour: a dark ☰ on a dark header whose links are white.
    expect(BASE_CSS).toMatch(/\.b-menu-toggle\)\{[^}]*color:var\(--b-link,inherit\)/);
    expect(BASE_CSS).toMatch(/\.b-menu-caret\)\{[^}]*color:var\(--b-link,inherit\)/);
  });

  it("does not let a dark header's white links follow them into a white dropdown", () => {
    expect(BASE_CSS).toMatch(/\.b-menu-sub\)\{--b-link:initial;--b-link-hover:initial;/);
  });

  it("gives a text size and weight set on the bar to the menus in it, keeping their default otherwise", () => {
    const css = nodeCss(n("section", {}, { fontSize: "14px", fontWeight: 600, fontFamily: "Inter" }));
    expect(css).toContain("font-size:14px");
    expect(css).toContain("--b-fs:14px");
    expect(css).toContain("--b-fw:600");
    expect(BASE_CSS).toMatch(/\.b-menu\)\{[^}]*font-size:var\(--b-fs,15px\);font-weight:var\(--b-fw,500\)/);
    // A single element's own size is its own business.
    expect(nodeCss(n("text", {}, { fontSize: "14px" }))).not.toContain("--b-fs");
  });

  it("draws a line on one side: under a header, over a footer", () => {
    const css = nodeCss(n("section", {}, { borderBottomWidth: "1px", borderColor: "#ECECEC" }));
    expect(css).toContain("border-bottom-width:1px");
    expect(css).toContain("border-bottom-style:solid");
    expect(css).not.toContain("border-top");
    expect(nodeCss(n("section", {}, { borderTopWidth: 2 }))).toContain("border-top-width:2px;border-top-style:solid");
  });

  it("offers those settings on every container, and link colours on a menu", () => {
    for (const type of ["section", "stack", "column", "row"]) {
      expect(BY_TYPE[type]!.styles, type).toEqual(expect.arrayContaining(["typography", "links", "spacing", "background"]));
    }
    expect(BY_TYPE.section!.styles).toContain("border");
    expect(BY_TYPE.menu!.styles).toEqual(expect.arrayContaining(["typography", "links", "spacing"]));
  });
});

// ── The logo ─────────────────────────────────────────────────────────────────
describe("the logo", () => {
  it("shows the shop's own logo until one is chosen for it", () => {
    expect(html(n("logo", { fallback: "name" }))).toContain('src="https://cdn.example/shop-logo.png"');
    const own = html(n("logo", { image: "https://cdn.example/footer-logo.png", alt: "Northwind Print" }));
    expect(own).toContain('src="https://cdn.example/footer-logo.png"');
    expect(own).toContain('alt="Northwind Print"');
    expect(own).not.toContain("shop-logo.png");
  });

  it("refuses a picture address that is not a safe one", () => {
    const out = html(n("logo", { image: "javascript:alert(1)" }));
    expect(out).not.toContain("javascript:");
    expect(out).toContain("shop-logo.png");
  });

  it("is sized by its own width, height and widest settings — on the link, per device", () => {
    const logo = n("logo", {}, { width: "180px" }, undefined, { mobile: { width: "120px", maxWidth: "60%" } });
    const out = html(logo);
    expect(out).toContain("data-w");
    expect(out).not.toContain("data-auto");
    expect(out).not.toMatch(/style="[^"]*height/);
    const css = nodeCss(logo);
    expect(css).toContain("width:180px");
    expect(css.slice(css.indexOf(PHONE))).toContain("width:120px");
    expect(css.slice(css.indexOf(PHONE))).toContain("max-width:60%");
    // The picture fills what was set and keeps its shape in the other direction.
    expect(BASE_CSS).toContain(".bsite :where(.b-logo[data-w] img){width:100%}");
    expect(BASE_CSS).toContain(".bsite :where(.b-logo[data-h] img){height:100%}");
    expect(html(n("logo", {}, { height: "48px" }))).toContain("data-h");
  });

  it("has no fixed size of its own: the only cap is a default for a logo nobody sized", () => {
    expect(BASE_CSS).toContain(".bsite :where(.b-logo img){width:auto;max-width:100%;object-fit:contain}");
    expect(BASE_CSS).toContain(".bsite :where(.b-logo[data-auto] img){max-width:min(240px,100%)}");
    expect(BASE_CSS).not.toMatch(/\.b-logo img\)\{[^}]*max-width:\d+px/);
  });

  it("keeps a logo from before exactly as it was: its height, and the modest widest size", () => {
    const out = html(n("logo", { height: 36, fallback: "name" }));
    expect(out).toMatch(/style="height:36px"/);
    expect(out).toContain("data-auto");
    expect(out).not.toContain("data-w");
    expect(out).not.toContain("data-h");
  });

  it("can be put left, centre or right", () => {
    expect(html(n("logo", { align: "center" }))).toContain('data-align="center"');
    expect(html(n("logo", { align: "sideways" }))).not.toContain("data-align");
    expect(BASE_CSS).toContain(".bsite :where(.b-logo[data-align=center]){align-self:center;margin-inline:auto}");
  });

  it("offers the picture, the alignment and — beside them — its size and spacing", () => {
    const def = BY_TYPE.logo!;
    expect(def.fields.map((f) => f.key)).toEqual(expect.arrayContaining(["image", "alt", "align", "fallback"]));
    expect(def.fields.find((f) => f.key === "image")!.kind).toBe("image");
    expect(def.styles).toEqual(["logosize", "spacing"]);
    expect(def.inline).toEqual(["logosize", "spacing"]);
    const made = def.create();
    expect(made.style?.height).toBe("40px");
    expect((made.props as Record<string, unknown>).height).toBeUndefined();
  });
});

// ── The footer ───────────────────────────────────────────────────────────────
describe("the footer: a brand column and a column for each menu", () => {
  const menus = { shop: [{ label: "Tees", href: "/collections/tees" }, { label: "Hoodies", href: "/collections/hoodies" }] };

  it("is a logo, a tagline and a few words, then one column per menu, then a column of text", () => {
    const footer = simpleFooter([{ title: "Shop", menuId: "a" }, { title: "Help", menuId: "b" }, { title: "Company", menuId: "c" }], "Northwind");
    expect(footer.type).toBe("section");
    const rowOf = footer.children![0]!;
    const [brand, ...columns] = rowOf.children!;
    expect(types(brand!)).toEqual(["stack", "logo", "text", "text"]);
    const menus = columns.filter((c) => c.type === "menu");
    expect(menus.map((c) => [(c.props as Record<string, unknown>).title, (c.props as Record<string, unknown>).menuId, (c.props as Record<string, unknown>).layout]))
      .toEqual([["Shop", "a", "vertical"], ["Help", "b", "vertical"], ["Company", "c", "vertical"]]);
    // The last column is not links: a title, and lines of text under it.
    expect(types(columns.at(-1)!)).toEqual(["stack", "heading", "rich_text"]);
    expect(columns).toHaveLength(4);
    expect(JSON.stringify(footer)).toContain("© Northwind");
  });

  it("is a row that wraps: columns side by side while they fit, the last ones onto the next line when they do not", () => {
    const seven = simpleFooter(Array.from({ length: 7 }, (_, i) => ({ title: `Menu ${i + 1}` })));
    const rowOf = seven.children![0]!;
    expect(rowOf.children).toHaveLength(9);
    expect((rowOf.props as Record<string, unknown>).direction).toBe("row");
    expect(nodeCss(rowOf)).toContain("flex-wrap:wrap");
    // The brand is the widest, and every other column takes an equal share — none narrower than is worth reading.
    expect(nodeCss(rowOf.children![0]!)).toMatch(/flex-grow:3;flex-basis:280px|flex-basis:280px;flex-grow:3/);
    for (const col of rowOf.children!.slice(1)) expect(nodeCss(col)).toMatch(/flex-grow:1;flex-basis:160px|flex-basis:160px;flex-grow:1/);
    // Nothing is set for a tablet or a phone: the wrapping is the layout.
    expect(rowOf.tablet).toBeUndefined();
    expect(rowOf.mobile).toBeUndefined();
  });

  it("has a column for plain text — an email, a phone number, a town — under its own title", () => {
    const col = textColumn("Talk to us");
    expect(types(col)).toEqual(["stack", "heading", "rich_text"]);
    const out = html(col);
    expect(out).toContain("Talk to us");
    expect(out).toContain("hello@yourshop.com");
    // Not a menu: nothing in it is a link to a page.
    expect(out).not.toContain("b-menu");
  });

  it("shows a column's title over its links, down the page", () => {
    const out = html(menuColumn("Shop", "shop"), { data: data({ menus }) });
    expect(out).toContain('data-layout="vertical"');
    expect(out).toMatch(/<div class="b-menu-title">Shop<\/div>/);
    expect(out).toContain('href="/collections/tees"');
    expect(out).toContain('aria-label="Shop"');
    expect(out.indexOf("b-menu-title")).toBeLessThan(out.indexOf("b-menu-list"));
    // No title, no heading.
    expect(html(n("menu", { menuId: "shop", layout: "vertical" }), { data: data({ menus }) })).not.toContain("b-menu-title");
  });

  it("says what to do in the editor while a column has no menu yet, and draws nothing on the shop", () => {
    const column = menuColumn("Help");
    expect(html(column)).toBe("");
    const editing = html(column, { edit: true });
    expect(editing).toContain("Help");
    expect(editing).toContain("Choose which menu these links come from");
  });

  it("adds a column beside the others", () => {
    const doc = { ...(starter as unknown as SiteDoc), parts: { ...(starter as unknown as SiteDoc).parts, footer: simpleFooter([{ title: "Shop", menuId: "a" }]) } };
    const res = addFooterColumn(doc, "Help")!;
    const rowOf = res.doc.parts.footer!.children![0]!;
    // With the other menus, before the column of text that closes the row.
    expect(rowOf.children!.map((c) => c.type)).toEqual(["stack", "menu", "menu", "stack"]);
    const added = findNode(res.doc.parts.footer!, res.id)!;
    expect(added.type).toBe("menu");
    expect(added.props).toMatchObject({ title: "Help", layout: "vertical", menuId: "" });
    expect(added.style).toMatchObject({ flexGrow: 1, flexBasis: "160px" });
    // And again, and again: there is no limit.
    let d = res.doc;
    for (let i = 0; i < 5; i++) d = addFooterColumn(d, `More ${i}`)!.doc;
    expect(d.parts.footer!.children![0]!.children).toHaveLength(9);
    // The footer it was given is untouched.
    expect(doc.parts.footer!.children![0]!.children).toHaveLength(3);
  });

  it("adds a column of text at the end of the row", () => {
    const doc = { ...(starter as unknown as SiteDoc), parts: { ...(starter as unknown as SiteDoc).parts, footer: simpleFooter([{ title: "Shop", menuId: "a" }]) } };
    const res = addFooterTextColumn(doc, "Visit us")!;
    const rowOf = res.doc.parts.footer!.children![0]!;
    expect(rowOf.children!.map((c) => c.type)).toEqual(["stack", "menu", "stack", "stack"]);
    const added = findNode(res.doc.parts.footer!, res.id)!;
    expect(types(added)).toEqual(["stack", "heading", "rich_text"]);
    expect((added.children![0]!.props as Record<string, unknown>).text).toBe("Visit us");
    expect(added.style).toMatchObject({ flexGrow: 1, flexBasis: "160px" });
  });

  it("adds a column of text to an older footer built from a row of columns, too", () => {
    const doc = starter as unknown as SiteDoc;
    const rowBefore = (() => { let r: BuilderNode | null = null; walk(doc.parts.footer!, (x) => { if (!r && x.type === "row") r = x; }); return r as BuilderNode | null; })()!;
    const res = addFooterTextColumn(doc)!;
    const rowAfter = findNode(res.doc.parts.footer!, rowBefore.id)!;
    expect(rowAfter.children).toHaveLength(rowBefore.children!.length + 1);
    expect(types(rowAfter.children!.at(-1)!)).toEqual(["column", "stack", "heading", "rich_text"]);
    // In a column of a row the column itself is the share of the row; nothing more is said.
    expect(findNode(res.doc.parts.footer!, res.id)!.style?.flexBasis).toBeUndefined();
  });

  it("adds a column to an older footer built from a row of columns, too", () => {
    const doc = starter as unknown as SiteDoc;       // the footer new shops used to start with
    const before = doc.parts.footer!;
    const rowBefore = (() => { let r: BuilderNode | null = null; walk(before, (x) => { if (!r && x.type === "row") r = x; }); return r as BuilderNode | null; })()!;
    const res = addFooterColumn(doc, "Help")!;
    const rowAfter = findNode(res.doc.parts.footer!, rowBefore.id)!;
    expect(rowAfter.children).toHaveLength(rowBefore.children!.length + 1);
    expect(rowAfter.children!.every((c) => c.type === "column")).toBe(true);
    expect(rowAfter.style?.columns).toBe(rowBefore.children!.length + 1);
    expect(types(rowAfter.children!.at(-1)!)).toEqual(["column", "menu"]);
    expect(findNode(res.doc.parts.footer!, res.id)!.props).toMatchObject({ title: "Help" });
  });

  it("can replace an older footer with the simple one, keeping its menus under their titles", () => {
    const doc = starter as unknown as SiteDoc;
    const oldMenus: string[] = [];
    walk(doc.parts.footer!, (x) => { if (x.type === "menu") oldMenus.push(String((x.props as Record<string, unknown>).menuId ?? "")); });
    const next = withSimpleFooter(doc, "Northwind");
    const rowOf = next.parts.footer!.children![0]!;
    const columns = rowOf.children!.filter((c) => c.type === "menu");
    expect(columns.map((c) => (c.props as Record<string, unknown>).menuId)).toEqual(oldMenus);
    // The older footer titled its menu with a heading above it: that becomes the column's title.
    expect((columns[0]!.props as Record<string, unknown>).title).toBe("Shop");
    expect(types(next.parts.footer!)).not.toContain("newsletter");
    expect(next.parts.header).toBe(doc.parts.header);
  });

  it("offers the footer and a single menu column as ready-made pieces", () => {
    const keys = PRESETS.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["footer_simple", "menu_column"]));
    expect(PRESETS.find((p) => p.key === "menu_column")!.kind).toBe("block");
    expect(PRESETS.find((p) => p.key === "menu_column")!.create().type).toBe("menu");
    expect(BY_TYPE.menu!.fields.map((f) => f.key)).toEqual(expect.arrayContaining(["title", "menuId"]));
  });
});
