"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCheckoutStore } from "@/stores/checkout.store";
import type { ShippingMethod } from "@/stores/checkout.store";
import { formatCurrency } from "@/lib/utils";

const SHIPPING_LABELS: Record<string, string> = {
  standard: "Standard Ground",
  expedited: "Expedited (2-Day)",
  will_call: "Will Call Pickup",
  freight: "Freight / LTL",
};

export default function CheckoutConfirmedPage() {
  const router = useRouter();
  const {
    confirmedOrderId,
    confirmedOrderNumber,
    confirmedOrderTotal,
    confirmedUnits,
    confirmedColorSummary,
    confirmedProductName,
    confirmedShippingMethod,
    confirmedShippingCost,
    confirmedPaymentMethod,
    setConfirmedOrder,
  } = useCheckoutStore();

  const [ready, setReady] = useState(false);

  // On mount: if Zustand store is empty (e.g. full-page navigation wiped it),
  // recover from sessionStorage before deciding whether to redirect.
  useEffect(() => {
    if (!confirmedOrderId && !confirmedOrderNumber) {
      try {
        const stored = sessionStorage.getItem("af_confirmed_order");
        if (stored) {
          const data = JSON.parse(stored) as {
            id: string; number: string; total: number;
            units: number; colorSummary: string; productName: string;
            shippingMethod: ShippingMethod; shippingCost?: number;
            paymentMethod?: string; isGuest?: boolean;
          };
          setConfirmedOrder(data);
          setReady(true);
          return;
        }
      } catch {
        // ignore parse errors
      }
      // Nothing in store or sessionStorage — direct navigation, redirect away
      router.replace("/cart");
    } else {
      setReady(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || !confirmedOrderNumber) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#6B6B6B", fontSize: "14px" }}>
        Loading&hellip;
      </div>
    );
  }

  const shippingLabel = SHIPPING_LABELS[confirmedShippingMethod] ?? "Standard Ground";

  return (
    <div style={{ background: "#F8F8F6", padding: "64px 24px", display: "flex", flexDirection: "column", alignItems: "center", minHeight: "60vh", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: "600px", width: "100%" }}>

        {/* Success checkmark */}
        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="var(--brand-primary, #1C3557)" opacity="0.1"/>
            <path d="M14 24l7 7 13-13" stroke="var(--brand-primary, #1C3557)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "44px", fontWeight: 600, color: "#1A1A1A", marginBottom: "12px", lineHeight: 1.1, textAlign: "left" }}>
          Order Confirmed
        </h1>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "14px", color: "#6B6B6B", marginBottom: "8px" }}>
          {confirmedOrderNumber}
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "16px", color: "#6B6B6B", marginBottom: "36px", lineHeight: 1.6 }}>
          Your order has been placed. You will receive a confirmation email shortly.
        </p>

        {/* Details box */}
        <div style={{ border: "1px solid #E2E2DE", background: "#FFFFFF", padding: "24px", marginBottom: "28px" }}>
          {[
            { label: "Order Number", value: confirmedOrderNumber, mono: true },
            { label: "Items", value: `${confirmedUnits} unit${confirmedUnits !== 1 ? "s" : ""}` },
            ...(confirmedProductName ? [{ label: "Product", value: confirmedProductName }] : []),
            ...(confirmedColorSummary ? [{ label: "Colors", value: confirmedColorSummary }] : []),
            { label: "Shipping", value: shippingLabel },
            ...(confirmedShippingCost > 0 ? [{ label: "Shipping Cost", value: formatCurrency(confirmedShippingCost) }] : []),
            { label: "Total", value: formatCurrency(confirmedOrderTotal) },
            ...(confirmedPaymentMethod ? [{ label: "Payment", value: confirmedPaymentMethod === "net_30" ? "Net 30 — Invoice" : confirmedPaymentMethod === "ach" ? "ACH / Bank Transfer" : "Credit Card" }] : []),
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: "flex", gap: "12px", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #E2E2DE" : "none" }}>
              <dt style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#6B6B6B", minWidth: "200px", margin: 0 }}>{row.label}</dt>
              <dd style={{ fontFamily: (row as { mono?: boolean }).mono ? "'IBM Plex Mono', monospace" : "'DM Sans', sans-serif", fontSize: (row as { mono?: boolean }).mono ? "13px" : "14px", color: "#1A1A1A", margin: 0, fontWeight: 500 }}>{row.value}</dd>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <Link
            href={(() => {
              try { const d = JSON.parse(sessionStorage.getItem("af_confirmed_order") || "{}"); return d.isGuest ? "/track-order" : "/account/orders"; } catch { return "/account/orders"; }
            })()}
            style={{ display: "inline-block", padding: "12px 24px", border: "1px solid var(--brand-primary, #1C3557)", color: "var(--brand-primary, #1C3557)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 500, textDecoration: "none", transition: "all .15s" }}
          >
            Track Your Order →
          </Link>
          <Link
            href="/products"
            style={{ display: "inline-block", padding: "12px 24px", background: "var(--brand-primary, #1C3557)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 500, textDecoration: "none", transition: "opacity .15s" }}
          >
            Continue Shopping →
          </Link>
        </div>

      </div>
    </div>
  );
}
