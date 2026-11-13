import type { Metadata } from "next";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import { BuilderPage } from "@/components/builder/SiteParts";
import { builderPageMetadata, loadBuilderSitePage } from "@/lib/builder/load";
import { loadStore } from "@/lib/store";
import SitePage from "@/components/marketing/site/SitePage";
import { siteMetadata } from "@/components/marketing/site/registry";

export const dynamic = "force-dynamic";

/** The builder's About page title, on a shop that has switched. Nothing otherwise, as before. */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await loadStore()).brand) return siteMetadata("about");
  return (await builderPageMetadata("about")) ?? {};
}

export default async function AboutPage() {
  // The platform's own address: the marketing site's page. Every shop gets what it always did, below.
  if (!(await loadStore()).brand) return <SitePage page="about" />;
  const site = await loadBuilderSitePage("about");
  if (site) return <BuilderPage payload={site} />;
  return <StorefrontPage slug="about" />;
}
