export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import StorefrontPage from "@/components/storefront/StorefrontPage";
import ThemeWrittenPage from "@/components/storefront/ThemeWrittenPage";
import { loadWrittenPage } from "@/lib/writtenPages";
import { loadThemeChrome } from "@/components/storefront/ThemeChrome";
import { titleWithBrand } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadWrittenPage("contact");
  return { title: await titleWithBrand(page?.title ?? "Contact"), description: page?.intro || undefined };
}

export default async function ContactPage() {
  // A themed brand gets the contact page in its own theme; without a theme the
  // built-in page is what it has always been.
  const themed = (await loadThemeChrome()) !== null;
  const page = themed ? await loadWrittenPage("contact") : null;
  if (page) return <ThemeWrittenPage page={page} />;
  return <StorefrontPage slug="contact" />;
}
