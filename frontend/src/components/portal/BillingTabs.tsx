"use client";

/** The Billing pages' tabs: one page each, so every tab has its own address. */
import { usePathname } from "next/navigation";
import { Tabs } from "./ui";

const TABS = [
  { key: "invoices", label: "Invoices", href: "/account/invoices" },
  { key: "statements", label: "Statements", href: "/account/statements" },
  { key: "terms", label: "Credit and terms", href: "/account/billing/terms" },
  { key: "payment", label: "Payment methods", href: "/account/billing/payment-methods" },
];

export function BillingTabs() {
  const pathname = usePathname() ?? "";
  return <Tabs label="Billing" tabs={TABS.map((t) => ({ ...t, on: pathname === t.href }))} />;
}
