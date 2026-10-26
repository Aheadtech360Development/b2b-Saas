"use client";

/**
 * Billing, Credit and terms: how this company pays and what it owes now.
 * Terms and the price tier are set by the shop; this page only shows them.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { accountService } from "@/services/account.service";
import { apiClient } from "@/lib/api-client";
import { money } from "@/lib/customerWords";
import { BillingTabs } from "@/components/portal/BillingTabs";
import { Loading, PageHead } from "@/components/portal/ui";
import { owed, type FullProfile, type Invoice } from "@/components/portal/data";

export default function CreditAndTermsPage() {
  const [net30, setNet30] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    apiClient.get<{ net30_enabled: boolean }>("/api/v1/account/net30-status")
      .then((d) => setNet30(!!d.net30_enabled)).catch(() => setNet30(false));
    (accountService.getFullProfile() as Promise<FullProfile>).then(setProfile).catch(() => {});
    (accountService.getInvoices() as Promise<Invoice[]>).then(setInvoices).catch(() => {});
  }, []);

  const open = invoices.filter((i) => owed(i) > 0);
  const tier = profile?.company?.pricing_tier_name;
  const discount = profile?.company?.pricing_tier_discount;

  return (
    <>
      <PageHead eyebrow="Billing" title="Credit and terms" sub="How your company pays, and where it stands." />
      <BillingTabs />
      {net30 === null ? <Loading /> : (
        <div className="cp-stack" style={{ maxWidth: 720 }}>
          <section className="cp-card cp-pad">
            <h2 className="cp-h2" style={{ marginBottom: 14 }}>Your terms</h2>
            <dl className="cp-kv" style={{ margin: 0 }}>
              <div><dt>Terms</dt><dd>{net30 ? "Net 30" : "Pay at checkout"}</dd></div>
              <div><dt>Balance owed</dt><dd>{money(open.reduce((s, i) => s + owed(i), 0))}</dd></div>
              <div><dt>Open invoices</dt><dd>{open.length}</dd></div>
              <div><dt>Pricing tier</dt><dd>{tier ? `${tier}${discount ? `, ${Number(discount)}% off retail` : ""}` : "Shop prices"}</dd></div>
            </dl>
          </section>
          <section className="cp-card cp-pad cp-stack-sm">
            <h2 className="cp-h3">{net30 ? "How Net 30 works" : "Want to pay on terms?"}</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
              {net30
                ? "Order now and pay within 30 days. Each order becomes an invoice, due 30 days after it is placed, and you pay it online from Invoices."
                : "Your account pays at checkout. Terms such as Net 30 are set by the shop: ask them in Messages if your company would like them."}
            </p>
            <div className="cp-actions">
              {net30 ? <Link href="/account/invoices" className="cp-btn cp-btn-p">See invoices</Link>
                : <Link href="/account/messages" className="cp-btn">Ask the shop</Link>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
