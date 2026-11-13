import type { Metadata } from "next";
import { loadStore } from "@/lib/store";
import ShopPage, { generateMetadata as shopPageMetadata } from "../[slug]/page";
import SitePage from "@/components/marketing/site/SitePage";
import { siteMetadata } from "@/components/marketing/site/registry";

export const dynamic = "force-dynamic";

/**
 * printcopilot.co/pricing — a page of the platform's marketing site.
 *
 * A fixed address now, so it is answered here and no longer reaches the
 * catch-all. On a shop the address is still the shop's: whatever page it has
 * at /pricing is drawn exactly as the catch-all would draw it.
 */
const params = async () => ({ slug: "pricing" });

export async function generateMetadata(): Promise<Metadata> {
  if ((await loadStore()).brand) return shopPageMetadata({ params: params() });
  return siteMetadata("pricing");
}

export default async function MarketingPricingRoute() {
  if ((await loadStore()).brand) return <ShopPage params={params()} />;
  return <SitePage page="pricing" />;
}
