/**
 * Site builder → Pages → Import a design (lib/builder/importHtml). Reading a
 * design needs a browser's layout, which jsdom does not have, so the reading
 * is checked in a real browser before release (the owner's wireframes and a
 * Tailwind page, each published locally and compared side by side at a
 * computer's and a phone's width). These are the parts that need no layout:
 * how a design is made safe to read, colours, and how the result goes into
 * the draft.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyImport, dropAsset, hexColour, inlineCode, localise, placeUpload, planFolder, prepareHtml, siteSize, sizeAfter, type ImportedDesign,
} from "@/lib/builder/importHtml";
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

describe("a design folder (the Sidequest demo store: index, contact, rewards, checkout, product…)", () => {
  const file = (name: string, body = "", type = "text/html") => new File([body], name, { type });

  it("makes index the home page, brings its own pages, and leaves the shop's working pages to the shop", () => {
    const names = ["index.html", "contact.html", "rewards.html", "checkout.html", "product.html", "collections.html",
                   "gift-cards.html", "returns.html", "track.html"];
    const plan = planFolder([...names.map((n) => file(n)), file("styles.css", "", "text/css"), file("hero.jpg", "", "image/jpeg")]);
    expect(plan.home?.name).toBe("index.html");
    expect(plan.pages.map((f) => f.name)).toEqual(["contact.html", "rewards.html"]);
    expect(Object.fromEntries(plan.shop.map((s) => [s.file.name, s.path]))).toEqual({
      "checkout.html": "/cart", "product.html": "/products", "collections.html": "/products",
      "gift-cards.html": "/gift-cards", "returns.html": "/returns", "track.html": "/track-order",
    });
  });

  it("writes the folder's stylesheets and scripts into the page, leaving other sites' ones alone", () => {
    const html = `<head><link rel="stylesheet" href="assets/styles.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton">
      </head><body><script src="assets/app.js"></script><script src="https://cdn.example.com/x.js"></script></body>`;
    const out = inlineCode(html, new Map([["styles.css", "body{color:red}"], ["app.js", "var a = '</script>';"]]));
    expect(out).toContain("<style>body{color:red}</style>");
    expect(out).toContain('href="https://fonts.googleapis.com/css2?family=Anton"');
    expect(out).toContain("<script>var a = '<\\/script>';</script>");
    expect(out).toContain('src="https://cdn.example.com/x.js"');
  });

  it("shows the folder's pictures from this page's copy of each file, and knows which file each is", () => {
    let n = 0;
    const made = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:local/${++n}`);
    try {
      const hero = file("hero.jpg", "x", "image/jpeg");
      const html = `<img src="assets/img/hero.jpg"><div style="background-image: url(&quot;assets/img/hero.jpg&quot;)"></div>
        <style>.a{background:url(img/hero.jpg)}</style><img src="https://cdn.example.com/hero.jpg"><img src="missing.png">`;
      const { html: out, blobs } = localise(html, [hero]);
      expect(out).toContain('<img src="blob:local/1">');
      expect(out).toContain("url(&quot;blob:local/1&quot;)");
      expect(out).toContain("url(blob:local/1)");
      expect(out).toContain('src="https://cdn.example.com/hero.jpg"');
      expect(out).toContain('src="missing.png"');
      expect(blobs.get("blob:local/1")).toBe(hero);
      expect(blobs.size).toBe(1);
    } finally {
      made.mockRestore();
    }
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

  it("knows the site's size with the design in it, as the server counts it", () => {
    const doc = site();
    // header 1 + footer 1 + bar 1 + home 1 + two empty page templates 0 + about 1
    expect(siteSize(doc)).toBe(5);
    const d = design();
    // The new home (3) replaces the old (1); the new header (1) replaces the old one and its bar (2); the new footer replaces the old.
    expect(sizeAfter(doc, d, { pages: ["home"], header: true, footer: true, look: true })).toBe(5 - 1 + 3 - 2 + 1);
    // Two more pages (2 each).
    expect(sizeAfter(doc, d, { pages: ["home", "about", "collection-page"], header: false, footer: false, look: false })).toBe(5 - 1 + 3 + 2 + 2);
    const { doc: next } = applyImport(doc, d, { pages: ["home", "about", "collection-page"], header: true, footer: true, look: true });
    expect(siteSize(next)).toBe(sizeAfter(site(), design(), { pages: ["home", "about", "collection-page"], header: true, footer: true, look: true }));
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
