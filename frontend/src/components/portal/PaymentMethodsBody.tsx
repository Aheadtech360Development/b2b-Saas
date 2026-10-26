"use client";

/**
 * How this buyer pays, for the Account and Billing tabs alike. No card is kept
 * on file: the card is entered at checkout each time and held by the payment
 * processor, so there is nothing to add or remove. A company account with Net
 * 30 terms is told so, and where its invoices are paid.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

export function PaymentMethodsBody() {
  const user = useAuthStore((s) => s.user);
  const company = !!user?.company_id;
  const [net30, setNet30] = useState(false);

  useEffect(() => {
    if (!company) return;
    apiClient.get<{ net30_enabled: boolean }>("/api/v1/account/net30-status")
      .then((d) => setNet30(!!d.net30_enabled))
      .catch(() => setNet30(false));
  }, [company]);

  return (
    <div className="cp-stack" style={{ maxWidth: 720 }}>
      <section className="cp-card cp-pad cp-stack-sm">
        <h2 className="cp-h2">Card at checkout</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          You enter your card when you check out. It is never stored on your account: the payment processor holds it
          for that payment only, so there is no saved card to manage here.
        </p>
      </section>
      {company && net30 && (
        <section className="cp-card cp-pad cp-stack-sm">
          <h2 className="cp-h2">Net 30 terms</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
            Your company can order now and pay within 30 days. Each order becomes an invoice you pay online from Billing.
          </p>
          <div><Link href="/account/invoices" className="cp-btn cp-btn-p">Go to invoices</Link></div>
        </section>
      )}
    </div>
  );
}
