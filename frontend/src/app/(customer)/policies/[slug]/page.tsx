export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ThemeWrittenPage from "@/components/storefront/ThemeWrittenPage";
import { loadWrittenPage } from "@/lib/writtenPages";
import { titleWithBrand } from "@/lib/brand";
import { loadBuilderChrome } from "@/lib/builder/load";

const ALLOWED = new Set(["shipping", "returns", "privacy", "terms"]);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!ALLOWED.has(slug)) return { title: "Not found" };
  const page = await loadWrittenPage(slug);
  return {
    title: await titleWithBrand(page?.title ?? "Policy"),
    description: page?.intro || undefined,
  };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!ALLOWED.has(slug)) notFound();
  const page = await loadWrittenPage(slug);
  if (!page) notFound();
  // A shop on the visual builder draws it in the builder's look; see ThemeWrittenPage.
  return <ThemeWrittenPage page={page} builder={(await loadBuilderChrome()) !== null} />;
}
