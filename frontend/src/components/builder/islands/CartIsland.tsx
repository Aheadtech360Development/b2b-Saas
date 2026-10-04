"use client";

/**
 * The shop's real cart, where a cart template puts it.
 *
 * Loaded only on the page that shows it, so no other builder page carries the
 * cart's code. In the editor it is a still picture of a cart: the admin
 * editing the site is not a shopper, and their own session has no business
 * appearing in the design.
 */
import dynamic from "next/dynamic";

const CartView = dynamic(() => import("@/components/storefront/CartView"), {
  loading: () => <div style={{ minHeight: 200, display: "grid", placeItems: "center", color: "#7A7880", fontSize: 14 }}>Loading cart…</div>,
});

function Mock() {
  const line = (w: string) => <div style={{ height: 12, width: w, borderRadius: 6, background: "var(--b-border,#ECECEC)" }} />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,280px)", gap: 24, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: 14, border: "1px solid var(--b-border,#ECECEC)", borderRadius: "var(--b-radius,10px)" }}>
            <div style={{ width: 64, height: 64, borderRadius: 8, background: "var(--b-surface,#FAFAF8)", flex: "0 0 auto" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>{line("55%")}{line("30%")}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 18, border: "1px solid var(--b-border,#ECECEC)", borderRadius: "var(--b-radius,10px)", display: "flex", flexDirection: "column", gap: 10 }}>
        {line("70%")}{line("50%")}
        <div style={{ height: 40, borderRadius: "var(--b-btn-radius,10px)", background: "var(--b-primary,#14161B)", opacity: 0.85, marginTop: 6 }} />
      </div>
      <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "#5B6170", fontFamily: "system-ui, sans-serif" }}>
        The shopper&apos;s cart shows here — their lines, quantities, totals and the checkout button.
      </div>
    </div>
  );
}

export default function CartIsland({ id, edit }: { id: string; edit?: boolean }) {
  return (
    <div data-b={id || undefined} className="b-cart">
      {edit ? <Mock /> : <CartView embedded />}
    </div>
  );
}
