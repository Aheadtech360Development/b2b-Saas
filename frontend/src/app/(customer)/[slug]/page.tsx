import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import { BuilderPage } from "@/components/builder/SiteParts";
import { builderPageMetadata, loadBuilderChrome, loadBuilderSitePage } from "@/lib/builder/load";
import { apiClient, ApiClientError } from "@/lib/api-client";

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
  // On a builder shop, an address that is neither a builder page nor one of
  // the shop's existing pages is a real 404. Other shops keep their page as it
  // always was.
  if ((await loadBuilderChrome()) && !(await existingPage(slug))) notFound();
  return <StorefrontPage slug={slug} />;
}

/** Whether the shop has a page by this address from the older page editor. */
async function existingPage(slug: string): Promise<boolean> {
  try {
    await apiClient.get(`/api/v1/storefront/pages/${encodeURIComponent(slug)}`, { skipAuth: true });
    return true;
  } catch (err) {
    // Only a definite "no such page" is a 404; anything else draws the page as before.
    return !(err instanceof ApiClientError && err.status === 404);
  }
}
