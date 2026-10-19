import type { Metadata } from "next";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import { BuilderPage } from "@/components/builder/SiteParts";
import { builderPageMetadata, loadBuilderSitePage } from "@/lib/builder/load";
import { loadStore } from "@/lib/store";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingAbout from "@/components/marketing/pages/About";
import { MARKETING_META } from "@/components/marketing/meta";

export const dynamic = "force-dynamic";

/** The builder's About page title, on a shop that has switched. Nothing otherwise, as before. */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await loadStore()).brand) return MARKETING_META.about;
  return (await builderPageMetadata("about")) ?? {};
}

export default async function AboutPage() {
  // The platform's own address: the marketing site's page. Every shop gets what it always did, below.
  if (!(await loadStore()).brand) {
    return (
      <MarketingShell active="about">
        <MarketingAbout />
      </MarketingShell>
    );
  }
  const site = await loadBuilderSitePage("about");
  if (site) return <BuilderPage payload={site} />;
  return <StorefrontPage slug="about" />;
}
