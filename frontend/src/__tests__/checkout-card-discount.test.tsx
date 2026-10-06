/**
 * The card is asked for the discounted amount.
 *
 * The card form raises its payment the moment it appears. It appeared on the
 * review page's first render — before the page had read the discount code the
 * buyer applied in the cart — so the payment was priced at full price, the
 * card paid full price, and the order (which was given the code) recorded the
 * discounted total. A $7.35 order with 90% off charged $7.35 plus tax.
 */
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mounts: Record<string, unknown>[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => ({ isAuthenticated: () => true, isLoading: false }) }));
vi.mock("@/stores/cart.store", () => ({ useCartStore: (pick: (s: { clearCart: () => void }) => unknown) => pick({ clearCart: () => {} }) }));
vi.mock("@/stores/checkout.store", () => {
  const state = {
    shippingAddress: { full_name: "Sam Lee", line1: "30 N Gould St", city: "Sheridan", state: "WY", postal_code: "82801", country: "US" },
    companyName: "Sam Prints", contactName: "Sam Lee", shippingPhone: "", shippingMethod: "standard", shippingCost: 0,
    addressId: null, poNumber: "", orderNotes: "", setPoNumber: () => {}, setOrderNotes: () => {},
    savedCardId: null, setConfirmedOrder: () => {}, taxRegion: "", taxRate: 0, taxAmount: 0,
    paymentMethod: "card", achBankName: "", achAccountHolder: "", achRoutingNumber: "", achAccountLast4: "",
    achAccountType: "", shippingType: "flat", selectedRate: null, convenienceFee: 0,
  };
  const useCheckoutStore = Object.assign(() => state, { getState: () => state });
  return { useCheckoutStore };
});
vi.mock("@/services/cart.service", () => ({ cartService: { getCart: () => Promise.resolve({ subtotal: 7.35, items: [] }) } }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { post: () => Promise.resolve({ tax_rate: 0, tax_amount: 0, region: "", taxable: false }), get: () => Promise.resolve({}) },
}));
vi.mock("@/components/checkout/StripePaymentForm", () => ({
  // Stands in for the card form: what it would raise its payment with, at the
  // moment it appears — which is when the real one does.
  StripePaymentForm: ({ intentPayload }: { intentPayload: Record<string, unknown> }) => {
    useEffect(() => { mounts.push(intentPayload); }, [intentPayload]);
    return <div>card form</div>;
  },
}));

import CheckoutReviewPage from "@/app/(customer)/checkout/review/page";

beforeEach(() => {
  mounts.length = 0;
  localStorage.clear();
});

describe("paying by card with a discount code", () => {
  it("raises the card's payment with the code the buyer applied, from the first moment", async () => {
    localStorage.setItem("af_coupon", JSON.stringify({ code: "SAVE90", discount_amount: 6.62, discount_type: "percentage" }));
    render(<CheckoutReviewPage />);
    await waitFor(() => expect(screen.getByText("card form")).toBeInTheDocument());
    expect(mounts.length).toBeGreaterThan(0);
    // Every payment the form raised was priced with the code — none without it.
    for (const payload of mounts) expect(payload.discount_code).toBe("SAVE90");
  });

  it("raises it without a code when there is none", async () => {
    render(<CheckoutReviewPage />);
    await waitFor(() => expect(screen.getByText("card form")).toBeInTheDocument());
    expect(mounts.every((p) => p.discount_code === undefined)).toBe(true);
  });
});
