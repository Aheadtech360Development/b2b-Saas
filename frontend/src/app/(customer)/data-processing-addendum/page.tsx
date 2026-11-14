import type { Metadata } from "next";
import { loadStore } from "@/lib/store";
import SiteShell from "@/components/marketing/site/SiteShell";
import PolicyPage from "@/components/marketing/site/PolicyPage";
import dpa from "@/components/marketing/site/policies/dpa";
import { MARKETING_META } from "@/components/marketing/meta";
import ShopPage, { generateMetadata as shopPageMetadata } from "../[slug]/page";

export const dynamic = "force-dynamic";

/**
 * printcopilot.co/data-processing-addendum — the DPA shops agree to, from the
 * owner's PDF. On a shop the address is still the shop's: whatever page it
 * has at /data-processing-addendum is drawn exactly as the catch-all would.
 */
const params = async () => ({ slug: "data-processing-addendum" });

export async function generateMetadata(): Promise<Metadata> {
  if ((await loadStore()).brand) return shopPageMetadata({ params: params() });
  return MARKETING_META.dpa;
}

export default async function DataProcessingRoute() {
  if ((await loadStore()).brand) return <ShopPage params={params()} />;
  return (
    <SiteShell>
      <PolicyPage policy={dpa} />
    </SiteShell>
  );
}
