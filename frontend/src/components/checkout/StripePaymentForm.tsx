"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { apiClient } from "@/lib/api-client";

// Fields that determine the charge amount — MUST match what the review page
// sends to /checkout/confirm so the PaymentIntent amount == the order total.
export type IntentPayload = {
  shipping_method?: string;
  shipping_cost?: number;
  tax_amount?: number;
  discount_code?: string;
  payment_method?: string;
  to_state?: string;
  to_zip?: string;
  /** A guest's cart travels with the request: there is no company cart on the
   *  server to price. The server prices these lines itself. */
  items?: unknown[];
  /** Gift cards paying first, and the checkout attempt their holds belong to. */
  gift_card_codes?: string[];
  checkout_ref?: string;
};

export type IntentResp = {
  /** Absent when gift cards pay it all (`gift_only`): no card is charged. */
  client_secret?: string;
  payment_intent_id?: string;
  connected_account_id?: string;
  publishable_key?: string;
  /** What the card is charged. */
  amount: number | string;
  order_total?: number | string;
  gift_only?: boolean;
  gift_cards?: { last4: string; masked: string; amount: number }[];
  gift_card_total?: number;
  card_amount?: number;
};

function InnerForm({
  onPaid, submitting, setSubmitting, buttonLabel,
}: {
  onPaid: (paymentIntentId: string) => void;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  buttonLabel: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required", // stay on-site unless the bank forces a redirect (3DS)
    });
    if (error) {
      setErr(error.message ?? "Payment failed. Please check your card and try again.");
      setSubmitting(false);
      return;
    }
    if (paymentIntent && paymentIntent.status === "succeeded") {
      onPaid(paymentIntent.id); // hand the confirmed PI to the order-creation step
    } else {
      setErr("Payment could not be completed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PaymentElement />
      {err && (
        <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(232,36,42,.07)", border: "1px solid rgba(232,36,42,.25)", color: "#E8242A", fontSize: "13px", fontWeight: 600 }}>
          {err}
        </div>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={!stripe || submitting}
        style={{
          width: "100%", marginTop: "16px", padding: "14px",
          background: submitting ? "#E2E2DE" : "var(--brand-primary, #1C3557)",
          color: submitting ? "#aaa" : "#fff", border: "none",
          fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500,
          cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Processing payment…" : buttonLabel}
      </button>
    </div>
  );
}

export function StripePaymentForm({
  intentPayload, onPaid, buttonLabel = "Pay & Place Order",
  intentUrl = "/api/v1/checkout/intent", onIntent, onGiftOnly, giftOnlyLabel = "Place order",
}: {
  intentPayload: IntentPayload;
  onPaid: (paymentIntentId: string) => void;
  buttonLabel?: string;
  /** Told what the payment step priced: the total, and what gift cards pay of it. */
  onIntent?: (r: IntentResp) => void;
  /** Gift cards cover the whole order: no card form, this places it. */
  onGiftOnly?: () => void;
  giftOnlyLabel?: string;
  /** Where to raise the PaymentIntent. Defaults to the cart; an invoice raises
   *  its own for the balance still owed. */
  intentUrl?: string;
}) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [giftOnly, setGiftOnly] = useState(false);
  // Create the intent exactly once — a fresh mount (e.g. after editing the cart)
  // makes a new one, which is fine; the previous uncaptured PI simply expires.
  const started = useRef(false);

  useEffect(() => {
    // `started` guards against React Strict Mode's double-invoke (which would
    // otherwise create two PaymentIntents). No cancel-on-cleanup flag: that
    // would block the single fetch's state update on the second (skipped) run
    // and leave the form stuck on "Loading secure payment…".
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const r = await apiClient.post<IntentResp>(intentUrl, {
          cart_validated: true,
          ...intentPayload,
        });
        onIntent?.(r);
        if (r.gift_only) {
          setGiftOnly(true);
          return;
        }
        setStripePromise(loadStripe(r.publishable_key!, { stripeAccount: r.connected_account_id }));
        setClientSecret(r.client_secret!);
      } catch (e: unknown) {
        const msg = (e as { status?: number; code?: string; message?: string });
        setLoadError(
          msg?.status === 409 || msg?.code === "STORE_PAYMENTS_NOT_READY"
            ? "This store hasn't finished setting up card payments yet. Please contact the store, or choose another payment method."
            : (msg?.message ?? "Could not start payment. Please try again.")
        );
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) {
    return (
      <div style={{ padding: "12px 16px", background: "rgba(232,36,42,.07)", border: "1px solid rgba(232,36,42,.25)", color: "#E8242A", fontSize: "13px", fontWeight: 600 }}>
        {loadError}
      </div>
    );
  }
  if (giftOnly) {
    return (
      <div data-gift-only>
        <div style={{ padding: "12px 14px", background: "rgba(5,150,105,.07)", border: "1px solid rgba(5,150,105,.25)", color: "#065F46", fontSize: "13px", fontWeight: 600 }}>
          Your gift card covers the whole order. No card needed.
        </div>
        <button
          type="button"
          onClick={() => { setSubmitting(true); onGiftOnly?.(); }}
          disabled={submitting}
          style={{
            width: "100%", marginTop: "16px", padding: "14px",
            background: submitting ? "#E2E2DE" : "var(--brand-primary, #1C3557)",
            color: submitting ? "#aaa" : "#fff", border: "none",
            fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 500,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Placing your order…" : giftOnlyLabel}
        </button>
      </div>
    );
  }
  if (!stripePromise || !clientSecret) {
    return <div style={{ padding: "16px", color: "#6B6B6B", fontSize: "13px" }}>Loading secure payment…</div>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <InnerForm onPaid={onPaid} submitting={submitting} setSubmitting={setSubmitting} buttonLabel={buttonLabel} />
    </Elements>
  );
}
