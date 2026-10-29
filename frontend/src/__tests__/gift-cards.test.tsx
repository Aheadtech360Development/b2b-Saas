/**
 * Gift cards (Retail launch, package 3) on the buyer's side: a guest cart line
 * for one, the checkout box that applies a code, the order placed with the
 * gift card alone, and the card form that steps aside when nothing is left
 * for a card to pay.
 */
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const calls: { url: string; body: unknown }[] = [];
const mounts: Record<string, unknown>[] = [];
let intentAnswer: Record<string, unknown> = {};
let balanceAnswer: Record<string, unknown> | Error = { masked: "•••• T1VB", last4: "T1VB", balance: 50, usable: true, problem: null };
const confirmOrder = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => ({ isAuthenticated: () => true, isLoading: false }) }));
vi.mock("@/stores/cart.store", () => ({ useCartStore: (pick: (s: { clearCart: () => void }) => unknown) => pick({ clearCart: () => {} }) }));
vi.mock("@/stores/checkout.store", () => {
  const state = {
    shippingAddress: { full_name: "Sam Lee", line1: "30 N Gould St", city: "Sheridan", state: "WY", postal_code: "82801", country: "US" },
    companyName: "", contactName: "Sam Lee", shippingPhone: "", shippingMethod: "standard", shippingCost: 6,
    addressId: null, poNumber: "", orderNotes: "", setPoNumber: () => {}, setOrderNotes: () => {},
    savedCardId: null, setConfirmedOrder: () => {}, taxRegion: "", taxRate: 0, taxAmount: 0,
    paymentMethod: "card", setPaymentMethod: () => {}, achBankName: "", achAccountHolder: "", achRoutingNumber: "",
    achAccountLast4: "", achAccountType: "", shippingType: "flat", selectedRate: null, convenienceFee: 0,
  };
  const useCheckoutStore = Object.assign(() => state, { getState: () => state });
  return { useCheckoutStore };
});
vi.mock("@/services/cart.service", () => ({
  cartService: {
    getCart: () => Promise.resolve({
      subtotal: 16, total_units: 2, discount_percent: 0,
      items: [{ id: "i1", product_name: "Youth Tee", quantity: 2, line_total: "16.00", unit_price: "8.00", item_type: "variant" }],
    }),
  },
}));
vi.mock("@/services/orders.service", () => ({ ordersService: { confirmOrder: (p: unknown) => confirmOrder(p) } }));
vi.mock("@/lib/api-client", () => ({
  ApiClientError: class extends Error { status = 0; },
  apiClient: {
    get: (url: string) => Promise.resolve(url.includes("gift-cards") ? { accepted: true } : { card: true, cod: false }),
    post: (url: string, body: unknown) => {
      calls.push({ url, body });
      if (url.includes("/gift-cards/balance")) {
        return balanceAnswer instanceof Error ? Promise.reject(balanceAnswer) : Promise.resolve(balanceAnswer);
      }
      return Promise.resolve({ tax_rate: 0, tax_amount: 0, region: "", taxable: false });
    },
  },
}));
vi.mock("@/components/checkout/StripePaymentForm", () => ({
  // Stands in for the card form: records what it would price, answers as the
  // payment step would, and offers the gift card button when told gift_only.
  StripePaymentForm: ({ intentPayload, onIntent, onGiftOnly, buttonLabel }: {
    intentPayload: Record<string, unknown>; onIntent?: (r: unknown) => void; onGiftOnly?: () => void; buttonLabel: string;
  }) => {
    useEffect(() => {
      mounts.push(intentPayload);
      onIntent?.(intentAnswer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return intentAnswer.gift_only
      ? <button type="button" onClick={onGiftOnly}>Place order with gift card</button>
      : <div>card form · {buttonLabel}</div>;
  },
}));

import CheckoutReviewPage from "@/app/(customer)/checkout/review/page";
import { giftCardLine, guestCheckoutItem, isGiftCardLine } from "@/lib/guestCart";

beforeEach(() => {
  calls.length = 0;
  mounts.length = 0;
  confirmOrder.mockReset();
  confirmOrder.mockResolvedValue({ id: "o1", order_number: "1051", total: "22.00", view_key: "k" });
  intentAnswer = { amount: 22, order_total: 22 };
  balanceAnswer = { masked: "•••• T1VB", last4: "T1VB", balance: 50, usable: true, problem: null };
  localStorage.clear();
  sessionStorage.clear();
});

describe("a gift card bought as a guest", () => {
  it("is one line of its own that checkout sends as a gift card", () => {
    const line = giftCardLine({ amount: 50, recipient_email: "ann@example.com", recipient_name: "Ann" });
    expect(line.product_name).toBe("Gift card 50.00 for Ann");
    expect(isGiftCardLine(line)).toBe(true);
    expect(guestCheckoutItem(line)).toEqual({ quantity: 1, gift_card: line.gift_card });
    expect(giftCardLine({ amount: 50, recipient_email: "a@b.co" }).variant_id).not.toBe(line.variant_id);
  });
});

describe("paying with a gift card", () => {
  it("applies a code after checking it, and prices the card with it", async () => {
    render(<CheckoutReviewPage />);
    const input = await screen.findByLabelText("Gift card code");
    fireEvent.change(input, { target: { value: "7k3m-9qx2-4pz8-t1vb" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText(/on the card/);
    expect(calls.find((c) => c.url.includes("/gift-cards/balance"))?.body).toEqual({ code: "7k3m-9qx2-4pz8-t1vb" });
    await waitFor(() => expect(mounts.some((m) => Array.isArray(m.gift_card_codes))).toBe(true));
    const priced = mounts.filter((m) => Array.isArray(m.gift_card_codes)).pop()!;
    expect(priced.gift_card_codes).toEqual(["7k3m-9qx2-4pz8-t1vb"]);
    // The attempt the holds belong to travels with every pricing.
    expect(typeof priced.checkout_ref).toBe("string");
    expect(String(priced.checkout_ref).length).toBeGreaterThan(8);
  });

  it("says why a code cannot be used, and prices nothing with it", async () => {
    balanceAnswer = new Error("That gift card code isn't valid. Check it and try again.");
    render(<CheckoutReviewPage />);
    fireEvent.change(await screen.findByLabelText("Gift card code"), { target: { value: "WRONG" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't valid");
    expect(mounts.some((m) => m.gift_card_codes)).toBe(false);
  });

  it("shows what the gift card pays and what is left for the card", async () => {
    intentAnswer = { amount: 30, order_total: 80, gift_cards: [{ last4: "T1VB", masked: "•••• T1VB", amount: 50 }],
      gift_card_total: 50, card_amount: 30 };
    render(<CheckoutReviewPage />);
    expect(await screen.findByText("To pay by card")).toBeInTheDocument();
    expect(screen.getByText("Gift card •••• T1VB")).toBeInTheDocument();
    expect(screen.getByText(/card form · Pay \$30\.00/)).toBeInTheDocument();
  });

  it("places the order with the gift card alone when it covers everything", async () => {
    intentAnswer = { amount: 0, order_total: 22, gift_only: true, gift_cards: [{ last4: "T1VB", masked: "•••• T1VB", amount: 22 }],
      gift_card_total: 22, card_amount: 0 };
    render(<CheckoutReviewPage />);
    fireEvent.change(await screen.findByLabelText("Gift card code"), { target: { value: "7K3M9QX24PZ8T1VB" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    // The form is priced again with the code (a fresh one, keyed by it).
    await waitFor(() => expect(mounts.some((m) => Array.isArray(m.gift_card_codes))).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Place order with gift card" }));
    await waitFor(() => expect(confirmOrder).toHaveBeenCalled());
    const sent = confirmOrder.mock.calls[0][0];
    expect(sent.payment_method).toBe("gift_card");
    expect(sent.payment_intent_id).toBeUndefined();
    expect(sent.gift_card_codes).toEqual(["7K3M9QX24PZ8T1VB"]);
    // The order's attempt key is the gift card holds' checkout reference.
    expect(sent.checkout_ref).toBe(sent.idempotency_key);
  });
});

describe("a gift card in the shop's analytics", () => {
  it("is reported as a gift card, never with who it is for", async () => {
    const { cartLine } = await import("@/lib/tracking");
    const guest = giftCardLine({ amount: 50, recipient_email: "ann@example.com", recipient_name: "Ann" });
    for (const line of [guest, { product_name: "Gift card 50.00 for ann@example.com", item_type: "gift_card", unit_price: 50, quantity: 1 }]) {
      const item = cartLine(line);
      expect(item).toMatchObject({ id: "gift-card", sku: "GIFT-CARD", name: "Gift card", price: 50 });
      expect(JSON.stringify(item)).not.toMatch(/ann/i);
    }
  });
});
