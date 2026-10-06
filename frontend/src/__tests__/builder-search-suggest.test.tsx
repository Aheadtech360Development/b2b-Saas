/**
 * Search on a builder shop, while the shopper is still typing — and the
 * draft's preview keeping its links, the search among them, inside itself.
 *
 * The products come from the server (/storefront/search/suggest); this is the
 * page's side: ask after two letters, list the best few as links, say when
 * nothing matches, let the keys move through the list, and open the header's
 * search in place rather than on another page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const asked: string[] = [];
let answer: (q: string) => unknown = () => ({ query: "", total: 0, items: [] });
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (url: string) => {
      asked.push(url);
      const q = new URL(url, "http://shop.test").searchParams.get("q") ?? "";
      return Promise.resolve(answer(q));
    },
  },
}));

import { SearchBox, SearchIcon, suggestQuery } from "@/components/builder/islands/SearchBox";
import { Tree } from "@/components/builder/render";
import { previewTarget } from "@/lib/builder/previewLinks";
import type { SitePayload } from "@/lib/builder/types";

const GANG = { title: "Custom DTF Gang Sheet", url: "/gang-sheets?product=p-1", image: "https://img.example/gang.jpg", price: "From $12.00", builder: true };
const UPLOAD = { title: "Gang Sheet Upload By Size", url: "/products/gang-upload", image: "", price: "From $8.00", builder: false };

async function settle() {
  await act(async () => { vi.advanceTimersByTime(400); });
  await act(async () => { await Promise.resolve(); });
}
function typeInto(box: HTMLElement, value: string) {
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value } });
}

beforeEach(() => {
  asked.length = 0;
  vi.useFakeTimers();
  answer = (q) => (q.toLowerCase().startsWith("gang")
    ? { query: q, total: 2, items: [GANG, UPLOAD] }
    : { query: q, total: 0, items: [] });
});

describe("the search box suggests while typing", () => {
  it("is drawn as the plain form it always was, ready to be a list", () => {
    const out = renderToStaticMarkup(<SearchBox id="f1" query="hoodie" placeholder="Search products" />);
    expect(out).toMatch(/<form[^>]*action="\/search"/);
    expect(out).toMatch(/<input[^>]*name="q"/);
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('autoComplete="off"');
    expect(out).not.toContain("b-suggest");
  });

  it("asks nothing for one letter, then suggests the shop's products from two", async () => {
    render(<SearchBox id="f1" query="" placeholder="Search products" />);
    const box = screen.getByRole("combobox");
    typeInto(box, "g");
    await settle();
    expect(asked).toEqual([]);
    typeInto(box, "gang");
    await settle();
    expect(asked).toEqual(["/api/v1/storefront/search/suggest?q=gang"]);
    expect(box).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Custom DTF Gang SheetOpens the gang sheet builder",
      "Gang Sheet Upload By SizeFrom $8.00",
    ]);
  });

  it("opens a gang sheet made in the builder in the builder itself, anything else on its page", async () => {
    render(<SearchBox id="f1" query="" placeholder="Search products" />);
    typeInto(screen.getByRole("combobox"), "gang");
    await settle();
    const [gang, upload] = screen.getAllByRole("option");
    expect(gang).toHaveAttribute("href", "/gang-sheets?product=p-1");
    expect(upload).toHaveAttribute("href", "/products/gang-upload");
  });

  it("waits for the typing to stop, and asks once for the same words", async () => {
    render(<SearchBox id="f1" query="" placeholder="Search products" />);
    const box = screen.getByRole("combobox");
    typeInto(box, "ga");
    typeInto(box, "gan");
    typeInto(box, "gang");
    await settle();
    expect(asked).toEqual(["/api/v1/storefront/search/suggest?q=gang"]);
    typeInto(box, "gan");
    await settle();
    typeInto(box, "gang");
    await settle();
    expect(asked).toEqual(["/api/v1/storefront/search/suggest?q=gang", "/api/v1/storefront/search/suggest?q=gan"]);
  });

  it("says so when nothing matches, and offers the whole search when there is more", async () => {
    answer = (q) => (q === "zebra" ? { query: q, total: 0, items: [] } : { query: q, total: 9, items: [GANG] });
    render(<SearchBox id="f1" query="" placeholder="Search products" />);
    const box = screen.getByRole("combobox");
    typeInto(box, "zebra");
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent("No products match “zebra”.");
    typeInto(box, "sheet");
    await settle();
    expect(screen.getByRole("link", { name: "See all 9 results for “sheet”" })).toHaveAttribute("href", "/search?q=sheet");
  });

  it("moves through the list with the arrow keys, opens the chosen one with Enter, and closes on Escape", async () => {
    render(<SearchBox id="f1" query="" placeholder="Search products" />);
    const box = screen.getByRole("combobox");
    typeInto(box, "gang");
    await settle();
    const clicked: string[] = [];
    screen.getAllByRole("option").forEach((o) => o.addEventListener("click", (e) => { e.preventDefault(); clicked.push(o.getAttribute("href") ?? ""); }));
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(box.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1]!.id);
    fireEvent.keyDown(box, { key: "ArrowUp" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(clicked).toEqual(["/gang-sheets?product=p-1"]);
    typeInto(box, "gang sheet");
    await settle();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("drops a suggestion whose link or picture is not a safe address", async () => {
    answer = (q) => ({ query: q, total: 2, items: [{ ...GANG, url: "javascript:alert(1)" }, { ...UPLOAD, image: "javascript:x" }] });
    const { container } = render(<SearchBox id="f1" query="" placeholder="Search products" />);
    typeInto(screen.getByRole("combobox"), "gang");
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
  });

  it("asks nothing in the editor", async () => {
    render(<SearchBox id="f1" query="" placeholder="Search products" edit />);
    typeInto(screen.getByRole("combobox"), "gang");
    await settle();
    expect(asked).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("asks for the words as typed, trimmed to one space between them", () => {
    expect(suggestQuery("  gang   sheet ")).toBe("gang sheet");
  });
});

describe("the header's search icon", () => {
  it("is a link to the search page before any script runs", () => {
    const out = renderToStaticMarkup(<SearchIcon id="i1" placeholder="Search products" />);
    expect(out).toMatch(/<a[^>]*href="\/search"[^>]*aria-label="Search"/);
  });

  it("opens the search box over the page, with the cursor in it, and closes on Escape", async () => {
    render(<SearchIcon id="i1" placeholder="Search products" />);
    const icon = screen.getByRole("link", { name: "Search" });
    fireEvent.click(icon);
    const dialog = screen.getByRole("dialog", { name: "Search the shop" });
    expect(dialog).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays a link in the editor, and with a key held for a new tab", () => {
    const { rerender } = render(<SearchIcon id="i1" placeholder="Search products" edit />);
    fireEvent.click(screen.getByRole("link", { name: "Search" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<SearchIcon id="i1" placeholder="Search products" />);
    fireEvent.click(screen.getByRole("link", { name: "Search" }), { ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("links in the draft's preview stay in the preview", () => {
  const here = { origin: "https://shop.test", search: "?route=collection&slug=tees" };
  const at = (href: string) => previewTarget(new URL(href, "https://shop.test/site-builder/preview?route=collection&slug=tees"), here)?.toString() ?? null;

  it("draws the shop's own pages from the draft", () => {
    expect(at("/")).toBe("route=home");
    expect(at("/search?q=gang+sheet")).toBe("route=search&q=gang+sheet");
    expect(at("/products")).toBe("route=products");
    expect(at("/products?category=dtf&page=2")).toBe("route=products&page=2&slug=dtf");
    expect(at("/products?q=hoodie")).toBe("route=search&q=hoodie");
    expect(at("/products/black-tee")).toBe("route=product&slug=black-tee");
    expect(at("/collections/dtf?sort=name")).toBe("route=collection&slug=dtf&sort=name");
    expect(at("/cart")).toBe("route=cart");
    expect(at("/about")).toBe("route=page&slug=about");
  });

  it("keeps the page on screen when only its page or sort changes — Load more", () => {
    expect(at("?page=2")).toBe("route=collection&slug=tees&page=2");
    expect(at("?category=dtf&page=3&sort=name")).toBe("route=collection&slug=tees&page=3&sort=name");
  });

  it("leaves alone what the draft does not draw", () => {
    for (const href of ["/checkout", "/account/orders", "/gang-sheets?product=p-1", "/quote", "/policies/terms",
                        "https://elsewhere.example/", "#reviews", "/site-builder/preview?route=home"]) {
      expect(at(href)).toBeNull();
    }
  });
});

describe("All products", () => {
  it("loads more of an old link's category, not of everything", () => {
    const data: SitePayload["data"] = {
      product: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "Shop", logo: "" },
      collection: { name: "Hoodies", slug: "hoodies", description: "", image: "" },
      collectionPage: { items: [], total: 30, page: 1, page_size: 12, has_more: true },
    };
    const tree = { id: "cp", type: "collection_products", props: { showSort: false } };
    const out = (route: string) => renderToStaticMarkup(<Tree tree={tree} ctx={{ data, globals: {}, page: null, query: "", route }} />);
    expect(out("products")).toContain('href="?category=hoodies&amp;page=2"');
    expect(out("collection")).toContain('href="?page=2"');
  });
});
