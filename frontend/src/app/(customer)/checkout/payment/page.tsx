// frontend/src/app/(customer)/checkout/payment/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QBPaymentForm } from "@/components/checkout/QBPaymentForm";
import { useCheckoutStore } from "@/stores/checkout.store";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient } from "@/lib/api-client";
import { cartService } from "@/services/cart.service";
import { formatCurrency } from "@/lib/utils";
import type { Cart } from "@/types/order.types";

type GuestCartEntry = { unit_price: number; quantity: number; product_name?: string; color?: string | null; size?: string | null; image_url?: string | null };

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  name: string | null;
  is_default: boolean;
}

interface SavedAch {
  bank_name: string;
  account_holder: string;
  routing_last4: string;
  account_last4: string;
  account_type: string;
}

function brandDisplayName(brand: string): string {
  const b = brand.toLowerCase();
  if (b === "visa") return "Visa";
  if (b === "mastercard") return "Mastercard";
  if (b === "amex" || b === "american express") return "Amex";
  if (b === "discover") return "Discover";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
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

export default function CheckoutPaymentPage() {
  const router = useRouter();
  const {
    shippingAddress, shippingMethod, shippingCost, setSavedCardId, setQbToken,
    taxAmount: storedTaxAmount, taxRate: storedTaxRate, taxRegion: storedTaxRegion,
    setPaymentMethod, setAchInfo, setConvenienceFee,
  } = useCheckoutStore();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const isGuest = !isLoading && !isAuthenticated();
  const isWholesale = user?.account_type === "wholesale";
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [paymentType, setPaymentType] = useState<"card" | "ach" | "net_30">("card");
  const [net30Enabled, setNet30Enabled] = useState(false);

  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showNewCardForm, setShowNewCardForm] = useState(false);
  const [loadingCards, setLoadingCards] = useState(true);
  const [cart, setCart] = useState<Cart | null>(null);
  const [guestSubtotal, setGuestSubtotal] = useState(0);
  const [cartDisplayItems, setCartDisplayItems] = useState<Array<{ name: string; color: string | null; size: string | null; qty: number; lineTotal: number; imageUrl?: string | null }>>([]);

  const [savedAch, setSavedAch] = useState<SavedAch | null>(null);
  const [useNewAch, setUseNewAch] = useState(false);
  const [achForm, setAchForm] = useState({ bankName: "", accountHolder: "", routingNumber: "", accountNumber: "", accountType: "checking" as "checking" | "savings" });
  const [achErrors, setAchErrors] = useState<Partial<Record<keyof typeof achForm, string>>>({});

  // Guard: must have shipping address
  useEffect(() => {
    if (!shippingAddress) {
      router.replace("/checkout/address");
    }
  }, [shippingAddress, router]);

  // For guests: load guest cart total; for authenticated: load saved cards
  useEffect(() => {
    if (isLoading) return;

    if (isGuest) {
      // Guests always use the new card form
      setShowNewCardForm(true);
      setLoadingCards(false);
      try {
        const entries: GuestCartEntry[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
        setGuestSubtotal(entries.reduce((s, i) => s + i.unit_price * i.quantity, 0));
        setCartDisplayItems(entries.map(i => ({
          name: i.product_name ?? "",
          color: i.color ?? null,
          size: i.size ?? null,
          qty: i.quantity,
          lineTotal: i.unit_price * i.quantity,
          imageUrl: i.image_url,
        })));
      } catch { /* ignore */ }
      return;
    }

    apiClient
      .get<SavedCard[]>("/api/v1/account/payment-methods")
      .then((cards) => {
        setSavedCards(cards);
        if (cards.length > 0) {
          const def = cards.find(c => c.is_default) ?? cards[0]!;
          setSelectedCardId(def.id);
          setShowNewCardForm(false);
        } else {
          setShowNewCardForm(true);
        }
      })
      .catch(() => setShowNewCardForm(true))
      .finally(() => setLoadingCards(false));

    apiClient
      .get<SavedAch>("/api/v1/account/ach-method")
      .then(ach => {
        if (ach && ach.account_last4) {
          setSavedAch(ach);
          setUseNewAch(false);
        }
      })
      .catch(() => { /* no saved ACH */ });

    // Check if Net 30 is enabled for this company
    if (isWholesale) {
      apiClient
        .get<{ net30_enabled?: boolean }>("/api/v1/account/net30-status")
        .then(r => setNet30Enabled(r.net30_enabled === true))
        .catch(() => setNet30Enabled(false));
    }
  }, [isLoading, isGuest, isAuthenticated, isWholesale]);

  // Load cart for total display (wholesale only)
  useEffect(() => {
    if (!isGuest) {
      cartService.getCart().then(c => {
        setCart(c);
        setCartDisplayItems(c.items.map(i => ({
          name: i.product_name,
          color: i.color ?? null,
          size: i.size ?? null,
          qty: i.quantity,
          lineTotal: Number(i.line_total),
          imageUrl: i.product_image_url,
        })));
      }).catch(() => { });
    }
    const saved = localStorage.getItem("af_coupon");
    if (saved) {
      try { setCouponDiscount(JSON.parse(saved).discount_amount ?? 0); } catch { }
    }
  }, [isGuest]);


  // Compute fee here (before early return) so handlers can save it to the store
  const subtotalEarly = isGuest ? guestSubtotal : Number(cart?.subtotal ?? 0);
  const convenienceFeeEarly = (isWholesale && paymentType === "card") ? Math.round(subtotalEarly * 0.03 * 100) / 100 : 0;

  function handleContinueWithSavedCard() {
    if (!selectedCardId) return;
    setConvenienceFee(convenienceFeeEarly);
    setPaymentMethod("card");
    setSavedCardId(selectedCardId);
    router.push("/checkout/review");
  }

  function handleNewCardToken(token: string) {
    setConvenienceFee(convenienceFeeEarly);
    setPaymentMethod("card");
    setQbToken(token);
    router.push("/checkout/review");
  }

  function handleAchContinue() {
    if (savedAch && !useNewAch) {
      setPaymentMethod("ach");
      setAchInfo(savedAch.bank_name, savedAch.account_holder, savedAch.routing_last4, savedAch.account_last4, savedAch.account_type as "checking" | "savings");
      router.push("/checkout/review");
      return;
    }
    const errors: Partial<Record<keyof typeof achForm, string>> = {};
    if (!achForm.bankName.trim()) errors.bankName = "Required";
    if (!achForm.accountHolder.trim()) errors.accountHolder = "Required";
    if (!/^\d{9}$/.test(achForm.routingNumber.trim())) errors.routingNumber = "Must be exactly 9 digits";
    if (!achForm.accountNumber.trim()) errors.accountNumber = "Required";
    else if (achForm.accountNumber.replace(/\D/g, "").length < 4) errors.accountNumber = "Account number too short";
    if (Object.keys(errors).length > 0) { setAchErrors(errors); return; }
    const last4 = achForm.accountNumber.replace(/\D/g, "").slice(-4);
    setConvenienceFee(0);
    setPaymentMethod("ach");
    setAchInfo(achForm.bankName.trim(), achForm.accountHolder.trim(), achForm.routingNumber.trim(), last4, achForm.accountType);
    router.push("/checkout/review");
  }

  function handleNet30Continue() {
    setConvenienceFee(0);
    setPaymentMethod("net_30");
    router.push("/checkout/review");
  }

  if (loadingCards) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#6B6B6B", fontSize: "14px" }}>
        Loading payment methods…
      </div>
    );
  }

  const subtotal = isGuest ? guestSubtotal : Number(cart?.subtotal ?? 0);
  const shipping = shippingCost;
  const taxAmountDisplay = storedTaxAmount > 0 ? storedTaxAmount : 0;
  const convenienceFee = (isWholesale && paymentType === "card") ? Math.round(subtotal * 0.03 * 100) / 100 : 0;
  const total = subtotal + shipping + taxAmountDisplay - (isGuest ? 0 : couponDiscount) + convenienceFee;

  const SHIPPING_LABELS: Record<string, string> = {
    standard: "Standard Ground",
    expedited: "Expedited (2-Day)",
    will_call: "Will Call Pickup",
  };

  return (
    <div style={{ padding: "40px 24px 64px", background: "#F8F8F6" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div className="checkout-cols" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "48px", alignItems: "start" }}>

          {/* LEFT COLUMN — Payment */}
          <div>
            {/* ── Payment Method type selector ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={{ ...sectionLabelStyle, marginTop: 0 }}>Payment Method</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(["card", "ach"] as const).map(type => {
                  const isSelected = paymentType === type;
                  return (
                    <div key={type}>
                      <label onClick={() => setPaymentType(type)} style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", border: `1px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`, background: isSelected ? "rgba(28,53,87,.04)" : "#FAFAF8", cursor: "pointer", transition: "all .15s" }}>
                        <div style={{ width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0, border: `2px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`, background: isSelected ? "var(--brand-primary, #1C3557)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isSelected && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>{type === "card" ? "Credit / Debit Card" : "ACH / Bank Transfer"}</div>
                          <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "2px" }}>{type === "card" ? "Visa, Mastercard, Amex, Discover" : "Checking or savings account"}</div>
                        </div>
                      </label>
                      {type === "card" && isSelected && isWholesale && (
                        <div style={{ fontSize: "12px", color: "#92400e", background: "#fef3c7", padding: "6px 10px", borderRadius: "4px", marginTop: "6px" }}>
                          ⚠ A 3% convenience fee will be added to your order total.
                        </div>
                      )}
                    </div>
                  );
                })}
                {!isGuest && isWholesale && net30Enabled && (() => {
                  const isSelected = paymentType === "net_30";
                  return (
                    <label onClick={() => setPaymentType("net_30")} style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", border: `1px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`, background: isSelected ? "rgba(28,53,87,.04)" : "#FAFAF8", cursor: "pointer", transition: "all .15s" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0, border: `2px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`, background: isSelected ? "var(--brand-primary, #1C3557)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isSelected && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>Net 30 — Pay by Invoice</div>
                        <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "2px" }}>Invoice sent to your account; payment due within 30 days</div>
                      </div>
                    </label>
                  );
                })()}
              </div>
            </div>

            {/* ── ACH section ── */}
            {paymentType === "ach" && (
              <div style={{ marginBottom: "32px" }}>
                <div style={sectionLabelStyle}>Bank Account Details</div>

                {/* Saved ACH — shown for authenticated users who have one saved */}
                {!isGuest && savedAch && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: useNewAch ? "16px" : "0" }}>
                    {/* Saved ACH option */}
                    <label
                      onClick={() => setUseNewAch(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px",
                        padding: "14px 18px",
                        border: `1px solid ${!useNewAch ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: !useNewAch ? "rgba(28,53,87,.04)" : "#FAFAF8",
                        cursor: "pointer", transition: "all .15s",
                      }}
                    >
                      <div style={{
                        width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${!useNewAch ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: !useNewAch ? "var(--brand-primary, #1C3557)" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {!useNewAch && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                      </div>
                      {/* Bank icon */}
                      <svg width="32" height="22" viewBox="0 0 32 22" fill="none" style={{ flexShrink: 0 }}>
                        <rect width="32" height="22" rx="3" fill="#F4F3EF" stroke="#E2E2DE" />
                        <rect x="4" y="5" width="24" height="3" rx="1" fill="#E2E2DE" />
                        <rect x="6" y="10" width="3" height="6" rx="0.5" fill="#E2E2DE" />
                        <rect x="14" y="10" width="3" height="6" rx="0.5" fill="#E2E2DE" />
                        <rect x="22" y="10" width="3" height="6" rx="0.5" fill="#E2E2DE" />
                      </svg>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>
                          {savedAch.bank_name} •••• {savedAch.account_last4}
                        </div>
                        <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "2px" }}>
                          {savedAch.account_holder} · {savedAch.account_type.charAt(0).toUpperCase() + savedAch.account_type.slice(1)}
                        </div>
                      </div>
                    </label>

                    {/* Use different account option */}
                    <label
                      onClick={() => setUseNewAch(true)}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px",
                        padding: "12px 18px",
                        border: `1px solid ${useNewAch ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: useNewAch ? "rgba(28,53,87,.04)" : "#FAFAF8",
                        cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#1A1A1A",
                        transition: "all .15s",
                      }}
                    >
                      <div style={{
                        width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${useNewAch ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: useNewAch ? "var(--brand-primary, #1C3557)" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {useNewAch && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                      </div>
                      + Use a different account
                    </label>
                  </div>
                )}

                {/* Manual ACH form — shown when no saved ACH, or user chose "use different account" */}
                {(isGuest || !savedAch || useNewAch) && (
                  <div style={{ borderTop: savedAch && useNewAch ? "1px solid #E2E2DE" : "none", paddingTop: savedAch && useNewAch ? "16px" : "0" }}>
                    <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                      <div>
                        <label style={lbl}>Bank Name <span style={{ color: "#E8242A" }}>*</span></label>
                        <input style={{ ...inp, borderColor: achErrors.bankName ? "#E8242A" : "#E2E2DE" }} value={achForm.bankName} onChange={e => { setAchForm(p => ({ ...p, bankName: e.target.value })); setAchErrors(p => ({ ...p, bankName: undefined })); }} placeholder="Chase, Wells Fargo, etc." />
                        {achErrors.bankName && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{achErrors.bankName}</p>}
                      </div>
                      <div>
                        <label style={lbl}>Account Holder Name <span style={{ color: "#E8242A" }}>*</span></label>
                        <input style={{ ...inp, borderColor: achErrors.accountHolder ? "#E8242A" : "#E2E2DE" }} value={achForm.accountHolder} onChange={e => { setAchForm(p => ({ ...p, accountHolder: e.target.value })); setAchErrors(p => ({ ...p, accountHolder: undefined })); }} placeholder="Full name on account" />
                        {achErrors.accountHolder && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{achErrors.accountHolder}</p>}
                      </div>
                      <div>
                        <label style={lbl}>Routing Number <span style={{ color: "#E8242A" }}>*</span></label>
                        <input style={{ ...inp, borderColor: achErrors.routingNumber ? "#E8242A" : "#E2E2DE" }} value={achForm.routingNumber} onChange={e => { setAchForm(p => ({ ...p, routingNumber: e.target.value.replace(/\D/g, "").slice(0, 9) })); setAchErrors(p => ({ ...p, routingNumber: undefined })); }} placeholder="9-digit routing number" maxLength={9} />
                        {achErrors.routingNumber && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{achErrors.routingNumber}</p>}
                      </div>
                      <div>
                        <label style={lbl}>Account Number <span style={{ color: "#E8242A" }}>*</span></label>
                        <input style={{ ...inp, borderColor: achErrors.accountNumber ? "#E8242A" : "#E2E2DE" }} value={achForm.accountNumber} onChange={e => { setAchForm(p => ({ ...p, accountNumber: e.target.value.replace(/\D/g, "") })); setAchErrors(p => ({ ...p, accountNumber: undefined })); }} placeholder="Account number" type="text" />
                        {achErrors.accountNumber && <p style={{ fontSize: "11px", color: "#E8242A", marginTop: "3px" }}>{achErrors.accountNumber}</p>}
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={lbl}>Account Type <span style={{ color: "#E8242A" }}>*</span></label>
                        <div style={{ display: "flex", gap: "10px" }}>
                          {(["checking", "savings"] as const).map(t => (
                            <label key={t} onClick={() => setAchForm(p => ({ ...p, accountType: t }))} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", border: `1px solid ${achForm.accountType === t ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`, cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#1A1A1A", background: achForm.accountType === t ? "rgba(28,53,87,.04)" : "#FAFAF8" }}>
                              <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${achForm.accountType === t ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`, background: achForm.accountType === t ? "var(--brand-primary, #1C3557)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {achForm.accountType === t && <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#fff" }} />}
                              </div>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "14px", padding: "12px 14px", background: "#F4F3EF", fontSize: "12px", color: "#6B6B6B", lineHeight: 1.6 }}>
                  ACH payments are verified manually. Your order will be processed within 1–2 business days after payment is confirmed.
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <a
                    href="/checkout/address"
                    style={{ display: "inline-block", fontSize: "13px", color: "#6B6B6B", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", padding: "14px 0" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--brand-primary, #1C3557)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B6B6B"; }}
                  >
                    ← Back to Shipping
                  </a>
                  <button type="button" onClick={handleAchContinue} style={{ flex: 1, padding: "14px", background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500, cursor: "pointer", transition: "opacity .15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                  >
                    Continue to Review →
                  </button>
                </div>
              </div>
            )}

            {/* ── Net 30 section ── */}
            {paymentType === "net_30" && (
              <div style={{ marginBottom: "32px" }}>
                <div style={sectionLabelStyle}>Net 30 — Pay by Invoice</div>
                <div style={{ fontSize: "13px", color: "#1A1A1A", lineHeight: 1.7, marginBottom: "14px" }}>
                  Your order will be processed immediately. An invoice will be emailed to your account within 1 business day. Payment is due within 30 days of the invoice date.
                </div>
                <div style={{ padding: "12px 14px", background: "rgba(217,119,6,.08)", fontSize: "12px", color: "#D97706", fontWeight: 600, marginBottom: "16px" }}>
                  Net 30 terms are subject to your approved credit limit. Overdue balances may affect future orders.
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <a
                    href="/checkout/address"
                    style={{ display: "inline-block", fontSize: "13px", color: "#6B6B6B", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", padding: "14px 0" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--brand-primary, #1C3557)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B6B6B"; }}
                  >
                    ← Back to Shipping
                  </a>
                  <button type="button" onClick={handleNet30Continue} style={{ flex: 1, padding: "14px", background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500, cursor: "pointer", transition: "opacity .15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                  >
                    Continue to Review →
                  </button>
                </div>
              </div>
            )}

            {/* ── Card payment section (when card type selected) ── */}
            {paymentType === "card" && (
              <div style={{ marginBottom: "32px" }}>
                {!isGuest && <div style={sectionLabelStyle}>Card Details</div>}

                {savedCards.length > 0 && !isGuest && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: showNewCardForm ? "16px" : "0" }}>
                    {savedCards.map(card => {
                      const isSelected = selectedCardId === card.id && !showNewCardForm;
                      return (
                        <label
                          key={card.id}
                          onClick={() => { setSelectedCardId(card.id); setShowNewCardForm(false); }}
                          style={{
                            display: "flex", alignItems: "center", gap: "14px",
                            padding: "14px 18px",
                            border: `1px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                            background: isSelected ? "rgba(28,53,87,.04)" : "#FAFAF8",
                            cursor: "pointer", transition: "all .15s",
                          }}
                        >
                          {/* Radio */}
                          <div style={{
                            width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                            border: `2px solid ${isSelected ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                            background: isSelected ? "var(--brand-primary, #1C3557)" : "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {isSelected && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                          </div>
                          {/* Card icon */}
                          <svg width="32" height="22" viewBox="0 0 32 22" fill="none" style={{ flexShrink: 0 }}>
                            <rect width="32" height="22" rx="3" fill="#F4F3EF" stroke="#E2E2DE" />
                            <rect x="4" y="8" width="10" height="6" rx="1.5" fill="#E2E2DE" />
                            <rect x="4" y="16" width="5" height="2" rx="0.5" fill="#E2E2DE" />
                            <rect x="11" y="16" width="5" height="2" rx="0.5" fill="#E2E2DE" />
                          </svg>
                          {/* Card info */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>
                              {brandDisplayName(card.brand)} •••• {card.last4}
                              {card.is_default && (
                                <span style={{ marginLeft: "8px", fontSize: "10px", background: "rgba(28,53,87,.1)", color: "var(--brand-primary, #1C3557)", padding: "2px 7px", fontWeight: 700 }}>
                                  Default
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "2px" }}>
                              Expires {card.exp_month}/{card.exp_year}
                            </div>
                          </div>
                        </label>
                      );
                    })}

                    {/* Use new card option */}
                    <label
                      onClick={() => { setShowNewCardForm(true); setSelectedCardId(null); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px",
                        padding: "12px 18px",
                        border: `1px solid ${showNewCardForm ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: showNewCardForm ? "rgba(28,53,87,.04)" : "#FAFAF8",
                        cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#1A1A1A",
                        transition: "all .15s",
                      }}
                    >
                      <div style={{
                        width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${showNewCardForm ? "var(--brand-primary, #1C3557)" : "#E2E2DE"}`,
                        background: showNewCardForm ? "var(--brand-primary, #1C3557)" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {showNewCardForm && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                      </div>
                      + Use a new card
                    </label>
                  </div>
                )}

                {/* New card form */}
                {showNewCardForm && (
                  <div style={{ borderTop: savedCards.length > 0 ? "1px solid #E2E2DE" : "none", paddingTop: savedCards.length > 0 ? "16px" : "0" }}>
                    <QBPaymentForm
                      onToken={handleNewCardToken}
                      onBack={
                        savedCards.length > 0
                          ? () => { setShowNewCardForm(false); setSelectedCardId(savedCards.find(c => c.is_default)?.id ?? savedCards[0]?.id ?? null); }
                          : () => router.push("/checkout/address")
                      }
                    />
                  </div>
                )}

                {/* Continue to Review (saved card) */}
                {!showNewCardForm && selectedCardId && (
                  <div style={{ display: "flex", gap: "16px", alignItems: "center", marginTop: "16px" }}>
                    <a
                      href="/checkout/address"
                      style={{ display: "inline-block", fontSize: "13px", color: "#6B6B6B", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--brand-primary, #1C3557)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B6B6B"; }}
                    >
                      ← Back to Shipping
                    </a>
                    <button
                      type="button"
                      onClick={handleContinueWithSavedCard}
                      style={{
                        flex: 1, padding: "14px", background: "var(--brand-primary, #1C3557)",
                        color: "#fff", border: "none",
                        fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500,
                        cursor: "pointer", transition: "opacity .15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                    >
                      Continue to Review →
                    </button>
                  </div>
                )}

                {/* Back button when new card form shown and no saved cards */}
                {showNewCardForm && savedCards.length === 0 && (
                  <a
                    href="/checkout/address"
                    style={{ display: "inline-block", marginTop: "10px", fontSize: "13px", color: "#6B6B6B", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--brand-primary, #1C3557)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B6B6B"; }}
                  >
                    ← Back to Shipping
                  </a>
                )}
              </div>
            )}
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
            {(cart || isGuest) && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                  <span>Subtotal{cart ? ` (${cart.total_units} units)` : ""}</span>
                  <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{formatCurrency(subtotal)}</span>
                </div>
                {cart && Number(cart.discount_percent) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#059669", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                    <span style={{ fontWeight: 600 }}>Tier Discount ({cart.discount_percent}% applied)</span>
                    <span style={{ fontWeight: 700 }}>&#10003; Included</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                  <span>Shipping ({SHIPPING_LABELS[shippingMethod] ?? "Standard"})</span>
                  <span style={{ color: shipping === 0 ? "#059669" : "#1A1A1A", fontWeight: 600 }}>
                    {shipping === 0 ? "FREE" : formatCurrency(shipping)}
                  </span>
                </div>
                {couponDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#059669", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                    <span style={{ fontWeight: 600 }}>Coupon Applied</span>
                    <span style={{ fontWeight: 700 }}>-{formatCurrency(couponDiscount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                  <span>{storedTaxRegion && storedTaxRate > 0 ? `Tax (${storedTaxRegion} ${storedTaxRate}%)` : "Tax"}</span>
                  <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{formatCurrency(taxAmountDisplay)}</span>
                </div>
                {convenienceFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#92400e", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                    <span style={{ fontWeight: 600 }}>Convenience Fee (3%)</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(convenienceFee)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 600, color: "#1A1A1A", padding: "14px 0 0" }}>
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { .checkout-cols { display: block !important; } }
      `}</style>
    </div>
  );
}
