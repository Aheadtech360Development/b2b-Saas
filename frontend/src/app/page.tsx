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

export default function HomePage() {
  return (
    <>
      <StorefrontHome />
      <Footer />
    </>
  );
}
