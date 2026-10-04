import type { Metadata } from "next";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import { BuilderPage } from "@/components/builder/SiteParts";
import { builderPageMetadata, loadBuilderSitePage } from "@/lib/builder/load";

export const dynamic = "force-dynamic";

/** The builder's About page title, on a shop that has switched. Nothing otherwise, as before. */
export async function generateMetadata(): Promise<Metadata> {
  return (await builderPageMetadata("about")) ?? {};
}

export default async function AboutPage() {
  const site = await loadBuilderSitePage("about");
  if (site) return <BuilderPage payload={site} />;
  return <StorefrontPage slug="about" />;
}
