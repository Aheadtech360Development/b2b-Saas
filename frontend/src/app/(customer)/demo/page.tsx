import type { Metadata } from "next";
import { loadStore } from "@/lib/store";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingDemo from "@/components/marketing/pages/Demo";
import { MARKETING_META } from "@/components/marketing/meta";
import ShopPage, { generateMetadata as shopPageMetadata } from "../[slug]/page";

export const dynamic = "force-dynamic";

/**
 * printcopilot.co/demo — a page of the platform's marketing site.
 *
 * A fixed address now, so it is answered here and no longer reaches the
 * catch-all. On a shop the address is still the shop's: whatever page it has
 * at /demo is drawn exactly as the catch-all would draw it.
 */
const params = async () => ({ slug: "demo" });

export async function generateMetadata(): Promise<Metadata> {
  if ((await loadStore()).brand) return shopPageMetadata({ params: params() });
  return MARKETING_META.demo;
}

export default async function MarketingDemoRoute() {
  if ((await loadStore()).brand) return <ShopPage params={params()} />;
  return (
    <MarketingShell>
      <MarketingDemo />
    </MarketingShell>
  );
}
