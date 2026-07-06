// frontend/src/app/(customer)/checkout/review/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCheckoutStore } from "@/stores/checkout.store";
import { useCartStore } from "@/stores/cart.store";
import { useAuthStore } from "@/stores/auth.store";
import { cartService } from "@/services/cart.service";
import { ordersService } from "@/services/orders.service";
import { apiClient } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import type { Cart } from "@/types/order.types";

type GuestCartEntry = { variant_id: string; quantity: number; product_id: string; product_name: string; slug: string; color: string | null; size: string | null; unit_price: number; image_url?: string | null };

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  is_default: boolean;
}

function brandDisplayName(brand: string): string {
  const b = brand.toLowerCase();
  if (b === "visa") return "Visa";
  if (b === "mastercard") return "Mastercard";
  if (b === "amex" || b === "american express") return "Amex";
  if (b === "discover") return "Discover";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

const SHIPPING_LABELS: Record<string, string> = {
  standard: "Standard Ground",
  expedited: "Expedited (2-Day)",
  will_call: "Will Call Pickup",
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: "11px", letterSpacing: "0.1em",
  textTransform: "uppercase", fontWeight: 700, color: "#1A1A1A",
  marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid #E2E2DE",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "1px solid #E2E2DE",
  fontSize: "14px", fontFamily: "'DM Sans', sans-serif",
  outline: "none", boxSizing: "border-box", color: "#1A1A1A", background: "#fff",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 600, color: "#1A1A1A",
  textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "7px",
};

export default function CheckoutReviewPage() {
  const router = useRouter();
  const {
    shippingAddress, companyName, contactName, shippingPhone, shippingMethod,
    shippingCost,
    addressId, poNumber, orderNotes, setPoNumber, setOrderNotes,
    savedCardId, qbToken,
    setConfirmedOrder,
    taxRegion: storedTaxRegion,
    taxRate: storedTaxRate,
    taxAmount: storedTaxAmount,
    paymentMethod,
    achBankName, achAccountHolder, achRoutingNumber, achAccountLast4, achAccountType,
    shippingType,
    selectedRate,
    convenienceFee,
  } = useCheckoutStore();
  const clearCart = useCartStore((s) => s.clearCart);
  const { isAuthenticated, isLoading: authIsLoading } = useAuthStore();
  const isGuest = !authIsLoading && !isAuthenticated();

  useEffect(() => {
    const store = useCheckoutStore.getState();
    console.log("Review page store state:", {
      shippingType: store.shippingType,
      selectedRate: store.selectedRate,
    });
  }, []);

  const [cart, setCart] = useState<Cart | null>(null);
  const [guestEntries, setGuestEntries] = useState<GuestCartEntry[]>([]);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_amount: number; discount_type: string } | null>(null);
  // Seed from checkout store; API fetch is a fallback in case user navigated directly here
  const [taxRate, setTaxRate] = useState<{ region: string; rate: number } | null>(
    storedTaxRate > 0 && storedTaxRegion ? { region: storedTaxRegion, rate: storedTaxRate } : null
  );
  const [freshTaxAmount, setFreshTaxAmount] = useState(0);

  // Derived values needed by useEffects below
  const guestSubtotalCalc = guestEntries.reduce((s, e) => s + e.unit_price * e.quantity, 0);
  const subtotal = isGuest ? guestSubtotalCalc : Number(cart?.subtotal ?? 0);
  const shipping = shippingCost;
  const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount_amount) : 0;

  // Guard: must have shipping + payment
  useEffect(() => {
    if (!shippingAddress) {
      router.replace("/checkout/address");
    } else if (!savedCardId && !qbToken && paymentMethod !== "ach" && paymentMethod !== "net_30") {
      router.replace("/checkout/payment");
    }
  }, [shippingAddress, savedCardId, qbToken, paymentMethod, router]);

  useEffect(() => {
    if (!isGuest) {
      cartService.getCart().then(setCart).catch(() => {});
    } else {
      try {
        const entries: GuestCartEntry[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
        setGuestEntries(entries);
      } catch { /* ignore */ }
    }
  }, [isGuest]);

  useEffect(() => {
    if (!isGuest) {
      apiClient.get<SavedCard[]>("/api/v1/account/payment-methods").then(setSavedCards).catch(() => {});
    }
  }, [isGuest]);

  useEffect(() => {
    if (typeof window === "undefined" || isGuest) return;
    const saved = localStorage.getItem("af_coupon");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.code) setAppliedCoupon(parsed);
    } catch { /* ignore */ }
  }, [isGuest]);

  useEffect(() => {
    // Use stored tax rate if available from address step
    if (storedTaxRate > 0 && storedTaxRegion) {
      setTaxRate({ region: storedTaxRegion, rate: storedTaxRate });
      return;
    }
    // Fallback: fetch fresh if navigated directly to review (store empty)
    if (!shippingAddress?.state) return;
    apiClient.post<{ tax_rate: number; tax_amount: number; region: string; taxable: boolean }>(
      `/api/v1/tax/calculate`,
      {
        subtotal,
        zip_code: shippingAddress.postal_code ?? "",
        state: shippingAddress.state.toUpperCase(),
        discount: couponDiscount,
      },
    )
      .then(r => {
        const rate = Number(r.tax_rate ?? 0);
        const amount = Number(r.tax_amount ?? 0);
        setTaxRate(rate > 0 ? { region: r.region, rate } : null);
        if (amount > 0) setFreshTaxAmount(amount);
      })
      .catch(() => setTaxRate(null));
  }, [storedTaxRegion, storedTaxRate, shippingAddress?.state, couponDiscount]);

  function buildColorSummary(c: Cart): string {
    const colorMap = new Map<string, number>();
    for (const item of c.items) {
      const col = item.color ?? "Default";
      colorMap.set(col, (colorMap.get(col) ?? 0) + item.quantity);
    }
    return Array.from(colorMap.entries())
      .map(([color, units]) => `${color} x ${units} units`)
      .join(", ");
  }

  async function handlePlaceOrder() {
    if (!shippingAddress) return;
    setIsPlacing(true);
    setError(null);

    // Belt-and-suspenders: read from store first, fall back to sessionStorage
    const _storeSnap = useCheckoutStore.getState();
    const shippingType = _storeSnap.shippingType || sessionStorage.getItem('checkout_shipping_type') || "";
    const _savedRateStr = sessionStorage.getItem('checkout_selected_rate');
    const selectedRate = _storeSnap.selectedRate || (_savedRateStr ? (() => { try { return JSON.parse(_savedRateStr); } catch { return null; } })() : null);

    console.log("[Review] Checkout shipping data:", { shippingType, selectedRate });

    try {
      if (isGuest) {
        // ── Guest checkout ─────────────────────────────────────────────────
        const guestData = JSON.parse(sessionStorage.getItem("af_guest_checkout") || "{}");
        const guestPayload = {
          guest_name: guestData.name || contactName || "Guest",
          guest_email: guestData.email || "",
          guest_phone: guestData.phone || shippingPhone || undefined,
          items: guestEntries.map(e => ({ variant_id: e.variant_id, quantity: e.quantity })),
          shipping_address: {
            label: "Shipping",
            full_name: guestData.name,
            line1: shippingAddress.line1,
            line2: shippingAddress.line2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postal_code: shippingAddress.postal_code,
            country: shippingAddress.country || "US",
          },
          shipping_method: shippingMethod || "standard",
          payment_method: paymentMethod,
          qb_token: paymentMethod === "card" ? qbToken : undefined,
          ach_bank_name: paymentMethod === "ach" ? achBankName : undefined,
          ach_account_holder: paymentMethod === "ach" ? achAccountHolder : undefined,
          ach_routing_number: paymentMethod === "ach" ? achRoutingNumber : undefined,
          ach_account_last4: paymentMethod === "ach" ? achAccountLast4 : undefined,
          ach_account_type: paymentMethod === "ach" ? achAccountType : undefined,
          order_notes: orderNotes || undefined,
          tax_amount: taxAmount > 0 ? taxAmount : undefined,
          tax_rate: taxRate?.rate ?? undefined,
          tax_region: taxRate?.region ?? undefined,
          shipping_cost: shippingCost > 0 ? shippingCost : undefined,
          ...(selectedRate && shippingType === "live_shippo" ? {
            shipping_rate_id: selectedRate.rate_id,
            shipping_carrier: selectedRate.carrier,
            shipping_service: selectedRate.service,
          } : {}),
        };
        console.log("[Review] Guest order payload:", JSON.stringify(guestPayload, null, 2));
        const order = await apiClient.post<{ order_id: string; order_number: string; total: number }>("/api/v1/guest/checkout", guestPayload);

        const guestSubtotal = guestEntries.reduce((s, e) => s + e.unit_price * e.quantity, 0);
        const productName = guestEntries[0]?.product_name ?? "Your Order";
        const colorSummary = guestEntries.map(e => e.color ?? "").filter(Boolean).join(", ");

        const confirmedData = {
          id: order.order_id,
          number: order.order_number,
          total: order.total,
          units: guestEntries.reduce((s, e) => s + e.quantity, 0),
          colorSummary,
          productName,
          shippingMethod,
          shippingCost,
          paymentMethod,
          isGuest: true,
        };
        setConfirmedOrder(confirmedData);
        sessionStorage.setItem("af_confirmed_order", JSON.stringify(confirmedData));
        localStorage.removeItem("af_guest_cart");
        sessionStorage.removeItem("af_guest_checkout");
        window.dispatchEvent(new Event("af_guest_cart_updated"));
        router.push("/checkout/confirmed");
        return;
      }

      // ── Wholesale checkout ───────────────────────────────────────────────
      const fullAddress = {
        label: companyName || "Shipping",
        full_name: contactName || undefined,
        line1: shippingAddress.line1,
        line2: shippingAddress.line2,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.postal_code,
        country: shippingAddress.country || "US",
        phone: shippingPhone || undefined,
      };

      const basePayload = {
        address_id: addressId ?? undefined,
        shipping_address: fullAddress,
        shipping_method: shippingMethod || "standard",
        po_number: poNumber || undefined,
        order_notes: orderNotes || undefined,
        discount_code: appliedCoupon?.code || undefined,
        tax_amount: taxAmount > 0 ? taxAmount : undefined,
        tax_rate: taxRate?.rate ?? undefined,
        tax_region: taxRate?.region ?? undefined,
        shipping_cost: shippingCost > 0 ? shippingCost : undefined,
        ...(selectedRate && shippingType === "live_shippo" ? {
          shipping_rate_id: selectedRate.rate_id,
          shipping_carrier: selectedRate.carrier,
          shipping_service: selectedRate.service,
        } : {}),
      };

      console.log("[Review] Wholesale basePayload:", JSON.stringify(basePayload, null, 2));
      console.log("[Review] Final shipping fields in payload:", {
        shipping_rate_id: (basePayload as Record<string, unknown>).shipping_rate_id,
        shipping_carrier: (basePayload as Record<string, unknown>).shipping_carrier,
        shipping_service: (basePayload as Record<string, unknown>).shipping_service,
      });
      const order = await ordersService.confirmOrder(
        paymentMethod === "ach"
          ? {
              ...basePayload,
              payment_method: "ach",
              ach_bank_name: achBankName || undefined,
              ach_account_holder: achAccountHolder || undefined,
              ach_routing_number: achRoutingNumber || undefined,
              ach_account_last4: achAccountLast4 || undefined,
              ach_account_type: achAccountType || undefined,
            }
          : paymentMethod === "net_30"
          ? {
              ...basePayload,
              payment_method: "net_30",
            }
          : {
              ...basePayload,
              payment_method: "card",
              qb_token: qbToken ?? undefined,
              saved_card_id: savedCardId ?? undefined,
            }
      );

      const productName = cart?.items[0]?.product_name ?? "Your Order";
      const colorSummary = cart ? buildColorSummary(cart) : "";
      const orderTotal = subtotal + shippingCost + taxAmount - couponDiscount + convenienceFee;

      const confirmedData = {
        id: order.id,
        number: order.order_number,
        total: orderTotal,
        units: cart?.total_units ?? 0,
        colorSummary,
        productName,
        shippingMethod,
        shippingCost,
        paymentMethod,
      };
      setConfirmedOrder(confirmedData);
      sessionStorage.setItem("af_confirmed_order", JSON.stringify(confirmedData));

      if (typeof window !== "undefined") localStorage.removeItem("af_coupon");
      clearCart();
      window.dispatchEvent(new Event("cart_updated"));
      router.push("/checkout/confirmed");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to place order. Please try again.");
      setIsPlacing(false);
    }
  }

  const cartDisplayItems = isGuest
    ? guestEntries.map(e => ({ name: e.product_name, color: e.color, size: e.size, qty: e.quantity, lineTotal: e.unit_price * e.quantity, imageUrl: e.image_url ?? null }))
    : (cart?.items ?? []).map(i => ({ name: i.product_name, color: i.color ?? null, size: i.size ?? null, qty: i.quantity, lineTotal: Number(i.line_total), imageUrl: i.product_image_url ?? null }));

  const selectedCard = savedCards.find(c => c.id === savedCardId);
  const paymentLabel = paymentMethod === "ach"
    ? `ACH / Bank Transfer${achAccountLast4 ? ` — ****${achAccountLast4}` : ""}`
    : paymentMethod === "net_30"
    ? "Net 30 — Pay by Invoice"
    : selectedCard
    ? `${brandDisplayName(selectedCard.brand)} •••• ${selectedCard.last4}`
    : qbToken
    ? "New Card (tokenized)"
    : "Credit Card";

  // Priority: stored tax amount → fresh re-fetch amount → rate × (subtotal-discount)
  const taxAmount = storedTaxAmount > 0
    ? storedTaxAmount
    : freshTaxAmount > 0
      ? freshTaxAmount
      : (taxRate ? Math.round(Math.max(0, subtotal - couponDiscount) * taxRate.rate / 100 * 100) / 100 : 0); // shipping not taxed
  const total = subtotal + shipping + taxAmount - (isGuest ? 0 : couponDiscount) + convenienceFee;
  const shippingLabel = SHIPPING_LABELS[shippingMethod] ?? "Standard Ground";

  return (
    <div style={{ padding: "40px 24px 64px", background: "#F8F8F6" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div className="checkout-cols" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "48px", alignItems: "start" }}>

          {/* LEFT COLUMN */}
          <div>
            {/* ── Shipping Address ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...sectionLabelStyle }}>
                <span>Shipping Address</span>
                <button onClick={() => router.push("/checkout/address")} style={{ fontSize: "12px", color: "#1C3557", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textTransform: "none", letterSpacing: 0 }}>Edit</button>
              </div>
              <div style={{ fontSize: "13px", color: "#1A1A1A", lineHeight: 1.7 }}>
                {companyName && <div style={{ fontWeight: 700 }}>{companyName}</div>}
                {contactName && <div>{contactName}</div>}
                {shippingAddress && (
                  <>
                    <div>{shippingAddress.line1}</div>
                    {shippingAddress.line2 && <div>{shippingAddress.line2}</div>}
                    <div>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.postal_code}</div>
                  </>
                )}
                {shippingPhone && <div style={{ color: "#6B6B6B" }}>{shippingPhone}</div>}
              </div>
              <div style={{ borderTop: "1px solid #E2E2DE", margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "#6B6B6B" }}>Shipping Method</span>
                <span style={{ fontWeight: 600, color: "#1A1A1A" }}>
                  {shippingLabel} — {shipping === 0 ? "FREE" : formatCurrency(shipping)}
                </span>
              </div>
            </div>

            {/* ── Payment ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...sectionLabelStyle }}>
                <span>Payment</span>
                <button onClick={() => router.push("/checkout/payment")} style={{ fontSize: "12px", color: "#1C3557", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textTransform: "none", letterSpacing: 0 }}>Change</button>
              </div>
              {paymentMethod === "ach" ? (
                <div style={{ fontSize: "13px", color: "#1A1A1A", lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 700, marginBottom: "6px" }}>ACH / Bank Transfer</div>
                  {achBankName && <div style={{ color: "#6B6B6B" }}>Bank: <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{achBankName}</span></div>}
                  {achAccountHolder && <div style={{ color: "#6B6B6B" }}>Account Holder: <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{achAccountHolder}</span></div>}
                  {achAccountLast4 && <div style={{ color: "#6B6B6B" }}>Account: <span style={{ color: "#1A1A1A", fontWeight: 600 }}>****{achAccountLast4}</span></div>}
                  {achAccountType && <div style={{ color: "#6B6B6B" }}>Type: <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{achAccountType.charAt(0).toUpperCase() + achAccountType.slice(1)}</span></div>}
                  <div style={{ marginTop: "8px", padding: "8px 12px", background: "rgba(217,119,6,.08)", fontSize: "12px", color: "#D97706", fontWeight: 600 }}>
                    Order pending — payment verified within 1–2 business days
                  </div>
                </div>
              ) : paymentMethod === "net_30" ? (
                <div style={{ fontSize: "13px", color: "#1A1A1A", lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 700, marginBottom: "6px" }}>Net 30 — Pay by Invoice</div>
                  <div style={{ marginTop: "8px", padding: "8px 12px", background: "rgba(217,119,6,.08)", fontSize: "12px", color: "#D97706", fontWeight: 600 }}>
                    An invoice will be sent to your account. Payment due within 30 days.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <svg width="32" height="22" viewBox="0 0 32 22" fill="none">
                    <rect width="32" height="22" rx="3" fill="#F4F3EF" stroke="#E2E2DE" />
                    <rect x="4" y="8" width="10" height="6" rx="1.5" fill="#E2E2DE" />
                    <rect x="4" y="16" width="5" height="2" rx="0.5" fill="#E2E2DE" />
                    <rect x="11" y="16" width="5" height="2" rx="0.5" fill="#E2E2DE" />
                  </svg>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>{paymentLabel}</span>
                </div>
              )}
            </div>

            {/* ── Order Items ── */}
            {(isGuest ? guestEntries.length > 0 : cart ? cart.items.length > 0 : false) && (
              <div style={{ marginBottom: "32px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...sectionLabelStyle }}>
                  <span>Items in Your Order</span>
                  <span style={{ fontSize: "11px", color: "#6B6B6B", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                    {isGuest
                      ? `${guestEntries.reduce((s, e) => s + e.quantity, 0)} units`
                      : `${cart!.total_units} units`}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {isGuest
                    ? guestEntries.map((item, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "38px", height: "38px", flexShrink: 0, background: "#F4F3EF", border: "1px solid #E2E2DE", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
                            {item.image_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={item.image_url} alt={item.product_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                              : <span>👕</span>
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A" }}>{item.product_name}</div>
                            <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "1px" }}>
                              {[item.color, item.size].filter(Boolean).join(" / ")}
                              {" · "}qty {item.quantity}
                            </div>
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap" }}>{formatCurrency(item.unit_price * item.quantity)}</span>
                        </div>
                      ))
                    : cart!.items.map(item => (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "38px", height: "38px", flexShrink: 0, background: "#F4F3EF", border: "1px solid #E2E2DE", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {item.product_image_url
                              ? <img src={item.product_image_url} alt={item.product_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <span style={{ fontSize: "16px" }}>👕</span>
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A" }}>{item.product_name}</div>
                            <div style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "1px" }}>
                              {[item.color, item.size].filter(Boolean).join(" / ")}
                              {" · "}SKU {item.sku}
                              {" · "}qty {item.quantity}
                            </div>
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap" }}>{formatCurrency(Number(item.line_total))}</span>
                        </div>
                      ))
                  }
                </div>
              </div>
            )}
            {/* Loading state for wholesale cart */}
            {!isGuest && !cart && (
              <div style={{ textAlign: "center", color: "#6B6B6B", fontSize: "13px", marginBottom: "32px" }}>
                Loading order items…
              </div>
            )}

            {/* ── PO Number & Notes ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={sectionLabelStyle}>Order Details (Optional)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={lbl}>
                    PO Number
                  </label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={e => setPoNumber(e.target.value)}
                    placeholder="Optional purchase order reference"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>
                    Order Notes
                  </label>
                  <textarea
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    placeholder="Special instructions or notes for this order"
                    rows={3}
                    style={{ ...inp, resize: "vertical" }}
                  />
                </div>
              </div>
            </div>

            {/* ── Error ── */}
            {error && (
              <div style={{ padding: "12px 16px", background: "rgba(232,36,42,.07)", border: "1px solid rgba(232,36,42,.25)", color: "#E8242A", fontSize: "13px", fontWeight: 600, marginBottom: "14px" }}>
                {error}
              </div>
            )}

            {/* ── Place Order ── */}
            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              <a
                href="/checkout/payment"
                style={{ display: "inline-block", fontSize: "13px", color: "#6B6B6B", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B6B6B"; }}
              >
                ← Back to Payment
              </a>
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={isPlacing}
                style={{
                  flex: 1, padding: "14px",
                  background: isPlacing ? "#E2E2DE" : "#1C3557",
                  color: isPlacing ? "#aaa" : "#fff",
                  border: "none",
                  fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500,
                  cursor: isPlacing ? "not-allowed" : "pointer", transition: "opacity .15s",
                }}
                onMouseEnter={e => { if (!isPlacing) (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              >
                {isPlacing ? "Placing Order…" : "Place Order"}
              </button>
            </div>

            <p style={{ textAlign: "center", fontSize: "12px", color: "#6B6B6B", marginTop: "12px", fontFamily: "'DM Sans', sans-serif" }}>
              By placing your order you agree to our Terms of Service and wholesale pricing agreement.
            </p>
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
                <span>Subtotal ({isGuest ? guestEntries.reduce((s, e) => s + e.quantity, 0) : (cart?.total_units ?? 0)} units)</span>
                <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{formatCurrency(subtotal)}</span>
              </div>
              {Number(cart?.discount_percent ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#059669", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                  <span style={{ fontWeight: 600 }}>Tier Discount ({cart?.discount_percent}% applied)</span>
                  <span style={{ fontWeight: 700 }}>&#10003; Included</span>
                </div>
              )}
              {appliedCoupon && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#059669", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                  <span style={{ fontWeight: 600 }}>Coupon ({appliedCoupon.code})</span>
                  <span style={{ fontWeight: 700 }}>-{formatCurrency(couponDiscount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                <span>Shipping ({shippingLabel})</span>
                <span style={{ color: shipping === 0 ? "#059669" : "#1A1A1A", fontWeight: 600 }}>
                  {shipping === 0 ? "FREE" : formatCurrency(shipping)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#6B6B6B", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
                <span>
                  {taxRate ? `Tax (${taxRate.region} ${taxRate.rate}%)` : "Tax"}
                </span>
                <span style={{ color: "#1A1A1A", fontWeight: 600 }}>
                  {formatCurrency(taxAmount)}
                </span>
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
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { .checkout-cols { display: block !important; } }
      `}</style>
    </div>
  );
}
