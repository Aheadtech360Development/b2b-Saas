export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ThemeWrittenPage from "@/components/storefront/ThemeWrittenPage";
import { loadWrittenPage } from "@/lib/writtenPages";
import { titleWithBrand } from "@/lib/brand";
import { loadBuilderChrome } from "@/lib/builder/load";

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadWrittenPage("quote");
  return { title: await titleWithBrand(page?.title ?? "Get a quote"), description: page?.intro || undefined };
}

export default async function QuotePage() {
  const page = await loadWrittenPage("quote");
  if (!page) notFound();
  // A shop on the visual builder draws it in the builder's look; see ThemeWrittenPage.
  return <ThemeWrittenPage page={page} builder={(await loadBuilderChrome()) !== null} />;
}
