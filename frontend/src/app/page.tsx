export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";


export async function generateMetadata(): Promise<Metadata> {
  const store = await loadStore();
  if (!store.brand) return siteMetadata("home");
  // The shop's own name until its SEO says otherwise. The SEO was read with no
  // shop named on the request, so every shop's home page opened titled
  // "Wholesale Store" before the browser put the name in (dev fix list, item 33).
  const name = store.title || store.brand;
  try {
    const seo = await apiClient.get<{ meta_title?: string | null; meta_description?: string | null; keywords?: string | null; og_image_url?: string | null }>(
      "/api/v1/pages-seo/home", { skipAuth: true });
    return {
      title: seo?.meta_title || name,
      description: seo?.meta_description || `${store.brand}. Order online.`,
      keywords: seo?.keywords ?? undefined,
      openGraph: seo?.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: name };
  }
}
import { Footer } from "@/components/layout/Footer";
import NewShopHome from "@/components/home/NewShopHome";
import StorefrontHome from "@/components/home/StorefrontHome";
import { loadStore } from "@/lib/store";
import StorefrontShell from "@/components/storefront/StorefrontShell";
import { apiClient } from "@/lib/api-client";
import { BuilderPage } from "@/components/builder/SiteParts";
import { loadBuilderPage } from "@/lib/builder/load";
import SitePage from "@/components/marketing/site/SitePage";
import { siteMetadata } from "@/components/marketing/site/registry";

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
  // The marketing site draws its own header and footer, and deliberately gets
  // no shop chrome around it. (The one-page PlatformLanding it replaced is
  // still in components/platform.)
  if (!store.brand) {
    // The design's home page (components/marketing/site), prices filled from
    // the plans the super admin sets; a partner's ?ref= link counts on it.
    return <SitePage page="home" />;
  }

  // A shop live on the website builder: its home page.
  const site = await loadBuilderPage("home");
  if (site) {
    return (
      <StorefrontShell>
        <BuilderPage payload={site} />
      </StorefrontShell>
    );
  }

  // A shop that has not gone live on the builder yet. This page sits above
  // the (customer) segment, so it wraps itself in the same shell that segment
  // uses. Both mount and unmount with the route, which the root layout could
  // not do — it is shared by the console too and is never re-rendered on the
  // way there.
  //
  // With nothing to sell it is a shop on its first day, not a broken one; the
  // built-in storefront is for a brand that has stock but has not published
  // its builder site yet.
  if (!(await hasProducts())) {
    return (
      <StorefrontShell>
        <NewShopHome brand={store.brand} />
      </StorefrontShell>
    );
  }
  return (
    <StorefrontShell>
      <StorefrontHome />
      <Footer />
    </StorefrontShell>
  );
}
