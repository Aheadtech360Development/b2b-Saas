import type { Metadata } from "next";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import { BuilderPage } from "@/components/builder/SiteParts";
import { builderPageMetadata, loadBuilderSitePage } from "@/lib/builder/load";

export const dynamic = "force-dynamic";

/** A builder page's own title and description. Nothing for any other shop, as before. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return (await builderPageMetadata(slug)) ?? {};
}

// Catch-all for custom storefront pages created in the admin Pages builder.
// Specific routes (products, account, about, contact, …) take priority.
export default async function CustomStorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // A page made in the visual builder, on a shop that has switched to it. A
  // slug the builder has no page for still finds the shop's existing page.
  const site = await loadBuilderSitePage(slug);
  if (site) return <BuilderPage payload={site} />;
  return <StorefrontPage slug={slug} />;
}
