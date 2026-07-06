import type { Metadata } from "next";
import ProductSpecsPage from "./ProductSpecsContent";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/product-specs`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? "Product Specs | AF Apparels",
      description: seo.meta_description ?? "Detailed product specifications and sizing guides for AF Apparels blank apparel.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "Product Specs | AF Apparels" };
  }
}

export default function Page() {
  return <ProductSpecsPage />;
}
