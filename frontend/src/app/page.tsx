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
import { loadStore } from "@/lib/store";
import StorefrontShell from "@/components/storefront/StorefrontShell";
import PlatformLanding from "@/components/platform/PlatformLanding";
import { apiClient } from "@/lib/api-client";
import { BuilderPage } from "@/components/builder/SiteParts";
import { loadBuilderPage } from "@/lib/builder/load";

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
  // PlatformLanding draws its own header, and deliberately gets no shop
  // chrome around it.
  if (!store.brand) return <PlatformLanding />;

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
