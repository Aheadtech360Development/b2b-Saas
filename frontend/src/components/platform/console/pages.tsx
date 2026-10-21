"use client";

/**
 * The console's pages that are a frame around a screen it already had:
 * Activity, Taxes, Affiliates and Leads.
 */
import { AffiliatesTab } from "@/components/platform/affiliates/AffiliatesTab";
import { LeadsTab } from "@/components/platform/LeadsTab";
import { TaxTab } from "@/components/platform/TaxTab";
import { ActivityTable } from "./ActivityTable";
import { consoleApi } from "./api";
import { PageHead, useLoad } from "./ui";

export function ActivityPage() {
  const brands = useLoad(() => consoleApi.brands(), []);
  return (
    <div>
      <PageHead eyebrow="Activity" title="Activity" lede="Everything the log holds, across every brand and the console itself." />
      <ActivityTable brands={brands.data?.items ?? []} />
    </div>
  );
}

export function TaxesPage() {
  return (
    <div>
      <PageHead eyebrow="Taxes" title="Taxes" lede="Sales tax every brand charged, by period and by region." />
      <TaxTab />
    </div>
  );
}

export function LeadsPage() {
  return (
    <div>
      <PageHead eyebrow="Leads" title="Leads" lede="printcopilot.co's demo requests and contact messages." />
      <LeadsTab />
    </div>
  );
}

export function AffiliatesPage() {
  // The partner program's own back office, drawn the width of the screen as
  // its design is; it keeps its place in the address (#affiliates/...).
  return <AffiliatesTab />;
}
