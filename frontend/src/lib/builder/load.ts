/**
 * Asking the API whether this shop renders through the visual builder, and
 * for the page when it does. Server components only.
 *
 * The first question costs every storefront page one small request, and its
 * answer for every shop that has not switched — every shop that existed
 * before the builder — is "legacy": the page then goes on down the path it
 * has always taken, exactly as before. It is asked once per request (cached),
 * however many components want to know.
 *
 * Any failure is answered as legacy. A storefront that cannot reach the
 * builder renders the way it rendered yesterday, never a blank page.
 */
import { cache } from "react";
import { apiClient } from "@/lib/api-client";
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
export const loadBuilderChrome = cache(async (): Promise<SitePayload | null> => ask({ route: "chrome" }));

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
