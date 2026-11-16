/**
 * The card is asked for the discounted amount.
 *
 * The card form raises its payment the moment it appears. It once appeared
 * before the page had read the discount code the buyer applied in the cart,
 * so the payment was priced at full price, the card paid full price, and the
 * order (which was given the code) recorded the discounted total. A $7.35
 * order with 90% off charged $7.35 plus tax. Checked on the one-page checkout.
 */
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mounts: Record<string, unknown>[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/providers/BrandingProvider", () => ({ useBranding: () => ({}) }));
vi.mock("@/hooks/useAddressAutocomplete", () => ({ useAddressAutocomplete: () => ({ current: null }) }));
vi.mock("@/lib/buyerReferral", () => ({ claimBuyerReferral: () => Promise.resolve() }));
vi.mock("@/stores/auth.store", () => {
  const state = { isAuthenticated: () => true, isLoading: false, user: { email: "sam@shop.com", first_name: "Sam", last_name: "Lee" } };
  return { useAuthStore: (pick?: (s: typeof state) => unknown) => (pick ? pick(state) : state) };
});
vi.mock("@/stores/cart.store", () => ({ useCartStore: (pick: (s: { clearCart: () => void }) => unknown) => pick({ clearCart: () => {} }) }));
vi.mock("@/stores/checkout.store", () => {
  const noop = () => {};
  const state = {
    shippingAddress: null, companyName: "", contactName: "Sam Lee", shippingPhone: "", shippingMethod: "standard",
    addressId: null, poNumber: "", orderNotes: "", paymentMethod: "card", shippingType: "store_default", selectedRate: null,
    setPoNumber: noop, setOrderNotes: noop, setConfirmedOrder: noop, setShippingMethod: noop, setPaymentMethod: noop,
    setCompanyName: noop, setContactName: noop, setShippingPhone: noop, setShippingAddress: noop, setAddressId: noop,
    setShippingCost: noop, setShippingType: noop, setTaxInfo: noop, setSelectedRate: noop,
  };
  const useCheckoutStore = Object.assign(() => state, { getState: () => state });
  return { useCheckoutStore };
});
vi.mock("@/services/cart.service", () => ({
  cartService: {
    getCart: () => Promise.resolve({
      subtotal: 7.35, total_units: 1,
      validation: { has_shipping_tier: true, estimated_shipping: "6.00" },
      items: [{ id: "i1", product_name: "Tee", quantity: 1, line_total: "7.35", unit_price: "7.35", item_type: "variant", variant_id: "v1" }],
    }),
  },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    post: () => Promise.resolve({ tax_rate: 0, tax_amount: 0, region: "", taxable: false }),
    get: (url: string) => Promise.resolve(
      url.includes("/account/addresses")
        ? [{ id: "a1", label: null, full_name: "Sam Lee", line1: "30 N Gould St", line2: null, city: "Sheridan", state: "WY", postal_code: "82801", country: "US", phone: null, is_default: true }]
        : url.includes("payment-options") ? { card: true, cod: false } : {},
    ),
  },
}));
vi.mock("@/components/checkout/StripePaymentForm", () => ({
  // Stands in for the card form: what it would raise its payment with, at the
  // moment it appears, which is when the real one does.
  StripePaymentForm: ({ intentPayload }: { intentPayload: Record<string, unknown> }) => {
    useEffect(() => { mounts.push(intentPayload); }, [intentPayload]);
    return <div>card form</div>;
  },
}));

import CheckoutPage from "@/app/(customer)/checkout/page";

beforeEach(() => {
  mounts.length = 0;
  localStorage.clear();
});

describe("paying by card with a discount code", () => {
  it("raises the card's payment with the code the buyer applied, from the first moment", async () => {
    localStorage.setItem("af_coupon", JSON.stringify({ code: "SAVE90", discount_amount: 6.62, discount_type: "percentage" }));
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByText("card form")).toBeInTheDocument());
    expect(mounts.length).toBeGreaterThan(0);
    // Every payment the form raised was priced with the code, none without it.
    for (const payload of mounts) expect(payload.discount_code).toBe("SAVE90");
  });

  it("raises it without a code when there is none", async () => {
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByText("card form")).toBeInTheDocument());
    expect(mounts.every((p) => p.discount_code === undefined)).toBe(true);
  });

  it("asks for the address first, and only then shows the card form", async () => {
    render(<CheckoutPage />);
    // The saved address fills the delivery section; the card form follows.
    await waitFor(() => expect(screen.getByText("card form")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /Delivery address/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue("sam@shop.com")).toBeInTheDocument();
  });
});
