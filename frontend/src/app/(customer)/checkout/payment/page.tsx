"use client";

/**
 * The payment step, retired.
 *
 * It asked which kind of payment, then said the card comes on the next screen.
 * The card is on the review page, where somebody can see what they are paying
 * for while they type it — so this was a whole screen standing between a buyer
 * and their order, to tell them about the screen after it.
 *
 * The route stays as a redirect rather than disappearing: it is in people's
 * history, in half-finished checkouts, and in a link or two we do not own.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CheckoutPaymentPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/checkout/review"); }, [router]);
  return (
    <div className="ui-wrap" style={{ padding: "60px 0", textAlign: "center", color: "var(--ui-muted)", fontSize: "14px" }}>
      Taking you to your order…
    </div>
  );
}
