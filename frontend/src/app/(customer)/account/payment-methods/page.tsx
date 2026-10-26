"use client";

/** Account, Payment methods: how this buyer pays (components/portal/PaymentMethodsBody). */
import { AccountTabs } from "@/components/portal/AccountTabs";
import { PageHead } from "@/components/portal/ui";
import { PaymentMethodsBody } from "@/components/portal/PaymentMethodsBody";

export default function PaymentMethodsPage() {
  return (
    <>
      <PageHead eyebrow="Account" title="Payment methods" sub="How you pay this shop." />
      <AccountTabs />
      <PaymentMethodsBody />
    </>
  );
}
