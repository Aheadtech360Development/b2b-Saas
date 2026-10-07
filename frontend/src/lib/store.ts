/**
 * Whose shop this address is.
 *
 * Every storefront page asks once per request: which brand, what its browser
 * tab says and shows, and — when the shop is live on the website builder — the
 * builder's header, footer and "page not found" template, so a page learns it
 * is a builder page without a second request.
 *
 * This used to live beside the imported theme's header and footer, and carried
 * them too. Imported themes are gone: a shop is drawn by the website builder,
 * or — until it has published one and switched over — by the app's own pages.
 */
import { cache } from "react";
import { isBuilder, type SitePayload, type SiteResponse } from "@/lib/builder/types";

export interface Store {
  /** Null means no brand at all — the platform's own address. */
  brand: string | null;
  icon: string | null;
  title: string | null;
  /** When this shop is live on the visual builder: its header, footer and
   *  "page not found" template. Null for every other shop. */
  builder: SitePayload | null;
}

/** Cached per request: the root layout, the storefront's layout and the page all ask. */
export const loadStore = cache(async (): Promise<Store> => {
  try {
    const { apiClient } = await import("@/lib/api-client");
    const r = await apiClient.get<{ brand: string | null; icon?: string | null; title?: string | null; builder?: SiteResponse | null }>(
      "/api/v1/storefront/theme-active", { skipAuth: true },
    );
    return {
      brand: r?.brand ?? null,
      icon: r?.icon ?? null,
      title: r?.title ?? null,
      builder: isBuilder(r?.builder) ? r.builder : null,
    };
  } catch {
    return { brand: null, icon: null, title: null, builder: null };
  }
});
