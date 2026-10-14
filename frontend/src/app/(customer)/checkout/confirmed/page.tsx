"use client";

/**
 * Where every order used to land, one address for all of them. An order has
 * its own page now (/checkout/thank-you/<number>, lib/orderThanks.ts); this
 * sends a tab still open on the old address, or a saved link, to it.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { thankYouPath } from "@/lib/orderThanks";
import { useCheckoutStore } from "@/stores/checkout.store";

export default function CheckoutConfirmedPage() {
  const router = useRouter();

  useEffect(() => {
    let number = useCheckoutStore.getState().confirmedOrderNumber;
    if (!number) {
      try {
        number = (JSON.parse(sessionStorage.getItem("af_confirmed_order") || "{}") as { number?: string }).number ?? null;
      } catch {
        number = null;
      }
    }
    router.replace(number ? thankYouPath(number) : "/cart");
  }, [router]);

  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ui-muted)", fontSize: "14px" }}>
      Loading&hellip;
    </div>
  );
}
