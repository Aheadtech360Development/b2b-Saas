/**
 * The cart on the owner's design (2026-11-16): the shop's own offers, the
 * free-shipping bar only when the buyer's shipping has a free line, line
 * badges that are true for the line, and the checkout button in the shop's
 * colour and words (Settings → Cart and checkout). A guest's offer line keeps
 * its offer price only while the server says the offer still applies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const posts: { url: string; body: Record<string, unknown> }[] = [];
let signedIn = true;
let offersAnswer: Record<string, unknown> = {};
let cartAnswer: Record<string, unknown> = {};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/providers/BrandingProvider", () => ({
  useBranding: () => ({ cart: { button_color: "#0F766E", checkout_text: "Go to checkout", place_order_text: "Pay now", show_order_note: true } }),
}));
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: { isAuthenticated: () => boolean; isLoading: boolean }) => unknown) =>
    pick({ isAuthenticated: () => signedIn, isLoading: false }),
}));
vi.mock("@/stores/checkout.store", () => ({ useCheckoutStore: () => ({ orderNotes: "", setOrderNotes: vi.fn() }) }));
vi.mock("@/components/storefront/PointsLine", () => ({ PointsLine: () => null }));
vi.mock("@/lib/tracking", () => ({ trackCartViewed: vi.fn(), trackLineAdd: vi.fn(), trackLinesRemoved: vi.fn() }));
vi.mock("@/lib/guestCart", async (orig) => ({
  ...(await orig<typeof import("@/lib/guestCart")>()),
  adoptGuestCart: () => Promise.resolve({ moved: 0, dropped: [] }),
}));
vi.mock("@/services/cart.service", () => ({
  cartService: { getCart: () => Promise.resolve(cartAnswer), removeItem: vi.fn(), updateItem: vi.fn() },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (url: string) => Promise.resolve(url.includes("/cart/upsells") ? offersAnswer : url.includes("payment-options") ? { card: true } : {}),
    post: (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      if (url.includes("/cart/add-upsell")) return Promise.resolve(cartAnswer);
      if (url.includes("/storefront/upsells")) return Promise.resolve(offersAnswer);
      return Promise.resolve({});
    },
  },
}));

import CartView from "@/components/storefront/CartView";
import { cartLook, inkOn } from "@/lib/cartLook";

const OFFER = {
  offer_id: "o1", product_id: "hoodie", product_slug: "hoodie", product_name: "Heavyweight hoodie",
  title: "Add a hoodie", description: null, image_url: null, kind: "ready", discount: "10% off", unlocks_free_shipping: false,
  variants: [
    { variant_id: "vh-m", label: "Black / M", color: "Black", size: "M", price: "58.00", offer_price: "52.20" },
    { variant_id: "vh-l", label: "Black / L", color: "Black", size: "L", price: "58.00", offer_price: "52.20" },
  ],
};

function account(items: Record<string, unknown>[], subtotal: number) {
  return { items, subtotal: String(subtotal), item_count: items.length, total_units: items.length, discount_percent: "0",
    validation: { is_valid: true, moq_violations: [], mov_violation: false, mov_required: "0", mov_current: String(subtotal), estimated_shipping: "12", has_shipping_tier: true } };
}
const TEE = { id: "l1", variant_id: "vt", product_id: "tee", product_name: "Custom tee", color: "Navy", size: "L", quantity: 2,
  unit_price: "13.50", line_total: "27.00", retail_price: "13.50", stock_quantity: 40, tracks_stock: true, moq: 1, moq_satisfied: true };
const SHEET = { id: "l2", variant_id: null, product_id: null, product_name: "DTF gang sheet, 22 x 60", item_type: "gang_sheet", quantity: 1,
  unit_price: "89.00", line_total: "89.00", retail_price: "89.00", stock_quantity: 1, moq: 0, moq_satisfied: true };

beforeEach(() => {
  push.mockReset();
  posts.length = 0;
  signedIn = true;
  localStorage.clear();
  cartAnswer = account([TEE, SHEET], 471);
  offersAnswer = { offers: [OFFER], free_shipping: { threshold: "500.00", reached: false } };
});

describe("the cart", () => {
  it("says how far the buyer is from free shipping, only when their shipping has a free line", async () => {
    render(<CartView />);
    expect(await screen.findByText("You're $29.00 away from free shipping")).toBeInTheDocument();
    offersAnswer = { offers: [], free_shipping: null };
    const { container } = render(<CartView />);
    await waitFor(() => expect(container.querySelectorAll("[data-cart-line]").length).toBe(2));
    expect(container.querySelector("[data-free-shipping]")).toBeNull();
  });

  it("shows badges that are true for each line", async () => {
    render(<CartView />);
    await screen.findByText("Custom tee");
    expect(screen.getByText("Navy, size L")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(screen.getByText("Built in the gang sheet builder")).toBeInTheDocument();
    expect(screen.getByText("The shop checks your artwork before printing")).toBeInTheDocument();
    // The design's "Proof sent, approve to start production": no such step exists, so never.
    expect(screen.queryByText(/approve/i)).not.toBeInTheDocument();
  });

  it("offers the shop's upsell at its price and adds the option the buyer chose", async () => {
    render(<CartView />);
    expect(await screen.findByText("Add a hoodie")).toBeInTheDocument();
    expect(screen.getByText(/\$52\.20, 10% off/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose Heavyweight hoodie"), { target: { value: "vh-l" } });
    cartAnswer = account([TEE, SHEET, { id: "l3", variant_id: "vh-l", product_id: "hoodie", product_name: "Heavyweight hoodie",
      color: "Black", size: "L", quantity: 1, unit_price: "52.20", line_total: "52.20", regular_unit_price: "58.00", upsell_offer_id: "o1",
      retail_price: "58.00", stock_quantity: 5, moq: 1, moq_satisfied: true }], 523.2);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to cart" })); });
    expect(posts.find((p) => p.url === "/api/v1/cart/add-upsell")?.body).toEqual({ offer_id: "o1", variant_id: "vh-l", quantity: 1 });
    expect(await screen.findByText("Offer price")).toBeInTheDocument();
    // The usual price, struck through beside the offer price.
    expect(document.querySelector(".ck-was")?.textContent).toBe("$58.00");
  });

  it("puts the checkout button in the shop's colour and words", async () => {
    render(<CartView />);
    const btn = (await screen.findAllByRole("button", { name: "Go to checkout" }))[0]!;
    await act(async () => { fireEvent.click(btn); });
    expect(push).toHaveBeenCalledWith("/checkout");
  });

  it("keeps a guest's offer price only while the server says the offer still applies", async () => {
    signedIn = false;
    localStorage.setItem("af_guest_cart", JSON.stringify([
      { variant_id: "vt", quantity: 2, product_id: "tee", product_name: "Custom tee", slug: "tee", color: "Navy", size: "L", unit_price: 13.5, image_url: "x" },
      { variant_id: "vh-m", quantity: 1, product_id: "hoodie", product_name: "Heavyweight hoodie", slug: "hoodie", color: "Black", size: "M",
        unit_price: 52.2, regular_unit_price: 58, upsell_offer_id: "o1", image_url: "x" },
    ]));
    offersAnswer = { offers: [], free_shipping: null, applying: {} };
    render(<CartView />);
    await waitFor(() => expect(posts.some((p) => p.url === "/api/v1/storefront/upsells")).toBe(true));
    const sent = posts.find((p) => p.url === "/api/v1/storefront/upsells")!.body as { lines: { key: string; offer_id: string | null; line_total: number }[] };
    expect(sent.lines.find((l) => l.key === "vh-m")).toMatchObject({ offer_id: "o1", line_total: 58 });
    // The offer no longer applies: the hoodie is back at $58.00.
    expect(await screen.findAllByText("$58.00")).not.toHaveLength(0);
    expect(screen.queryByText("Offer price")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an account to check out" })).toBeInTheDocument();
  });
});

describe("the shop's button", () => {
  it("picks the theme colour unless the shop chose one, with text that reads on it", () => {
    expect(cartLook(null).button).toContain("var(--b-primary");
    expect(cartLook({ button_color: "#0F766E" }).button).toBe("#0F766E");
    expect(inkOn("#0F766E")).toBe("#fff");
    expect(inkOn("#FDE68A")).toBe("#111318");
    expect(cartLook({ checkout_text: "" }).checkoutText).toBe("Checkout");
    expect(cartLook({ show_order_note: false }).showOrderNote).toBe(false);
  });
});
