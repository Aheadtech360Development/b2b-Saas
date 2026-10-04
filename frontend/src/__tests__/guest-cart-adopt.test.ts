/**
 * The guest cart, carried into the account a shopper opens at checkout.
 *
 * The first order needs an account, so every first-time buyer signs up with
 * a cart already chosen — and those lines used to stay behind in the browser.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { kind: string; body: unknown }[] = [];
let failVariant = "";
let failOnce500 = "";

vi.mock("@/services/cart.service", () => ({
  cartService: {
    addMatrix: vi.fn(async (product_id: string, items: { variant_id: string; quantity: number }[]) => {
      if (items.some((i) => i.variant_id === failVariant)) {
        const { ApiClientError } = await import("@/lib/api-client");
        throw new ApiClientError(404, "NOT_FOUND", "Variant not found");
      }
      calls.push({ kind: "matrix", body: { product_id, items } });
      return {};
    }),
    addGangSheet: vi.fn(async (id: string) => {
      if (id === failOnce500) {
        failOnce500 = "";
        const { ApiClientError } = await import("@/lib/api-client");
        throw new ApiClientError(503, "UNAVAILABLE", "Try again");
      }
      calls.push({ kind: "gang", body: id });
      return {};
    }),
  },
}));

vi.mock("@/lib/api-client", async (orig) => {
  const real = await orig<typeof import("@/lib/api-client")>();
  return {
    ...real,
    apiClient: { ...real.apiClient, post: vi.fn(async (url: string, body: unknown) => { calls.push({ kind: url, body }); return {}; }) },
  };
});

import { GUEST_CART_KEY, adoptGuestCart, readGuestCart, type GuestLine } from "@/lib/guestCart";

const tee = (variant: string, qty = 1): GuestLine => ({
  variant_id: variant, quantity: qty, product_id: "p-tee", product_name: "Tee", slug: "tee", color: "White", size: "M", unit_price: 14,
});

describe("carrying the guest cart into a new account", () => {
  beforeEach(() => {
    calls.length = 0;
    failVariant = "";
    failOnce500 = "";
    localStorage.clear();
  });

  it("moves every kind of line — stocked, made-to-order, gang sheet — and empties the guest cart", async () => {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify([
      tee("v1", 2), tee("v2", 1),
      { ...tee("cfg:p-card:stock=a"), product_id: "p-card", product_name: "Cards", selections: { stock: "a" }, artwork: { url: "https://x/a.pdf", file_name: "a.pdf", file_type: "application/pdf" } },
      { ...tee("gs:job1"), product_id: "", product_name: "Gang Sheet GS-1", gang_sheet_order_id: "job1" },
    ]));
    const r = await adoptGuestCart();
    expect(r).toEqual({ moved: 4, dropped: [] });
    expect(calls).toContainEqual({ kind: "matrix", body: { product_id: "p-tee", items: [{ variant_id: "v1", quantity: 2 }, { variant_id: "v2", quantity: 1 }] } });
    expect(calls).toContainEqual({ kind: "gang", body: "job1" });
    expect(calls.find((c) => c.kind === "/api/v1/cart/add-configured")?.body).toMatchObject({ product_id: "p-card", selections: { stock: "a" }, quantity: 1 });
    expect(readGuestCart()).toEqual([]);
  });

  it("keeps the good lines when one can no longer be bought, and says which", async () => {
    failVariant = "v-gone";
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify([tee("v1"), tee("v-gone")]));
    const r = await adoptGuestCart();
    expect(r.moved).toBe(1);
    expect(r.dropped.map((l) => l.variant_id)).toEqual(["v-gone"]);
    expect(readGuestCart()).toEqual([]); // not retried forever
  });

  it("puts a line back for next time when the server only stumbled", async () => {
    failOnce500 = "job9";
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ ...tee("gs:job9"), gang_sheet_order_id: "job9" }]));
    expect(await adoptGuestCart()).toEqual({ moved: 0, dropped: [] });
    expect(readGuestCart().map((l) => l.gang_sheet_order_id)).toEqual(["job9"]);
    expect(await adoptGuestCart()).toEqual({ moved: 1, dropped: [] });
    expect(readGuestCart()).toEqual([]);
  });

  it("sends each line once when two parts of the page ask at the same moment", async () => {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify([tee("v1", 3)]));
    const [a, b] = await Promise.all([adoptGuestCart(), adoptGuestCart()]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c.kind === "matrix")).toHaveLength(1);
  });

  it("leaves lines alone while another tab is moving them", async () => {
    localStorage.setItem("af_guest_cart_adopting", JSON.stringify({ at: Date.now(), lines: [tee("v1")] }));
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify([tee("v2")]));
    expect(await adoptGuestCart()).toEqual({ moved: 0, dropped: [] });
    expect(calls).toHaveLength(0);
  });

  it("picks up lines a closed tab left half-moved", async () => {
    localStorage.setItem("af_guest_cart_adopting", JSON.stringify({ at: Date.now() - 10 * 60_000, lines: [tee("v1")] }));
    const r = await adoptGuestCart();
    expect(r.moved).toBe(1);
    expect(localStorage.getItem("af_guest_cart_adopting")).toBeNull();
  });
});
