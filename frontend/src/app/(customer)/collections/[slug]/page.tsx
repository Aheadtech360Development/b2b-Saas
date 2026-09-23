export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { titleWithBrand } from "@/lib/brand";
import ThemeRenderer, { type ThemePage } from "@/components/storefront/ThemeRenderer";
import { loadThemeChrome } from "@/components/storefront/ThemeChrome";

interface CollectionInfo {
  name: string;
  slug: string;
  description: string;
  seo_title: string;
  seo_description: string;
}

interface Answer {
  page: ThemePage | null;
  collection: CollectionInfo | null;
  total?: number;
}

/** This collection, in the brand's own theme when it has one. */
async function load(slug: string, page: number): Promise<Answer> {
  try {
    return await apiClient.get<Answer>(
      `/api/v1/storefront/theme/collection/${encodeURIComponent(slug)}?page=${page}`,
      { skipAuth: true },
    );
  } catch {
    return { page: null, collection: null };
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
  const { page: themePage, collection } = await load(slug, page);

  if (!collection) notFound();
  // No theme yet: the built-in catalogue already lists a collection's products.
  if (!themePage) redirect(`/products?category=${encodeURIComponent(slug)}`);

  return <ThemeRenderer page={themePage} chromeInLayout={(await loadThemeChrome()) !== null} />;
}
