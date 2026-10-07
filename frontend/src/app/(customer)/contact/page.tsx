export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import ThemeWrittenPage from "@/components/storefront/ThemeWrittenPage";
import { loadWrittenPage } from "@/lib/writtenPages";
import { titleWithBrand } from "@/lib/brand";
import { BuilderPage } from "@/components/builder/SiteParts";
import { builderPageMetadata, loadBuilderChrome, loadBuilderSitePage } from "@/lib/builder/load";

export async function generateMetadata(): Promise<Metadata> {
  const built = await builderPageMetadata("contact");
  if (built) return built;
  const page = await loadWrittenPage("contact");
  return { title: await titleWithBrand(page?.title ?? "Contact"), description: page?.intro || undefined };
}

export default async function ContactPage() {
  // A Contact page made in the website builder.
  const site = await loadBuilderSitePage("contact");
  if (site) return <BuilderPage payload={site} />;

  // A builder shop that has not made one: the shop's own written Contact page,
  // in the builder's look — the same way its quote and policy pages are drawn.
  if ((await loadBuilderChrome()) !== null) {
    const page = await loadWrittenPage("contact");
    if (page) return <ThemeWrittenPage page={page} builder />;
  }

  // A shop that is not on the builder yet: the built-in page.
  return <StorefrontPage slug="contact" />;
}
