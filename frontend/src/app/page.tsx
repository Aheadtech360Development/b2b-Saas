export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/home`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? "Wholesale Store",
      description: seo.meta_description ?? "B2B wholesale storefront.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "Wholesale Store" };
  }
}
import { Footer } from "@/components/layout/Footer";
import NewShopHome from "@/components/home/NewShopHome";
import StorefrontHome from "@/components/home/StorefrontHome";
import ThemeRenderer, { type ThemePage } from "@/components/storefront/ThemeRenderer";
import { loadStore } from "@/components/storefront/ThemeChrome";
import PlatformLanding from "@/components/platform/PlatformLanding";
import { apiClient } from "@/lib/api-client";

/** This brand's published theme home page, or null when it has none. */
async function themeHome(): Promise<ThemePage | null> {
  try {
    const res = await apiClient.get<{ page: ThemePage | null }>("/api/v1/storefront/theme/home", { skipAuth: true });
    return res?.page ?? null;
  } catch {
    return null;  // no theme, or the API is down — the built-in home still works
  }
}

/** Whether this brand has anything for sale yet. */
async function hasProducts(): Promise<boolean> {
  try {
    const res = await apiClient.get<{ items?: unknown[]; total?: number }>(
      "/api/v1/products?page_size=1", { skipAuth: true },
    );
    return (res?.total ?? res?.items?.length ?? 0) > 0;
  } catch {
    // If we cannot tell, show the built-in storefront rather than tell a brand
    // with a full catalogue that it is still being set up.
    return true;
  }
}

export default async function HomePage() {
  const store = await loadStore();
  // No brand was asked for: this is the platform's own address, not a shop.
  if (!store.brand) return <PlatformLanding />;

  const page = await themeHome();
  if (page) {
    // The store's header and footer are drawn by the layout, around every page
    // of the shop; this one leaves its own copies out.
    return <ThemeRenderer page={page} chromeInLayout={store.chrome !== null} />;
  }
  // A shop with no theme and nothing to sell is a shop on its first day, not a
  // broken one. The built-in storefront is for a brand that has stock but has
  // not imported a design yet.
  if (!(await hasProducts())) return <NewShopHome brand={store.brand} />;
  return (
    <>
      <StorefrontHome />
      <Footer />
    </>
  );
}
