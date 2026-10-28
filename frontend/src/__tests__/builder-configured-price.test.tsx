/**
 * A builder product page selling a product priced from its options, sold in
 * set quantities by a price table (500 flyers, $120).
 *
 * The page opened on the product's base price, which is not what its first
 * choices cost; any choice then showed the set's price spread over every
 * flyer ($0.24), and going back to the first choices showed that, not the
 * price it opened on. A guest's cart kept one flyer at $0.24.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({
  api: { post: vi.fn() as (url: string, body: { selections: Record<string, string>; quantity: number }) => Promise<unknown> },
}));

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: null, isAuthenticated: () => false }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: () => Promise.resolve({}), post: (url: string, body: never) => api.post(url, body) },
  ApiClientError: class extends Error { status = 400; },
}));
vi.mock("@/services/cart.service", () => ({ cartService: {} }));
vi.mock("@/components/storefront/UploadBySizeModal", () => ({ UploadBySizeModal: () => null }));
vi.mock("@/components/storefront/UploadOwnSheetModal", () => ({ UploadOwnSheetModal: () => null }));
vi.mock("@/components/storefront/DesignUploadModal", () => ({ DesignUploadModal: () => null }));

import ThemeProductBuy, { configuredPriceText, type ThemeProductData } from "@/components/storefront/ThemeProductBuy";
import { GUEST_CART_KEY, guestLineTotal, readGuestCart } from "@/lib/guestCart";

/** The shop's price table: the whole set's price, as suppliers send it. */
const TABLE: Record<string, Record<string, number>> = { q500: { gloss: 120, matte: 140 }, q1000: { gloss: 200, matte: 230 } };
const SETS: Record<string, number> = { q500: 500, q1000: 1000 };

function priceOf(selections: Record<string, string>) {
  const total = TABLE[selections.qty ?? ""]?.[selections.paper ?? ""];
  if (total == null) return Promise.reject(Object.assign(new Error("That combination is not available."), { status: 400 }));
  const quantity = SETS[selections.qty!]!;
  return Promise.resolve({ unit_price: Math.floor((total / quantity) * 100) / 100, total, quantity, quantity_from_option: true });
}

const FLYER: ThemeProductData = {
  id: "flyer", slug: "business-flyer", name: "Business Flyer", pricing_mode: "configurable", from_price: 25,
  images: [], variants: [], colours: [], sizes: [], qty_tiers: [], gang_sheet: false,
  options: [
    { id: "qty", name: "Quantity", input_type: "quantity", required: true, values: [{ id: "q500", label: "500" }, { id: "q1000", label: "1000" }] },
    { id: "paper", name: "Paper", required: true, values: [{ id: "gloss", label: "Gloss" }, { id: "matte", label: "Matte" }, { id: "kraft", label: "Kraft" }] },
  ],
};

/** The buy box as the builder draws it: first choices already picked, base price showing. */
function page(): HTMLElement {
  const root = document.createElement("div");
  root.dataset.productId = "flyer";
  root.innerHTML = `
    <div class="b-price" data-theme-price="1">$25.00</div>
    <div class="variant-group" data-option-id="qty"><label class="vlabel">Quantity</label>
      <button class="b-choice selected" data-label="500" data-value-id="q500">500</button>
      <button class="b-choice" data-label="1000" data-value-id="q1000">1000</button></div>
    <div class="variant-group" data-option-id="paper"><label class="vlabel">Paper</label>
      <button class="b-choice selected" data-label="Gloss" data-value-id="gloss">Gloss</button>
      <button class="b-choice" data-label="Matte" data-value-id="matte">Matte</button>
      <button class="b-choice" data-label="Kraft" data-value-id="kraft">Kraft</button></div>
    <div class="qty-box" data-theme-qty="1"><button type="button">−</button><input type="number" value="1" /><button type="button">+</button></div>
    <button data-theme-buy="1">Add to cart</button>`;
  document.body.appendChild(root);
  return root;
}

const shown = (root: HTMLElement) => root.querySelector("[data-theme-price]")!.textContent;
const choose = (root: HTMLElement, valueId: string) => fireEvent.click(root.querySelector(`[data-value-id="${valueId}"]`)!);

describe("a product sold in set quantities by a price table", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.mocked(api.post).mockReset();
  });

  it("opens on the price of its first choices, and shows each set's whole price", async () => {
    vi.mocked(api.post).mockImplementation((_url, body) => priceOf(body.selections));
    const root = page();
    render(<ThemeProductBuy product={FLYER} />);
    await waitFor(() => expect(shown(root)).toBe("$120.00"));

    choose(root, "matte");
    await waitFor(() => expect(shown(root)).toBe("$140.00"));
    choose(root, "q1000");
    await waitFor(() => expect(shown(root)).toBe("$230.00"));
    // Back to the first choices: the price it opened on, not $0.24.
    choose(root, "q500");
    choose(root, "gloss");
    await waitFor(() => expect(shown(root)).toBe("$120.00"));
    // The page's own quantity box would change nothing: the question sets how many.
    expect(root.querySelector<HTMLElement>("[data-theme-qty]")!.style.display).toBe("none");
  });

  it("shows the latest choice's price when an earlier answer comes back last", async () => {
    let releaseSlow: (v: unknown) => void = () => {};
    vi.mocked(api.post).mockImplementation((_url, body) =>
      body.selections.paper === "matte" ? new Promise((resolve) => { releaseSlow = resolve; }) : priceOf(body.selections));
    const root = page();
    render(<ThemeProductBuy product={FLYER} />);
    await waitFor(() => expect(shown(root)).toBe("$120.00"));
    choose(root, "matte");   // slow
    choose(root, "gloss");   // fast
    await waitFor(() => expect(shown(root)).toBe("$120.00"));
    await act(async () => { releaseSlow({ unit_price: 0.28, total: 140, quantity: 500, quantity_from_option: true }); });
    expect(shown(root)).toBe("$120.00");
  });

  it("says a combination the table does not sell is not available", async () => {
    vi.mocked(api.post).mockImplementation((_url, body) => priceOf(body.selections));
    const root = page();
    render(<ThemeProductBuy product={FLYER} />);
    await waitFor(() => expect(shown(root)).toBe("$120.00"));
    choose(root, "kraft");
    await waitFor(() => expect(shown(root)).toBe("Not available"));
  });

  it("puts the whole set in a guest's cart at the set's price", async () => {
    vi.mocked(api.post).mockImplementation((_url, body) => priceOf(body.selections));
    const root = page();
    render(<ThemeProductBuy product={FLYER} />);
    await waitFor(() => expect(shown(root)).toBe("$120.00"));
    fireEvent.click(root.querySelector("[data-theme-buy]")!);
    await waitFor(() => expect(readGuestCart()).toHaveLength(1));
    const [line] = readGuestCart();
    expect(line).toMatchObject({ quantity: 500, line_total: 120, quantity_from_option: true, selections: { qty: "q500", paper: "gloss" } });
    expect(guestLineTotal(line!)).toBe(120);
    // A second set is a second line, never 1,000 flyers at the 500 price.
    fireEvent.click(root.querySelector("[data-theme-buy]")!);
    await waitFor(() => expect(readGuestCart()).toHaveLength(2));
    expect(JSON.parse(localStorage.getItem(GUEST_CART_KEY)!).map((l: { quantity: number }) => l.quantity)).toEqual([500, 500]);
  });
});

describe("the price line's words", () => {
  it("is the set's price for a set, the total for one, and each plus total for several", () => {
    expect(configuredPriceText({ unit_price: 0.24, total: 120, quantity: 500, quantity_from_option: true }, 1)).toBe("$120.00");
    expect(configuredPriceText({ unit_price: 12, total: 37, quantity: 1 }, 1)).toBe("$37.00");
    expect(configuredPriceText({ unit_price: 12, total: 73, quantity: 4 }, 4)).toBe("$12.00 each · $73.00");
  });
});
