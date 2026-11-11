/**
 * Site builder → Pages → Import a design (lib/builder/importHtml). Reading a
 * design needs a browser's layout, which jsdom does not have, so the reading
 * is checked in a real browser before release (the owner's wireframes and a
 * Tailwind page, each published locally and compared side by side at a
 * computer's and a phone's width). These are the parts that need no layout:
 * how a design is made safe to read, colours, and how the result goes into
 * the draft.
 */
import { describe, expect, it } from "vitest";
import { applyImport, dropAsset, hexColour, placeUpload, prepareHtml, type ImportedDesign } from "@/lib/builder/importHtml";
import type { BuilderNode, SiteDoc } from "@/lib/builder/types";

const section = (id: string, children: BuilderNode[] = []): BuilderNode => ({ id, type: "section", props: { width: "contained" }, style: {}, children });
const stack = (id: string, children: BuilderNode[]): BuilderNode => ({ id, type: "stack", props: {}, style: {}, children });

function site(): SiteDoc {
  return {
    schema: 1,
    settings: { fonts: [{ family: "Inter", source: "google", weights: [400, 700] }], typography: {}, layout: { containerWidth: 1200 }, colors: { primary: "#111111" } },
    parts: { header: section("old-header"), footer: section("old-footer"), announcement: { id: "old-bar", type: "announcement_bar", props: { text: "Old news" } } },
    templates: { home: { default: { name: "Home", tree: stack("old-home", []) } }, page: { default: { name: "Default page", tree: null }, full_width: { name: "Full width", tree: null } } },
    pages: { about: { title: "About us", template: "default", tree: stack("about", []) } },
    assignments: {}, globals: {}, saved: {},
  };
}

function design(over: Partial<ImportedDesign> = {}): ImportedDesign {
  const cta: BuilderNode = { id: "cta", type: "button", props: { text: "About", href: "/about" }, style: {} };
  return {
    pages: [
      { title: "Home", key: "home", tree: stack("new-home", [section("hero", [cta])]), sections: 1 },
      { title: "About", key: "about", tree: stack("new-about", [section("story")]), sections: 1 },
      { title: "Collection", key: "collection-page", tree: stack("new-coll", [section("grid")]), sections: 1 },
    ],
    announcement: null,
    header: section("new-header"),
    footer: section("new-footer"),
    menu: { node: { id: "m", type: "menu", props: { menuId: "" } }, items: [{ label: "About", href: "/about" }] },
    fonts: [{ family: "Sora", weights: [600, 800] }, { family: "Inter", weights: [500] }],
    headingFont: "Sora", bodyFont: "Inter", containerWidth: 1152,
    colors: { background: "#FAFAF8", text: "#16233A", primary: "#3A2FC9" },
    assets: [], warnings: [], count: 9,
    ...over,
  };
}

describe("reading a design safely", () => {
  it("takes its scripts out, keeps its buttons' page switches as data, and marks its own addresses", () => {
    const html = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><script>alert(1)</script></head>
      <body><button class="tab-btn" onclick="showTab('home',this)">Home</button><img src="hero.jpg" onerror="steal()"></body></html>`;
    const out = prepareHtml(html);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/http-equiv/i);
    expect(out).not.toMatch(/\sonclick=|\sonerror=/i);
    expect(out).toContain(`data-onclick="showTab('home',this)"`);
    expect(out).toContain('<base href="https://local.invalid/">');
  });

  it("reads colours as the builder writes them", () => {
    expect(hexColour("rgb(22, 35, 58)")).toBe("#16233A");
    expect(hexColour("rgba(0, 0, 0, 0)")).toBeNull();
    expect(hexColour("rgba(255, 255, 255, 0.5)")).toBe("#FFFFFF80");
    expect(hexColour("transparent")).toBeNull();
  });
});

describe("into the draft", () => {
  it("replaces the home page, header and footer, adds its pages, and takes the old bar away when the design has none", () => {
    const { doc, slugs } = applyImport(site(), design(), { pages: ["home", "about", "collection-page"], header: true, footer: true, look: true });
    expect(doc.templates.home!.default!.tree!.id).toBe("new-home");
    expect(doc.parts.header!.id).toBe("new-header");
    expect(doc.parts.footer!.id).toBe("new-footer");
    expect(doc.parts.announcement).toBeNull();
    // The shop's own About page stays; the design's gets the next free address, and links to it follow.
    expect(doc.pages.about!.title).toBe("About us");
    expect(slugs).toEqual(["about-2", "collection-page"]);
    expect(doc.pages["about-2"]!.template).toBe("full_width");
    const cta = doc.templates.home!.default!.tree!.children![0]!.children![0]!;
    expect(cta.props!.href).toBe("/about-2");
  });

  it("brings the design's fonts, colours and page width, keeping the site's own fonts", () => {
    const { doc } = applyImport(site(), design(), { pages: ["home"], header: false, footer: false, look: true });
    const fonts = Object.fromEntries((doc.settings.fonts ?? []).map((f) => [f.family, f.weights]));
    expect(fonts.Inter).toEqual([400, 500, 700]);
    expect(fonts.Sora).toEqual([600, 800]);
    expect(doc.settings.typography!.heading!.family).toBe("Sora");
    expect(doc.settings.typography!.body!.family).toBe("Inter");
    expect(doc.settings.layout!.containerWidth).toBe(1152);
    expect(doc.settings.colors!.primary).toBe("#3A2FC9");
    expect(doc.parts.header!.id).toBe("old-header");
    expect(doc.parts.announcement!.id).toBe("old-bar");
  });

  it("without the design's look, its elements use the site's own fonts", () => {
    const d = design();
    d.pages[0]!.tree.children![0]!.style = { fontFamily: "Sora", fontSize: "44px" };
    const { doc } = applyImport(site(), d, { pages: ["home"], header: false, footer: false, look: false });
    const hero = doc.templates.home!.default!.tree!.children![0]!;
    expect(hero.style!.fontFamily).toBeUndefined();
    expect(hero.style!.fontSize).toBe("44px");
    expect((doc.settings.fonts ?? []).map((f) => f.family)).toEqual(["Inter"]);
  });

  it("puts an uploaded picture's address everywhere it is used, and takes out one that could not be uploaded", () => {
    const img: BuilderNode = { id: "i", type: "image", props: { src: "data:image/png;base64,AAAA" }, style: {} };
    const hero: BuilderNode = { id: "h", type: "section", props: {}, style: { backgroundImage: "linear-gradient(red, blue), url(data:image/png;base64,AAAA)" },
      mobile: { backgroundImage: "url(data:image/png;base64,AAAA)" } };
    const asset = { key: "data:image/png;base64,AAAA", name: "picture.png", source: "data:image/png;base64,AAAA", uses: [
      { node: img, prop: "src" },
      { node: hero, at: "style" as const, key: "backgroundImage", from: "data:image/png;base64,AAAA" },
      { node: hero, at: "mobile" as const, key: "backgroundImage", from: "data:image/png;base64,AAAA" },
    ] };
    placeUpload(asset, "https://ik.imagekit.io/shop/hero.png");
    expect(img.props!.src).toBe("https://ik.imagekit.io/shop/hero.png");
    expect(hero.style!.backgroundImage).toBe("linear-gradient(red, blue), url(https://ik.imagekit.io/shop/hero.png)");
    expect(hero.mobile!.backgroundImage).toBe("url(https://ik.imagekit.io/shop/hero.png)");

    const lost = { ...asset, uses: [{ node: { ...img, props: { src: "data:image/png;base64,AAAA" } }, prop: "src" }] };
    dropAsset(lost);
    expect(lost.uses[0]!.node.props!.src).toBe("");
  });
});
