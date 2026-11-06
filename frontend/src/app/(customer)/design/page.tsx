"use client";

/**
 * /design — the t-shirt designer.
 *
 *   ?product=<garment id>   start a new design on that garment
 *   ?new=1                  start a new design instead of the one in progress
 *   ?design=<design id>     open a design of the buyer's from the server (the
 *                           link in its emails, or Edit design in the cart)
 *
 * The canvas library is loaded with this page only, so the rest of the shop
 * stays as light as it was.
 */
import dynamic from "next/dynamic";

const Designer = dynamic(() => import("@/components/designer/Designer"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#ECEEF1", color: "#5D6470", fontWeight: 600 }}>
      Opening the designer…
    </div>
  ),
});

export default function DesignPage() {
  return <Designer />;
}
