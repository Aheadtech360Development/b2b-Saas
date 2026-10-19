import type { Metadata } from "next";
import { loadStore } from "@/lib/store";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingFeatures from "@/components/marketing/pages/Features";
import { MARKETING_META } from "@/components/marketing/meta";
import ShopPage, { generateMetadata as shopPageMetadata } from "../[slug]/page";

export const dynamic = "force-dynamic";

/**
 * printcopilot.co/features — a page of the platform's marketing site.
 *
 * A fixed address now, so it is answered here and no longer reaches the
 * catch-all. On a shop the address is still the shop's: whatever page it has
 * at /features is drawn exactly as the catch-all would draw it.
 */
const params = async () => ({ slug: "features" });

export async function generateMetadata(): Promise<Metadata> {
  if ((await loadStore()).brand) return shopPageMetadata({ params: params() });
  return MARKETING_META.features;
}

export default async function MarketingFeaturesRoute() {
  if ((await loadStore()).brand) return <ShopPage params={params()} />;
  return (
    <MarketingShell active="features">
      <MarketingFeatures />
    </MarketingShell>
  );
}
