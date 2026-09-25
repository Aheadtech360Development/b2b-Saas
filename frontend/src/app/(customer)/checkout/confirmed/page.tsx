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
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ui-muted)", fontSize: "14px" }}>
        Loading&hellip;
      </div>
    );
  }

  const shippingLabel = SHIPPING_LABELS[confirmedShippingMethod] ?? "Standard Ground";

  return (
    <div className="ui-page" style={{ padding: "64px 24px" }}>
      <div style={{ maxWidth: "560px", width: "100%", margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <svg width="52" height="52" viewBox="0 0 48 48" fill="none" style={{ marginBottom: "16px" }}>
            <circle cx="24" cy="24" r="24" fill="var(--ui-ok)" opacity="0.12"/>
            <path d="M14 24l7 7 13-13" stroke="var(--ui-ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className="ui-h1" style={{ fontSize: "32px", marginBottom: "8px" }}>
            Order placed
          </h1>
          <p style={{ fontSize: "16px", color: "var(--ui-muted)", margin: 0, lineHeight: 1.6 }}>
            Order <span className="ui-num" style={{ color: "var(--ui-ink)", fontWeight: 600 }}>{confirmedOrderNumber}</span>.
            A confirmation is on its way to your inbox.
          </p>
        </div>

        <div className="ui-card" style={{ marginBottom: "24px", padding: "8px 24px" }}>
          {[
            { label: "Items", value: `${confirmedUnits} unit${confirmedUnits !== 1 ? "s" : ""}` },
            ...(confirmedProductName ? [{ label: "Product", value: confirmedProductName }] : []),
            ...(confirmedColorSummary ? [{ label: "Colors", value: confirmedColorSummary }] : []),
            { label: "Shipping", value: shippingLabel },
            ...(confirmedShippingCost > 0 ? [{ label: "Shipping Cost", value: formatCurrency(confirmedShippingCost) }] : []),
            { label: "Total", value: formatCurrency(confirmedOrderTotal) },
            ...(confirmedPaymentMethod ? [{ label: "Payment", value: confirmedPaymentMethod === "net_30" ? "Net 30 — Invoice" : confirmedPaymentMethod === "ach" ? "ACH / Bank Transfer" : "Credit Card" }] : []),
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: "flex", gap: "12px", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--ui-line)" : "none" }}>
              <dt style={{ fontSize: "14px", color: "var(--ui-muted)", flex: 1, margin: 0 }}>{row.label}</dt>
              <dd className={(row as { mono?: boolean }).mono ? "ui-num" : undefined}
                  style={{ fontSize: "14px", margin: 0, fontWeight: 600, textAlign: "right" }}>{row.value}</dd>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link
            href={(() => {
              try { const d = JSON.parse(sessionStorage.getItem("af_confirmed_order") || "{}"); return d.isGuest ? "/track-order" : "/account/orders"; } catch { return "/account/orders"; }
            })()}
            className="ui-btn"
          >
            Track this order
          </Link>
          <Link href="/products" className="ui-btn-ghost">
            Keep shopping
          </Link>
        </div>

      </div>
    </div>
  );
}
