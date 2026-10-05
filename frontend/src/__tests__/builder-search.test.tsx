/**
 * What a shopper sees after searching on a builder shop.
 *
 * The products come from the server — the shop's own, read for that request.
 * This is the page's side of it: say how many were found, list them as real
 * product cards, and when nothing matched say so in words rather than leave a
 * blank page that reads as broken.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tree, type RenderCtx } from "@/components/builder/render";
import type { BuilderNode, ProductCard, SitePayload } from "@/lib/builder/types";

const GRID: BuilderNode = { id: "g1", type: "product_grid", props: { source: "search", limit: 24, columns: 4 } };
const FIELD: BuilderNode = { id: "f1", type: "search", props: { style: "field" } };
const ICON: BuilderNode = { id: "i1", type: "search", props: { style: "icon" } };
const card = (title: string, slug: string, price = "From $38.00"): ProductCard =>
  ({ title, url: `/products/${slug}`, image: `https://img.example/${slug}.jpg`, price, badge: "", text: "" });

function data(over: Partial<SitePayload["data"]> = {}): SitePayload["data"] {
  return { product: null, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "Shop", logo: "" }, ...over };
}
function page(tree: BuilderNode, ctx: Partial<RenderCtx> = {}) {
  return renderToStaticMarkup(<Tree tree={tree} ctx={{ data: data(), globals: {}, page: null, query: "", route: "search", ...ctx }} />);
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("search results on the storefront", () => {
  it("lists what was found as product cards that open the product", () => {
    const cards = [card("Pullover Hoodie", "pullover-hoodie"), card("Hoodie Strings", "hoodie-strings", "From $3.00")];
    const out = page(GRID, { query: "hoodie", data: data({ grids: { g1: cards }, search: { query: "hoodie", total: 2, shown: 2 } }) });
    expect(out).toContain('data-search="found"');
    expect(text(out)).toContain("2 products for “hoodie”");
    expect(out).toContain('href="/products/pullover-hoodie"');
    expect(out).toContain('src="https://img.example/pullover-hoodie.jpg"');
    expect(text(out)).toContain("Pullover Hoodie");
    expect(text(out)).toContain("From $38.00");
    expect(text(out)).toContain("From $3.00");
  });

  it("says one product, not one products", () => {
    const out = page(GRID, { query: "cap", data: data({ grids: { g1: [card("Snapback Cap", "cap")] }, search: { query: "cap", total: 1, shown: 1 } }) });
    expect(text(out)).toContain("1 product for “cap”");
    expect(text(out)).not.toContain("1 products");
  });

  it("says when there are more than fit on the page", () => {
    const cards = Array.from({ length: 24 }, (_, i) => card(`Sticker ${i}`, `sticker-${i}`));
    const out = page(GRID, { query: "sticker", data: data({ grids: { g1: cards }, search: { query: "sticker", total: 61, shown: 24 } }) });
    expect(text(out)).toContain("61 products for “sticker” — showing the first 24");
  });

  it("says so, with a way on, when nothing matches — never a blank page", () => {
    const out = page(GRID, { query: "zebra", data: data({ grids: { g1: [] }, search: { query: "zebra", total: 0, shown: 0 } }) });
    expect(out).toContain('data-search="none"');
    expect(out).toContain('role="status"');
    expect(text(out)).toContain("No products match “zebra”.");
    expect(text(out)).toContain("Check the spelling");
    expect(out).toContain('href="/products"');
    expect(out).not.toContain("b-card");
  });

  it("asks for something to search for before anything is typed", () => {
    const out = page(GRID, { query: "", data: data({ grids: { g1: [] }, search: { query: "", total: 0, shown: 0 } }) });
    expect(out).toContain('data-search="idle"');
    expect(text(out)).toContain("Type what you are looking for");
  });

  it("shows what was typed as text, whatever it is", () => {
    const q = '<img src=x onerror="alert(1)">';
    const out = page(GRID, { query: q, data: data({ grids: { g1: [] }, search: { query: q, total: 0, shown: 0 } }) });
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x");
  });

  it("drops a result whose link or picture is not a safe address", () => {
    const bad: ProductCard = { title: "Odd", url: "javascript:alert(1)", image: "javascript:alert(2)", price: "", badge: "", text: "" };
    const out = page(GRID, { query: "odd", data: data({ grids: { g1: [bad] }, search: { query: "odd", total: 1, shown: 1 } }) });
    expect(out).not.toContain("javascript:");
  });

  it("still works from the page's own query if the server sent no summary", () => {
    const out = page(GRID, { query: "hoodie", data: data({ grids: { g1: [card("Pullover Hoodie", "pullover-hoodie")] } }) });
    expect(text(out)).toContain("1 product for “hoodie”");
  });

  it("leaves other product grids exactly as they were", () => {
    const newest: BuilderNode = { id: "n1", type: "product_grid", props: { source: "newest", limit: 4 } };
    const out = page(newest, { route: "home", data: data({ grids: { n1: [card("Tee", "tee")] } }) });
    expect(out).not.toContain("data-search");
    expect(out).toContain('href="/products/tee"');
    // And an empty one draws nothing on the storefront, as before.
    expect(page(newest, { route: "home", data: data({ grids: { n1: [] } }) })).toBe("");
  });

  it("keeps the editor's own placeholder for a search grid", () => {
    const out = page(GRID, { edit: true, data: data({ grids: { g1: [] } }) });
    expect(text(out)).toContain("Search results show here.");
    expect(out).not.toContain("data-search");
  });
});

describe("the search box", () => {
  it("is a real form that asks the shop's search page", () => {
    const out = page(FIELD, { query: "hoodie" });
    const form = /<form[^>]*>/.exec(out)?.[0] ?? "";
    expect(form).toContain('action="/search"');
    expect(form).toMatch(/method="get"/i);
    expect(form).toContain('role="search"');
    expect(out).toMatch(/<input[^>]*name="q"/);
    expect(out).toContain('value="hoodie"');
    expect(out).toContain('maxLength="80"');
  });

  it("takes the cursor on the search page when nothing is typed yet — where the header icon lands", () => {
    expect(page(FIELD, { query: "" })).toContain("autofocus");
    expect(page(FIELD, { query: "hoodie" })).not.toContain("autofocus");
    expect(page(FIELD, { query: "", route: "home" })).not.toContain("autofocus");
    expect(page(FIELD, { query: "", edit: true })).not.toContain("autofocus");
  });

  it("as an icon in the header, links to the search page", () => {
    const out = page(ICON, { route: "home" });
    expect(out).toMatch(/<a[^>]*href="\/search"[^>]*aria-label="Search"/);
  });
});
