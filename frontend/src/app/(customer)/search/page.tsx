import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BuilderPage } from "@/components/builder/SiteParts";
import { loadBuilderPage } from "@/lib/builder/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

/**
 * Search, for a shop on the visual builder: its search template, with the
 * results in it. Any other shop searches the catalogue it always has.
 */
export default async function SearchPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 120) : "";
  const site = await loadBuilderPage("search", "", q);
  if (site) return <BuilderPage payload={site} />;
  redirect(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
}
