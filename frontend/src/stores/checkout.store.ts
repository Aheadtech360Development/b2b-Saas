import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export type ShippingMethod = "standard" | "expedited" | "will_call";

export interface SelectedLiveRate {
  rate_id: string;
  carrier: string;
  service: string;
  price: number;
}

interface CheckoutState {
  // Step 1 — shipping
  addressId: string | null;
  shippingAddress: ShippingAddress | null;
  companyName: string;
  contactName: string;
  shippingPhone: string;
  shippingMethod: ShippingMethod;
  shippingCost: number;
  shippingType: string;
  selectedRate: SelectedLiveRate | null;

  // Step 1 extras (PO + notes kept for backward compat)
  poNumber: string;
  orderNotes: string;

  // Tax (calculated at address step, persisted to review step)
  taxRegion: string | null;
  taxRate: number;
  taxAmount: number;

  // Convenience fee (3% for card payments, persisted so review page sees it)
  convenienceFee: number;

  // Payment method selection
  paymentMethod: "card" | "ach" | "net_30";
  achBankName: string;
  achAccountHolder: string;
  achRoutingNumber: string;
  achAccountLast4: string;
  achAccountType: string;

  // Step 2 — payment (QB Payments)
  qbToken: string | null;
  savedCardId: string | null;
  // Stripe (legacy)
  paymentIntentId: string | null;
  clientSecret: string | null;

  // Step 3 — confirmed order data
  confirmedOrderId: string | null;
  confirmedOrderNumber: string | null;
  confirmedOrderTotal: number;
  confirmedUnits: number;
  confirmedColorSummary: string;
  confirmedProductName: string;
  confirmedShippingMethod: ShippingMethod;
  confirmedShippingCost: number;
  confirmedPaymentMethod: string;

  // Actions
  setAddressId: (id: string | null) => void;
  setShippingAddress: (address: ShippingAddress | null) => void;
  setCompanyName: (v: string) => void;
  setContactName: (v: string) => void;
  setShippingPhone: (v: string) => void;
  setShippingMethod: (m: ShippingMethod) => void;
  setShippingCost: (cost: number) => void;
  setShippingType: (t: string) => void;
  setSelectedRate: (r: SelectedLiveRate | null) => void;
  setTaxInfo: (region: string | null, rate: number, amount?: number) => void;
  setConvenienceFee: (fee: number) => void;
  setPaymentMethod: (m: "card" | "ach" | "net_30") => void;
  setAchInfo: (bankName: string, accountHolder: string, routingNumber: string, accountLast4: string, accountType: string) => void;
  setPoNumber: (po: string) => void;
  setOrderNotes: (notes: string) => void;
  setQbToken: (token: string | null) => void;
  setSavedCardId: (id: string | null) => void;
  setPaymentIntent: (id: string, secret: string) => void;
  setConfirmedOrder: (order: {
    id: string;
    number: string;
    total: number;
    units: number;
    colorSummary: string;
    productName: string;
    shippingMethod: ShippingMethod;
    shippingCost?: number;
    paymentMethod?: string;
    isGuest?: boolean;
  }) => void;
  reset: () => void;
}

const initialState = {
  addressId: null,
  shippingAddress: null,
  companyName: "",
  contactName: "",
  shippingPhone: "",
  shippingMethod: "standard" as ShippingMethod,
  shippingCost: 0,
  shippingType: "",
  selectedRate: null,
  taxRegion: null,
  taxRate: 0,
  taxAmount: 0,
  convenienceFee: 0,
  paymentMethod: "card" as "card" | "ach" | "net_30",
  achBankName: "",
  achAccountHolder: "",
  achRoutingNumber: "",
  achAccountLast4: "",
  achAccountType: "",
  poNumber: "",
  orderNotes: "",
  qbToken: null,
  savedCardId: null,
  paymentIntentId: null,
  clientSecret: null,
  confirmedOrderId: null,
  confirmedOrderNumber: null,
  confirmedOrderTotal: 0,
  confirmedUnits: 0,
  confirmedColorSummary: "",
  confirmedProductName: "",
  confirmedShippingMethod: "standard" as ShippingMethod,
  confirmedShippingCost: 0,
  confirmedPaymentMethod: "card",
};

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      ...initialState,
      setAddressId: (id) => set({ addressId: id }),
      setShippingAddress: (address) => set({ shippingAddress: address }),
      setCompanyName: (v) => set({ companyName: v }),
      setContactName: (v) => set({ contactName: v }),
      setShippingPhone: (v) => set({ shippingPhone: v }),
      setShippingMethod: (m) => set({ shippingMethod: m }),
      setShippingCost: (cost) => set({ shippingCost: cost }),
      setShippingType: (t) => set({ shippingType: t }),
      setSelectedRate: (r) => set({ selectedRate: r }),
      setTaxInfo: (region, rate, amount = 0) => set({ taxRegion: region, taxRate: rate, taxAmount: amount }),
      setConvenienceFee: (fee) => set({ convenienceFee: fee }),
      setPaymentMethod: (m) => set({ paymentMethod: m }),
      setAchInfo: (bankName, accountHolder, routingNumber, accountLast4, accountType) =>
        set({ achBankName: bankName, achAccountHolder: accountHolder, achRoutingNumber: routingNumber, achAccountLast4: accountLast4, achAccountType: accountType }),
      setPoNumber: (po) => set({ poNumber: po }),
      setOrderNotes: (notes) => set({ orderNotes: notes }),
      setQbToken: (token) => set({ qbToken: token, savedCardId: null }),
      setSavedCardId: (id) => set({ savedCardId: id, qbToken: null }),
      setPaymentIntent: (id, secret) => set({ paymentIntentId: id, clientSecret: secret }),
      setConfirmedOrder: ({ id, number, total, units, colorSummary, productName, shippingMethod, shippingCost, paymentMethod }) =>
        set({
          confirmedOrderId: id,
          confirmedOrderNumber: number,
          confirmedOrderTotal: total,
          confirmedUnits: units,
          confirmedColorSummary: colorSummary,
          confirmedProductName: productName,
          confirmedShippingMethod: shippingMethod,
          confirmedShippingCost: shippingCost ?? 0,
          confirmedPaymentMethod: paymentMethod ?? "card",
        }),
      reset: () => set(initialState),
    }),
    {
      name: "af-checkout",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        shippingType: state.shippingType,
        selectedRate: state.selectedRate,
      }),
    }
  )
);
