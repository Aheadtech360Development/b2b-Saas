"use client";

/** The Account pages' tabs: one page each, so every tab has its own address.
 *  The address book belongs to a company account, so a retail buyer has no
 *  Addresses tab (their address is asked at checkout). */
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Tabs } from "./ui";

const TABS = [
  { key: "profile", label: "Profile", href: "/account/profile" },
  { key: "addresses", label: "Addresses", href: "/account/addresses" },
  { key: "payment", label: "Payment methods", href: "/account/payment-methods" },
  { key: "security", label: "Security", href: "/account/change-password" },
];

export function AccountTabs() {
  const pathname = usePathname() ?? "";
  const company = !!useAuthStore((s) => s.user?.company_id);
  return (
    <Tabs label="Account" tabs={TABS
      .filter((t) => company || t.key !== "addresses" || pathname === t.href)
      .map((t) => ({ ...t, on: pathname === t.href }))} />
  );
}
