// frontend/src/app/(customer)/checkout/address/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useCheckoutStore, type ShippingMethod } from "@/stores/checkout.store";
import { useAuthStore } from "@/stores/auth.store";
import { cartService } from "@/services/cart.service";
import { formatCurrency } from "@/lib/utils";

interface LiveRate {
  rate_id: string;
  carrier: string;
  service: string;
  cost: number;
  days: number | null;
}

const CARRIER_LOGOS: Record<string, string> = {
  USPS: "https://shippo-static.s3.amazonaws.com/providers/75/USPS.png",
  UPS: "https://shippo-static.s3.amazonaws.com/providers/75/UPS.png",
  FedEx: "https://shippo-static.s3.amazonaws.com/providers/75/FedEx.png",
  DHL: "https://shippo-static.s3.amazonaws.com/providers/75/DHL_Express.png",
};

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY",
];

interface SavedAddress {
  id: string;
  label: string | null;
  full_name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "1px solid #E2E2DE",
  fontSize: "14px", fontFamily: "'DM Sans', sans-serif",
  outline: "none", boxSizing: "border-box", color: "#1A1A1A", background: "#fff",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 600, color: "#1A1A1A",
  textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "7px",
};
const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: "11px", letterSpacing: "0.1em",
  textTransform: "uppercase", fontWeight: 700, color: "#1A1A1A",
  marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid #E2E2DE",
};

const EXPEDITED_SURCHARGE = 45;

export default function CheckoutAddressPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const isGuest = !authIsLoading && !isAuthenticated;

  const {
    companyName, setCompanyName,
    contactName, setContactName,
    shippingPhone, setShippingPhone,
    shippingAddress, setShippingAddress,
    setAddressId,
    shippingMethod, setShippingMethod,
    setShippingCost,
    setTaxInfo,
    setShippingType,
    setSelectedRate,
  } = useCheckoutStore();

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const [tierShipping, setTierShipping] = useState<number | null>(null);
  const [taxRate, setTaxRate] = useState<{ region: string; rate: number } | null>(null);
  const [shippingTypeForUser, setShippingTypeForUser] = useState<string>("store_default");
  const [liveRates, setLiveRates] = useState<LiveRate[]>([]);
  const [liveRatesLoading, setLiveRatesLoading] = useState(false);
  const [selectedLiveRateId, setSelectedLiveRateId] = useState<string | null>(null);
  const [cartItemsForShipping, setCartItemsForShipping] = useState<Array<{ variant_id: string; quantity: number }>>([]);
  const [cartDisplayItems, setCartDisplayItems] = useState<Array<{ name: string; color: string | null; size: string | null; qty: number; lineTotal: number; imageUrl?: string | null }>>([]);
  const ratesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    company: companyName || "",
    contact: contactName || "",
    street: shippingAddress?.line1 || "",
    city: shippingAddress?.city || "",
    state: shippingAddress?.state || "",
    zip: shippingAddress?.postal_code || "",
    phone: shippingPhone || "",
    // Guest-specific fields
    email: "",
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [shippingGateError, setShippingGateError] = useState(false);

  const handleAddressAutofill = useCallback((addr: { street: string; city: string; state: string; zipCode: string }) => {
    setForm(prev => ({
      ...prev,
      street: addr.street || prev.street,
      city: addr.city || prev.city,
      state: addr.state || prev.state,
      zip: addr.zipCode || prev.zip,
    }));
  }, []);
  const streetInputRef = useAddressAutocomplete(handleAddressAutofill);

  // Fetch the shipping type applicable to the current user
  useEffect(() => {
    if (authIsLoading) return;
    apiClient.get<{ shipping_type: string }>("/api/v1/shipping/shipping-type")
      .then(r => setShippingTypeForUser(r.shipping_type || "store_default"))
      .catch(() => setShippingTypeForUser("store_default"));
  }, [authIsLoading]);

  // Load saved addresses + cart (subtotal + tier-based shipping)
  useEffect(() => {
    if (authIsLoading) return;
    const saved = localStorage.getItem("af_coupon");
    if (saved) {
      try { setCouponDiscount(JSON.parse(saved).discount_amount ?? 0); } catch { }
    }

    if (isGuest) {
      // Calculate subtotal + units from guest cart, then fetch real shipping rate
      let guestSubtotal = 0;
      let guestUnits = 0;
      try {
        const guestCart = JSON.parse(localStorage.getItem("af_guest_cart") || "[]") as Array<{ variant_id?: string; unit_price: number; quantity: number; product_name?: string; color?: string | null; size?: string | null; image_url?: string | null }>;
        guestSubtotal = guestCart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
        guestUnits = guestCart.reduce((s, i) => s + i.quantity, 0);
        setSubtotal(guestSubtotal);
        setCartItemsForShipping(
          guestCart.filter(i => i.variant_id).map(i => ({ variant_id: i.variant_id!, quantity: i.quantity }))
        );
        setCartDisplayItems(guestCart.map(i => ({
          name: i.product_name ?? "",
          color: i.color ?? null,
          size: i.size ?? null,
          qty: i.quantity,
          lineTotal: i.unit_price * i.quantity,
          imageUrl: i.image_url,
        })));
      } catch { /* ignore */ }
      setShowNewForm(true);
      if (shippingTypeForUser !== "live_shippo") {
        const sp = new URLSearchParams({ units: String(guestUnits), subtotal: String(guestSubtotal) });
        apiClient.get<{ estimated_shipping: number }>(`/api/v1/guest/shipping-estimate?${sp}`)
          .then(est => setTierShipping(Number(est.estimated_shipping ?? 9.99)))
          .catch(() => setTierShipping(9.99));
      }

      // Restore from sessionStorage if returning to this step
      try {
        const stored = sessionStorage.getItem("af_guest_checkout");
        if (stored) {
          const data = JSON.parse(stored);
          setForm(prev => ({
            ...prev,
            contact: data.name || prev.contact,
            email: data.email || prev.email,
            phone: data.phone || prev.phone,
            street: data.line1 || prev.street,
            city: data.city || prev.city,
            state: data.state || prev.state,
            zip: data.postal_code || prev.zip,
          }));
        }
      } catch { /* ignore */ }
    } else {
      cartService.getCart().then(c => {
        setSubtotal(Number(c.subtotal));
        setCartItemsForShipping(c.items.map(i => ({ variant_id: i.variant_id, quantity: i.quantity })));
        setCartDisplayItems(c.items.map(i => ({
          name: i.product_name,
          color: i.color ?? null,
          size: i.size ?? null,
          qty: i.quantity,
          lineTotal: Number(i.line_total),
          imageUrl: i.product_image_url,
        })));
        const hasTier = (c.validation as (typeof c.validation & { has_shipping_tier?: boolean }))?.has_shipping_tier ?? false;
        setTierShipping(hasTier ? Number(c.validation?.estimated_shipping ?? 0) : null);
      }).catch(() => {
        setTierShipping(null);
      });
      apiClient.get<SavedAddress[]>("/api/v1/account/addresses").then(addrs => {
        setSavedAddresses(addrs);
        if (addrs.length > 0) {
          const def = addrs.find(a => a.is_default) ?? addrs[0]!;
          setSelectedAddressId(def.id);
          setShowNewForm(false);
        } else {
          setShowNewForm(true);
        }
      }).catch(() => {
        setShowNewForm(true);
      });
    }
  }, [authIsLoading, isGuest]);

  // Selected live rate cost (null when no rate selected)
  const selectedLiveRate = liveRates.find(r => r.rate_id === selectedLiveRateId) ?? liveRates[0] ?? null;

  // Compute the shipping cost for a given method
  function methodCost(method: ShippingMethod): number {
    if (method === "will_call") return 0;
    if (shippingTypeForUser === "live_shippo" && method === "standard") {
      return selectedLiveRate ? selectedLiveRate.cost : 0;
    }
    const base = tierShipping ?? 0;
    if (method === "expedited") return base + EXPEDITED_SURCHARGE;
    return base; // standard
  }

  const selectedCost = methodCost(shippingMethod);
  const [apiTaxAmount, setApiTaxAmount] = useState(0);

  // Derive address fields for tax lookup
  const savedActive = savedAddresses.find(a => a.id === selectedAddressId);
  const activeState = showNewForm ? form.state : (savedActive?.state ?? "");
  const activeZip   = showNewForm ? form.zip   : (savedActive?.postal_code ?? "");
  const activeCity  = showNewForm ? form.city  : (savedActive?.city ?? "");

  function fetchLiveRates(zip: string, state: string) {
    if (!zip || zip.length !== 5 || !/^\d{5}$/.test(zip)) return;
    if (!state || state.length < 2) return;

    setLiveRatesLoading(true);
    setLiveRates([]);
    setSelectedLiveRateId(null);

    apiClient.post<{ rates: LiveRate[]; error?: string }>("/api/v1/shipping/live-rates", {
      to_zip: zip,
      to_state: state,
      to_city: activeCity || undefined,
      cart_items: cartItemsForShipping.length > 0 ? cartItemsForShipping : undefined,
    })
      .then(r => {
        const rates = r.rates || [];
        setLiveRates(rates);
        const first = rates[0];
        if (first) {
          setSelectedLiveRateId(first.rate_id);
          setTierShipping(first.cost);
        }
      })
      .catch(() => setLiveRates([]))
      .finally(() => setLiveRatesLoading(false));
  }

  // Trigger live rates fetch — debounced 800ms, only fires on exactly 5-digit ZIP
  useEffect(() => {
    if (shippingTypeForUser !== "live_shippo") return;

    if (ratesDebounceRef.current) clearTimeout(ratesDebounceRef.current);

    ratesDebounceRef.current = setTimeout(() => {
      fetchLiveRates(activeZip.trim(), activeState.trim());
    }, 800);

    return () => {
      if (ratesDebounceRef.current) clearTimeout(ratesDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingTypeForUser, activeZip, activeState, activeCity, cartItemsForShipping]);

  useEffect(() => {
    if (!activeState) {
      console.log("[Tax] Skipping — activeState is empty", { activeZip, subtotal, selectedAddressId });
      setTaxRate(null);
      setApiTaxAmount(0);
      setTaxInfo(null, 0, 0);
      return;
    }
    if (subtotal <= 0) {
      console.log("[Tax] Skipping — subtotal is 0", { activeState, activeZip });
      return;
    }
    console.log("[Tax] zip_code value:", activeZip, "type:", typeof activeZip, "length:", activeZip?.length);
    console.log("[Tax] Calling /api/v1/tax/calculate", {
      state: activeState.toUpperCase(),
      zip: activeZip,
      subtotal,
      discount: couponDiscount,
    });
    apiClient.post<{ tax_rate: number; tax_amount: number; region: string; taxable: boolean; source?: string }>(
      `/api/v1/tax/calculate`,
      { subtotal, zip_code: activeZip, state: activeState.toUpperCase(), discount: couponDiscount },
    )
      .then(r => {
        const rate   = Number(r.tax_rate ?? 0);
        const amount = Number(r.tax_amount ?? 0);
        console.log("[Tax] Response:", { source: r.source, region: r.region, rate, amount });
        if (rate > 0 || amount > 0) {
          setTaxRate({ region: r.region, rate });
          setApiTaxAmount(amount);
          setTaxInfo(r.region, rate, amount);
        } else {
          console.warn("[Tax] $0 result — source:", r.source, "state:", activeState, "zip:", activeZip);
          setTaxRate(null);
          setApiTaxAmount(0);
          setTaxInfo(null, 0, 0);
        }
      })
      .catch(err => {
        console.error("[Tax] Request failed:", err);
        setTaxRate(null);
        setApiTaxAmount(0);
        setTaxInfo(null, 0, 0);
      });
  }, [activeState, activeZip, subtotal, selectedAddressId, couponDiscount]);


  const taxableBase = Math.max(0, subtotal - couponDiscount); // shipping not taxed
  const taxAmount = apiTaxAmount > 0 ? apiTaxAmount : (taxRate ? Math.round(taxableBase * taxRate.rate / 100 * 100) / 100 : 0);
  const orderTotal = subtotal + selectedCost + taxAmount - couponDiscount;

  function validate() {
    const e: Partial<typeof form> = {};
    if (isGuest) {
      if (!form.contact.trim()) e.contact = "Required";
      if (!form.email.trim()) e.email = "Required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    } else {
      if (!form.company.trim()) e.company = "Required";
      if (!form.contact.trim()) e.contact = "Required";
    }
    if (!form.street.trim()) e.street = "Required";
    if (!form.city.trim()) e.city = "Required";
    if (!form.state.trim()) e.state = "Required";
    if (!form.zip.trim()) e.zip = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleContinue() {
    // Block if live_shippo user hasn't selected a rate yet
    if (shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && !selectedLiveRate) {
      setShippingGateError(true);
      return;
    }
    setShippingGateError(false);
    setShippingCost(methodCost(shippingMethod));
    console.log("[Address] shippingTypeForUser:", shippingTypeForUser, "selectedLiveRate:", selectedLiveRate);
    setShippingType(shippingTypeForUser);
    sessionStorage.setItem('checkout_shipping_type', shippingTypeForUser);
    if (shippingTypeForUser === "live_shippo" && selectedLiveRate) {
      const rateToSave = { rate_id: selectedLiveRate.rate_id, carrier: selectedLiveRate.carrier, service: selectedLiveRate.service, price: selectedLiveRate.cost };
      console.log("[Address] saving selectedRate:", rateToSave);
      setSelectedRate(rateToSave);
      sessionStorage.setItem('checkout_selected_rate', JSON.stringify(rateToSave));
    } else {
      console.log("[Address] clearing selectedRate (shippingType not live_shippo or no rate selected)");
      setSelectedRate(null);
      sessionStorage.removeItem('checkout_selected_rate');
    }

    if (isGuest) {
      if (!validate()) return;
      // Persist guest info to sessionStorage for review page
      const guestData = {
        name: form.contact,
        email: form.email,
        phone: form.phone,
        line1: form.street,
        city: form.city,
        state: form.state,
        postal_code: form.zip,
        country: "US",
      };
      sessionStorage.setItem("af_guest_checkout", JSON.stringify(guestData));
      setContactName(form.contact);
      setShippingPhone(form.phone);
      setShippingAddress({ line1: form.street, city: form.city, state: form.state, postal_code: form.zip, country: "US" });
      setAddressId(null);
      router.push("/checkout/payment");
      return;
    }

    if (!showNewForm && selectedAddressId) {
      const addr = savedAddresses.find(a => a.id === selectedAddressId);
      if (!addr) return;
      setCompanyName(form.company || companyName);
      setContactName(addr.full_name || contactName);
      setShippingPhone(addr.phone || "");
      setShippingAddress({
        line1: addr.line1,
        line2: addr.line2 || undefined,
        city: addr.city,
        state: addr.state,
        postal_code: addr.postal_code,
        country: addr.country || "US",
      });
      setAddressId(selectedAddressId);
      router.push("/checkout/payment");
    } else {
      if (!validate()) return;
      setCompanyName(form.company);
      setContactName(form.contact);
      setShippingPhone(form.phone);
      setShippingAddress({
        line1: form.street,
        city: form.city,
        state: form.state,
        postal_code: form.zip,
        country: "US",
      });
      setAddressId(null);
      router.push("/checkout/payment");
    }
  }

  // Build shipping option display
  function shippingOptionLabel(method: ShippingMethod): { price: string; note?: string } {
    if (method === "will_call") {
      return { price: "FREE", note: "Pick up from our warehouse — no shipping charge." };
    }
    // Live Shippo rates mode
    if (shippingTypeForUser === "live_shippo" && method === "standard") {
      if (liveRatesLoading) return { price: "Fetching rates…" };
      if (selectedLiveRate) return { price: formatCurrency(selectedLiveRate.cost), note: `${selectedLiveRate.carrier} ${selectedLiveRate.service}${selectedLiveRate.days ? ` · est. ${selectedLiveRate.days} day${selectedLiveRate.days !== 1 ? "s" : ""}` : ""}` };
      if (liveRates.length === 0 && activeZip.length >= 5) return { price: "Unavailable", note: "Enter your address to get shipping rates." };
      return { price: "Enter address", note: "Live carrier rates will appear once your ZIP and state are filled in." };
    }
    // No tier assigned yet
    if (tierShipping === null) {
      if (method === "expedited") {
        return { price: `+ $${EXPEDITED_SURCHARGE} surcharge`, note: "Tier-based base rate + $45 expedited surcharge." };
      }
      return { price: "Calculated", note: "Contact us to have a shipping tier assigned to your account." };
    }
    if (method === "expedited") {
      const cost = tierShipping + EXPEDITED_SURCHARGE;
      return {
        price: formatCurrency(cost),
        note: `Your tier rate ${formatCurrency(tierShipping)} + $${EXPEDITED_SURCHARGE} expedited surcharge.`,
      };
    }
    // standard
    if (tierShipping === 0) {
      return { price: "FREE", note: "Free shipping on your account's tier." };
    }
    return { price: formatCurrency(tierShipping), note: "Rate based on your assigned shipping tier." };
  }

  const SHIPPING_OPTIONS: { id: ShippingMethod; label: string; sub: string }[] = [
    { id: "standard", label: "Standard Ground", sub: "3–5 business days · Ships from Dallas, TX" },
    { id: "will_call", label: "Will Call Pickup", sub: "Pick up at our warehouse · 10719 Turbeville Rd, Dallas, TX 75243 · Orders before 12 PM → same-day pickup by 4 PM · After 12 PM → next business day by 12 PM · Sat/Sun: closed · No shipping fee" },
  ];

  return (
    <div style={{ padding: "40px 24px 64px", background: "#F8F8F6" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div className="checkout-cols" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "48px", alignItems: "start" }}>

          {/* LEFT COLUMN — Form */}
          <div>
            {/* ── Shipping Address ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={{ ...sectionLabelStyle, marginTop: 0 }}>Shipping Address</div>

              {savedAddresses.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
                  {savedAddresses.map(addr => {
                    const isSelected = selectedAddressId === addr.id && !showNewForm;
                    return (
                      <label
                        key={addr.id}
                        onClick={() => { setSelectedAddressId(addr.id); setShowNewForm(false); }}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: "14px",
                          padding: "14px 18px",
                          border: `1px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                          background: isSelected ? "rgba(28,53,87,.03)" : "#FAFAF8",
                          cursor: "pointer", transition: "all .15s",
                        }}
                      >
                        <div style={{
                          width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0, marginTop: "2px",
                          border: `2px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                          background: isSelected ? "var(--brand-primary, #1C3557)" : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {isSelected && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>
                              {addr.label || "Address"}
                            </span>
                            {addr.is_default && (
                              <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 6px", background: "rgba(28,53,87,.1)", color: "var(--brand-primary, #1C3557)" }}>
                                Default
                              </span>
                            )}
                          </div>
                          {addr.full_name && <div style={{ fontSize: "12px", color: "#6B6B6B" }}>{addr.full_name}</div>}
                          <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
                            {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} {addr.postal_code}
                          </div>
                          {addr.phone && <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "2px" }}>{addr.phone}</div>}
                        </div>
                      </label>
                    );
                  })}

                  <label
                    onClick={() => { setShowNewForm(true); setSelectedAddressId(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "14px",
                      padding: "12px 18px",
                      border: `1px solid ${showNewForm ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                      background: showNewForm ? "rgba(28,53,87,.03)" : "#FAFAF8",
                      cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#1A1A1A",
                      transition: "all .15s",
                    }}
                  >
                    <div style={{
                      width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${showNewForm ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                      background: showNewForm ? "var(--brand-primary, #1C3557)" : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {showNewForm && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                    </div>
                    + Use a different address
                  </label>
                </div>
              )}

              {/* Company name — wholesale only */}
              {!isGuest && (
                <div style={{ marginBottom: "14px" }}>
                  <label style={lbl}>Company Name <span style={{ color: "#E8242A" }}>*</span></label>
                  <input
                    style={{ ...inp, borderColor: errors.company ? "#E8242A" : "#E2E2DE" }}
                    value={form.company}
                    onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                    placeholder="AF Apparels Inc."
                  />
                  {errors.company && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{errors.company}</p>}
                </div>
              )}

              {showNewForm && (
                <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>{isGuest ? "Full Name" : "Contact Name"} <span style={{ color: "#E8242A" }}>*</span></label>
                    <input
                      style={{ ...inp, borderColor: errors.contact ? "#E8242A" : "#E2E2DE" }}
                      value={form.contact}
                      onChange={e => setForm(p => ({ ...p, contact: e.target.value }))}
                      placeholder={isGuest ? "Jane Smith" : "John Smith"}
                    />
                    {errors.contact && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{errors.contact}</p>}
                  </div>

                  {/* Guest email field */}
                  {isGuest && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={lbl}>Email Address <span style={{ color: "#E8242A" }}>*</span></label>
                      <input
                        type="email"
                        style={{ ...inp, borderColor: errors.email ? "#E8242A" : "#E2E2DE" }}
                        value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="you@example.com"
                      />
                      {errors.email && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{errors.email}</p>}
                      <p style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "3px" }}>Order confirmation will be sent to this email.</p>
                    </div>
                  )}

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Street Address <span style={{ color: "#E8242A" }}>*</span></label>
                    <input
                      ref={streetInputRef}
                      style={{ ...inp, borderColor: errors.street ? "#E8242A" : "#E2E2DE" }}
                      value={form.street}
                      onChange={e => setForm(p => ({ ...p, street: e.target.value }))}
                      placeholder="123 Commerce Blvd, Suite 400"
                    />
                    {errors.street && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{errors.street}</p>}
                  </div>

                  <div>
                    <label style={lbl}>City <span style={{ color: "#E8242A" }}>*</span></label>
                    <input
                      style={{ ...inp, borderColor: errors.city ? "#E8242A" : "#E2E2DE" }}
                      value={form.city}
                      onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                      placeholder="Dallas"
                    />
                    {errors.city && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{errors.city}</p>}
                  </div>

                  <div>
                    <label style={lbl}>State <span style={{ color: "#E8242A" }}>*</span></label>
                    <select
                      style={{ ...inp, cursor: "pointer", borderColor: errors.state ? "#E8242A" : "#E2E2DE" }}
                      value={form.state}
                      onChange={e => setForm(p => ({ ...p, state: e.target.value }))}
                    >
                      <option value="">Select state</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {errors.state && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{errors.state}</p>}
                  </div>

                  <div>
                    <label style={lbl}>ZIP Code <span style={{ color: "#E8242A" }}>*</span></label>
                    <input
                      style={{ ...inp, borderColor: errors.zip ? "#E8242A" : "#E2E2DE" }}
                      value={form.zip}
                      onChange={e => setForm(p => ({ ...p, zip: e.target.value }))}
                      placeholder="75001"
                      maxLength={10}
                    />
                    {errors.zip && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{errors.zip}</p>}
                  </div>

                  <div>
                    <label style={lbl}>Phone <span style={{ fontSize: "10px", color: "#6B6B6B", textTransform: "none", letterSpacing: 0 }}>(for shipping updates)</span></label>
                    <input
                      style={inp}
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="(214) 555-0100"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Shipping Method ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={sectionLabelStyle}>Shipping Method</div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {SHIPPING_OPTIONS.map(opt => {
                  const isSelected = shippingMethod === opt.id;
                  const { price: priceDisplay, note } = shippingOptionLabel(opt.id);
                  const isFree = priceDisplay === "FREE";

                  return (
                    <label
                      key={opt.id}
                      onClick={() => setShippingMethod(opt.id)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: "14px",
                        padding: "16px 18px",
                        border: `1px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: isSelected ? "rgba(28,53,87,.03)" : "#FAFAF8",
                        cursor: "pointer", transition: "border-color .15s, background .15s",
                      }}
                    >
                      <div style={{
                        width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                        border: `2px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: isSelected ? "var(--brand-primary, #1C3557)" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isSelected && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>{opt.label}</span>
                          <span style={{ fontSize: "14px", fontWeight: 800, color: isFree ? "#059669" : "#1A1A1A" }}>
                            {priceDisplay}
                          </span>
                        </div>
                        {opt.id === "will_call" ? (
                          <div style={{ marginTop: "6px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "5px", marginBottom: "5px" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary, #1C3557)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                              </svg>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "#1A1A1A" }}>10719 Turbeville Rd, Dallas, TX 75243</span>
                            </div>
                            <div style={{ fontSize: "11px", color: "#6B6B6B", lineHeight: 1.6, paddingLeft: "18px" }}>
                              <div>Mon–Fri, before 12 PM → same-day pickup by 4 PM</div>
                              <div>Mon–Fri, after 12 PM → next business day by 12 PM</div>
                              <div>Sat / Sun: Closed</div>
                            </div>
                          </div>
                        ) : shippingTypeForUser === "live_shippo" && opt.id === "standard" && isSelected ? (
                          <div style={{ marginTop: "8px" }}>
                            <div style={{ fontSize: "12px", color: "#6B6B6B", marginBottom: "8px" }}>{opt.sub}</div>
                            {liveRatesLoading && (
                              <div style={{ fontSize: "12px", color: "#6B6B6B", padding: "8px 0" }}>Fetching live carrier rates…</div>
                            )}
                            {!liveRatesLoading && liveRates.length > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {liveRates.map(rate => {
                                  const isRateSelected = selectedLiveRateId === rate.rate_id;
                                  return (
                                    <label
                                      key={rate.rate_id}
                                      onClick={() => {
                                        setSelectedLiveRateId(rate.rate_id);
                                        setTierShipping(rate.cost);
                                        setShippingGateError(false);
                                      }}
                                      style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                        padding: "10px 14px", cursor: "pointer",
                                        border: `1px solid ${isRateSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                                        background: isRateSelected ? "rgba(28,53,87,.03)" : "#fff",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <div style={{
                                          width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0,
                                          border: `2px solid ${isRateSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                                          background: isRateSelected ? "var(--brand-primary, #1C3557)" : "#fff",
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                          {isRateSelected && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#fff" }} />}
                                        </div>
                                        {CARRIER_LOGOS[rate.carrier] && (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={CARRIER_LOGOS[rate.carrier]}
                                            alt={rate.carrier}
                                            style={{ maxHeight: "20px", width: "auto", objectFit: "contain", flexShrink: 0 }}
                                          />
                                        )}
                                        <div>
                                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#1A1A1A" }}>{rate.service}</div>
                                          {rate.days != null && <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "1px" }}>{rate.days} business day{rate.days !== 1 ? "s" : ""}</div>}
                                        </div>
                                      </div>
                                      <span style={{ fontSize: "13px", fontWeight: 800, color: "#1A1A1A" }}>{formatCurrency(rate.cost)}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            {!liveRatesLoading && liveRates.length === 0 && activeZip.length >= 5 && (
                              <div style={{ fontSize: "12px", color: "#6B6B6B", padding: "6px 0" }}>
                                No rates available for this address. Please verify your ZIP and state.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "3px" }}>{opt.sub}</div>
                        )}
                        {note && (
                          <div style={{ fontSize: "11px", color: isFree ? "#059669" : "#6B6B6B", marginTop: "4px", fontWeight: isFree ? 600 : 400 }}>
                            {note}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Continue button */}
            {shippingGateError && (
              <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "4px", padding: "8px 12px", marginBottom: "10px", fontSize: "13px", color: "#92400e", fontFamily: "'DM Sans', sans-serif" }}>
                Please select a shipping carrier and rate before continuing.
              </div>
            )}
            <button
              onClick={handleContinue}
              disabled={shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && liveRatesLoading}
              style={{ width: "100%", padding: "14px", background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500, cursor: (shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && liveRatesLoading) ? "not-allowed" : "pointer", transition: "opacity .15s", opacity: (shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && liveRatesLoading) ? 0.6 : 1 }}
              onMouseEnter={e => { if (!(shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && liveRatesLoading)) (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
              onMouseLeave={e => { if (!(shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && liveRatesLoading)) (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            >
              {shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && liveRatesLoading ? "Fetching rates…" : "Continue to Payment →"}
            </button>
            <a
              href="/cart"
              style={{ display: "inline-block", fontSize: "13px", color: "#6B6B6B", textDecoration: "none", marginTop: "14px", fontFamily: "'DM Sans', sans-serif" }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--brand-primary, #1C3557)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B6B6B"; }}
            >
              ← Return to Cart
            </a>
          </div>

          {/* RIGHT COLUMN — Order Summary */}
          <div style={{ alignSelf: "start", position: "sticky", top: "24px" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, color: "#1A1A1A", marginBottom: "18px" }}>
              Order Summary
            </div>

            {/* Cart items */}
            {cartDisplayItems.length > 0 && (
              <div>
                {cartDisplayItems.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #E2E2DE" }}>
                    <div style={{ width: "52px", height: "52px", border: "1px solid #E2E2DE", flexShrink: 0, background: "#FFFFFF", overflow: "hidden" }}>
                      {item.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <div style={{ width: "100%", height: "100%", background: "#F8F8F6" }} />
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 500, color: "#1A1A1A", lineHeight: 1.3 }}>{item.name}</div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6B6B", marginTop: "2px" }}>
                        {[item.color, item.size].filter(Boolean).join(" / ")}{item.qty > 0 ? ` × ${item.qty}` : ""}
                      </div>
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 500, color: "#1A1A1A", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {formatCurrency(item.lineTotal)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                <span>Subtotal</span>
                <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{formatCurrency(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                <span>Shipping ({shippingTypeForUser === "live_shippo" && shippingMethod === "standard" && selectedLiveRate ? `${selectedLiveRate.carrier} ${selectedLiveRate.service}` : SHIPPING_OPTIONS.find(o => o.id === shippingMethod)?.label})</span>
                <span style={{ fontWeight: 600, color: (shippingMethod === "will_call" || (tierShipping !== null && selectedCost === 0)) ? "#059669" : "#1A1A1A" }}>
                  {shippingMethod === "will_call"
                    ? "FREE"
                    : shippingTypeForUser === "live_shippo" && shippingMethod === "standard"
                      ? selectedLiveRate
                        ? formatCurrency(selectedLiveRate.cost)
                        : <span style={{ color: "#6B6B6B", fontWeight: 400 }}>Select a carrier above</span>
                      : tierShipping === null
                        ? <span style={{ color: "#6B6B6B", fontWeight: 400 }}>Calculated at checkout</span>
                        : selectedCost === 0
                          ? "FREE"
                          : formatCurrency(selectedCost)}
                </span>
              </div>
              {couponDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#059669", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                  <span style={{ fontWeight: 600 }}>Coupon Applied</span>
                  <span style={{ fontWeight: 700 }}>-{formatCurrency(couponDiscount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                <span>{taxRate ? `Tax (${taxRate.region} ${taxRate.rate}%)` : "Tax"}</span>
                <span style={{ fontWeight: 600, color: "#1A1A1A" }}>
                  {activeState ? formatCurrency(taxAmount) : <span style={{ fontWeight: 400 }}>Calculated at checkout</span>}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 600, color: "#1A1A1A", padding: "14px 0 0" }}>
                <span>Total</span>
                <span>
                  {(tierShipping !== null || shippingMethod === "will_call" || (shippingTypeForUser === "live_shippo" && selectedLiveRate)) ? formatCurrency(orderTotal) : `${formatCurrency(subtotal)}+`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { .checkout-cols { display: block !important; } }
      `}</style>
    </div>
  );
}
