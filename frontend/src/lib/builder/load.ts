/**
 * Whether this shop renders through the visual builder, and its page when it
 * does. Server components only.
 *
 * The first question costs nothing extra: it is answered by the request every
 * storefront page already makes to learn whose shop it is drawing (loadStore),
 * which comes back with the builder's header and footer when — and only when —
 * the shop is live on the builder. A shop that has not gone live yet gets null
 * and is drawn by the app's own pages. Only a builder shop then asks for its
 * page.
 *
 * Any failure is answered as "not on the builder". A storefront that cannot
 * reach the builder draws the app's own pages, never a blank one.
 */
import { cache } from "react";
import { apiClient } from "@/lib/api-client";
import { loadStore } from "@/lib/store";
import { isBuilder, type SitePayload, type SiteResponse } from "./types";

async function ask(params: Record<string, string>): Promise<SitePayload | null> {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await apiClient.get<SiteResponse>(`/api/v1/storefront/site?${query}`, { skipAuth: true });
    return isBuilder(res) ? res : null;
  } catch {
    return null;
  }
}

/** The header, announcement and footer when this shop is on the builder; null when it is not. */
export const loadBuilderChrome = cache(async (): Promise<SitePayload | null> => (await loadStore()).builder);

/**
 * One page of a builder shop, or null — for every legacy shop, without a
 * second request.
 */
export const loadBuilderPage = cache(async (
  route: string, slug = "", q = "", page = 1, sort = "",
): Promise<SitePayload | null> => {
  if (!(await loadBuilderChrome())) return null;
  const params: Record<string, string> = { route };
  if (slug) params.slug = slug;
  if (q) params.q = q.slice(0, 120);
  if (page > 1) params.page = String(Math.min(page, 500));
  if (sort) params.sort = sort;
  return ask(params);
});

/** A page the merchant made in the builder, or null — for a legacy shop, or a slug the builder has no page for. */
export async function loadBuilderSitePage(slug: string): Promise<SitePayload | null> {
  const site = await loadBuilderPage("page", slug);
  return site && !site.notFound && site.page ? site : null;
}

/** A builder page's title and description, from its SEO settings. Null when the page is not a builder page. */
export async function builderPageMetadata(slug: string): Promise<{
  title: string; description?: string; openGraph?: { images: { url: string }[] };
} | null> {
  const site = await loadBuilderSitePage(slug);
  if (!site?.page) return null;
  const seo = site.page.seo ?? {};
  const store = site.data.store?.name ?? "";
  const title = seo.title || (store ? `${site.page.title} | ${store}` : site.page.title);
  return {
    title,
    ...(seo.description ? { description: seo.description } : {}),
    ...(seo.image && /^https:\/\//.test(seo.image) ? { openGraph: { images: [{ url: seo.image }] } } : {}),
  };
}
