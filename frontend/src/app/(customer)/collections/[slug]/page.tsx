export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { titleWithBrand } from "@/lib/brand";
import { BuilderPage } from "@/components/builder/SiteParts";
import { loadBuilderPage } from "@/lib/builder/load";

interface CollectionInfo {
  name: string;
  slug: string;
  description: string;
  seo_title: string;
  seo_description: string;
}

interface Answer {
  collection: CollectionInfo | null;
  total?: number;
}

/** This collection's name and description — or nothing, when there is no such collection. */
async function load(slug: string, page: number): Promise<Answer> {
  try {
    return await apiClient.get<Answer>(
      `/api/v1/storefront/theme/collection/${encodeURIComponent(slug)}?page=${page}`,
      { skipAuth: true },
    );
  } catch {
    return { collection: null };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { collection } = await load(slug, 1);
  if (!collection) return { title: await titleWithBrand("Collection") };
  return {
    title: collection.seo_title || (await titleWithBrand(collection.name)),
    description: collection.seo_description || collection.description || undefined,
  };
}

export default async function CollectionPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  // A shop on the website builder: its collection template.
  const sort = sp.sort === "name" ? "name" : "";
  const site = await loadBuilderPage("collection", slug, "", page, sort);
  if (site) {
    if (site.notFound) notFound();
    return <BuilderPage payload={site} sort={sort} />;
  }

  // A shop that is not on the builder yet: the built-in catalogue already
  // lists a collection's products.
  const { collection } = await load(slug, page);
  if (!collection) notFound();
  redirect(`/products?category=${encodeURIComponent(slug)}`);
}
