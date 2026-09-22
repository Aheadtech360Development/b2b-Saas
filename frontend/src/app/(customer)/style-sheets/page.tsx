import type { Metadata } from "next";
import StyleSheetsPage from "./StyleSheetsContent";
import { titleWithBrand } from "@/lib/brand";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/style-sheets`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? (await titleWithBrand("Style Sheets")),
      description: seo.meta_description ?? "Downloadable style sheets for our catalogue.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: await titleWithBrand("Style Sheets") };
  }
}

export default function Page() {
  return <StyleSheetsPage />;
}
