import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import { BuilderPage } from "@/components/builder/SiteParts";
import { builderPageMetadata, loadBuilderChrome, loadBuilderSitePage } from "@/lib/builder/load";
import { apiClient, ApiClientError } from "@/lib/api-client";

export const dynamic = "force-dynamic";

/** The builder's privacy policy title, on a shop that has switched. Nothing otherwise, as before. */
export async function generateMetadata(): Promise<Metadata> {
  return (await builderPageMetadata("privacy-policy")) ?? {};
}

/**
 * A fixed address, so it is answered here and never reaches the catch-all page.
 * That meant a privacy policy written in the website builder could not be
 * seen: this drew the older page editor's page, or its "page not found", in
 * front of it. The builder's page comes first now, as it does for About and
 * Contact; a shop that has not switched gets exactly what it always did.
 */
export default async function PrivacyPolicyPage() {
  const site = await loadBuilderSitePage("privacy-policy");
  if (site) return <BuilderPage payload={site} />;
  // On a builder shop with no privacy policy from either editor, there is no page.
  if ((await loadBuilderChrome()) && !(await existingPage())) notFound();
  return <StorefrontPage slug="privacy-policy" />;
}

/** Whether the shop has a privacy policy from the older page editor. */
async function existingPage(): Promise<boolean> {
  try {
    await apiClient.get("/api/v1/storefront/pages/privacy-policy", { skipAuth: true });
    return true;
  } catch (err) {
    // Only a definite "no such page" is a 404; anything else draws the page as before.
    return !(err instanceof ApiClientError && err.status === 404);
  }
}
