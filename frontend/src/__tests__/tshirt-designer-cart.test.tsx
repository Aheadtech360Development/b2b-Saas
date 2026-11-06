/**
 * A design from the t-shirt designer, bought through the cart.
 *
 * What each test holds, in the owner's terms:
 * - A design is one line in the cart: "12 pieces for $204.00", with what each
 *   shirt is, a way back to the designer, and no quantity box (sizes change in
 *   the designer). One that can't be ordered says why, and checkout waits.
 * - A guest's design waits in the browser's cart and moves into the account
 *   when they sign up to check out, priced again on the server.
 * - Finishing a design sent before: updated while it is still the buyer's,
 *   the changes sent back when a paid one was sent back, a new design (and
 *   order) when the old one was bought.
 * - On Production a design is a card like a sheet's, opening the design.
 * - The shop's analytics hear of a design as one custom design, never its name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";

const getCart = vi.fn();
const addTshirtDesign = vi.fn();
vi.mock("@/services/cart.service", () => ({
  cartService: {
    getCart: () => getCart(), addTshirtDesign: (id: string) => addTshirtDesign(id),
    addMatrix: vi.fn(), addGangSheet: vi.fn(), removeItem: vi.fn(), updateItem: vi.fn(),
  },
}));
const signedIn = { value: true };
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ isAuthenticated: () => signedIn.value, isLoading: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/storefront/PointsLine", () => ({ PointsLine: () => null }));
vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  apiClient: { get: vi.fn(async () => ({ estimated_shipping: 9.99 })), post: vi.fn() },
}));

import CartView from "@/components/storefront/CartView";
import { finishPlan } from "@/components/designer/finish";
import { decorationWords, designRows } from "@/components/shared/ConfigurationDetail";
import {
  addToGuestCart, adoptGuestCart, designLine, guestCheckoutItem, isDesignLine, readGuestCart, writeGuestCart,
} from "@/lib/guestCart";
import { cartLine } from "@/lib/tracking";
import { jobHref, jobSummary } from "@/services/production.service";
import type { Cart, CartItem } from "@/types/order.types";

const snapshot = {
  id: "d1", reference: "TS-AB-2611-0007", name: "Team tees", method: "print", pieces: 12, total: 204, personalization: 0,
  lines: [
    { garment: "Gildan 5000", colour: "Black", size: "S", qty: 4, sides: ["front", "back"] },
    { garment: "Gildan 5000", colour: "Black", size: "M", qty: 4, sides: ["front", "back"] },
    { garment: "Gildan 5000", colour: "Black", size: "2XL", qty: 2, sides: ["front", "back"] },
    { garment: "Gildan 5000", colour: "Sport Grey", size: "M", qty: 2, sides: ["front"] },
  ],
};

function designItem(over: Partial<CartItem> = {}): CartItem {
  return {
    id: "line-1", variant_id: null, product_id: null, product_name: "Team tees", product_image_url: "https://ik.example/front.png",
    sku: "TS-AB-2611-0007", color: null, size: null, quantity: 12, unit_price: "17.00", line_total: "204.00",
    moq: 0, moq_satisfied: true, stock_quantity: 12, item_type: "tshirt_design",
    configuration: { tshirt_design: snapshot }, problem: null, ...over,
  };
}

function cart(items: CartItem[]): Cart {
  return {
    items, subtotal: items.reduce((n, i) => n + Number(i.line_total), 0).toFixed(2), item_count: items.length,
    total_units: items.reduce((n, i) => n + i.quantity, 0), discount_percent: "0",
    validation: { is_valid: true, moq_violations: [], mov_violation: false, mov_required: "0", mov_current: "0", estimated_shipping: "0", has_shipping_tier: true },
  } as unknown as Cart;
}

beforeEach(() => {
  getCart.mockReset(); addTshirtDesign.mockReset(); signedIn.value = true;
  localStorage.clear();
});

describe("a design in the cart", () => {
  it("is one line: its pieces for its total, each shirt in words, back to the designer, no quantity box", async () => {
    getCart.mockResolvedValue(cart([designItem()]));
    await act(async () => { render(<CartView />); });
    const line = (await screen.findByText("Team tees")).closest(".cart-line") as HTMLElement;
    expect(within(line).getByText("Design")).toBeInTheDocument();
    expect(line.textContent).toContain("12 pieces for $204.00");
    expect(line.textContent).toContain("Gildan 5000, Black: S ×4, M ×4, 2XL ×2. Printed front and back");
    expect(line.textContent).toContain("Gildan 5000, Sport Grey: M ×2. Printed front");
    expect(within(line).getByRole("link", { name: "Edit design" })).toHaveAttribute("href", "/design?design=d1");
    expect(within(line).queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
  });

  it("that can no longer be ordered says why, and checkout waits until it is fixed", async () => {
    const problem = "Only 3 of Gildan 5000 in Black, size S left in stock.";
    getCart.mockResolvedValue(cart([designItem({ problem })]));
    await act(async () => { render(<CartView />); });
    expect(await screen.findByText(problem, { selector: "[data-line-problem]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checkout" })).toBeDisabled();
    expect(screen.getByText(`Fix Team tees first: ${problem}`)).toBeInTheDocument();
  });
});

describe("a guest's design", () => {
  const record = { id: "d1", reference: "TS-AB-2611-0007", name: "Team tees", quoted_total: 204, total_qty: 12, preview_url: "https://ik.example/front.png" };

  it("waits in the browser's cart as one line, and saving it again replaces that line", () => {
    addToGuestCart(designLine(record));
    addToGuestCart(designLine({ ...record, quoted_total: 230, total_qty: 14 }));
    const lines = readGuestCart();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ variant_id: "ts:d1", tshirt_design_id: "d1", quantity: 14, line_total: 230, product_name: "Team tees" });
    expect(isDesignLine(lines[0]!)).toBe(true);
    expect(guestCheckoutItem(lines[0]!)).toEqual({ quantity: 14, tshirt_design_id: "d1" });
    expect(designLine({ ...record, name: "Untitled design" }).product_name).toBe("Custom design");
  });

  it("shows in the guest cart like an account's", async () => {
    signedIn.value = false;
    writeGuestCart([designLine(record)]);
    await act(async () => { render(<CartView />); });
    const line = (await screen.findByText("Team tees")).closest(".cart-line") as HTMLElement;
    expect(line.textContent).toContain("12 pieces for $204.00");
    expect(within(line).getByRole("link", { name: "Edit design" })).toHaveAttribute("href", "/design?design=d1");
  });

  it("moves into the account at sign-up through the cart's own route, priced again there", async () => {
    writeGuestCart([designLine(record)]);
    addTshirtDesign.mockResolvedValue(cart([designItem()]));
    const out = await adoptGuestCart();
    expect(addTshirtDesign).toHaveBeenCalledWith("d1");
    expect(out).toEqual({ moved: 1, dropped: [] });
    expect(readGuestCart()).toEqual([]);
  });
});

describe("finishing a design sent before", () => {
  it("updates it while it is the buyer's, sends the changes when a paid one was sent back, else starts a new one", () => {
    expect(finishPlan({ order_id: null, status: "submitted" })).toEqual({ keep: true, finish: "cart" });
    expect(finishPlan({ order_id: "o1", status: "revision_requested" })).toEqual({ keep: true, finish: "changes" });
    expect(finishPlan({ order_id: "o1", status: "approved" })).toEqual({ keep: false, finish: "cart" });
    expect(finishPlan({ order_id: "o1", status: "completed" })).toEqual({ keep: false, finish: "cart" });
    expect(finishPlan(null)).toEqual({ keep: false, finish: "cart" });
  });
});

describe("in words", () => {
  it("a shirt's decoration, and a design's shirts", () => {
    expect(decorationWords("print", ["front", "back", "left"])).toBe("Printed front, back and left sleeve");
    expect(decorationWords("embroidery", ["front"])).toBe("Embroidered front");
    expect(designRows({ id: "d1", reference: "R", method: "print", sides: ["back"] })).toEqual(["Printed back"]);
    expect(designRows({ ...snapshot, personalization: 7 }).at(-1)).toBe("Names and numbers: $7.00");
  });

  it("on Production: a design's card opens the design, and says what it is", () => {
    const job = { id: "d1", kind: "tshirt_design" as const, sheet_name: "Team tees", width_in: 0, height_in: 0, quantity: 12, subtotal: 204 };
    expect(jobHref(job)).toBe("/admin/tshirt-designer?tab=designs&design=d1");
    expect(jobSummary(job)).toBe("Custom shirts, Team tees, 12 pieces, $204.00");
    expect(jobSummary({ ...job, sheet_name: "Untitled design" })).toBe("Custom shirts, 12 pieces, $204.00");
    expect(jobHref({ id: "g1", kind: "gang_sheet" })).toBe("/admin/production/g1");
  });

  it("to the shop's analytics: one custom design, never the buyer's name for it", () => {
    expect(cartLine({ ...designItem(), unit_price: "17.00" })).toEqual(
      { id: "CUSTOM-DESIGN", sku: "CUSTOM-DESIGN", name: "Custom design", price: 17, quantity: 12 });
    expect(cartLine({ variant_id: "ts:d1", product_name: "Smith family reunion", quantity: 3, unit_price: 20 }).name).toBe("Custom design");
  });
});
