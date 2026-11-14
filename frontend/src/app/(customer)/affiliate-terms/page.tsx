import type { Metadata } from "next";
import { loadStore } from "@/lib/store";
import SiteShell from "@/components/marketing/site/SiteShell";
import PolicyPage from "@/components/marketing/site/PolicyPage";
import affiliate from "@/components/marketing/site/policies/affiliate";
import { MARKETING_META } from "@/components/marketing/meta";
import ShopPage, { generateMetadata as shopPageMetadata } from "../[slug]/page";

export const dynamic = "force-dynamic";

/**
 * printcopilot.co/affiliate-terms — the affiliate program's terms, from the
 * owner's PDF. On a shop the address is still the shop's: whatever page it
 * has at /affiliate-terms is drawn exactly as the catch-all would draw it.
 */
const params = async () => ({ slug: "affiliate-terms" });

export async function generateMetadata(): Promise<Metadata> {
  if ((await loadStore()).brand) return shopPageMetadata({ params: params() });
  return MARKETING_META.affiliateTerms;
}

export default async function AffiliateTermsRoute() {
  if ((await loadStore()).brand) return <ShopPage params={params()} />;
  return (
    <SiteShell>
      <PolicyPage policy={affiliate} />
    </SiteShell>
  );
}
