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
import StorefrontHome from "@/components/home/StorefrontHome";
import ThemeRenderer, { type ThemePage } from "@/components/storefront/ThemeRenderer";
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

export default async function HomePage() {
  const page = await themeHome();
  if (page) {
    // The theme carries its own header and footer.
    return <ThemeRenderer page={page} />;
  }
  return (
    <>
      <StorefrontHome />
      <Footer />
    </>
  );
}
