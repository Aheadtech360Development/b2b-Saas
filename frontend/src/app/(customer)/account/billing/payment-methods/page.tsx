"use client";

/** Billing, Payment methods: the same answer as Account's tab, under Billing. */
import { BillingTabs } from "@/components/portal/BillingTabs";
import { PageHead } from "@/components/portal/ui";
import { PaymentMethodsBody } from "@/components/portal/PaymentMethodsBody";

export default function BillingPaymentMethodsPage() {
  return (
    <>
      <PageHead eyebrow="Billing" title="Payment methods" sub="How you pay this shop." />
      <BillingTabs />
      <PaymentMethodsBody />
    </>
  );
}
