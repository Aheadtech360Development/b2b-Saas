import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadStore } from "@/lib/store";
import MarketingShell from "@/components/marketing/MarketingShell";
import RetailPage from "@/components/marketing/pages/Retail";
import { MARKETING_META, retailDescription } from "@/components/marketing/meta";
import { PlanPricesProvider } from "@/lib/planPricesContext";
import { loadPlanPrices } from "@/lib/planPricesServer";
import { RETAIL_LAUNCHED } from "@/lib/retailLaunch";
import ShopPage, { generateMetadata as shopPageMetadata } from "../[slug]/page";

export const dynamic = "force-dynamic";

/**
 * printcopilot.co/retail: the Retail plan's page (Retail launch, package 6).
 * Not there until the launch switch is on (lib/retailLaunch). On a shop the
 * address is the shop's own, drawn as the catch-all would draw it.
 */
const params = async () => ({ slug: "retail" });

export async function generateMetadata(): Promise<Metadata> {
  if ((await loadStore()).brand) return shopPageMetadata({ params: params() });
  return { ...MARKETING_META.retail, description: retailDescription((await loadPlanPrices()).retail) };
}

export default async function MarketingRetailRoute() {
  if ((await loadStore()).brand) return <ShopPage params={params()} />;
  if (!RETAIL_LAUNCHED) notFound();
  return (
    <MarketingShell active="retail">
      <PlanPricesProvider prices={await loadPlanPrices()}>
        <RetailPage />
      </PlanPricesProvider>
    </MarketingShell>
  );
}
