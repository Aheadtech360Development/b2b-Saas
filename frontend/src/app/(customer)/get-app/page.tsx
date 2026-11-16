import type { Metadata } from "next";
import { Suspense } from "react";
import { loadStore } from "@/lib/store";
import SiteShell from "@/components/marketing/site/SiteShell";
import GetApp from "@/components/marketing/site/GetApp";
import ShopPage, { generateMetadata as shopPageMetadata } from "../[slug]/page";

export const dynamic = "force-dynamic";

/**
 * printcopilot.co/get-app?code=XXXXXX — where a shop's QR square (Settings →
 * Buyer app) sends a buyer: the shop, how to get the PrintCoPilot app, and
 * the way into it. On a shop the address is still the shop's own.
 */
const params = async () => ({ slug: "get-app" });

export async function generateMetadata(): Promise<Metadata> {
  if ((await loadStore()).brand) return shopPageMetadata({ params: params() });
  return { title: "Get the PrintCoPilot app", robots: { index: false } };
}

export default async function GetAppRoute() {
  if ((await loadStore()).brand) return <ShopPage params={params()} />;
  return (
    <SiteShell>
      <Suspense fallback={null}>
        <GetApp />
      </Suspense>
    </SiteShell>
  );
}
