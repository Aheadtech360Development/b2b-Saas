/**
 * The bulk order form (owner, 2026-10-30): colour cards a buyer picks up to
 * ten of, each opening its sizes with the price, the stock and a box for how
 * many, and one Add to cart for all of it. A card shows the colour's own
 * picture, or the colour alone when the shop chose swatches or has none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  signedIn: false,
  push: (() => {}) as (to: string) => void,
  addMatrix: (() => Promise.resolve({})) as (...a: unknown[]) => Promise<unknown>,
  trackAddToCart: (() => {}) as (...a: unknown[]) => void,
  trackCartAdd: (() => {}) as (...a: unknown[]) => void,
}));

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: null, isAuthenticated: () => h.signedIn }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: (to: string) => h.push(to), replace: () => {} }) }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: () => Promise.resolve({}), post: () => Promise.resolve({}) },
  ApiClientError: class extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  },
}));
vi.mock("@/services/cart.service", () => ({ cartService: { addMatrix: (...a: unknown[]) => h.addMatrix(...a) } }));
vi.mock("@/lib/tracking", async (real) => ({
  ...(await real<typeof import("@/lib/tracking")>()),
  trackAddToCart: (...a: unknown[]) => h.trackAddToCart(...a),
  trackCartAdd: (...a: unknown[]) => h.trackCartAdd(...a),
}));

import BulkOrderPicker, { MAX_COLOURS, bulkProductOf, cardPicture, soldInBulk, type BulkProduct } from "@/components/storefront/BulkOrderPicker";
import { ApiClientError } from "@/lib/api-client";
import { readGuestCart } from "@/lib/guestCart";
import { COLOUR_CHOSEN } from "@/lib/colourPictures";
import { Tree } from "@/components/builder/render";
import type { SitePayload } from "@/lib/builder/types";
import type { ProductDetail } from "@/types/product.types";

const SIZES = ["S", "M", "L", "XL", "2XL"];
const img = (alt: string) => ({ url: `https://img.example.com/${alt.replace(/\W+/g, "-")}-large.jpg`, thumb: `https://img.example.com/${alt.replace(/\W+/g, "-")}-medium.jpg`, alt });

function tee(over: Partial<BulkProduct> = {}): BulkProduct {
  const variants: BulkProduct["variants"] = [];
  for (const colour of ["Black", "Navy", "Red"]) {
    for (const size of SIZES) {
      if (colour === "Black" && size === "2XL") continue; // a size this colour lacks
      variants.push({
        id: `${colour}-${size}`, colour, size, sku: `G5000-${colour}-${size}`,
        price: size === "2XL" ? 6.59 : 3.99,
        stock: colour === "Black" && size === "L" ? 0 : colour === "Navy" ? 9999 : size === "S" ? 5 : 513,
      });
    }
  }
  return {
    id: "p1", slug: "g5000", name: "Gildan 5000",
    images: [img("Gildan 5000 - Black - Back"), img("Gildan 5000 - Black"), img("Gildan 5000 - Navy")],
    variants,
    colours: [{ label: "Black", hex: "#000000" }, { label: "Navy", hex: "" }, { label: "Red", hex: "#C62828" }],
    sizes: SIZES.map((label) => ({ label })),
    bulk_cards: "pictures",
    moq: 1,
    ...over,
  };
}

// Found by their marks, not by role: a role lookup over a few hundred
// cells is slow enough in jsdom to time a test out.
const card = (name: string) => document.querySelector(`button.bop-card[data-colour="${name}"]`) as HTMLButtonElement;
const panel = (name: string) => document.querySelector(`section[data-colour-panel="${name}"]`) as HTMLElement;
const panels = () => document.querySelectorAll("section[data-colour-panel]");
const box = (colour: string, size: string) => document.querySelector(`input[aria-label="${colour}, ${size}: how many"]`) as HTMLInputElement;
const cells = (p: HTMLElement, row: string) => Array.from(p.querySelectorAll(`tr[data-row="${row}"] td`)).map((td) => td.textContent);

beforeEach(() => {
  h.signedIn = false;
  h.push = vi.fn();
  h.addMatrix = vi.fn(() => Promise.resolve({ items: [] }));
  h.trackAddToCart = vi.fn();
  h.trackCartAdd = vi.fn();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("the colour cards", () => {
  it("show each colour's own picture, its front before its back, and the colour itself where it has none", () => {
    render(<BulkOrderPicker product={tee()} />);
    expect(screen.getByText(/Click to select multiple colors/)).toHaveTextContent(`Click to select multiple colors (max ${MAX_COLOURS}). Click again to deselect.`);
    expect(card("Black").querySelector("img")?.getAttribute("src")).toBe("https://img.example.com/Gildan-5000-Black-medium.jpg");
    expect(card("Navy").querySelector("img")?.getAttribute("src")).toBe("https://img.example.com/Gildan-5000-Navy-medium.jpg");
    expect(card("Red").querySelector("img")).toBeNull();
    expect((card("Red").querySelector(".bop-chip") as HTMLElement).style.background).toBe("rgb(198, 40, 40)");
    // The full name shows on hover, as a long one is cut short on the card.
    expect(card("Black").title).toBe("Black");
  });

  it("show the colour alone on every card when the shop chose swatches", () => {
    render(<BulkOrderPicker product={tee({ bulk_cards: "swatches" })} />);
    for (const c of ["Black", "Navy", "Red"]) expect(card(c).querySelector("img")).toBeNull();
    // A colour saved with no hex is drawn from its name.
    expect((card("Navy").querySelector(".bop-chip") as HTMLElement).style.background).not.toBe("");
  });

  it("finds a picture the product's Media tab gave a colour, named just by it", () => {
    expect(cardPicture([{ url: "u1", alt: "Heather Grey" }, { url: "u2", alt: "Navy" }], "Navy")).toBe("u2");
    expect(cardPicture([{ url: "u1", alt: "Tee" }], "Navy")).toBeNull();
  });
});

describe("choosing colours", () => {
  it("opens a colour's sizes with the price, the stock and a box for each; a size it lacks is a dash, one sold out cannot be ordered", () => {
    render(<BulkOrderPicker product={tee()} />);
    expect(panels()).toHaveLength(0);
    fireEvent.click(card("Black"));
    expect(card("Black").getAttribute("aria-pressed")).toBe("true");
    expect(card("Black").querySelector(".bop-n")?.textContent).toBe("1");
    const black = panel("Black");
    expect(Array.from(black.querySelectorAll("thead th")).map((th) => th.textContent)).toEqual(["", ...SIZES]);
    expect(cells(black, "price")).toEqual(["$3.99", "$3.99", "$3.99", "$3.99", "—"]);
    expect(cells(black, "stock")).toEqual(["5", "513", "Out of stock", "513", "—"]);
    expect(box("Black", "S").disabled).toBe(false);
    expect(box("Black", "L").disabled).toBe(true);
    expect(box("Black", "2XL").disabled).toBe(true);
    expect(box("Black", "M").value).toBe("0");

    fireEvent.click(card("Navy"));
    expect(card("Navy").querySelector(".bop-n")?.textContent).toBe("2");
    // Stock not counted reads as in stock, not as a number nobody has.
    expect(cells(panel("Navy"), "stock")).toEqual(Array(5).fill("In stock"));
    expect(cells(panel("Navy"), "price")).toEqual(["$3.99", "$3.99", "$3.99", "$3.99", "$6.59"]);
  });

  it("tells the gallery which colour was picked", () => {
    const heard: string[] = [];
    const on = (e: Event) => heard.push((e as CustomEvent).detail.colour);
    window.addEventListener(COLOUR_CHOSEN, on);
    render(<BulkOrderPicker product={tee()} />);
    fireEvent.click(card("Navy"));
    window.removeEventListener(COLOUR_CHOSEN, on);
    expect(heard).toEqual(["Navy"]);
  });

  it("puts a colour back on a second click, or with Remove, and its quantities go with it", () => {
    render(<BulkOrderPicker product={tee()} />);
    fireEvent.click(card("Black"));
    fireEvent.change(box("Black", "M"), { target: { value: "4" } });
    expect(screen.getByText("4", { selector: "b" })).toBeTruthy();
    fireEvent.click(card("Black"));
    expect(panel("Black")).toBeNull();
    expect(card("Black").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(card("Black"));
    expect(box("Black", "M").value).toBe("0");
    fireEvent.click(card("Red"));
    fireEvent.click(within(panel("Black")).getByRole("button", { name: "Remove Black" }));
    expect(panel("Black")).toBeNull();
    // The one left is first now.
    expect(card("Red").querySelector(".bop-n")?.textContent).toBe("1");
  });

  it(`takes up to ${MAX_COLOURS} colours at a time, and says so`, () => {
    const colours = Array.from({ length: MAX_COLOURS + 1 }, (_, i) => ({ label: `Colour ${i + 1}`, hex: "#123456" }));
    const product = tee({
      colours, images: [],
      variants: colours.map((c) => ({ id: c.label, colour: c.label, size: "M", sku: c.label, price: 4, stock: 10 })),
      sizes: [{ label: "M" }],
    });
    render(<BulkOrderPicker product={product} />);
    for (const c of colours) fireEvent.click(card(c.label));
    expect(panels()).toHaveLength(MAX_COLOURS);
    expect(card(`Colour ${MAX_COLOURS + 1}`).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("status")).toHaveTextContent(`Up to ${MAX_COLOURS} colours at a time. Remove one to add Colour ${MAX_COLOURS + 1}.`);
  });

  it("cuts a quantity to the stock there is, and says so", () => {
    render(<BulkOrderPicker product={tee()} />);
    fireEvent.click(card("Black"));
    fireEvent.change(box("Black", "S"), { target: { value: "8" } });
    expect(box("Black", "S").value).toBe("5");
    expect(screen.getByRole("status")).toHaveTextContent("Only 5 left in Black, S.");
    fireEvent.change(box("Black", "M"), { target: { value: "12x" } });
    expect(box("Black", "M").value).toBe("12");
  });
});

describe("adding to the cart", () => {
  function fill() {
    fireEvent.click(card("Black"));
    fireEvent.click(card("Navy"));
    fireEvent.change(box("Black", "S"), { target: { value: "3" } });
    fireEvent.change(box("Black", "M"), { target: { value: "12" } });
    fireEvent.change(box("Navy", "2XL"), { target: { value: "6" } });
  }

  it("adds a guest's quantities to the guest cart at once, reports them, and empties the boxes", async () => {
    const updated = vi.fn();
    window.addEventListener("cart_updated", updated);
    render(<BulkOrderPicker product={tee()} />);
    const add = screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fill();
    expect(screen.getByText("$99.39")).toBeTruthy(); // 15 × 3.99 + 6 × 6.59
    await act(async () => { fireEvent.click(add); });
    window.removeEventListener("cart_updated", updated);

    expect(readGuestCart().map((l) => [l.variant_id, l.quantity, l.unit_price, l.color, l.size, l.image_url])).toEqual([
      ["Black-S", 3, 3.99, "Black", "S", "https://img.example.com/Gildan-5000-Black-medium.jpg"],
      ["Black-M", 12, 3.99, "Black", "M", "https://img.example.com/Gildan-5000-Black-medium.jpg"],
      ["Navy-2XL", 6, 6.59, "Navy", "2XL", "https://img.example.com/Gildan-5000-Navy-medium.jpg"],
    ]);
    expect(h.trackAddToCart).toHaveBeenCalledTimes(1);
    expect((h.trackAddToCart as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([
      { id: "Black-S", sku: "G5000-Black-S", name: "Gildan 5000", price: 3.99, quantity: 3, variant: "Black / S" },
      { id: "Black-M", sku: "G5000-Black-M", name: "Gildan 5000", price: 3.99, quantity: 12, variant: "Black / M" },
      { id: "Navy-2XL", sku: "G5000-Navy-2XL", name: "Gildan 5000", price: 6.59, quantity: 6, variant: "Navy / 2XL" },
    ]);
    expect(updated).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Added 21 pieces to your cart.");
    expect(box("Black", "M").value).toBe("0");
    expect(h.addMatrix).not.toHaveBeenCalled();
  });

  it("adds a signed-in buyer's in one request to their cart, and reports what the cart says", async () => {
    h.signedIn = true;
    render(<BulkOrderPicker product={tee()} />);
    fill();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to cart" })); });
    const items = [{ variant_id: "Black-S", quantity: 3 }, { variant_id: "Black-M", quantity: 12 }, { variant_id: "Navy-2XL", quantity: 6 }];
    expect(h.addMatrix).toHaveBeenCalledWith("p1", items);
    expect(h.trackCartAdd).toHaveBeenCalledWith({ items: [] }, items);
    expect(readGuestCart()).toEqual([]);
  });

  it("says what the shop said when it refuses, and keeps what was typed", async () => {
    h.signedIn = true;
    h.addMatrix = vi.fn(() => Promise.reject(new (ApiClientError as unknown as new (s: number, m: string) => Error)(403, "Trade accounts only.")));
    render(<BulkOrderPicker product={tee()} />);
    fill();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to cart" })); });
    expect(screen.getByRole("status")).toHaveTextContent("Trade accounts only.");
    expect(box("Black", "M").value).toBe("12");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("sends a buyer whose session ended to sign in, and back here after", async () => {
    vi.useFakeTimers();
    h.signedIn = true;
    h.addMatrix = vi.fn(() => Promise.reject(new (ApiClientError as unknown as new (s: number, m: string) => Error)(401, "")));
    render(<BulkOrderPicker product={tee()} />);
    fill();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to cart" })); });
    expect(screen.getByRole("status")).toHaveTextContent("Please sign in again to finish that.");
    act(() => { vi.advanceTimersByTime(1500); });
    expect(h.push).toHaveBeenCalledWith("/login?next=%2F");
  });

  it("names the minimum order while there is less than it", () => {
    render(<BulkOrderPicker product={tee({ moq: 24 })} />);
    fireEvent.click(card("Navy"));
    fireEvent.change(box("Navy", "M"), { target: { value: "6" } });
    expect(screen.getByText("Minimum order: 24 pieces")).toBeTruthy();
    fireEvent.change(box("Navy", "M"), { target: { value: "30" } });
    expect(screen.queryByText("Minimum order: 24 pieces")).toBeNull();
  });
});

describe("where the form is drawn", () => {
  const detail = (over: Partial<ProductDetail> = {}): ProductDetail => ({
    id: "p9", slug: "tee", name: "Tee", status: "active", moq: 12, description: null,
    images: [{ id: "i1", url_thumbnail: "t.jpg", url_medium: "m.jpg", url_large: "l.jpg", alt_text: "Tee - Red", is_primary: true } as unknown as ProductDetail["images"][number]],
    variants: [
      { id: "v1", sku: "A", color: "Red", color_hex: "#f00", size: "XL", retail_price: "5.00", effective_price: "4.25", status: "active", stock_quantity: 7 },
      { id: "v2", sku: "B", color: "Red", size: "S", retail_price: "5.00", effective_price: null, status: "active", stock_quantity: 0 },
      { id: "v3", sku: "C", color: "Blue", size: "M", retail_price: "5.00", effective_price: null, status: "discontinued", stock_quantity: 3 },
    ] as unknown as ProductDetail["variants"],
    categories: [], bulk_order: true, bulk_cards: "swatches",
    ...over,
  } as ProductDetail);

  it("on the older product page: the buyer's own price, sizes on the chart, nothing discontinued", () => {
    const p = bulkProductOf(detail());
    expect(p.sizes.map((s) => s.label)).toEqual(["S", "XL"]);
    expect(p.colours).toEqual([{ label: "Red", hex: "#f00" }]);
    expect(p.variants.map((v) => [v.id, v.price, v.stock])).toEqual([["v1", 4.25, 7], ["v2", 5, 0]]);
    expect(p.images).toEqual([{ url: "l.jpg", alt: "Tee - Red", thumb: "m.jpg" }]);
    expect([p.bulk_cards, p.moq]).toEqual(["swatches", 12]);
    expect(soldInBulk(detail())).toBe(true);
    expect(soldInBulk(detail({ bulk_order: false }))).toBe(false);
    expect(soldInBulk(detail({ pricing_mode: "configurable" }))).toBe(false);
    expect(soldInBulk(detail({ gang_sheet_enabled: true }))).toBe(false);
  });

  it("in the website builder's buy box, for a product sold in bulk, with the price line saying where prices start", () => {
    const product = { ...tee(), from_price: 3.99, pricing_mode: "variant", gang_sheet: false, options: [], qty_tiers: [], bulk: true };
    const data = { product } as unknown as SitePayload["data"];
    const ctx = { data, globals: {}, page: null, query: "", route: "product" };
    const buy = renderToStaticMarkup(<Tree tree={{ id: "b1", type: "product_buy" }} ctx={ctx} />);
    expect(buy).toContain('data-bulk-order="p1"');
    expect(buy).not.toContain("variant-group");
    expect(buy).not.toContain("data-theme-buy");
    expect(renderToStaticMarkup(<Tree tree={{ id: "pp", type: "product_price" }} ctx={ctx} />)).toContain("From </span>$3.99");

    const usual = renderToStaticMarkup(<Tree tree={{ id: "b1", type: "product_buy" }} ctx={{ ...ctx, data: { product: { ...product, bulk: false } } as unknown as SitePayload["data"] }} />);
    expect(usual).toContain("variant-group");
    expect(usual).not.toContain("data-bulk-order");
  });
});
